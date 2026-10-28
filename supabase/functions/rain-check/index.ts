// Detecta lluvia con Open-Meteo (gratis, sin llave) en la zona de los negocios activos y,
// si el admin activó el modo automático (rain_auto), prende o apaga el recargo por lluvia (rain_mode).
// La invoca pg_cron cada 15 minutos (migración 008). No recibe datos del cliente.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

// Códigos WMO de llovizna, lluvia, chubascos y tormenta
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: auto } = await admin.from('app_settings').select('value').eq('key', 'rain_auto').maybeSingle()
  if (auto?.value !== 'true') return json({ skipped: 'modo manual' })

  const { data: biz } = await admin.from('businesses').select('lat, lng').eq('active', true).not('lat', 'is', null).limit(500)
  if (!biz?.length) return json({ skipped: 'sin negocios con ubicación' })
  const lat = biz.reduce((s, b) => s + Number(b.lat), 0) / biz.length
  const lng = biz.reduce((s, b) => s + Number(b.lng), 0) / biz.length

  const r = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=precipitation,weather_code&timezone=America%2FBogota`,
  )
  if (!r.ok) return json({ error: `Open-Meteo ${r.status}` }, 502)
  const w = await r.json()
  const precipitation = Number(w.current?.precipitation ?? 0)
  const code = Number(w.current?.weather_code ?? 0)
  const raining = precipitation >= 0.2 || RAIN_CODES.has(code)

  const checked = { at: new Date().toISOString(), lat, lng, precipitation, code, raining }
  await admin.from('app_settings').upsert([
    { key: 'rain_mode', value: String(raining) },
    { key: 'rain_checked', value: JSON.stringify(checked) },
  ])
  return json(checked)
})
