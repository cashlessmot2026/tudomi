import { useEffect, useRef } from 'react'

const CHECK_URL = 'https://lottie.host/embed/adf97339-cf21-4491-8706-24ee01b7f1ef/AkKsIdNxRM.lottie'

// Check animado a pantalla completa; se cierra solo o tocándolo
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
        <iframe src={CHECK_URL} title="Confirmado" allow="autoplay" />
        {title && <h2>{title}</h2>}
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
    </div>
  )
}
