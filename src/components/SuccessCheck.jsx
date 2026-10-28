import { useEffect, useRef } from 'react'

// Check animado a pantalla completa (SVG + CSS, sin fondo); se cierra solo o tocándolo
export function SuccessCheck({ title, subtitle, onDone, ms = 3200 }) {
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const t = setTimeout(() => done.current(), ms)
    return () => clearTimeout(t)
  }, [ms])
  return (
    <div className="success-check" role="status" onClick={() => done.current()}>
      <div className="success-card">
        <svg className="anim-check" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="ac-glow" cx="60" cy="60" r="44" />
          <circle className="ac-ring" cx="60" cy="60" r="44" />
          <path className="ac-tick" d="M38 61 L54 77 L84 45" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <line key={a} className="ac-spark" x1="60" y1="6" x2="60" y2="14" transform={`rotate(${a} 60 60)`} />
          ))}
        </svg>
        {title && <h2>{title}</h2>}
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
    </div>
  )
}
