// Notificaciones de Mercado Pago (webhook). Se despliega SIN verificación de JWT.
// Valida la firma x-signature con MP_WEBHOOK_SECRET, consulta el pago a la API y lo aplica al pedido.
// Secretos: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const enc = new TextEncoder()

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// https://www.mercadopago.com.co/developers/es/docs/your-integrations/notifications/webhooks
async function validSignature(req: Request, dataId: string) {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET')
  if (!secret) return true // sin secreto configurado se confía en la consulta a la API
  const parts = Object.fromEntries(
    (req.headers.get('x-signature') ?? '').split(',').map((p) => p.trim().split('=', 2) as [string, string]),
  )
  if (!parts.ts || !parts.v1) return false
  const requestId = req.headers.get('x-request-id')
  let manifest = `id:${dataId.toLowerCase()};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${parts.ts};`
  return safeEqual(await hmacHex(secret, manifest), parts.v1)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')
  const url = new URL(req.url)
  const body = await req.json().catch(() => ({}))
  const type = body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
  const dataId = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')

  // Solo interesan los pagos; el resto se confirma para que MP no reintente
  if (type !== 'payment' || !dataId) return new Response('ignored')
  if (!(await validSignature(req, dataId))) return new Response('invalid signature', { status: 401 })

  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}` },
  })
  if (!r.ok) {
    console.error('MP payment fetch error', r.status, await r.text())
    return new Response('retry', { status: 500 })
  }
  const p = await r.json()
  if (!p.external_reference) return new Response('no reference')

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin.rpc('mp_apply_payment', {
    p_order: p.external_reference,
    p_payment_id: String(p.id),
    p_status: p.status,
    p_amount: Number(p.transaction_amount ?? 0),
  })
  if (error) {
    console.error('mp_apply_payment', error)
    return new Response('retry', { status: 500 })
  }
  return new Response(String(data))
})
