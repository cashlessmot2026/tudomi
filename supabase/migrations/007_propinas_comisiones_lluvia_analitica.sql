-- =====================================================================
-- 007: Propina voluntaria, recargo por lluvia, comisiones de la plataforma y analítica
--   Comisión: Mercado Pago = 10% fijo del subtotal (sin domicilio ni propina).
--             Otros métodos = % que defina el superadmin, solo si la activa.
--   Lluvia:   recargo % sobre el domicilio (manual o automático con la función rain-check).
--   Ganancia del domiciliario = domicilio (con recargo) + propina.
-- =====================================================================

insert into public.app_settings(key, value) values
  ('commission_enabled', 'false'), ('commission_pct', '0'),
  ('rain_mode', 'false'), ('rain_pct', '50'), ('rain_auto', 'false'), ('rain_checked', '')
on conflict (key) do nothing;

create or replace function public._setting(p_key text) returns text
language sql stable security definer set search_path = public as $$
  select value from app_settings where key = p_key;
$$;
revoke all on function public._setting(text) from public, anon, authenticated;

-- Configuración pública (sin datos sensibles)
create or replace function public.payment_config() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'mp_enabled', coalesce(public._setting('mp_enabled') = 'true', false),
    'rain_mode', coalesce(public._setting('rain_mode') = 'true', false),
    'rain_pct', coalesce(nullif(public._setting('rain_pct'), '')::numeric, 50)
  );
$$;
grant execute on function public.payment_config() to anon, authenticated;

create or replace function public.admin_get_settings(p_pass text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return json_build_object(
    'commission_enabled', _setting('commission_enabled') = 'true',
    'commission_pct', coalesce(nullif(_setting('commission_pct'), '')::numeric, 0),
    'rain_mode', _setting('rain_mode') = 'true',
    'rain_pct', coalesce(nullif(_setting('rain_pct'), '')::numeric, 50),
    'rain_auto', _setting('rain_auto') = 'true',
    'rain_checked', nullif(_setting('rain_checked'), '')::json
  );
end $$;

create or replace function public.admin_set_settings(p_pass text, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  perform _admin_check(p_pass);
  if p ? 'commission_pct' and ((p->>'commission_pct')::numeric < 0 or (p->>'commission_pct')::numeric > 100) then
    raise exception 'La comisión debe estar entre 0 y 100%%';
  end if;
  if p ? 'rain_pct' and ((p->>'rain_pct')::numeric < 0 or (p->>'rain_pct')::numeric > 300) then
    raise exception 'El recargo por lluvia debe estar entre 0 y 300%%';
  end if;
  foreach k in array array['commission_enabled','commission_pct','rain_mode','rain_pct','rain_auto'] loop
    if p ? k then
      insert into app_settings(key, value) values (k, p->>k) on conflict (key) do update set value = excluded.value;
    end if;
  end loop;
end $$;

-- ---------- Pedidos ----------
alter table public.orders
  add column if not exists tip numeric not null default 0 check (tip >= 0),
  add column if not exists rain_surcharge numeric not null default 0,
  add column if not exists commission_pct numeric not null default 0,
  add column if not exists commission numeric not null default 0;

create or replace function public.orders_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b businesses; p products; h products; it jsonb;
  qty numeric; unit numeric; sub numeric := 0; out_items jsonb := '[]'::jsonb;
  cfg json := public.payment_config();
  rain numeric := 0; pct numeric := 0;
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
  if new.payment_method = 'mercadopago' and not (cfg->>'mp_enabled')::boolean then
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

  -- Recargo por lluvia sobre el domicilio
  if (cfg->>'rain_mode')::boolean then rain := round(b.delivery_fee * (cfg->>'rain_pct')::numeric / 100); end if;
  -- Comisión de la plataforma sobre el subtotal (venta neta sin domicilio ni propina)
  if new.payment_method = 'mercadopago' then pct := 10;
  elsif public._setting('commission_enabled') = 'true' then pct := coalesce(nullif(public._setting('commission_pct'), '')::numeric, 0);
  end if;

  new.customer_id := auth.uid();
  new.items := out_items;
  new.subtotal := sub;
  new.rain_surcharge := rain;
  new.delivery_fee := b.delivery_fee + rain;
  new.tip := least(greatest(round(coalesce(new.tip, 0)), 0), 1000000);
  new.total := sub + new.delivery_fee + new.tip;
  new.commission_pct := pct;
  new.commission := round(sub * pct / 100);
  new.status := 'pendiente';
  new.payment_status := case when new.payment_method in ('transferencia','qr','link','mercadopago') then 'pendiente' else 'no_aplica' end;
  if new.payment_method = 'mercadopago' then new.payment_proof_url := null; end if;
  new.mp_preference_id := null; new.mp_payment_id := null; new.mp_status := null;
  new.courier_id := null; new.courier_name := null; new.courier_phone := null;
  new.dispatch := null;
  new.reject_reason := null; new.delivered_at := null;
  return new;
end $$;

-- El domiciliario externo ve cuánto gana con cada pedido disponible
drop function if exists public.available_orders();
create function public.available_orders()
returns table (id uuid, number bigint, business_name text, business_address text, address text,
               total numeric, payment_method text, status text, created_at timestamptz, items_count int,
               delivery_fee numeric, rain_surcharge numeric, tip numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.number, b.name, b.address, o.address, o.total, o.payment_method, o.status, o.created_at,
         jsonb_array_length(o.items), o.delivery_fee, o.rain_surcharge, o.tip
  from orders o join businesses b on b.id = o.business_id
  where exists (select 1 from couriers c where c.id = auth.uid() and c.status = 'aprobado' and c.active and c.kind = 'externo')
    and o.courier_id is null
    and o.dispatch = 'externo'
    and o.status in ('aceptado','preparando')
  order by o.created_at;
$$;

-- ---------- Analítica (ventas = pedidos entregados, por día en hora de Colombia) ----------
create or replace function public._sales_summary(p_business uuid, p_from date, p_to date) returns json
language sql stable security definer set search_path = public as $$
  with o as (
    select (created_at at time zone 'America/Bogota')::date as d, *
    from orders
    where status = 'entregado'
      and (p_business is null or business_id = p_business)
      and (created_at at time zone 'America/Bogota')::date between p_from and p_to
  ), agg as (
    select d, count(*) as orders, sum(subtotal) as subtotal, sum(delivery_fee) as delivery,
           sum(rain_surcharge) as rain, sum(tip) as tips, sum(total) as total, sum(commission) as commission,
           coalesce(sum(total) filter (where payment_method = 'mercadopago'), 0) as mp_total,
           coalesce(sum(subtotal) filter (where payment_method = 'mercadopago'), 0) as mp_subtotal,
           coalesce(sum(commission) filter (where payment_method = 'mercadopago'), 0) as mp_commission
    from o group by grouping sets ((d), ())
  )
  select json_build_object(
    'daily', coalesce((select json_agg(json_build_object(
        'day', d, 'orders', orders, 'subtotal', subtotal, 'delivery', delivery, 'rain', rain, 'tips', tips,
        'total', total, 'commission', commission, 'mp_total', mp_total) order by d desc)
      from agg where d is not null), '[]'::json),
    'totals', (select json_build_object(
        'orders', coalesce(orders, 0), 'subtotal', coalesce(subtotal, 0), 'delivery', coalesce(delivery, 0),
        'rain', coalesce(rain, 0), 'tips', coalesce(tips, 0), 'total', coalesce(total, 0),
        'commission', coalesce(commission, 0), 'mp_total', mp_total, 'mp_subtotal', mp_subtotal,
        'mp_commission', mp_commission,
        -- Positivo: la plataforma le transfiere al negocio lo cobrado por MP menos todas sus comisiones.
        -- Negativo: el negocio le debe a la plataforma las comisiones de pagos que recibió directamente.
        'balance', mp_subtotal - coalesce(commission, 0))
      from agg where d is null)
  );
$$;
revoke all on function public._sales_summary(uuid, date, date) from public, anon, authenticated;

create or replace function public.admin_analytics(p_pass text, p_from date, p_to date) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return (select json_build_object(
    'summary', _sales_summary(null, p_from, p_to),
    'by_business', coalesce((select json_agg(t order by t.subtotal desc) from (
        select b.id, b.name, count(*) as orders, sum(o.subtotal) as subtotal, sum(o.commission) as commission,
               coalesce(sum(o.subtotal) filter (where o.payment_method = 'mercadopago'), 0) as mp_subtotal,
               coalesce(sum(o.delivery_fee + o.tip) filter (where o.payment_method = 'mercadopago'), 0) as mp_delivery_tips,
               coalesce(sum(o.subtotal) filter (where o.payment_method = 'mercadopago'), 0) - sum(o.commission) as balance
        from orders o join businesses b on b.id = o.business_id
        where o.status = 'entregado' and (o.created_at at time zone 'America/Bogota')::date between p_from and p_to
        group by b.id, b.name) t), '[]'::json),
    'by_courier', coalesce((select json_agg(t order by t.earnings desc) from (
        select o.courier_id as id, max(o.courier_name) as name, count(*) as deliveries,
               sum(o.delivery_fee) as delivery, sum(o.tip) as tips, sum(o.delivery_fee + o.tip) as earnings,
               coalesce(sum(o.delivery_fee + o.tip) filter (where o.payment_method = 'mercadopago'), 0) as mp_to_pay
        from orders o
        where o.status = 'entregado' and o.courier_id is not null
          and (o.created_at at time zone 'America/Bogota')::date between p_from and p_to
        group by o.courier_id) t), '[]'::json)
  ));
end $$;

create or replace function public.business_analytics(p_business uuid, p_from date, p_to date) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_business(p_business) then raise exception 'Negocio no encontrado'; end if;
  return _sales_summary(p_business, p_from, p_to);
end $$;

create or replace function public.courier_stats(p_from date, p_to date) returns json
language sql stable security definer set search_path = public as $$
  with o as (
    select (created_at at time zone 'America/Bogota')::date as d, *
    from orders
    where courier_id = auth.uid() and status = 'entregado'
      and (created_at at time zone 'America/Bogota')::date between p_from and p_to
  ), agg as (
    select d, count(*) as deliveries, sum(subtotal) as order_value, sum(delivery_fee - rain_surcharge) as delivery,
           sum(rain_surcharge) as rain, sum(tip) as tips, sum(delivery_fee + tip) as earnings
    from o group by grouping sets ((d), ())
  )
  select json_build_object(
    'daily', coalesce((select json_agg(json_build_object(
        'day', d, 'deliveries', deliveries, 'order_value', order_value, 'delivery', delivery,
        'rain', rain, 'tips', tips, 'earnings', earnings) order by d desc)
      from agg where d is not null), '[]'::json),
    'totals', (select json_build_object(
        'deliveries', coalesce(deliveries, 0), 'order_value', coalesce(order_value, 0), 'delivery', coalesce(delivery, 0),
        'rain', coalesce(rain, 0), 'tips', coalesce(tips, 0), 'earnings', coalesce(earnings, 0))
      from agg where d is null)
  );
$$;
