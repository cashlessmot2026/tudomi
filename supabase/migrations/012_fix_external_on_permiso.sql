-- 012: los triggers de la 011 llaman a _external_on() con el rol del usuario (negocio o domiciliario),
-- que no tenía permiso de ejecución. La función solo devuelve un booleano, así que es seguro abrirla.
grant execute on function public._external_on() to anon, authenticated;
