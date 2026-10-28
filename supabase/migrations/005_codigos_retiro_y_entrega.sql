-- =====================================================================
-- 005: Código de retiro (domi -> negocio) y código de entrega oculto al domi
-- Los códigos viven en order_codes, sin políticas de lectura: solo se obtienen con
-- my_order_codes(), que devuelve a cada uno lo que le corresponde:
--   delivery_code -> cliente y negocio (NO el domiciliario)
--   pickup_code   -> solo el domiciliario asignado (NO el negocio ni el cliente)
-- =====================================================================

create table if not exists public.order_codes (
  order_id uuid primary key references public.orders(id) on delete cascade,
  delivery_code char(4) not null,
  pickup_code char(4) not null check (pickup_code <> delivery_code),
  picked_up_at timestamptz
);
alter table public.order_codes enable row level security;
-- Sin políticas: nadie la lee ni la escribe directamente.

-- Genera dos códigos distintos de 4 dígitos
create or replace function public.new_order_codes(p_order uuid, p_delivery text default null) returns void
language plpgsql security definer set search_path = public as $$
declare d int := coalesce(nullif(p_delivery, '')::int, floor(random() * 10000)::int);
begin
  insert into order_codes (order_id, delivery_code, pickup_code)
  values (p_order, lpad(d::text, 4, '0'), lpad(((d + 1 + floor(random() * 9999)::int) % 10000)::text, 4, '0'))
  on conflict (order_id) do nothing;
end $$;
revoke all on function public.new_order_codes(uuid, text) from public, anon, authenticated;

-- Pedidos existentes: se conserva su código de entrega y se crea el de retiro
do $$
declare r record;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_code') then
    for r in execute 'select id, delivery_code from public.orders' loop
      perform public.new_order_codes(r.id, r.delivery_code);
    end loop;
  end if;
end $$;

create or replace function public.orders_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.new_order_codes(new.id);
  return new;
end $$;
drop trigger if exists orders_after_insert on public.orders;
create trigger orders_after_insert after insert on public.orders
  for each row execute function public.orders_after_insert();

-- El insert ya no toca delivery_code (la columna se elimina abajo)
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
  return new;
end $$;

-- Con domiciliario asignado, "En camino" solo se marca validando el código de retiro
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
  if new.status = 'enviado' and old.status is distinct from 'enviado' then
    raise exception 'Para entregar el pedido al domiciliario, escribe su código de retiro';
  end if;
  if new.payment_method in ('transferencia','qr','link') and new.status in ('aceptado','preparando','enviado')
     and new.payment_status <> 'validado' then
    raise exception 'Primero valida el comprobante de pago';
  end if;
  return new;
end $$;

-- Códigos que le corresponden al usuario actual
create or replace function public.my_order_codes(p_order uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare o orders; c order_codes; res jsonb := '{}'::jsonb;
begin
  select * into o from orders where id = p_order;
  if not found then return null; end if;
  select * into c from order_codes where order_id = p_order;
  if not found then return null; end if;
  if o.customer_id = auth.uid() or public.owns_business(o.business_id) then
    res := res || jsonb_build_object('delivery_code', c.delivery_code);
  end if;
  if o.courier_id = auth.uid() then
    res := res || jsonb_build_object('pickup_code', c.pickup_code);
  end if;
  if res = '{}'::jsonb then return null; end if;
  return res || jsonb_build_object('picked_up_at', c.picked_up_at);
end $$;

-- El negocio escribe el código que le dicta el domiciliario y le entrega el pedido
create or replace function public.confirm_pickup(p_order uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; c order_codes;
begin
  select * into o from orders where id = p_order;
  if not found or not public.owns_business(o.business_id) then raise exception 'Pedido no encontrado'; end if;
  if o.courier_id is null then raise exception 'El pedido aún no tiene domiciliario asignado'; end if;
  if o.status not in ('aceptado','preparando') then raise exception 'El pedido no está listo para entregar al domiciliario'; end if;
  select * into c from order_codes where order_id = p_order;
  if c.pickup_code <> trim(coalesce(p_code, '')) then
    raise exception 'Código de retiro incorrecto. Pídele al domiciliario el código que aparece en su app';
  end if;
  perform set_config('app.ctx', 'system', true);
  update order_codes set picked_up_at = now() where order_id = p_order;
  update orders set status = 'enviado' where id = p_order;
end $$;

-- El domiciliario ya no marca "recogido" por su cuenta
create or replace function public.courier_mark_sent(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Díctale tu código de retiro al negocio para que te entregue el pedido';
end $$;

-- La entrega se cierra con el código del cliente, comparado contra order_codes
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
  c order_codes;
  ok_gps boolean := p_lat between -90 and 90 and p_lng between -180 and 180;
begin
  select * into o from orders where id = p_order and courier_id = auth.uid();
  if not found then raise exception 'Este pedido no está asignado a ti'; end if;
  if o.status <> 'enviado' then raise exception 'Primero recoge el pedido en el negocio con tu código de retiro'; end if;
  select * into c from order_codes where order_id = p_order;
  if c.delivery_code <> trim(coalesce(p_code, '')) then
    raise exception 'Código incorrecto. Pídele al cliente su código de 4 dígitos';
  end if;

  perform set_config('app.ctx', 'system', true);
  update orders set status = 'entregado', delivered_at = now() where id = p_order;

  insert into delivery_locations (order_id, lat, lng, accuracy, gps_status)
  values (
    p_order,
    case when ok_gps then p_lat end,
    case when ok_gps then p_lng end,
    case when ok_gps then p_accuracy end,
    case when ok_gps then 'ok' when p_gps_status = 'sin_permiso' then 'sin_permiso' else 'no_disponible' end
  )
  on conflict (order_id) do update set
    lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy,
    gps_status = excluded.gps_status, captured_at = now();
end $$;

-- El admin ve ambos códigos
create or replace function public.admin_get_order(p_pass text, p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return (
    select json_build_object(
      'order', to_json(o),
      'business', json_build_object('name', b.name, 'address', b.address, 'phone', b.phone, 'lat', b.lat, 'lng', b.lng),
      'location', (select to_json(l) from delivery_locations l where l.order_id = o.id),
      'courier_location', (select to_json(cl) from courier_locations cl where cl.courier_id = o.courier_id),
      'codes', (select to_json(oc) from order_codes oc where oc.order_id = o.id)
    )
    from orders o left join businesses b on b.id = o.business_id
    where o.id = p_id
  );
end $$;

-- El código de entrega ya no vive en la tabla de pedidos (el domi podía leerlo ahí)
alter table public.orders drop column if exists delivery_code;
