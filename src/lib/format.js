const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

export const money = (n) => cop.format(Number(n || 0))

export const qtyLabel = (qty, saleType, unit) => (saleType === 'peso' ? `${Number(qty)} ${unit}` : `x${Number(qty)}`)

export const priceLabel = (p) => (p.sale_type === 'peso' ? `${money(p.price)} / ${p.weight_unit}` : money(p.price))

export const fmtDate = (d) => new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

export const CATEGORIES = [
  { id: 'restaurante', label: 'Restaurantes', icon: '🍔' },
  { id: 'minimarket', label: 'Minimarkets', icon: '🥕' },
  { id: 'tecnologia', label: 'Tecnología', icon: '📱' },
]

export const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id

export const STATUS = {
  pendiente: { label: 'Pendiente', color: '#f59e0b', icon: '⏳' },
  aceptado: { label: 'Aceptado', color: '#3b82f6', icon: '✅' },
  preparando: { label: 'Preparando', color: '#a855f7', icon: '👨‍🍳' },
  enviado: { label: 'En camino', color: '#06b6d4', icon: '🛵' },
  entregado: { label: 'Entregado', color: '#22c55e', icon: '🎉' },
  rechazado: { label: 'Rechazado', color: '#ef4444', icon: '✖' },
}

export const FLOW = ['pendiente', 'aceptado', 'preparando', 'enviado', 'entregado']

// Efectivo: el ticket se muestra de una. Transferencia: cuando el negocio valida el pago.
export const ticketReady = (o) =>
  o.status !== 'rechazado' && (o.payment_method === 'efectivo' || o.payment_status === 'validado')

// Convierte enlaces de compartir (Google Drive, Dropbox) en URLs directas de imagen
export function imageUrl(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  const drive =
    u.match(/drive\.google\.com\/file\/d\/([\w-]{10,})/) ||
    u.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?(?:.*&)?id=([\w-]{10,})/) ||
    u.match(/docs\.google\.com\/uc\?(?:.*&)?id=([\w-]{10,})/)
  if (drive) return `https://lh3.googleusercontent.com/d/${drive[1]}=w1000`
  if (/^https?:\/\/(www\.)?dropbox\.com\//.test(u)) {
    const d = new URL(u)
    d.searchParams.delete('dl')
    d.searchParams.set('raw', '1')
    return d.href
  }
  return u
}

export const mapsUrl =(addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || '')}`

export const waUrl = (phone) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^(?!57)(\d{10})$/, '57$1')}`
