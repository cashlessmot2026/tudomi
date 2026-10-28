import { useEffect, useState } from 'react'
import { STATUS } from '../lib/format'
import { canPromptInstall, enablePush, isIOS, isStandalone, onInstallChange, promptInstall } from '../lib/pwa'

export const Spinner = ({ text }) => (
  <div className="center-box">
    <div className="spinner" />
    {text && <p className="muted">{text}</p>}
  </div>
)

export const Empty = ({ icon = '📭', text, children }) => (
  <div className="center-box empty">
    <div className="empty-icon">{icon}</div>
    <p className="muted">{text}</p>
    {children}
  </div>
)

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', k)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export const StatusBadge = ({ status }) => {
  const s = STATUS[status] || { label: status, color: '#888' }
  return (
    <span className="badge" style={{ '--c': s.color }}>
      {s.icon} {s.label}
    </span>
  )
}

export const Field = ({ label, hint, children }) => (
  <label className="field">
    <span>{label}</span>
    {children}
    {hint && <small className="muted">{hint}</small>}
  </label>
)

export const Tabs = ({ value, onChange, items }) => (
  <div className="tabs">
    {items.map(([id, label]) => (
      <button key={id} className={`tab ${value === id ? 'active' : ''}`} onClick={() => onChange(id)}>
        {label}
      </button>
    ))}
  </div>
)

export const Img = ({ src, alt, className, fallback = '🛍️' }) => {
  const [bad, setBad] = useState(false)
  if (!src || bad) return <div className={`img-fallback ${className || ''}`}>{fallback}</div>
  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setBad(true)} />
}

export function InstallButton() {
  const [, force] = useState(0)
  const [help, setHelp] = useState(false)
  useEffect(() => onInstallChange(() => force((x) => x + 1)), [])
  if (isStandalone()) return null
  const click = async () => {
    if (!(await promptInstall())) setHelp(true)
  }
  return (
    <>
      <button className={`btn ghost sm ${canPromptInstall() ? 'pulse' : ''}`} onClick={click}>
        📲 Instalar app
      </button>
      {help && (
        <Modal title="Instalar la app" onClose={() => setHelp(false)}>
          {isIOS() ? (
            <ol className="steps">
              <li>Abre esta página en <b>Safari</b>.</li>
              <li>Toca el botón <b>Compartir</b> ⬆️.</li>
              <li>Elige <b>“Agregar a pantalla de inicio”</b>.</li>
            </ol>
          ) : (
            <ol className="steps">
              <li>Abre el menú del navegador (⋮).</li>
              <li>Toca <b>“Instalar app”</b> o <b>“Agregar a pantalla principal”</b>.</li>
            </ol>
          )}
        </Modal>
      )}
    </>
  )
}

export function PushButton({ app }) {
  const [msg, setMsg] = useState('')
  const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted'
  const click = async () => {
    try {
      const r = await enablePush(app)
      setMsg(r.localOnly ? '¡Notificaciones activadas en este dispositivo!' : '¡Notificaciones push activadas!')
    } catch (e) {
      setMsg(e.message)
    }
  }
  return (
    <div>
      <button className="btn ghost sm" onClick={click}>
        🔔 {granted ? 'Notificaciones activas' : 'Activar notificaciones'}
      </button>
      {msg && <p className="muted small">{msg}</p>}
    </div>
  )
}

export const ErrorText = ({ children }) => (children ? <p className="error">{children}</p> : null)
