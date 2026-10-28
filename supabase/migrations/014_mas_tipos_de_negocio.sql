-- 014: nuevos tipos de negocio (floristería, ferretería, tienda, taller de vehículos, alquiler y otro)
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
  check (category in ('restaurante','minimarket','tecnologia','floristeria','ferreteria','tienda','taller','alquiler','otro'));
