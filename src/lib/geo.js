// Utilidades de ubicación: GPS del dispositivo, dirección a partir de coordenadas y enlaces a Maps

export function getPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Tu dispositivo no permite obtener la ubicación'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? 'Debes permitir el acceso a la ubicación en tu navegador'
              : e.code === 3
                ? 'Se demoró mucho en obtener la ubicación, intenta de nuevo'
                : 'No se pudo obtener la ubicación. Activa el GPS',
          ),
        ),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    )
  })
}

// Dirección legible desde coordenadas (OpenStreetMap / Nominatim)
export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=es`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('No se pudo obtener la dirección')
  const d = await res.json()
  const a = d.address || {}
  const street = [a.road, a.house_number].filter(Boolean).join(' # ')
  const parts = [street, a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.village || a.municipality].filter(Boolean)
  return parts.length ? parts.join(', ') : d.display_name || ''
}

export const hasCoords = (o) => o && Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lng)) && o.lat !== null && o.lng !== null

// Enlace a Google Maps: usa coordenadas si existen, si no la dirección
export const mapsLink = (address, lat, lng) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hasCoords({ lat, lng }) ? `${lat},${lng}` : address || '')}`

export const directionsLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`

export function timeAgo(d) {
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000))
  if (s < 60) return `hace ${s} s`
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  return `hace ${Math.round(s / 3600)} h`
}
