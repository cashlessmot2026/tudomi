import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AddressPicker from '../../components/AddressPicker'
import { ErrorText, Field, InstallButton, PushButton } from '../../components/ui'
import { useAuth } from '../../lib/auth'

export default function Profile() {
  const { user, profile, updateProfile, signOut } = useAuth()
  const [f, setF] = useState({ full_name: '', phone: '', address: '', lat: null, lng: null })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (profile)
      setF({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        address: profile.address || '',
        lat: profile.lat ?? null,
        lng: profile.lng ?? null,
      })
  }, [profile])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    setMsg('')
    setErr('')
    try {
      await updateProfile(f)
      setMsg('Datos guardados ✔')
    } catch (x) {
      setErr(x.message)
    }
  }

  return (
    <div className="page narrow">
      <h2 className="title">Mi cuenta</h2>
      <p className="muted">{user.email}</p>
      <form className="card pad form" onSubmit={save}>
        <Field label="Nombre">
          <input className="input" value={f.full_name} onChange={set('full_name')} />
        </Field>
        <Field label="Celular">
          <input className="input" type="tel" value={f.phone} onChange={set('phone')} />
        </Field>
        <AddressPicker value={f} onChange={(a) => setF((prev) => ({ ...prev, address: a.address ?? '', lat: a.lat ?? null, lng: a.lng ?? null }))} />
        <ErrorText>{err}</ErrorText>
        {msg && <p className="success">{msg}</p>}
        <button className="btn">Guardar</button>
      </form>

      <div className="card pad stack">
        <PushButton app="cliente" />
        <InstallButton />
        <Link className="btn ghost sm" to="/negocio">
          🏪 ¿Tienes un negocio? Publica tus productos
        </Link>
        <Link className="btn ghost sm" to="/domiciliario">
          🛵 Quiero ser domiciliario
        </Link>
        <button className="btn danger sm" onClick={signOut}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
