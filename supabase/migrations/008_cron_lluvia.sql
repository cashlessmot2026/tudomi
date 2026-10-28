-- =====================================================================
-- 008: Revisión automática de lluvia cada 15 minutos (pg_cron + pg_net -> Edge Function rain-check)
-- La función solo cambia el recargo si el admin activó el modo automático.
-- La llave anon es pública (es la misma que usa la app).
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'tudomi-rain-check',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://xvyldsknuacajphzeivc.supabase.co/functions/v1/rain-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2eWxkc2tudWFjYWpwaHplaXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMzcxMDEsImV4cCI6MjEwODcxMzEwMX0.Pkw-fBVbdPatcj6P1azsf9kM6MRHnFCH_yav-shWywM'
    ),
    body := '{}'::jsonb
  );
  $$
);
