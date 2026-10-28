import { useEffect, useRef } from 'react'

const CHECK_URL = 'https://lottie.host/adf97339-cf21-4491-8706-24ee01b7f1ef/AkKsIdNxRM.lottie'
const WC_URL = 'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-wc@0.5.0/dist/index.js'

// Componente web de dotLottie: se carga una sola vez y dibuja el check sin fondo
function loadPlayer() {
  if (document.querySelector('script[data-dotlottie]')) return
  const s = document.createElement('script')
  s.type = 'module'
  s.src = WC_URL
  s.dataset.dotlottie = '1'
  document.head.appendChild(s)
}

// Check animado a pantalla completa; se cierra solo o tocándolo
export function SuccessCheck({ title, subtitle, onDone, ms = 3200 }) {
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => { loadPlayer() }, [])
  useEffect(() => {
    const t = setTimeout(() => done.current(), ms)
    return () => clearTimeout(t)
  }, [ms])
  return (
    <div className="success-check" role="status" onClick={() => done.current()}>
      <div className="success-card">
        <dotlottie-wc src={CHECK_URL} autoplay style={{ width: 220, height: 220, display: 'block', margin: '0 auto' }} />
        {title && <h2>{title}</h2>}
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
    </div>
  )
}
