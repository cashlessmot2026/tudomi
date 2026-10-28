import { useState } from 'react'
import { getPosition, hasCoords, reverseGeocodeDetail } from '../lib/geo'
import MapView from './MapView'

/**
 * Dirección con botón "Usar mi ubicación actual".
 * value: { address, lat, lng }  ·  onChange(nuevoValor)
 * El texto se puede editar y el pin se puede arrastrar para ajustar las coordenadas.
 */
export default function AddressPicker({ value, onChange, label = 'Dirección', required, placeholder = 'Calle, número, barrio' }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const v = value || {}
  const coords = hasCoords(v)

  // keepText: al arrastrar el pin solo se ajustan las coordenadas, no se borra lo escrito
  const fill = async (lat, lng, keepText) => {
    onChange({ ...v, lat, lng })
    if (keepText) return
    try {
      const { address, city } = await reverseGeocodeDetail(lat, lng)
      if (address) onChange({ ...v, lat, lng, address, city })
    } catch {
      // Sin dirección automática: quedan las coordenadas y el texto se escribe a mano
    }
  }

  const useCurrent = async () => {
    setBusy(true)
    setMsg('')
    try {
      const p = await getPosition()
      await fill(p.lat, p.lng, false)
      setMsg(`📍 Ubicación detectada (precisión ±${Math.round(p.accuracy)} m). Revisa y completa la dirección (apto, torre, referencias).`)
    } catch (e) {
      setMsg(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="field address-picker">
      <span>{label}</span>
      <div className="address-row">
        <input
          className="input"
          required={required}
          value={v.address || ''}
          placeholder={placeholder}
          onChange={(e) => onChange({ ...v, address: e.target.value })}
        />
        <button type="button" className="btn ghost sm" onClick={useCurrent} disabled={busy} title="Usar mi ubicación actual">
          {busy ? '…' : '📍'}
        </button>
      </div>
      <button type="button" className="link-btn" onClick={useCurrent} disabled={busy}>
        {busy ? 'Obteniendo ubicación…' : coords ? '↻ Actualizar con mi ubicación actual' : '📍 Usar mi ubicación actual'}
      </button>
      {msg && <small className="muted">{msg}</small>}
      {coords && (
        <>
          <MapView
            height={180}
            points={[{ id: 'yo', lat: v.lat, lng: v.lng, emoji: '📍', draggable: true, label: 'Arrástrame para ajustar' }]}
            onDrag={(_, p) => fill(p.lat, p.lng, true)}
          />
          <small className="muted">
            Coordenadas: {Number(v.lat).toFixed(6)}, {Number(v.lng).toFixed(6)} · arrastra el pin si no quedó exacto{' '}
            <button type="button" className="link-btn" onClick={() => onChange({ ...v, lat: null, lng: null })}>
              quitar
            </button>
          </small>
        </>
      )}
    </div>
  )
}
