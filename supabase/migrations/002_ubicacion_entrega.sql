-- =====================================================================
-- 002: Ubicación GPS de la entrega + detalle de pedido para el admin
-- La ubicación vive en una tabla aparte: solo la leen el negocio del pedido y el admin
-- (el domiciliario y el cliente no tienen acceso).
-- =====================================================================

create table if not exists public.delivery_locations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy double precision,
  gps_status text not null default 'ok' check (gps_status in ('ok','sin_permiso','no_disponible')),
  captured_at timestamptz not null default now()
);

alter table public.delivery_locations enable row level security;

drop policy if exists "ubicacion entrega negocio" on public.delivery_locations;
create policy "ubicacion entrega negocio" on public.delivery_locations for select using (
  exists (select 1 from public.orders o where o.id = order_id and public.owns_business(o.business_id))
);
-- Sin políticas de insert/update: solo se escribe desde complete_delivery (security definer)

drop function if exists public.complete_delivery(uuid, text);
create or replace function public.complete_delivery(
  p_order uuid,
  p_code text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null,
  p_gps_status text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  ok_gps boolean := p_lat between -90 and 90 and p_lng between -180 and 180;
begin
  select * into o from orders where id = p_order and courier_id = auth.uid();
  if not found then raise exception 'Este pedido no está asignado a ti'; end if;
  if o.status not in ('aceptado','preparando','enviado') then raise exception 'El pedido no está en ruta'; end if;
  if o.delivery_code <> trim(p_code) then raise exception 'Código incorrecto. Pídele al cliente su código de 4 dígitos'; end if;

  perform set_config('app.ctx', 'system', true);
  update orders set status = 'entregado', delivered_at = now() where id = p_order;

  insert into delivery_locations (order_id, lat, lng, accuracy, gps_status)
  values (
    p_order,
    case when ok_gps then p_lat end,
    case when ok_gps then p_lng end,
    case when ok_gps then p_accuracy end,
    case when ok_gps then 'ok'
         when p_gps_status = 'sin_permiso' then 'sin_permiso'
         else 'no_disponible' end
  )
  on conflict (order_id) do update set
    lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
    gps_status = excluded.gps_status, captured_at = now();
end $$;

-- Detalle completo de un pedido para el admin (ticket + negocio + ubicación de entrega)
create or replace function public.admin_get_order(p_pass text, p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return (
    select json_build_object(
      'order', to_json(o),
      'business', json_build_object('name', b.name, 'address', b.address, 'phone', b.phone),
      'location', (select to_json(l) from delivery_locations l where l.order_id = o.id)
    )
    from orders o left join businesses b on b.id = o.business_id
    where o.id = p_id
  );
end $$;

-- La lista del admin indica si el pedido tiene ubicación registrada
create or replace function public.admin_list_orders(p_pass text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return (select coalesce(json_agg(t), '[]'::json) from (
    select o.id, o.number, o.status, o.payment_method, o.payment_status, o.total, o.created_at,
           o.customer_name, o.courier_name, b.name as business_name,
           (l.gps_status = 'ok') as has_gps
    from orders o
    left join businesses b on b.id = o.business_id
    left join delivery_locations l on l.order_id = o.id
    order by o.created_at desc limit 200) t);
end $$;
