# TuDomi 🛵

PWA de domicilios (tipo Rappi) para restaurantes, minimarkets y tiendas de tecnología. Hecha con React + Vite + Supabase.

## Interfaces (URLs independientes; cada una se instala como su propia app)

| URL | Para quién | Qué hace |
| --- | --- | --- |
| `/` | Clientes | Ver negocios por categoría, carrito con varios productos, pizzas mitad y mitad, productos por peso (lb/kg), notas, pago en efectivo o transferencia con comprobante, ticket, código de entrega y chat |
| `/negocio` | Negocios | Registrar el negocio, publicar productos (imagen por URL), definir métodos de pago, aceptar/rechazar pedidos, validar pagos, marcar preparando/enviado y chatear con el cliente |
| `/domiciliario` | Domiciliarios | Pre-registro con SOAT, tecnomecánica, licencia y cédula. Cuando el admin lo aprueba: tomar pedidos, marcar recogido y finalizar con el código de 4 dígitos |
| `/admin` | Administrador (oculta) | Contraseña `1234` (se puede cambiar en Ajustes). Validar domiciliarios, activar o desactivar negocios y ver pedidos |

## Reglas de negocio (aplicadas en la base de datos)

- **Precios calculados en el servidor** (trigger `orders_before_insert`): el cliente no puede alterar el total.
- **Pizza mitad y mitad**: se cobra el precio de la mitad más costosa.
- **Productos por peso**: `sale_type = 'peso'` y `weight_unit` en `lb` o `kg`. Se compran en pasos de 0.5. Los perecederos se marcan por peso por defecto.
- **Código de entrega**: 4 dígitos aleatorios por pedido. Lo ven el cliente, el negocio y el domiciliario asignado. El pedido solo pasa a *entregado* cuando el domiciliario escribe el código correcto (`complete_delivery`).
- **Transferencia**: el cliente sube el comprobante, el negocio valida el pago, el pedido pasa a *aceptado* y se genera el ticket. Con efectivo el ticket se ve de inmediato.
- **Domiciliarios**: solo el admin puede aprobarlos. Solo los aprobados ven y toman pedidos.

## Puesta en marcha

```bash
npm install
cp .env.example .env
npm run dev
```

La base de datos se crea ejecutando `supabase/schema.sql` y luego, en orden, los archivos de `supabase/migrations/` en el SQL Editor de Supabase.

### Login con Google

1. En Google Cloud Console crea un OAuth Client ID (aplicación web), con redirect URI `https://xvyldsknuacajphzeivc.supabase.co/auth/v1/callback`.
2. En Supabase → Authentication → Providers → Google, pega el Client ID y el Secret.
3. En Supabase → Authentication → URL Configuration agrega tu dominio en **Site URL** y en **Redirect URLs**, por ejemplo `https://tu-dominio.com/**` y `http://localhost:5173/**`.

### Despliegue

Es un SPA estático (`npm run build` genera `dist/`). Sirve en Cloudflare Pages, Vercel (incluye `vercel.json`) o Netlify. Configura las variables `VITE_*` en el hosting.

### Instalar como app (Android / iOS)

- **Android/Chrome**: botón **📲 Instalar app**.
- **iPhone/Safari**: Compartir → *Agregar a pantalla de inicio*.
- Para publicar en Play Store o App Store se puede empaquetar con [PWABuilder](https://www.pwabuilder.com) o Capacitor.

### Pagos con Mercado Pago (Checkout Pro)

- El admin lo activa o desactiva en **/admin → Ajustes**. Activo, el cliente ve la opción **🟦 Mercado Pago** (tarjeta crédito, débito o PSE) en todos los negocios.
- Flujo: el cliente hace el pedido → `mp-create-preference` crea el pago → Mercado Pago avisa a `mp-webhook` → `mp_apply_payment` marca el pago como *validado*. El negocio solo puede aceptar el pedido cuando el pago está aprobado.
- El dinero llega a la cuenta de Mercado Pago dueña del `MP_ACCESS_TOKEN` (la plataforma), que luego le paga a cada negocio.
- Secretos de las Edge Functions: `MP_ACCESS_TOKEN` (Access Token de producción, o `TEST-…` para pruebas) y `MP_WEBHOOK_SECRET` (clave secreta de la sección Webhooks).
- Webhook en Mercado Pago (Tus integraciones → Webhooks, evento **Pagos**): `https://xvyldsknuacajphzeivc.supabase.co/functions/v1/mp-webhook`.

### Planes de suscripción para negocios

Los negocios ven la pestaña **⭐ Planes** con los planes de Mercado Pago Suscripciones. El admin edita nombre, valor, detalles y link en **/admin → Ajustes**.

### Notificaciones push

Ver `cloudflare-push/README.md`.

## Notas de seguridad

- Las imágenes de documentos y comprobantes están en buckets públicos con rutas aleatorias (`<user_id>/<uuid>`). Solo las conocen los participantes y el admin. Si se necesita más privacidad, se pueden pasar a buckets privados con URLs firmadas mediante una Edge Function.
- La contraseña del admin se guarda con hash bcrypt en `app_settings` y se valida en el servidor. Cambia `1234` antes de producción.
