import { fmtDate } from '../lib/format'

// Ubicación GPS registrada al finalizar la entrega. Solo la ven el negocio y el admin.
export function DeliveryLocation({ loc }) {
  if (!loc) return null
  if (loc.gps_status !== 'ok' || loc.lat == null)
    return (
      <div className="gps-box warn small">
        📍 Entrega sin ubicación GPS: {loc.gps_status === 'sin_permiso' ? 'el domiciliario no dio permiso de ubicación' : 'el GPS no estaba disponible'}.
      </div>
    )
  const q = `${loc.lat},${loc.lng}`
  return (
    <div className="gps-box">
      <div className="row-between small">
        <b>📍 Ubicación de entrega</b>
        <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer">
          Abrir en Maps ↗
        </a>
      </div>
      <iframe
        title="Ubicación de entrega"
        className="gps-map"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={`https://maps.google.com/maps?q=${q}&z=17&output=embed`}
      />
      <div className="muted small">
        {Number(loc.lat).toFixed(6)}, {Number(loc.lng).toFixed(6)}
        {loc.accuracy != null && ` · precisión ±${Math.round(loc.accuracy)} m`} · {fmtDate(loc.captured_at)}
      </div>
    </div>
  )
}
