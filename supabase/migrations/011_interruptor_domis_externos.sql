-- 011: el superadmin puede apagar los domiciliarios externos (de la plataforma).
-- Apagado: los negocios despachan solo con sus domiciliarios propios, no se registran externos
-- nuevos y los pedidos publicados para externos vuelven al negocio para que los asigne.
insert into public.app_settings(key, value) values ('external_couriers', 'true') on conflict (key) do nothing;

create or replace function public._external_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public._setting('external_couriers') <> 'false', true);
$$;
revoke all on function public._external_on() from public, anon, authenticated;

-- Configuración pública: se agrega el interruptor
create or replace function public.payment_config() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'mp_enabled', coalesce(public._setting('mp_enabled') = 'true', false),
    'rain_mode', coalesce(public._setting('rain_mode') = 'true', false),
    'rain_pct', coalesce(nullif(public._setting('rain_pct'), '')::numeric, 50),
    'external_couriers', public._external_on()
  );
$$;
grant execute on function public.payment_config() to anon, authenticated;

create or replace function public.admin_set_external_couriers(p_pass text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  insert into app_settings(key, value) values ('external_couriers', case when p_enabled then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
  if not p_enabled then
    -- Pedidos publicados para externos y sin tomar: vuelven al negocio para asignarlos a un domi propio
    perform set_config('app.ctx', 'system', true);
    update orders set dispatch = null
     where dispatch = 'externo' and courier_id is null and status in ('aceptado','preparando');
  end if;
end $$;

-- Los externos no ven ni toman pedidos cuando está apagado
create or replace function public.available_orders()
returns table (id uuid, number bigint, business_name text, business_address text, address text,
               total numeric, payment_method text, status text, created_at timestamptz, items_count int,
               delivery_fee numeric, rain_surcharge numeric, tip numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.number, b.name, b.address, o.address, o.total, o.payment_method, o.status, o.created_at,
         jsonb_array_length(o.items), o.delivery_fee, o.rain_surcharge, o.tip
  from orders o join businesses b on b.id = o.business_id
  where public._external_on()
    and exists (select 1 from couriers c where c.id = auth.uid() and c.status = 'aprobado' and c.active and c.kind = 'externo')
    and o.courier_id is null
    and o.dispatch = 'externo'
    and o.status in ('aceptado','preparando')
  order by o.created_at;
$$;

create or replace function public.take_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c couriers;
begin
  if not public._external_on() then raise exception 'Los domiciliarios externos están desactivados'; end if;
  select * into c from couriers where id = auth.uid() and status = 'aprobado' and active and kind = 'externo';
  if not found then raise exception 'Tu cuenta de domiciliario no puede tomar pedidos públicos'; end if;
  perform set_config('app.ctx', 'system', true);
  update orders set courier_id = c.id, courier_name = c.full_name, courier_phone = c.phone
   where id = p_order and courier_id is null and dispatch = 'externo' and status in ('aceptado','preparando');
  if not found then raise exception 'Este pedido ya fue tomado o no está disponible'; end if;
end $$;

-- El negocio no puede publicar pedidos para externos mientras estén apagados
create or replace function public.orders_external_guard() returns trigger language plpgsql as $$
begin
  if public.is_system_ctx() then return new; end if;
  if new.dispatch = 'externo' and new.dispatch is distinct from old.dispatch and not public._external_on() then
    raise exception 'Los domiciliarios externos están desactivados. Asigna uno de tus domiciliarios propios';
  end if;
  return new;
end $$;
drop trigger if exists orders_external_guard on public.orders;
create trigger orders_external_guard before update on public.orders
  for each row execute function public.orders_external_guard();

-- No se registran domiciliarios externos nuevos mientras estén apagados (los propios se vinculan en contexto de sistema)
create or replace function public.couriers_external_guard() returns trigger language plpgsql as $$
begin
  if public.is_system_ctx() then return new; end if;
  if not public._external_on() then
    raise exception 'El registro de domiciliarios externos está desactivado por ahora';
  end if;
  return new;
end $$;
drop trigger if exists couriers_external_guard on public.couriers;
create trigger couriers_external_guard before insert on public.couriers
  for each row execute function public.couriers_external_guard();
