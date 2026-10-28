-- =====================================================================
-- TuDomi - Esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar completo en: Supabase Dashboard > SQL Editor
-- Es idempotente: se puede volver a ejecutar sin perder datos.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- TABLAS
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  address text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('restaurante','minimarket','tecnologia')),
  description text,
  logo_url text,
  cover_url text,
  address text,
  phone text,
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  accepts_cash boolean not null default true,
  accepts_transfer boolean not null default false,
  transfer_info text,
  is_open boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint businesses_payment_chk check (accepts_cash or accepts_transfer)
);
create index if not exists businesses_owner_idx on public.businesses(owner_id);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  section text,
  price numeric(12,2) not null check (price >= 0),
  perishable boolean not null default false,
  sale_type text not null default 'unidad' check (sale_type in ('unidad','peso')),
  weight_unit text check (weight_unit in ('lb','kg')),
  is_pizza boolean not null default false,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  constraint products_weight_chk check (sale_type = 'unidad' or weight_unit is not null)
);
create index if not exists products_business_idx on public.products(business_id);

create table if not exists public.couriers (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null,
  document_number text not null,
  phone text not null,
  vehicle_plate text not null,
  vehicle_model text,
  soat_url text not null,
  tecnomecanica_url text not null,
  license_url text not null,
  id_card_url text not null,
  status text not null default 'pendiente' check (status in ('pendiente','aprobado','rechazado')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  customer_id uuid not null default auth.uid() references auth.users(id),
  business_id uuid not null references public.businesses(id),
  courier_id uuid references public.couriers(id),
  courier_name text,
  courier_phone text,
  customer_name text,
  phone text,
  address text not null,
  note text,
  items jsonb not null,
  subtotal numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text not null check (payment_method in ('efectivo','transferencia')),
  payment_proof_url text,
  payment_status text not null default 'no_aplica' check (payment_status in ('no_aplica','pendiente','validado','rechazado')),
  status text not null default 'pendiente' check (status in ('pendiente','aceptado','preparando','enviado','entregado','rechazado')),
  delivery_code char(4) not null default '0000',
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists orders_customer_idx on public.orders(customer_id);
create index if not exists orders_business_idx on public.orders(business_id);
create index if not exists orders_courier_idx on public.orders(courier_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id),
  sender_role text not null check (sender_role in ('cliente','negocio')),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_order_idx on public.messages(order_id);

-- Suscripciones Web Push (se usarán desde el Worker de Cloudflare)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  app text not null default 'cliente' check (app in ('cliente','negocio','domi')),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Configuración privada (sin políticas = nadie la lee desde el cliente)
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);
insert into public.app_settings(key, value)
values ('admin_password', extensions.crypt('1234', extensions.gen_salt('bf')))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------
create or replace function public.owns_business(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses where id = b and owner_id = auth.uid());
$$;

create or replace function public.is_approved_courier() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from couriers where id = auth.uid() and status = 'aprobado');
$$;

create or replace function public.is_order_chat_member(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from orders o
    where o.id = p_order and (o.customer_id = auth.uid() or public.owns_business(o.business_id))
  );
$$;

create or replace function public.is_system_ctx() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.ctx', true), '') = 'system';
$$;

-- ---------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------
-- Perfil automático al registrarse (formulario o Google)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, phone, address, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'address',
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email)
select id, email from auth.users on conflict (id) do nothing;

-- Negocios: el dueño no puede activarse/desactivarse (lo hace el admin)
create or replace function public.businesses_guard() returns trigger
language plpgsql as $$
begin
  if public.is_system_ctx() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.active := true;
  else
    new.owner_id := old.owner_id;
    new.active := old.active;
  end if;
  return new;
end $$;
drop trigger if exists businesses_guard on public.businesses;
create trigger businesses_guard before insert or update on public.businesses
  for each row execute function public.businesses_guard();

-- Domiciliarios: solo el admin aprueba/rechaza
create or replace function public.couriers_guard() returns trigger
language plpgsql as $$
begin
  if public.is_system_ctx() then new.updated_at := now(); return new; end if;
  if tg_op = 'INSERT' then
    new.id := auth.uid();
    new.status := 'pendiente';
    new.admin_note := null;
  else
    if new.status is distinct from old.status
       and not (old.status = 'rechazado' and new.status = 'pendiente') then
      raise exception 'Solo el administrador puede cambiar el estado del domiciliario';
    end if;
    new.admin_note := old.admin_note;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists couriers_guard on public.couriers;
create trigger couriers_guard before insert or update on public.couriers
  for each row execute function public.couriers_guard();

-- Pedidos: precios calculados en el servidor + código de 4 dígitos
-- Pizza mitad y mitad: se cobra el valor de la pizza más costosa.
create or replace function public.orders_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  b businesses;
  p products;
  h products;
  it jsonb;
  qty numeric;
  unit numeric;
  sub numeric := 0;
  out_items jsonb := '[]'::jsonb;
begin
  select * into b from businesses where id = new.business_id and active;
  if not found then raise exception 'El negocio no está disponible'; end if;
  if not b.is_open then raise exception 'El negocio está cerrado en este momento'; end if;
  if new.payment_method = 'efectivo' and not b.accepts_cash then
    raise exception 'Este negocio no recibe efectivo';
  end if;
  if new.payment_method = 'transferencia' and not b.accepts_transfer then
    raise exception 'Este negocio no recibe transferencias';
  end if;
  if new.payment_method = 'transferencia' and coalesce(new.payment_proof_url, '') = '' then
    raise exception 'Debes adjuntar el comprobante de la transferencia';
  end if;
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  for it in select * from jsonb_array_elements(new.items) loop
    select * into p from products
      where id = (it->>'product_id')::uuid and business_id = new.business_id and available;
    if not found then raise exception 'Un producto ya no está disponible'; end if;

    qty := nullif(it->>'qty', '')::numeric;
    if qty is null or qty <= 0 then raise exception 'Cantidad inválida para %', p.name; end if;
    if p.sale_type = 'unidad' then qty := ceil(qty); else qty := round(qty, 2); end if;

    unit := p.price;
    h := null;
    if coalesce(it->>'half_product_id', '') <> '' then
      if not p.is_pizza then raise exception '% no admite mitad y mitad', p.name; end if;
      select * into h from products
        where id = (it->>'half_product_id')::uuid and business_id = new.business_id and is_pizza and available;
      if not found then raise exception 'La otra mitad de la pizza no está disponible'; end if;
      unit := greatest(p.price, h.price);
    end if;

    sub := sub + unit * qty;
    out_items := out_items || jsonb_build_object(
      'product_id', p.id, 'name', p.name, 'image_url', p.image_url,
      'half_product_id', h.id, 'half_name', h.name,
      'unit_price', unit, 'qty', qty, 'sale_type', p.sale_type, 'weight_unit', p.weight_unit,
      'line_total', unit * qty, 'note', nullif(trim(coalesce(it->>'note', '')), '')
    );
  end loop;

  new.customer_id := auth.uid();
  new.items := out_items;
  new.subtotal := sub;
  new.delivery_fee := b.delivery_fee;
  new.total := sub + b.delivery_fee;
  new.status := 'pendiente';
  new.payment_status := case when new.payment_method = 'transferencia' then 'pendiente' else 'no_aplica' end;
  new.courier_id := null;
  new.courier_name := null;
  new.courier_phone := null;
  new.reject_reason := null;
  new.delivered_at := null;
  new.delivery_code := lpad(floor(random() * 10000)::int::text, 4, '0');
  return new;
end $$;
drop trigger if exists orders_before_insert on public.orders;
create trigger orders_before_insert before insert on public.orders
  for each row execute function public.orders_before_insert();

-- El negocio solo puede cambiar estado / pago; la entrega se cierra con el código
create or replace function public.orders_before_update() returns trigger
language plpgsql as $$
declare
  allowed text[] := array['status','payment_status','reject_reason','updated_at'];
begin
  new.updated_at := now();
  if public.is_system_ctx() then return new; end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Solo puedes cambiar el estado del pedido';
  end if;
  if old.status in ('entregado','rechazado') and new.status is distinct from old.status then
    raise exception 'Este pedido ya está cerrado';
  end if;
  if new.status = 'entregado' and old.status is distinct from 'entregado' then
    raise exception 'El pedido se finaliza cuando el domiciliario valida el código del cliente';
  end if;
  if new.payment_method = 'transferencia' and new.status in ('aceptado','preparando','enviado')
     and new.payment_status <> 'validado' then
    raise exception 'Primero valida el comprobante de pago';
  end if;
  return new;
end $$;
drop trigger if exists orders_before_update on public.orders;
create trigger orders_before_update before update on public.orders
  for each row execute function public.orders_before_update();

-- Chat: rol del remitente calculado en el servidor
create or replace function public.messages_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = new.order_id;
  if not found then raise exception 'Pedido no encontrado'; end if;
  new.sender_id := auth.uid();
  if o.customer_id = auth.uid() then new.sender_role := 'cliente';
  elsif public.owns_business(o.business_id) then new.sender_role := 'negocio';
  else raise exception 'No participas en este pedido';
  end if;
  return new;
end $$;
drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.couriers enable row level security;
alter table public.orders enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "perfil propio select" on public.profiles;
drop policy if exists "perfil propio insert" on public.profiles;
drop policy if exists "perfil propio update" on public.profiles;
create policy "perfil propio select" on public.profiles for select using (id = auth.uid());
create policy "perfil propio insert" on public.profiles for insert with check (id = auth.uid());
create policy "perfil propio update" on public.profiles for update using (id = auth.uid());

drop policy if exists "negocios visibles" on public.businesses;
drop policy if exists "negocios crear" on public.businesses;
drop policy if exists "negocios editar" on public.businesses;
drop policy if exists "negocios borrar" on public.businesses;
create policy "negocios visibles" on public.businesses for select using (active or owner_id = auth.uid());
create policy "negocios crear" on public.businesses for insert to authenticated with check (owner_id = auth.uid());
create policy "negocios editar" on public.businesses for update using (owner_id = auth.uid());
create policy "negocios borrar" on public.businesses for delete using (owner_id = auth.uid());

drop policy if exists "productos visibles" on public.products;
drop policy if exists "productos crear" on public.products;
drop policy if exists "productos editar" on public.products;
drop policy if exists "productos borrar" on public.products;
create policy "productos visibles" on public.products for select using (true);
create policy "productos crear" on public.products for insert to authenticated with check (public.owns_business(business_id));
create policy "productos editar" on public.products for update using (public.owns_business(business_id)) with check (public.owns_business(business_id));
create policy "productos borrar" on public.products for delete using (public.owns_business(business_id));

drop policy if exists "domi propio select" on public.couriers;
drop policy if exists "domi propio insert" on public.couriers;
drop policy if exists "domi propio update" on public.couriers;
create policy "domi propio select" on public.couriers for select using (id = auth.uid());
create policy "domi propio insert" on public.couriers for insert to authenticated with check (id = auth.uid());
create policy "domi propio update" on public.couriers for update using (id = auth.uid());

drop policy if exists "pedidos ver" on public.orders;
drop policy if exists "pedidos crear" on public.orders;
drop policy if exists "pedidos negocio actualiza" on public.orders;
create policy "pedidos ver" on public.orders for select using (
  customer_id = auth.uid() or courier_id = auth.uid() or public.owns_business(business_id)
);
create policy "pedidos crear" on public.orders for insert to authenticated with check (customer_id = auth.uid());
create policy "pedidos negocio actualiza" on public.orders for update using (public.owns_business(business_id));

drop policy if exists "chat ver" on public.messages;
drop policy if exists "chat enviar" on public.messages;
create policy "chat ver" on public.messages for select using (public.is_order_chat_member(order_id));
create policy "chat enviar" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_order_chat_member(order_id));

drop policy if exists "push propias" on public.push_subscriptions;
create policy "push propias" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- RPC DOMICILIARIOS
-- ---------------------------------------------------------------------
create or replace function public.available_orders()
returns table (id uuid, number bigint, business_name text, business_address text, address text,
               total numeric, payment_method text, status text, created_at timestamptz, items_count int)
language sql stable security definer set search_path = public as $$
  select o.id, o.number, b.name, b.address, o.address, o.total, o.payment_method, o.status,
         o.created_at, jsonb_array_length(o.items)
  from orders o join businesses b on b.id = o.business_id
  where public.is_approved_courier()
    and o.courier_id is null
    and o.status in ('aceptado','preparando')
  order by o.created_at;
$$;

create or replace function public.take_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c couriers;
begin
  select * into c from couriers where id = auth.uid() and status = 'aprobado';
  if not found then raise exception 'Tu cuenta de domiciliario aún no está aprobada'; end if;
  perform set_config('app.ctx', 'system', true);
  update orders set courier_id = c.id, courier_name = c.full_name, courier_phone = c.phone
   where id = p_order and courier_id is null and status in ('aceptado','preparando');
  if not found then raise exception 'Este pedido ya fue tomado o no está disponible'; end if;
end $$;

create or replace function public.courier_mark_sent(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.ctx', 'system', true);
  update orders set status = 'enviado'
   where id = p_order and courier_id = auth.uid() and status in ('aceptado','preparando');
  if not found then raise exception 'No puedes actualizar este pedido'; end if;
end $$;

create or replace function public.complete_delivery(p_order uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order and courier_id = auth.uid();
  if not found then raise exception 'Este pedido no está asignado a ti'; end if;
  if o.status not in ('aceptado','preparando','enviado') then raise exception 'El pedido no está en ruta'; end if;
  if o.delivery_code <> trim(p_code) then raise exception 'Código incorrecto. Pídele al cliente su código de 4 dígitos'; end if;
  perform set_config('app.ctx', 'system', true);
  update orders set status = 'entregado', delivered_at = now() where id = p_order;
end $$;

-- ---------------------------------------------------------------------
-- RPC ADMIN (protegidas por contraseña, por defecto 1234)
-- ---------------------------------------------------------------------
create or replace function public._admin_check(p_pass text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from app_settings where key = 'admin_password' and value = crypt(coalesce(p_pass, ''), value)) then
    raise exception 'Contraseña de administrador incorrecta';
  end if;
  perform set_config('app.ctx', 'system', true);
end $$;
revoke all on function public._admin_check(text) from public, anon, authenticated;

create or replace function public.admin_stats(p_pass text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return json_build_object(
    'couriers_pending', (select count(*) from couriers where status = 'pendiente'),
    'couriers_approved', (select count(*) from couriers where status = 'aprobado'),
    'businesses', (select count(*) from businesses),
    'orders_today', (select count(*) from orders where created_at >= date_trunc('day', now())),
    'orders_total', (select count(*) from orders),
    'sales_delivered', (select coalesce(sum(total), 0) from orders where status = 'entregado')
  );
end $$;

create or replace function public.admin_list_couriers(p_pass text) returns setof public.couriers
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return query select * from couriers order by (status = 'pendiente') desc, created_at desc;
end $$;

create or replace function public.admin_set_courier_status(p_pass text, p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  if p_status not in ('pendiente','aprobado','rechazado') then raise exception 'Estado inválido'; end if;
  update couriers set status = p_status, admin_note = p_note where id = p_id;
end $$;

create or replace function public.admin_list_businesses(p_pass text) returns setof public.businesses
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return query select * from businesses order by created_at desc;
end $$;

create or replace function public.admin_set_business_active(p_pass text, p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  update businesses set active = p_active where id = p_id;
end $$;

create or replace function public.admin_list_orders(p_pass text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return (select coalesce(json_agg(t), '[]'::json) from (
    select o.id, o.number, o.status, o.payment_method, o.payment_status, o.total, o.created_at,
           o.customer_name, o.courier_name, b.name as business_name
    from orders o left join businesses b on b.id = o.business_id
    order by o.created_at desc limit 200
  ) t);
end $$;

create or replace function public.admin_change_password(p_pass text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _admin_check(p_pass);
  if length(coalesce(p_new, '')) < 4 then raise exception 'La contraseña debe tener al menos 4 caracteres'; end if;
  update app_settings set value = crypt(p_new, gen_salt('bf')) where key = 'admin_password';
end $$;

-- ---------------------------------------------------------------------
-- STORAGE (comprobantes de pago y documentos de domiciliarios)
-- Rutas: <user_id>/<uuid>.<ext> -> URL imposible de adivinar
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', true), ('documentos', 'documentos', true)
on conflict (id) do nothing;

drop policy if exists "tudomi subir archivos propios" on storage.objects;
create policy "tudomi subir archivos propios" on storage.objects for insert to authenticated
  with check (bucket_id in ('comprobantes','documentos') and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
