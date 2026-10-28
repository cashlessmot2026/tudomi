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

// Dirección y ciudad desde coordenadas (OpenStreetMap / Nominatim)
export async function reverseGeocodeDetail(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=es`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('No se pudo obtener la dirección')
  const d = await res.json()
  const a = d.address || {}
  const city = a.city || a.town || a.village || a.municipality || ''
  const street = [a.road, a.house_number].filter(Boolean).join(' # ')
  const parts = [street, a.neighbourhood || a.suburb || a.quarter, city].filter(Boolean)
  return { address: parts.length ? parts.join(', ') : d.display_name || '', city }
}

export const reverseGeocode = async (lat, lng) => (await reverseGeocodeDetail(lat, lng)).address

// Para comparar ciudades sin importar mayúsculas ni tildes ("Bogotá" = "bogota")
export const normCity = (c) =>
  String(c || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

// Distancia en km entre dos puntos (fórmula de Haversine)
export function distanceKm(a, b) {
  const r = (x) => (Number(x) * Math.PI) / 180
  const h = Math.sin((r(b.lat) - r(a.lat)) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin((r(b.lng) - r(a.lng)) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

export const distLabel = (km) => (km < 1 ? `${Math.max(1, Math.round(km * 10) * 100)} m` : `${km.toFixed(1)} km`)

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
