-- =====================================================================
-- 009: Publicidad pagada (carrusel en el inicio de la app de clientes)
-- Solo el superadmin crea anuncios y activa el carrusel (app_settings.ads_enabled).
-- Un anuncio se muestra si está activo y hoy (hora Colombia) está entre starts_on y ends_on.
-- =====================================================================

insert into public.app_settings(key, value) values ('ads_enabled', 'false') on conflict (key) do nothing;

create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  title text not null,
  subtitle text,
  cta text,
  image_url text not null,
  link_url text check (link_url is null or link_url ~* '^https?://'),
  starts_on date not null default ((now() at time zone 'America/Bogota')::date),
  ends_on date not null,
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  active boolean not null default true,
  sort int not null default 0,
  clicks int not null default 0,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
alter table public.ads enable row level security;

-- Solo expone si el carrusel está activo (no da acceso a otros ajustes)
create or replace function public.ads_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public._setting('ads_enabled') = 'true', false);
$$;
grant execute on function public.ads_on() to anon, authenticated;

drop policy if exists "anuncios vigentes" on public.ads;
create policy "anuncios vigentes" on public.ads for select to anon, authenticated using (
  active
  and public.ads_on()
  and (now() at time zone 'America/Bogota')::date between starts_on and ends_on
);

-- Contador de clics (cualquiera puede sumar uno a un anuncio vigente)
create or replace function public.ad_click(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update ads set clicks = clicks + 1
  where id = p_id and active and (now() at time zone 'America/Bogota')::date between starts_on and ends_on;
$$;
grant execute on function public.ad_click(uuid) to anon, authenticated;

create or replace function public.admin_list_ads(p_pass text) returns json
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  return json_build_object(
    'enabled', _setting('ads_enabled') = 'true',
    'ads', coalesce((select json_agg(t order by t.sort, t.created_at desc) from (
      select a.*, b.name as business_name from ads a left join businesses b on b.id = a.business_id) t), '[]'::json)
  );
end $$;

create or replace function public.admin_set_ads_enabled(p_pass text, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  insert into app_settings(key, value) values ('ads_enabled', case when p_enabled then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
end $$;

create or replace function public.admin_save_ad(p_pass text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare aid uuid := nullif(p->>'id', '')::uuid;
begin
  perform _admin_check(p_pass);
  if coalesce(trim(p->>'title'), '') = '' then raise exception 'Escribe el título del anuncio'; end if;
  if coalesce(trim(p->>'image_url'), '') = '' then raise exception 'Pega el enlace de la imagen del anuncio'; end if;
  if nullif(p->>'ends_on', '') is null then raise exception 'Elige hasta qué fecha se muestra'; end if;
  if aid is null then
    insert into ads (business_id, title, subtitle, cta, image_url, link_url, starts_on, ends_on, amount_paid, active, sort)
    values (nullif(p->>'business_id', '')::uuid, trim(p->>'title'), nullif(trim(p->>'subtitle'), ''), nullif(trim(p->>'cta'), ''),
            trim(p->>'image_url'), nullif(trim(p->>'link_url'), ''),
            coalesce(nullif(p->>'starts_on', '')::date, (now() at time zone 'America/Bogota')::date), (p->>'ends_on')::date,
            coalesce(nullif(p->>'amount_paid', '')::numeric, 0), coalesce((p->>'active')::boolean, true),
            coalesce(nullif(p->>'sort', '')::int, 0))
    returning id into aid;
  else
    update ads set
      business_id = nullif(p->>'business_id', '')::uuid, title = trim(p->>'title'),
      subtitle = nullif(trim(p->>'subtitle'), ''), cta = nullif(trim(p->>'cta'), ''),
      image_url = trim(p->>'image_url'), link_url = nullif(trim(p->>'link_url'), ''),
      starts_on = coalesce(nullif(p->>'starts_on', '')::date, starts_on), ends_on = (p->>'ends_on')::date,
      amount_paid = coalesce(nullif(p->>'amount_paid', '')::numeric, 0), active = coalesce((p->>'active')::boolean, true),
      sort = coalesce(nullif(p->>'sort', '')::int, 0)
    where id = aid;
  end if;
  return aid;
end $$;

create or replace function public.admin_delete_ad(p_pass text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_pass);
  delete from ads where id = p_id;
end $$;
