-- 015: tipos Ropa y Renta corta + detalles particulares por producto según el tipo de negocio
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.businesses'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.businesses drop constraint %I', c);
  end loop;
end $$;

alter table public.businesses add constraint businesses_category_check
  check (category in ('restaurante','minimarket','tecnologia','floristeria','ferreteria','tienda','ropa','taller','alquiler','renta_corta','otro'));

-- Campos particulares (talla, amenidades, capacidad, etc.) según el tipo de negocio
alter table public.products add column if not exists details jsonb not null default '{}'::jsonb;
