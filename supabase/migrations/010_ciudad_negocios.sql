-- 010: ciudad del negocio, para que cada cliente vea solo los negocios de su ciudad
alter table public.businesses add column if not exists city text;
create index if not exists businesses_city_idx on public.businesses (lower(city));
