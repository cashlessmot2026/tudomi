-- =====================================================================
-- 013: Plan con comisión por venta, servicios por negocio y pantallazo de otra plataforma (domis)
--   * Plan "Comisión": $1.000/mes + 10% de cada venta, cobrado mes vencido en ciclos de 30 días.
--   * Servicios que el admin activa por negocio (y que el negocio puede pagar con un link):
--       externos (domiciliarios de la plataforma), publicidad_app, publicidad_push.
--   * Domiciliarios externos: pantallazo de su usuario en otra plataforma (Rappi, etc.).
-- =====================================================================

-- ---------- Domiciliarios: pantallazo de otra plataforma ----------
alter table public.couriers add column if not exists other_platform_url text;

-- ---------- Planes: comisión por venta y link opcional ----------
alter table public.subscription_plans
  add column if not exists commission_pct numeric not null default 0 check (commission_pct >= 0 and commission_pct <= 100);
alter table public.subscription_plans alter column checkout_url drop not null;

insert into public.subscription_plans (name, price, details, checkout_url, commission_pct, sort)
select 'Plan Comisión', 1000,
       'Pagas $1.000 al mes y el 10% del valor de cada venta. Se cobra mes vencido, con corte cada 30 días.',
       null, 10, 4
where not exists (select 1 from public.subscription_plans where commission_pct > 0);

create or replace function public.admin_save_plan(p_pass text, p_plan jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := nullif(p_plan->>'id', '')::uuid;
  url text := nullif(trim(coalesce(p_plan->>'checkout_url', '')), '');
  pct numeric := coalesce(nullif(p_plan->>'commission_pct', '')::numeric, 0);
begin
  perform _admin_check(p_pass);
  if coalesce(trim(p_plan->>'name'), '') = '' then raise exception 'Escribe el nombre del plan'; end if;
  if url is not null and url !~* '^https://' then raise exception 'El link de pago debe empezar por https://'; end if;
  if pct < 0 or pct > 100 then raise exception 'La comisión debe estar entre 0 y 100%%'; end if;
  if pid is null then
    insert into subscription_plans (name, price, period, details, checkout_url, commission_pct, active, sort)
    values (trim(p_plan->>'name'), (p_plan->>'price')::numeric, coalesce(nullif(p_plan->>'period', ''), 'mes'),
            nullif(trim(p_plan->>'details'), ''), url, pct,
            coalesce((p_plan->>'active')::boolean, true), coalesce((p_plan->>'sort')::int, 0))
    returning id into pid;
  else
    update subscription_plans set
      name = trim(p_plan->>'name'), price = (p_plan->>'price')::numeric,
      period = coalesce(nullif(p_plan->>'period', ''), 'mes'), details = nullif(trim(p_plan->>'details'), ''),
      checkout_url = url, commission_pct = pct, active = coalesce((p_plan->>'active')::boolean, true),
      sort = coalesce((p_plan->>'sort')::int, 0)
    where id = pid;
  end if;
  return pid;
end $$;

-- ---------- Plan de cada negocio ----------
create table if not exists public.business_subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  active boolean not null default true,
  started_on date not null default ((now() at time zone 'America/Bogota')::date),
  updated_at timestamptz not null default now()
);
alter table public.business_subscriptions enable row level security;
drop policy if exists "negocio ve su plan" on public.business_subscriptions;
create policy "negocio ve su plan" on public.business_subscriptions for select using (public.owns_business(business_id));

-- ---------- Servicios ----------
create table if not exists public.services (
  key text primary key,
  name text not null,
  price numeric not null default 0 check (price >= 0),
  period text not null default 'mes',
  details text,
  checkout_url text check (checkout_url is null or checkout_url ~* '^https://'),
  active boolean not null default true,
  sort int not null default 0
);
alter table public.services enable row level security;
drop policy if exists "servicios visibles" on public.services;
create policy "servicios visibles" on public.services for select to authenticated using (active);

insert into public.services (key, name, price, details, sort) values
  ('externos', 'Domiciliarios externos', 0, 'Publica tus pedidos para los domiciliarios de la plataforma.', 1),
  ('publicidad_app', 'Publicidad dentro de la app', 0, 'Tu negocio aparece en el carrusel de anuncios del inicio.', 2),
  ('publicidad_push', 'Mensajes push de publicidad', 0, 'Enviamos notificaciones push con tus promociones a los clientes.', 3)
on conflict (key) do nothing;

create table if not exists public.business_services (
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_key text not null references public.services(key) on delete cascade,
  active boolean not null default true,
  activated_on date not null default ((now() at time zone 'America/Bogota')::date),
  primary key (business_id, service_key)
);
alter table public.business_services enable row level security;
drop policy if exists "negocio ve sus servicios" on public.business_services;
create policy "negocio ve sus servicios" on public.business_services for select using (public.owns_business(business_id));

-- Los negocios que ya existen conservan los domiciliarios externos para que nada se rompa
insert into public.business_services (business_id, service_key)
select id, 'externos' from public.businesses
on conflict do nothing;

create or replace function public._biz_service_on(b uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_services where business_id = b and service_key = k and active);
$$;
revoke all on function public._biz_service_on(uuid, text) from public, anon, authenticated;

-- Sin el servicio activo, el negocio no publica pedidos para externos (se redefine el guard de la 011)
create or replace function public.orders_external_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_system_ctx() then return new; end if;
  if new.dispatch = 'externo' and new.dispatch is distinct from old.dispatch then
    if not public._external_on() then
      raise exception 'Los domiciliarios externos están desactivados. Asigna uno de tus domiciliarios propios';
    end if;
    if not public._biz_service_on(new.business_id, 'externos') then
      raise exception 'Activa el servicio de domiciliarios externos en la pestaña Planes, o asigna uno de tus domiciliarios propios';
    end if;
  end if;
  return new;
end $$;

-- ---------- Comisión del plan sobre cada pedido (corre después de orders_before_insert) ----------
create or replace function public.orders_plan_commission() returns trigger
language plpgsql security definer set search_path = public as $$
declare pct numeric;
begin
  select p.commission_pct into pct
  from business_subscriptions bs join subscription_plans p on p.id = bs.plan_id
  where bs.business_id = new.business_id and bs.active and p.commission_pct > 0;
  if pct is null then return new; end if;
  if new.payment_method = 'mercadopago' then pct := greatest(pct, 10); end if;
  new.commission_pct := pct;
  new.commission := round(new.subtotal * pct / 100);
  return new;
end $$;
drop trigger if exists orders_plan_commission on public.orders;
create trigger orders_plan_commission before insert on public.orders
  for each row execute function public.orders_plan_commission();

-- ---------- Cobro: ciclos de 30 días desde la activación, cobrados mes vencido ----------
create or replace function public._cycle_totals(b uuid, d1 date, d2 date) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'orders', count(*), 'sales', coalesce(sum(subtotal), 0), 'commission', coalesce(sum(commission), 0))
  from orders
  where business_id = b and status = 'entregado'
    and (created_at at time zone 'America/Bogota')::date between d1 and d2;
$$;
revoke all on function public._cycle_totals(uuid, date, date) from public, anon, authenticated;

create or replace function public._billing_for(b uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  bs business_subscriptions; p subscription_plans;
  t date := (now() at time zone 'America/Bogota')::date;
  n int; cs date; cur json; prev json; due json := null;
begin
  select * into bs from business_subscriptions where business_id = b;
  if not found then return null; end if;
  select * into p from subscription_plans where id = bs.plan_id;
  if not found then return null; end if;
  n := greatest(0, (t - bs.started_on) / 30);
  cs := bs.started_on + n * 30;
  cur := _cycle_totals(b, cs, cs + 29);
  if n >= 1 then
    prev := _cycle_totals(b, cs - 30, cs - 1);
    due := json_build_object('start', cs - 30, 'end', cs - 1, 'orders', prev->'orders', 'sales', prev->'sales',
                             'commission', prev->'commission',
                             'total', p.price + (prev->>'commission')::numeric);
  end if;
  return json_build_object(
    'plan_id', p.id, 'plan_name', p.name, 'active', bs.active, 'price', p.price,
    'commission_pct', p.commission_pct, 'started_on', bs.started_on,
    'cycle_start', cs, 'cycle_end', cs + 29, 'cycle_cut', cs + 30,
    'cycle', cur, 'due', due);
end $$;
revoke all on function public._billing_for(uuid) from public, anon, authenticated;

-- Admin: plan, cobro y servicios de todos los negocios
create or replace function public.admin_business_billing(p_pass text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return coalesce((
    select json_agg(json_build_object(
      'business_id', b.id,
      'billing', _billing_for(b.id),
      'services', coalesce((select json_agg(s.service_key) from business_services s where s.business_id = b.id and s.active), '[]'::json)))
    from businesses b), '[]'::json);
end $$;

create or replace function public.admin_set_business_plan(p_pass text, p_business uuid, p_plan uuid, p_active boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare cur business_subscriptions;
begin
  perform _admin_check(p_pass);
  if p_plan is null then
    delete from business_subscriptions where business_id = p_business;
    return;
  end if;
  select * into cur from business_subscriptions where business_id = p_business;
  if not found then
    insert into business_subscriptions (business_id, plan_id, active) values (p_business, p_plan, coalesce(p_active, true));
  else
    update business_subscriptions set
      plan_id = p_plan,
      active = coalesce(p_active, true),
      -- el ciclo de 30 días arranca de nuevo si cambia el plan o se reactiva
      started_on = case when cur.plan_id is distinct from p_plan or (not cur.active and coalesce(p_active, true))
                        then (now() at time zone 'America/Bogota')::date else cur.started_on end,
      updated_at = now()
    where business_id = p_business;
  end if;
end $$;

create or replace function public.admin_list_services(p_pass text) returns setof public.services
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return query select * from services order by sort;
end $$;

create or replace function public.admin_save_service(p_pass text, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare url text := nullif(trim(coalesce(p->>'checkout_url', '')), '');
begin
  perform _admin_check(p_pass);
  if url is not null and url !~* '^https://' then raise exception 'El link de pago debe empezar por https://'; end if;
  update services set
    price = coalesce(nullif(p->>'price', '')::numeric, 0),
    details = nullif(trim(coalesce(p->>'details', '')), ''),
    checkout_url = url,
    active = coalesce((p->>'active')::boolean, true)
  where key = p->>'key';
end $$;

create or replace function public.admin_set_business_service(p_pass text, p_business uuid, p_key text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  insert into business_services (business_id, service_key, active) values (p_business, p_key, p_active)
  on conflict (business_id, service_key) do update set
    active = excluded.active,
    activated_on = case when excluded.active and not business_services.active
                        then (now() at time zone 'America/Bogota')::date else business_services.activated_on end;
end $$;

-- Negocio: su plan y cobro (solo del dueño)
create or replace function public.my_billing(p_business uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_business(p_business) then raise exception 'Negocio no encontrado'; end if;
  return _billing_for(p_business);
end $$;
grant execute on function public.my_billing(uuid) to authenticated;
