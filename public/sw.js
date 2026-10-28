// TuDomi Service Worker: caché de la app + manejo de notificaciones push
// Todas las rutas son relativas al scope, así funciona en "/" y en subcarpetas (GitHub Pages: /tudomi/)
const CACHE = 'tudomi-v2'
const SCOPE = self.registration.scope
const abs = (p) => new URL(String(p || '').replace(/^\//, ''), SCOPE).href
const INDEX = abs('index.html')
const SHELL = [abs(''), INDEX, abs('manifest-cliente.webmanifest'), abs('manifest-negocio.webmanifest'), abs('manifest-domi.webmanifest')]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return

  // Navegación: red primero, caché si no hay conexión
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(INDEX, copy))
          }
          return res
        })
        .catch(() => caches.match(INDEX)),
    )
    return
  }

  // Assets con hash e íconos: caché primero
  if (url.href.startsWith(abs('assets/')) || url.href.startsWith(abs('icons/'))) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          }),
      ),
    )
  }
})

// Push desde el Worker de Cloudflare. Payload JSON: { title, body, url, icon, tag }
self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { body: e.data && e.data.text() }
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'TuDomi', {
      body: d.body || '',
      icon: d.icon || abs('icons/cliente-192.png'),
      badge: abs('icons/cliente-192.png'),
      tag: d.tag,
      vibrate: [120, 60, 120],
      data: { url: d.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = abs((e.notification.data && e.notification.data.url) || '/')
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
