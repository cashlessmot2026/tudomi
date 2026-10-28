// Worker de Cloudflare para enviar notificaciones Web Push de TuDomi.
// Estado: PLANTILLA. Falta implementar sendWebPush() (ver README.md de esta carpeta).
//
// Uso esperado (desde un Database Webhook de Supabase o desde el backend):
//   POST https://<tu-worker>.workers.dev/notify
//   Authorization: Bearer <PUSH_SECRET>
//   { "user_id": "...", "app": "cliente", "title": "Tu pedido va en camino", "body": "...", "url": "/pedidos/<id>" }
//
// Variables (wrangler secret put ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SECRET

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/notify') return new Response('Not found', { status: 404 })
    if (request.headers.get('Authorization') !== `Bearer ${env.PUSH_SECRET}`) return new Response('Unauthorized', { status: 401 })

    const { user_id, app, title, body, url: link, tag } = await request.json()
    if (!user_id) return Response.json({ error: 'user_id requerido' }, { status: 400 })

    const q = new URLSearchParams({ user_id: `eq.${user_id}`, select: 'id,endpoint,p256dh,auth' })
    if (app) q.set('app', `eq.${app}`)
    const subs = await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?${q}`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    }).then((r) => r.json())

    const payload = JSON.stringify({ title, body, url: link || '/', tag })
    const results = await Promise.allSettled(subs.map((s) => sendWebPush(s, payload, env)))

    // Borra suscripciones vencidas (404/410)
    const gone = subs.filter((_, i) => results[i].status === 'rejected' && [404, 410].includes(results[i].reason?.status))
    for (const s of gone) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${s.id}`, {
        method: 'DELETE',
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      })
    }

    return Response.json({ sent: results.filter((r) => r.status === 'fulfilled').length, total: subs.length })
  },
}

// TODO: firmar con VAPID (JWT ES256) y cifrar el payload (RFC 8291, aes128gcm) usando WebCrypto.
// Recomendado: usar una librería compatible con Workers en lugar de `web-push` (que depende de Node).
async function sendWebPush(subscription, payload, env) {
  throw Object.assign(new Error('sendWebPush no implementado todavía'), { status: 501 })
}
