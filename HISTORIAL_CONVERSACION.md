# Historial de trabajo — TuDomi (27–28 oct 2026)

Resumen de la conversación con Claude para retomar el trabajo después. Proyecto Supabase: `xvyldsknuacajphzeivc` (org *tpresentacion2026*, proyecto *tudomi*). Repo: `cashlessmot2026/tudomi` (GitHub Pages despliega desde `main`).

---

## 1. Punto de partida

Commits previos (27 oct): imágenes de Drive/Dropbox, detalle de pedidos en el admin, GPS de entrega, ubicación en tiempo real del domiciliario, URLs separadas por app, domiciliarios propios del negocio, pagos con datáfono/QR/link, código de retiro y código de entrega oculto al domiciliario.

## 2. Mercado Pago (Checkout Pro)

**Pedido:** botón de pago con Mercado Pago (tarjeta crédito, débito, PSE) que solo el admin activa/desactiva; planes de suscripción opcionales para negocios con valores editables.

**Hecho:**
- Migración `006_mercadopago_y_suscripciones.sql`: método `mercadopago`, interruptor `mp_enabled`, columnas `mp_preference_id / mp_payment_id / mp_status`, funciones `mp_set_preference` y `mp_apply_payment` (solo service_role), tabla `subscription_plans` con 3 planes: 150.000, 100.000 y 50.000 (links de preapproval de MP).
- Edge Functions:
  - `mp-create-preference`: crea la preferencia y devuelve el link de pago.
  - `mp-webhook`: valida firma `x-signature` (si existe `MP_WEBHOOK_SECRET`), consulta el pago a la API y marca el pedido como pagado. Responde 200 si el pago no existe (notificaciones simuladas).
- Frontend: opción 🟦 Mercado Pago en el carrito, botón de reintento en el detalle del pedido, estado del pago en el negocio, pestaña ⭐ Planes en el negocio, interruptor y editor de planes en el admin.
- App de Mercado Pago creada: **TuDomi Checkout Pro**, número `5846027985257358` (cuenta *cashless colombia*). Webhook (prueba y producción) → `https://xvyldsknuacajphzeivc.supabase.co/functions/v1/mp-webhook`, evento **Pagos**.
- ⚠️ **No tocar** la app `3317280669084800`: su webhook es de otro proyecto de Supabase (`ieoycdkamtmiouytwtbm`).

**Hecho por el usuario:** verificación JWT apagada en `mp-webhook`, secreto `MP_ACCESS_TOKEN` (producción). El usuario confirmó que Mercado Pago **ya funciona**.

**Pendiente / notas:**
- Confirmar que `MP_WEBHOOK_SECRET` esté configurado (en la última revisión el webhook aceptaba avisos sin firma).
- "Algo salió mal" al pagar = casi seguro pagar con la misma cuenta que cobra. Probar en incógnito u otro dispositivo.
- PSE no aparecía: no lo bloquea el código. Posibles causas: sesión del vendedor abierta, PSE no habilitado en la cuenta o monto bajo. No se llegó a consultar los métodos habilitados (MP pidió QR de verificación).
- El dinero de MP llega a la cuenta de la plataforma; la plataforma liquida a negocios y domiciliarios.

## 3. Alertas, propinas, comisiones, lluvia y analítica

**Pedido:** check animado (Lottie) al entregar y al confirmar pago por webhook; alertas de voz y sonido; analítica y consolidados; comisión opcional del superadmin; 10% fijo en pagos MP sobre venta neta; propina voluntaria; estadísticas del domiciliario; recargo del 50% por lluvia (manual o automático).

**Hecho:**
- Migración `007_propinas_comisiones_lluvia_analitica.sql`: columnas `tip`, `rain_surcharge`, `commission_pct`, `commission` en `orders`; ajustes `commission_enabled`, `commission_pct`, `rain_mode`, `rain_pct`, `rain_auto`; funciones `admin_get_settings`, `admin_set_settings`, `admin_analytics`, `business_analytics`, `courier_stats`, `_sales_summary`; `available_orders` devuelve domicilio, lluvia y propina.
- Migración `008_cron_lluvia.sql`: `pg_cron` job `tudomi-rain-check` cada 15 min → Edge Function `rain-check` (Open-Meteo, sin llave; solo actúa si `rain_auto` está activo).
- Reglas:
  - Comisión guardada en cada pedido al crearlo, sobre el subtotal (sin domicilio ni propina). MP = 10% siempre; otros métodos = % del superadmin si lo activa.
  - Ganancia del domiciliario = domicilio (con recargo por lluvia) + propina.
  - Ventas = pedidos entregados, agrupados por día en hora de Colombia.
- Frontend:
  - `src/lib/alerts.js`: voz ("Tienes un nuevo servicio", "Pedido recibido", "Has recibido un pago de X pesos") y sonido.
  - `src/components/SuccessCheck.jsx`: check Lottie (`lottie.host/embed/adf97339-…/AkKsIdNxRM.lottie`).
  - Domiciliario: alertas, "Ganas $X" en cada pedido, check al entregar, pestaña 📊 Ganancias.
  - Negocio: voz al recibir pedido y al confirmarse pago MP, pestaña 📊 Ventas (saldo con la plataforma).
  - Cliente: propina voluntaria, recargo por lluvia visible, check al aprobarse el pago.
  - Admin: pestaña 📊 Analítica (por día, liquidación por negocio y por domiciliario); Ajustes de comisión y lluvia (manual/automático, "Revisar clima ahora").
- Nota: los navegadores no reproducen voz/sonido hasta que el usuario toca la pantalla una vez.
- No probado aún en dispositivo real: voces, sonido y check animado.

## 4. Publicidad (carrusel)

**Pedido:** banner tipo slider automático con promociones de negocios que pagan por pautar, activado por el superadmin.

**Hecho:**
- Migración `009_publicidad.sql`: tabla `ads` (negocio, título, texto, botón, imagen, enlace externo, fechas `starts_on`/`ends_on`, valor pagado, orden, clics), interruptor `ads_enabled`, `ads_on()`, `ad_click()`, `admin_list_ads`, `admin_save_ad`, `admin_delete_ad`, `admin_set_ads_enabled`.
- `src/components/AdsCarousel.jsx` en el inicio de clientes: avanza cada 4,5 s, deslizable, se pausa al tocar; abre la tienda o el enlace externo y cuenta el clic.
- Admin → 📣 Publicidad: crear/editar anuncios, estados (Al aire, Programado, Vencido, Pausado) y clics.
- Estado: aplicado y publicado; carrusel **apagado** y sin anuncios hasta que el superadmin los cree.

## 5b. Ajustes visuales (28 oct 2026)

- Botones verdes (`.btn.ok` y botones principales de la app del domiciliario) y pestaña activa del menú del domiciliario: texto negro por contraste. Commit `4a4188e`.
- Check de éxito: se probó Lottie con `dotlottie-wc` (commit `4166daa`) y luego se reemplazó por un check **propio en SVG + CSS** (círculo que se dibuja, check trazado, rebote y destellos), sin fondo blanco ni dependencias externas. Archivos: `src/components/SuccessCheck.jsx` y estilos `.anim-check` / `.ac-*` en `src/styles.css`. Commit `44d091b`, publicado en `main`.
- Pendiente: ver el check nuevo en pantalla y ajustarlo si el usuario quiere otro estilo (no se había visto la imagen de referencia que mencionó).

## 5c. Ciudades, enlace de tienda e interruptor de externos (28 oct 2026)

- **Ciudad (migración 010):** columna `businesses.city`. El negocio la llena en su formulario (obligatoria, con sugerencias; se autocompleta con el botón 📍). El cliente elige su ciudad en el inicio (se guarda en el celular) o usa "Detectar mi ubicación"; solo ve negocios de esa ciudad, abiertos primero y luego por cercanía (Haversine), con la distancia en cada tarjeta. Los negocios sin ciudad se muestran en todas hasta que la completen. Commit `73ac137`.
- **Admin:** filtro por ciudad en la pestaña Negocios (con conteos y "Sin ciudad").
- **Enlace para redes:** en el panel del negocio, tarjeta "Tu enlace para redes sociales" (`/tienda/<id>`) con copiar, compartir y WhatsApp. La tienda muestra un aviso a visitantes sin sesión; el registro se exige al confirmar el pedido en el carrito.
- **Interruptor de domiciliarios externos (migración 011):** ajuste `external_couriers` (por defecto encendido), RPC `admin_set_external_couriers`, expuesto en `payment_config`. Apagado: `available_orders` y `take_order` quedan cerrados, el negocio no puede enviar a externos, no se registran externos nuevos (los propios sí) y los pedidos publicados sin tomar vuelven al negocio. UI: tarjeta en Ajustes del admin, aviso en el panel del negocio y "Registro cerrado" en la app del domiciliario. Commit `1bb53b3`.
- **Pendiente del usuario:** aplicar las migraciones 010 y 011 en el SQL Editor de Supabase (el código ya está en `main`). Luego probar el enlace en incógnito, el filtro del admin y el interruptor.

## 5d. Checks, planes, servicios, tipos de negocio (28 oct 2026)

- **Fix 012:** `grant execute on function _external_on() to anon, authenticated` (los triggers de la 011 corren con el rol del usuario). Commit `214bb69`.
- **Checks animados:** ahora también salen al hacer un pedido ("¡Pedido enviado!", vía `location.state` hacia `OrderDetail`) y al tomar un servicio ("¡Servicio tomado!"). El de entrega además se dispara cuando el pedido pasa a `entregado` en `loadMine`. Si el de entrega sigue sin salir, revisar qué ve el usuario al validar el código. Mapa 🏪 del negocio con "Cómo llegar" (Google Maps) en la tarjeta del domiciliario. Commit `37c68a8`.
- **Plan Comisión + servicios (migración 013):** plan de $1.000/mes + 10% por venta (`subscription_plans.commission_pct`, link de pago opcional). Tabla `business_subscriptions` (plan por negocio, ciclos de 30 días desde `started_on`, cobro mes vencido) y trigger `orders_plan_commission` (aplica el % del plan; MP nunca baja de 10%). Admin: en cada tarjeta de negocio asigna/pausa el plan, ve ciclo, corte y "por cobrar"; `my_billing` para el negocio. No guarda qué ciclos ya se pagaron.
- **Servicios por negocio:** `services` (externos, publicidad_app, publicidad_push) con precio y link editables en Ajustes del admin; `business_services` los activa el admin por negocio; el negocio ve botón "Activar / pagar" en su pestaña Planes. **Bloqueo real:** sin el servicio `externos` el negocio no puede publicar pedidos para externos (los negocios existentes quedaron con él activo). Publicidad en app y push son solo marcas por ahora.
- **Domiciliarios:** campo obligatorio "pantallazo de tu usuario en otra plataforma (Rappi, etc.)" (`couriers.other_platform_url`), visible en la revisión del admin. Commit `da6e2e9`.
- **Tipos de negocio (migraciones 014 y 015):** restaurante, minimarket, tecnología, floristería, ferretería, tienda, ropa, taller de vehículos, alquiler (elementos varios), rentas cortas y otro. Cada tipo tiene campos propios en `src/lib/productFields.js` (guardados en `products.details`, jsonb) que ve el cliente. Ropa: el cliente elige talla y color. Rentas cortas: precio por noche, fechas de entrada/salida, huéspedes, validación de noches mín/máx y capacidad; las noches van como cantidad del pedido. Commits `7e07c83` y `6bd5722`.
- **Limitaciones de rentas cortas:** limpieza y depósito se muestran pero no se suman al total; el pedido sigue el flujo de domicilio (se finaliza con el código de un domiciliario). Siguiente paso sugerido: que el anfitrión confirme y cierre la reserva sin domiciliario.
- **Pendiente del usuario:** aplicar en el SQL Editor las migraciones que falten entre 010 y 015 (según lo que ya haya ejecutado); la 014 y la 015 reemplazan la regla de tipos, se pueden repetir sin problema.

## 5. Estado de la base de datos

Migraciones aplicadas en Supabase: 002 a 009 (la 009 el 28 oct 2026). **010 a 015 están en el repo y se aplican a mano en el SQL Editor (el usuario confirmó la 013; verificar 014 y 015).**

Edge Functions desplegadas: `mp-create-preference`, `mp-webhook` (sin verificación JWT), `rain-check`.

Secretos: `MP_ACCESS_TOKEN` (configurado por el usuario), `MP_WEBHOOK_SECRET` (verificar).

## 6. Notas técnicas

- El PC tiene poca RAM libre: `npm run build` local falla por memoria. Se valida con `esbuild` y con la compilación de GitHub Actions.
- Para aplicar SQL se usó el SQL Editor del dashboard; para desplegar funciones, el editor de Edge Functions (al actualizar pide una confirmación "Deploy updates").
- Claude no puede ingresar llaves, tokens ni datos de pago, ni desactivar la verificación JWT; esos pasos los hace el usuario.

## 7. Ideas pendientes

- Consultar los métodos de pago habilitados en MP (PSE) cuando se pueda escanear el QR de verificación.
- Probar en celular: voces, el check nuevo y carrusel con un anuncio real.
- Opcional: modelo Marketplace de MP para que cada negocio reciba su dinero directo.
