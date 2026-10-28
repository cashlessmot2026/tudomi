import { useState } from 'react'
import { useAuth } from '../lib/auth'
import AddressPicker from './AddressPicker'
import { ErrorText, Field, Spinner } from './ui'

const ERRORS = {
  'Invalid login credentials': 'Correo o contraseña incorrectos',
  'User already registered': 'Ese correo ya está registrado',
  'Email not confirmed': 'Confirma tu correo antes de ingresar',
  'Password should be at least 6 characters.': 'La contraseña debe tener mínimo 6 caracteres',
}

export function AuthForm({ title = 'Bienvenido', subtitle }) {
  const { signInGoogle, signIn, signUp } = useAuth()
  const [mode, setMode] = useState('login')
  const [f, setF] = useState({ full_name: '', phone: '', address: '', lat: null, lng: null, email: '', password: '' })
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setInfo('')
    setBusy(true)
    const { data, error } = mode === 'login' ? await signIn(f.email, f.password) : await signUp(f)
    setBusy(false)
    if (error) return setErr(ERRORS[error.message] || error.message)
    if (mode === 'register' && !data.session) setInfo('¡Cuenta creada! Revisa tu correo para confirmarla y luego ingresa.')
  }

  return (
    <div className="auth card glass">
      <h2 className="title">{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}

      <button className="btn google block" onClick={() => signInGoogle()}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Continuar con Google
      </button>

      <div className="divider">
        <span>o con tu correo</span>
      </div>

      <div className="tabs small">
        <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
          Ingresar
        </button>
        <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
          Registrarme
        </button>
      </div>

      <form onSubmit={submit} className="form">
        {mode === 'register' && (
          <>
            <Field label="Nombre completo">
              <input className="input" required value={f.full_name} onChange={set('full_name')} />
            </Field>
            <Field label="Celular">
              <input className="input" required type="tel" value={f.phone} onChange={set('phone')} />
            </Field>
            <AddressPicker
              value={{ address: f.address, lat: f.lat, lng: f.lng }}
              onChange={(a) => setF((prev) => ({ ...prev, address: a.address ?? '', lat: a.lat ?? null, lng: a.lng ?? null }))}
            />
          </>
        )}
        <Field label="Correo">
          <input className="input" required type="email" autoComplete="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Contraseña">
          <input
            className="input"
            required
            type="password"
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={f.password}
            onChange={set('password')}
          />
        </Field>
        <ErrorText>{err}</ErrorText>
        {info && <p className="success">{info}</p>}
        <button className="btn block" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  )
}

export function RequireAuth({ children, title, subtitle }) {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session)
    return (
      <div className="page narrow">
        <AuthForm title={title} subtitle={subtitle} />
      </div>
    )
  return children
}
