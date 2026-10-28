-- =====================================================================
-- 004: Domiciliarios propios del negocio + asignación de pedidos + nuevos métodos de pago
-- =====================================================================

-- ---------- Métodos de pago ----------
alter table public.businesses
  add column if not exists accepts_card boolean not null default false,
  add column if not exists accepts_qr boolean not null default false,
  add column if not exists accepts_link boolean not null default false,
  add column if not exists qr_image_url text,
  add column if not exists payment_link_url text;

alter table public.businesses drop constraint if exists businesses_payment_chk;
alter table public.businesses add constraint businesses_payment_chk
  check (accepts_cash or accepts_transfer or accepts_card or accepts_qr or accepts_link);

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('efectivo','transferencia','datafono','qr','link'));

-- Cómo se despacha el pedido: domiciliario propio del negocio o externo de la plataforma
alter table public.orders add column if not exists dispatch text check (dispatch in ('externo','propio'));

-- ---------- Domiciliarios propios ----------
alter table public.couriers
  add column if not exists kind text not null default 'externo' check (kind in ('externo','propio')),
  add column if not exists business_id uuid references public.businesses(id) on delete cascade,
  add column if not exists active boolean not null default true,
  add column if not exists email text;

alter table public.couriers
  alter column soat_url drop not null,
  alter column tecnomecanica_url drop not null,
  alter column license_url drop not null,
  alter column id_card_url drop not null,
  alter column document_number drop not null,
  alter column vehicle_plate drop not null;

-- Los externos siguen necesitando todos sus documentos
alter table public.couriers drop constraint if exists couriers_docs_chk;
alter table public.couriers add constraint couriers_docs_chk check (
  kind = 'propio' or (
    soat_url is not null and tecnomecanica_url is not null and license_url is not null
    and id_card_url is not null and document_number is not null and vehicle_plate is not null
  )
);
alter table public.couriers drop constraint if exists couriers_kind_chk;
alter table public.couriers add constraint couriers_kind_chk check ((kind = 'propio') = (business_id is not null));

-- Invitaciones: el negocio registra al domi por correo; se vincula cuando el domi inicia sesión
create table if not exists public.business_courier_invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  full_name text not null,
  phone text not null,
  vehicle_plate text,
  claimed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);
alter table public.business_courier_invites enable row level security;

drop policy if exists "negocio ve sus invitaciones" on public.business_courier_invites;
drop policy if exists "negocio crea invitaciones" on public.business_courier_invites;
drop policy if exists "negocio borra invitaciones" on public.business_courier_invites;
create policy "negocio ve sus invitaciones" on public.business_courier_invites for select using (public.owns_business(business_id));
create policy "negocio crea invitaciones" on public.business_courier_invites for insert to authenticated
  with check (public.owns_business(business_id) and claimed_by is null);
create policy "negocio borra invitaciones" on public.business_courier_invites for delete using (public.owns_business(business_id) and claimed_by is null);

-- El negocio ve a sus domiciliarios propios
drop policy if exists "negocio ve sus domis propios" on public.couriers;
create policy "negocio ve sus domis propios" on public.couriers for select using (kind = 'propio' and public.owns_business(business_id));

create or replace function public.is_approved_courier() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from couriers where id = auth.uid() and status = 'aprobado' and active);
$$;

-- El domi no puede cambiarse tipo, negocio ni estado activo
create or replace function public.couriers_guard() returns trigger language plpgsql as $$
begin
  if public.is_system_ctx() then new.updated_at := now(); return new; end if;
  if tg_op = 'INSERT' then
    new.id := auth.uid();
    new.status := 'pendiente';
    new.admin_note := null;
    new.kind := 'externo';
    new.business_id := null;
    new.active := true;
  else
    if new.status is distinct from old.status and not (old.status = 'rechazado' and new.status = 'pendiente') then
      raise exception 'Solo el administrador puede cambiar el estado del domiciliario';
    end if;
    new.admin_note := old.admin_note;
    new.kind := old.kind;
    new.business_id := old.business_id;
    new.active := old.active;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Al entrar a /domiciliario: si hay una invitación para su correo, queda como domi propio aprobado
create or replace function public.claim_courier_invite() returns text
language plpgsql security definer set search_path = public as $$
declare
  inv business_courier_invites;
  em text;
  c couriers;
begin
  if auth.uid() is null then return 'sin_sesion'; end if;
  select * into c from couriers where id = auth.uid();
  if found then return c.kind; end if;
  select lower(email) into em from auth.users where id = auth.uid();
  select * into inv from business_courier_invites where email = em and claimed_by is null order by created_at limit 1;
  if not found then return 'ninguna'; end if;
  perform set_config('app.ctx', 'system', true);
  insert into couriers (id, full_name, phone, vehicle_plate, kind, business_id, status, active, email)
  values (auth.uid(), inv.full_name, inv.phone, inv.vehicle_plate, 'propio', inv.business_id, 'aprobado', true, em);
  update business_courier_invites set claimed_by = auth.uid() where id = inv.id;
  return 'propio';
end $$;

create or replace function public.set_own_courier_active(p_courier uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c couriers;
begin
  select * into c from couriers where id = p_courier and kind = 'propio';
  if not found or not public.owns_business(c.business_id) then raise exception 'Domiciliario no encontrado'; end if;
  perform set_config('app.ctx', 'system', true);
  update couriers set active = p_active where id = p_courier;
end $$;

-- El negocio asigna el pedido a uno de sus domiciliarios propios
create or replace function public.assign_own_courier(p_order uuid, p_courier uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; c couriers;
begin
  select * into o from orders where id = p_order;
  if not found or not public.owns_business(o.business_id) then raise exception 'Pedido no encontrado'; end if;
  if o.courier_id is not null then raise exception 'El pedido ya tiene domiciliario'; end if;
  if o.status not in ('aceptado','preparando') then raise exception 'Primero acepta el pedido'; end if;
  select * into c from couriers
    where id = p_courier and kind = 'propio' and business_id = o.business_id and active and status = 'aprobado';
  if not found then raise exception 'Ese domiciliario no está disponible'; end if;
  perform set_config('app.ctx', 'system', true);
  update orders set courier_id = c.id, courier_name = c.full_name, courier_phone = c.phone, dispatch = 'propio'
   where id = p_order;
end $$;

-- Los externos solo ven pedidos que el negocio envió a externos
create or replace function public.available_orders()
returns table (id uuid, number bigint, business_name text, business_address text, address text,
               total numeric, payment_method text, status text, created_at timestamptz, items_count int)
language sql stable security definer set search_path = public as $$
  select o.id, o.number, b.name, b.address, o.address, o.total, o.payment_method, o.status, o.created_at, jsonb_array_length(o.items)
  from orders o join businesses b on b.id = o.business_id
  where exists (select 1 from couriers c where c.id = auth.uid() and c.status = 'aprobado' and c.active and c.kind = 'externo')
    and o.courier_id is null
    and o.dispatch = 'externo'
    and o.status in ('aceptado','preparando')
  order by o.created_at;
$$;

create or replace function public.take_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c couriers;
begin
  select * into c from couriers where id = auth.uid() and status = 'aprobado' and active and kind = 'externo';
  if not found then raise exception 'Tu cuenta de domiciliario no puede tomar pedidos públicos'; end if;
  perform set_config('app.ctx', 'system', true);
  update orders set courier_id = c.id, courier_name = c.full_name, courier_phone = c.phone
   where id = p_order and courier_id is null and dispatch = 'externo' and status in ('aceptado','preparando');
  if not found then raise exception 'Este pedido ya fue tomado o no está disponible'; end if;
end $$;

-- ---------- Pedidos: validación de pagos y despacho ----------
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
  new.payment_status := case when new.payment_method in ('transferencia','qr','link') then 'pendiente' else 'no_aplica' end;
  new.courier_id := null; new.courier_name := null; new.courier_phone := null;
  new.dispatch := null;
  new.reject_reason := null; new.delivered_at := null;
  new.delivery_code := lpad(floor(random() * 10000)::int::text, 4, '0');
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
  if new.payment_method in ('transferencia','qr','link') and new.status in ('aceptado','preparando','enviado')
     and new.payment_status <> 'validado' then
    raise exception 'Primero valida el comprobante de pago';
  end if;
  return new;
end $$;

-- Pedidos aceptados antes de este cambio quedan disponibles para externos
update public.orders set dispatch = 'externo'
 where dispatch is null and courier_id is null and status in ('aceptado','preparando');
