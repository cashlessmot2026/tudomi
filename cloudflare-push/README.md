# Notificaciones push con Cloudflare (pendiente)

Lo que ya está listo en la app:

- `public/sw.js` recibe los eventos `push` y abre la URL al tocar la notificación.
- `src/lib/pwa.js` → `enablePush(app)` pide permiso, se suscribe con `VITE_VAPID_PUBLIC_KEY` y guarda la suscripción en la tabla `push_subscriptions` (`user_id`, `app`, `endpoint`, `p256dh`, `auth`).
- Botón **🔔 Activar notificaciones** en Perfil (cliente), Ajustes (negocio) y Cuenta (domiciliario).
- Mientras la app está abierta ya se muestran notificaciones locales (pedido nuevo, cambio de estado, domicilio disponible).

Pasos para terminarlo:

1. Generar llaves VAPID (`npx web-push generate-vapid-keys`).
2. Poner la pública en `VITE_VAPID_PUBLIC_KEY` (en `.env` y en el hosting) y volver a desplegar.
3. `cd cloudflare-push && npx wrangler deploy`, y luego cargar los secretos de `wrangler.toml`.
4. Implementar `sendWebPush()` en `worker.js` (VAPID + cifrado aes128gcm con WebCrypto).
5. En Supabase → Database → Webhooks, crear webhooks sobre `orders` (INSERT/UPDATE) que llamen a `POST /notify`:
   - INSERT → notificar al dueño del negocio (`app: "negocio"`).
   - UPDATE de `status` → notificar al cliente (`app: "cliente"`).
   - `status = aceptado` → notificar a los domiciliarios aprobados (`app: "domi"`).
