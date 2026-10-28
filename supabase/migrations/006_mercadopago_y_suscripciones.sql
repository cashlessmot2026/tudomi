-- =====================================================================
-- 006: Pagos en línea con Mercado Pago (Checkout Pro) + planes de suscripción para negocios
-- Mercado Pago lo activa o desactiva solo el admin (app_settings.mp_enabled).
-- El pago se confirma únicamente desde la Edge Function mp-webhook (service_role) con mp_apply_payment().
-- =====================================================================

insert into public.app_settings(key, value) values ('mp_enabled', 'false') on conflict (key) do nothing;

-- Configuración pública de pagos (sin datos sensibles)
create or replace function public.payment_config() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('mp_enabled', coalesce((select value = 'true' from app_settings where key = 'mp_enabled'), false));
$$;
grant execute on function public.payment_config() to anon, authenticated;

create or replace function public.admin_set_mp_enabled(p_pass text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  insert into app_settings(key, value) values ('mp_enabled', case when p_enabled then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
end $$;

-- ---------- Pedidos con Mercado Pago ----------
alter table public.orders
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text,
  add column if not exists mp_status text;

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('efectivo','transferencia','datafono','qr','link','mercadopago'));

create or replace function public.orders_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b businesses; p products; h products; it jsonb;
  qty numeric; unit numeric; sub numeric := 0; out_items jsonb := '[]'::jsonb;
begin
  select * into b from businesses where id = new.business_id and active;
  if not found then raise exception 'El negocio no está disponible'; end if;
  if not b.is_open then raise exception 'El negocio está cerrado en este momento'; end if;
  if (new.payment_method = 'efectivo' and not b.accepts_cash)
     or (new.payment_method = 'transferencia' and not b.accepts_transfer)
     or (new.payment_method = 'datafono' and not b.accepts_card)
     or (new.payment_method = 'qr' and not b.accepts_qr)
     or (new.payment_method = 'link' and not b.accepts_link) then
    raise exception 'Este negocio no recibe ese método de pago';
  end if;
  if new.payment_method = 'mercadopago' and not (public.payment_config()->>'mp_enabled')::boolean then
    raise exception 'El pago con Mercado Pago no está disponible en este momento';
  end if;
  if new.payment_method in ('transferencia','qr','link') and coalesce(new.payment_proof_url, '') = '' then
    raise exception 'Debes adjuntar el comprobante del pago';
  end if;
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then raise exception 'El pedido no tiene productos'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    select * into p from products where id = (it->>'product_id')::uuid and business_id = new.business_id and available;
    if not found then raise exception 'Un producto ya no está disponible'; end if;
    qty := nullif(it->>'qty', '')::numeric;
    if qty is null or qty <= 0 then raise exception 'Cantidad inválida para %', p.name; end if;
    if p.sale_type = 'unidad' then qty := ceil(qty); else qty := round(qty, 2); end if;
    unit := p.price;
    h := null;
    if coalesce(it->>'half_product_id', '') <> '' then
      if not p.is_pizza then raise exception '% no admite mitad y mitad', p.name; end if;
      select * into h from products where id = (it->>'half_product_id')::uuid and business_id = new.business_id and is_pizza and available;
      if not found then raise exception 'La otra mitad de la pizza no está disponible'; end if;
      unit := greatest(p.price, h.price);
    end if;
    sub := sub + unit * qty;
    out_items := out_items || jsonb_build_object(
      'product_id', p.id, 'name', p.name, 'image_url', p.image_url,
      'half_product_id', h.id, 'half_name', h.name,
      'unit_price', unit, 'qty', qty, 'sale_type', p.sale_type, 'weight_unit', p.weight_unit,
      'line_total', unit * qty, 'note', nullif(trim(coalesce(it->>'note', '')), ''));
  end loop;
  new.customer_id := auth.uid();
  new.items := out_items;
  new.subtotal := sub;
  new.delivery_fee := b.delivery_fee;
  new.total := sub + b.delivery_fee;
  new.status := 'pendiente';
  new.payment_status := case when new.payment_method in ('transferencia','qr','link','mercadopago') then 'pendiente' else 'no_aplica' end;
  if new.payment_method = 'mercadopago' then new.payment_proof_url := null; end if;
  new.mp_preference_id := null; new.mp_payment_id := null; new.mp_status := null;
  new.courier_id := null; new.courier_name := null; new.courier_phone := null;
  new.dispatch := null;
  new.reject_reason := null; new.delivered_at := null;
  return new;
end $$;

create or replace function public.orders_before_update() returns trigger language plpgsql as $$
declare allowed text[] := array['status','payment_status','reject_reason','dispatch','updated_at'];
begin
  new.updated_at := now();
  if public.is_system_ctx() then return new; end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Solo puedes cambiar el estado del pedido';
  end if;
  -- El estado de un pago de Mercado Pago solo lo cambia el webhook
  if new.payment_method = 'mercadopago' and new.payment_status is distinct from old.payment_status then
    raise exception 'El pago de Mercado Pago se confirma automáticamente';
  end if;
  if new.dispatch is distinct from old.dispatch then
    if old.courier_id is not null then raise exception 'El pedido ya tiene domiciliario asignado'; end if;
    if new.dispatch = 'propio' then raise exception 'Usa "Asignar" para un domiciliario propio'; end if;
  end if;
  if old.status in ('entregado','rechazado') and new.status is distinct from old.status then
    raise exception 'Este pedido ya está cerrado';
  end if;
  if new.status = 'entregado' and old.status is distinct from 'entregado' then
    raise exception 'El pedido se finaliza cuando el domiciliario valida el código del cliente';
  end if;
  if new.status = 'enviado' and old.status is distinct from 'enviado' then
    raise exception 'Para entregar el pedido al domiciliario, escribe su código de retiro';
  end if;
  if new.payment_method = 'mercadopago' and new.status in ('aceptado','preparando','enviado')
     and new.payment_status <> 'validado' then
    raise exception 'El cliente aún no ha completado el pago con Mercado Pago';
  end if;
  if new.payment_method in ('transferencia','qr','link') and new.status in ('aceptado','preparando','enviado')
     and new.payment_status <> 'validado' then
    raise exception 'Primero valida el comprobante de pago';
  end if;
  return new;
end $$;

-- Usadas solo por las Edge Functions (service_role)
create or replace function public.mp_set_preference(p_order uuid, p_preference text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.ctx', 'system', true);
  update orders set mp_preference_id = p_preference where id = p_order;
end $$;
revoke all on function public.mp_set_preference(uuid, text) from public, anon, authenticated;
grant execute on function public.mp_set_preference(uuid, text) to service_role;

-- Aplica el estado de un pago consultado a la API de Mercado Pago
create or replace function public.mp_apply_payment(p_order uuid, p_payment_id text, p_status text, p_amount numeric)
returns text language plpgsql security definer set search_path = public as $$
declare o orders; new_ps text;
begin
  select * into o from orders where id = p_order and payment_method = 'mercadopago' for update;
  if not found then return 'pedido_no_encontrado'; end if;
  -- Un pago aprobado no se reemplaza por otro intento del mismo pedido
  if o.payment_status = 'validado' and o.mp_payment_id is distinct from p_payment_id then return 'ya_pagado'; end if;
  new_ps := case
    when p_status = 'approved' and p_amount >= o.total then 'validado'
    when p_status in ('refunded','charged_back') then 'rechazado'
    else 'pendiente' -- rechazado/cancelado/en proceso: el cliente puede volver a intentar
  end;
  perform set_config('app.ctx', 'system', true);
  update orders set mp_payment_id = p_payment_id, mp_status = p_status, payment_status = new_ps where id = p_order;
  return new_ps;
end $$;
revoke all on function public.mp_apply_payment(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.mp_apply_payment(uuid, text, text, numeric) to service_role;

-- ---------- Planes de suscripción para negocios (opcionales) ----------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null check (price >= 0),
  period text not null default 'mes',
  details text,
  checkout_url text not null check (checkout_url ~* '^https://'),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.subscription_plans enable row level security;
drop policy if exists "planes visibles" on public.subscription_plans;
create policy "planes visibles" on public.subscription_plans for select to authenticated using (active);

insert into public.subscription_plans (name, price, details, checkout_url, sort)
select * from (values
  ('Plan Premium', 150000, 'Máxima visibilidad para tu negocio.',
   'https://www.mercadopago.com.co/subscriptions/checkout?preapproval_plan_id=7ec5673404c441779fef94b4a2e253da', 1),
  ('Plan Plus', 100000, 'Más visibilidad y beneficios para crecer.',
   'https://www.mercadopago.com.co/subscriptions/checkout?preapproval_plan_id=ab7a81d746e4449a8aec48ec9ebfe146', 2),
  ('Plan Básico', 50000, 'Lo esencial para empezar.',
   'https://www.mercadopago.com.co/subscriptions/checkout?preapproval_plan_id=27abe7a2013e434088576b5de75de951', 3)
) v(name, price, details, checkout_url, sort)
where not exists (select 1 from public.subscription_plans);

create or replace function public.admin_list_plans(p_pass text) returns setof public.subscription_plans
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return query select * from subscription_plans order by sort, price desc;
end $$;

create or replace function public.admin_save_plan(p_pass text, p_plan jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid := nullif(p_plan->>'id', '')::uuid;
begin
  perform _admin_check(p_pass);
  if coalesce(trim(p_plan->>'name'), '') = '' then raise exception 'Escribe el nombre del plan'; end if;
  if coalesce(p_plan->>'checkout_url', '') !~* '^https://' then raise exception 'El link de pago debe empezar por https://'; end if;
  if pid is null then
    insert into subscription_plans (name, price, period, details, checkout_url, active, sort)
    values (trim(p_plan->>'name'), (p_plan->>'price')::numeric, coalesce(nullif(p_plan->>'period', ''), 'mes'),
            nullif(trim(p_plan->>'details'), ''), trim(p_plan->>'checkout_url'),
            coalesce((p_plan->>'active')::boolean, true), coalesce((p_plan->>'sort')::int, 0))
    returning id into pid;
  else
    update subscription_plans set
      name = trim(p_plan->>'name'), price = (p_plan->>'price')::numeric,
      period = coalesce(nullif(p_plan->>'period', ''), 'mes'), details = nullif(trim(p_plan->>'details'), ''),
      checkout_url = trim(p_plan->>'checkout_url'), active = coalesce((p_plan->>'active')::boolean, true),
      sort = coalesce((p_plan->>'sort')::int, 0)
    where id = pid;
  end if;
  return pid;
end $$;

create or replace function public.admin_delete_plan(p_pass text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  delete from subscription_plans where id = p_id;
end $$;
