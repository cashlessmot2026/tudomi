-- =====================================================================
-- 003: Coordenadas de direcciones + ubicación del domiciliario en tiempo real
-- =====================================================================

-- Coordenadas de las direcciones (cliente, negocio y destino del pedido)
alter table public.profiles
  add column if not exists lat double precision check (lat between -90 and 90),
  add column if not exists lng double precision check (lng between -180 and 180);
alter table public.businesses
  add column if not exists lat double precision check (lat between -90 and 90),
  add column if not exists lng double precision check (lng between -180 and 180);
alter table public.orders
  add column if not exists lat double precision check (lat between -90 and 90),
  add column if not exists lng double precision check (lng between -180 and 180);

-- El registro con formulario puede traer la ubicación en los metadatos
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  la double precision;
  lo double precision;
begin
  begin
    la := nullif(m->>'lat', '')::double precision;
    lo := nullif(m->>'lng', '')::double precision;
    if la not between -90 and 90 or lo not between -180 and 180 then la := null; lo := null; end if;
  exception when others then la := null; lo := null;
  end;
  insert into profiles (id, full_name, email, phone, address, avatar_url, lat, lng)
  values (
    new.id,
    coalesce(m->>'full_name', m->>'name', ''),
    new.email,
    m->>'phone',
    m->>'address',
    coalesce(m->>'avatar_url', m->>'picture'),
    la, lo
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Posición en vivo del domiciliario (una fila por domiciliario, se actualiza con upsert)
create table if not exists public.courier_locations (
  courier_id uuid primary key references public.couriers(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy double precision,
  heading double precision,
  speed double precision,
  updated_at timestamptz not null default now()
);
alter table public.courier_locations enable row level security;

drop policy if exists "domi publica su ubicacion" on public.courier_locations;
drop policy if exists "domi actualiza su ubicacion" on public.courier_locations;
drop policy if exists "ver domi en vivo" on public.courier_locations;

create policy "domi publica su ubicacion" on public.courier_locations for insert to authenticated
  with check (courier_id = auth.uid() and public.is_approved_courier());
create policy "domi actualiza su ubicacion" on public.courier_locations for update to authenticated
  using (courier_id = auth.uid()) with check (courier_id = auth.uid() and public.is_approved_courier());

-- La ven: el propio domi, y el cliente / negocio de un pedido ACTIVO asignado a ese domi
create policy "ver domi en vivo" on public.courier_locations for select using (
  courier_id = auth.uid()
  or exists (
    select 1 from public.orders o
    where o.courier_id = courier_locations.courier_id
      and o.status in ('aceptado','preparando','enviado')
      and (o.customer_id = auth.uid() or public.owns_business(o.business_id))
  )
);

do $$ begin
  alter publication supabase_realtime add table public.courier_locations;
exception when duplicate_object then null; end $$;

-- El admin ve también la última posición del domi en el detalle del pedido
create or replace function public.admin_get_order(p_pass text, p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return (
    select json_build_object(
      'order', to_json(o),
      'business', json_build_object('name', b.name, 'address', b.address, 'phone', b.phone, 'lat', b.lat, 'lng', b.lng),
      'location', (select to_json(l) from delivery_locations l where l.order_id = o.id),
      'courier_location', (select to_json(c) from courier_locations c where c.courier_id = o.courier_id)
    )
    from orders o left join businesses b on b.id = o.business_id
    where o.id = p_id
  );
end $$;
