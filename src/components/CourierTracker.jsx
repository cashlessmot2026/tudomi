import { useCallback, useEffect, useState } from 'react'
import { hasCoords, timeAgo } from '../lib/geo'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import MapView from './MapView'

const LIVE = ['aceptado', 'preparando', 'enviado']

// Mapa en vivo del domiciliario para el cliente y el negocio de un pedido activo
export function CourierTracker({ order, business }) {
  const [loc, setLoc] = useState(null)
  const [, tick] = useState(0)
  const active = !!order.courier_id && LIVE.includes(order.status)

  const load = useCallback(async () => {
    if (!active) return
    const { data } = await supabase.from('courier_locations').select('*').eq('courier_id', order.courier_id).maybeSingle()
    setLoc(data)
  }, [active, order.courier_id])

  useEffect(() => {
    load()
  }, [load])

  useRealtime(
    'courier_locations',
    `courier_id=eq.${order.courier_id}`,
    (p) => {
      if (p.new && hasCoords(p.new)) setLoc(p.new)
    },
    active,
  )

  // Refresca el "hace X s"
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => tick((x) => x + 1), 10000)
    return () => clearInterval(t)
  }, [active])

  if (!active) return null

  const points = [
    hasCoords(business) && { id: 'negocio', lat: business.lat, lng: business.lng, emoji: '🏪', label: business.name || 'Negocio' },
    hasCoords(order) && { id: 'destino', lat: order.lat, lng: order.lng, emoji: '🏠', label: 'Entrega' },
    hasCoords(loc) && { id: 'domi', lat: loc.lat, lng: loc.lng, emoji: '🛵', label: order.courier_name || 'Domiciliario', pulse: true },
  ].filter(Boolean)

  return (
    <div className="tracker">
      <div className="row-between small">
        <b>🛵 {order.courier_name || 'Domiciliario'} en vivo</b>
        <span className={`live-dot ${loc ? 'on' : ''}`}>{loc ? `● ${timeAgo(loc.updated_at)}` : 'esperando GPS…'}</span>
      </div>
      {points.length > 0 ? (
        <MapView points={points} follow="domi" height={220} />
      ) : (
        <p className="muted small">Aún no hay ubicación del domiciliario. Aparecerá cuando abra su app.</p>
      )}
    </div>
  )
}
