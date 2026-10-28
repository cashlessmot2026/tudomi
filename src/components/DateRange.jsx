import { useState } from 'react'

// Fechas en hora de Colombia (YYYY-MM-DD), igual que la agrupación del servidor
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const daysAgo = (n) => ymd(new Date(Date.now() - n * 86400000))
const monthStart = () => `${ymd(new Date()).slice(0, 8)}01`

const PRESETS = [
  ['hoy', 'Hoy', () => [daysAgo(0), daysAgo(0)]],
  ['7', '7 días', () => [daysAgo(6), daysAgo(0)]],
  ['30', '30 días', () => [daysAgo(29), daysAgo(0)]],
  ['mes', 'Este mes', () => [monthStart(), daysAgo(0)]],
]

export function useDateRange(initial = '7') {
  const [range, setRange] = useState(() => {
    const [from, to] = PRESETS.find((p) => p[0] === initial)[2]()
    return { preset: initial, from, to }
  })
  return [range, setRange]
}

export function DateRange({ value, onChange }) {
  return (
    <div className="range-row">
      <div className="chips">
        {PRESETS.map(([id, label, fn]) => (
          <button
            key={id}
            className={`chip ${value.preset === id ? 'active' : ''}`}
            onClick={() => {
              const [from, to] = fn()
              onChange({ preset: id, from, to })
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <input className="input" type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, preset: '', from: e.target.value })} />
      <input className="input" type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, preset: '', to: e.target.value })} />
    </div>
  )
}

export const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
