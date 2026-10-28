// Crea la preferencia de Checkout Pro para un pedido del cliente y devuelve el link de pago.
// Secretos: MP_ACCESS_TOKEN (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const token = Deno.env.get('MP_ACCESS_TOKEN')
  if (!token) return json({ error: 'Mercado Pago no está configurado' }, 500)

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await userClient.auth.getUser()
  if (!auth?.user) return json({ error: 'Inicia sesión para pagar' }, 401)

  const { order_id, return_url } = await req.json().catch(() => ({}))
  if (!order_id) return json({ error: 'Falta el pedido' }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: cfg } = await admin.rpc('payment_config')
  if (!cfg?.mp_enabled) return json({ error: 'El pago con Mercado Pago no está disponible en este momento' }, 400)

  const { data: o } = await admin.from('orders').select('*, businesses(name)').eq('id', order_id).maybeSingle()
  if (!o || o.customer_id !== auth.user.id) return json({ error: 'Pedido no encontrado' }, 404)
  if (o.payment_method !== 'mercadopago') return json({ error: 'Este pedido no se paga con Mercado Pago' }, 400)
  if (o.payment_status === 'validado') return json({ error: 'Este pedido ya está pago' }, 400)
  if (o.status !== 'pendiente') return json({ error: 'Este pedido ya no se puede pagar' }, 400)

  // Solo se permite volver a la app (http/https); por defecto, la URL de Supabase no sirve como retorno
  let back = ''
  try {
    const u = new URL(String(return_url || ''))
    if (u.protocol === 'https:' || u.protocol === 'http:') back = u.href
  } catch { /* sin retorno */ }

  const pref = {
    items: [
      {
        id: String(o.id),
        title: `Pedido #${o.number} · ${o.businesses?.name ?? 'TuDomi'}`,
        quantity: 1,
        currency_id: 'COP',
        unit_price: Number(o.total),
      },
    ],
    payer: { email: auth.user.email },
    external_reference: o.id,
    notification_url: `${url}/functions/v1/mp-webhook`,
    statement_descriptor: 'TUDOMI',
    ...(back && {
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
    }),
  }

  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(pref),
  })
  const data = await r.json()
  if (!r.ok) {
    console.error('MP preference error', r.status, data)
    return json({ error: 'Mercado Pago no pudo crear el pago. Intenta de nuevo.' }, 502)
  }

  await admin.rpc('mp_set_preference', { p_order: o.id, p_preference: data.id })
  // Con credenciales de prueba se usa sandbox_init_point
  const sandbox = token.startsWith('TEST-')
  return json({ init_point: sandbox ? data.sandbox_init_point : data.init_point, preference_id: data.id })
})
