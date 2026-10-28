import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

const icon = (emoji, cls = '') =>
  L.divIcon({ className: `map-pin ${cls}`, html: `<span>${emoji}</span>`, iconSize: [38, 38], iconAnchor: [19, 36] })

/**
 * Mapa OpenStreetMap con marcadores.
 * points: [{ id, lat, lng, emoji, label, draggable, pulse }]
 * onDrag(id, {lat, lng}) se llama al soltar un marcador arrastrable.
 * follow: id del marcador que se mantiene visible al moverse.
 */
export default function MapView({ points, onDrag, follow, height = 240, zoom = 16 }) {
  const box = useRef(null)
  const map = useRef(null)
  const markers = useRef({})
  const fitted = useRef(false)
  const dragCb = useRef(onDrag)
  dragCb.current = onDrag

  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map.current)
    // Dentro de modales / pestañas el tamaño cambia después de montar
    const ro = new ResizeObserver(() => map.current?.invalidateSize())
    ro.observe(box.current)
    return () => {
      ro.disconnect()
      map.current.remove()
      map.current = null
      markers.current = {}
      fitted.current = false
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const valid = points.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && p.lat !== null && p.lng !== null)
    const seen = new Set()
    for (const p of valid) {
      seen.add(p.id)
      const ll = [Number(p.lat), Number(p.lng)]
      let mk = markers.current[p.id]
      if (!mk) {
        mk = L.marker(ll, { icon: icon(p.emoji, p.pulse ? 'pulse-pin' : ''), draggable: !!p.draggable }).addTo(m)
        if (p.label) mk.bindTooltip(p.label)
        if (p.draggable)
          mk.on('dragend', () => {
            const { lat, lng } = mk.getLatLng()
            dragCb.current?.(p.id, { lat, lng })
          })
        markers.current[p.id] = mk
      } else {
        mk.setLatLng(ll)
      }
    }
    for (const id of Object.keys(markers.current)) {
      if (!seen.has(id)) {
        markers.current[id].remove()
        delete markers.current[id]
      }
    }
    if (!valid.length) return
    if (!fitted.current) {
      fitted.current = true
      if (valid.length === 1) m.setView([valid[0].lat, valid[0].lng], zoom)
      else m.fitBounds(L.latLngBounds(valid.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 17 })
    } else if (follow && markers.current[follow] && !m.getBounds().pad(-0.1).contains(markers.current[follow].getLatLng())) {
      m.panTo(markers.current[follow].getLatLng())
    }
  }, [points, follow, zoom])

  return <div ref={box} className="map-view" style={{ height }} />
}
