import { useCallback, useEffect, useState } from 'react'
import { Empty, ErrorText, Field, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'

const courierUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}domiciliario`

// Domiciliarios propios del negocio: se inscriben por correo, sin documentos ni aprobación del admin
export default function BusinessCouriers({ business }) {
  const [couriers, setCouriers] = useState(null)
  const [invites, setInvites] = useState([])
  const [f, setF] = useState({ full_name: '', phone: '', email: '', vehicle_plate: '' })
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([
      supabase.from('couriers').select('*').eq('business_id', business.id).eq('kind', 'propio').order('created_at'),
      supabase.from('business_courier_invites').select('*').eq('business_id', business.id).is('claimed_by', null).order('created_at'),
    ])
    setCouriers(c.data || [])
    setInvites(i.data || [])
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const add = async (e) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    setBusy(true)
    const email = f.email.trim().toLowerCase()
    const { error } = await supabase.from('business_courier_invites').insert({
      business_id: business.id,
      email,
      full_name: f.full_name.trim(),
      phone: f.phone.trim(),
      vehicle_plate: f.vehicle_plate.trim().toUpperCase() || null,
    })
    setBusy(false)
    if (error) return setErr(error.code === '23505' ? 'Ya inscribiste a alguien con ese correo' : error.message)
    setMsg(`✔ ${f.full_name} inscrito. Pídele que entre a ${courierUrl()} con el correo ${email}.`)
    setF({ full_name: '', phone: '', email: '', vehicle_plate: '' })
    load()
  }

  const toggle = async (c) => {
    const { error } = await supabase.rpc('set_own_courier_active', { p_courier: c.id, p_active: !c.active })
    if (error) setErr(error.message)
    load()
  }

  const removeInvite = async (id) => {
    await supabase.from('business_courier_invites').delete().eq('id', id)
    load()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(courierUrl())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  if (couriers === null) return <Spinner />

  return (
    <div className="narrow">
      <div className="note-box small">
        <b>🛵 Tus domiciliarios de confianza</b>
        <ol className="steps compact">
          <li>Inscríbelo aquí con su nombre, celular y correo (Gmail u otro).</li>
          <li>
            Pídele que abra <b>{courierUrl()}</b> e ingrese con <b>ese mismo correo</b> (con Google o creando su cuenta).
          </li>
          <li>Queda activo de inmediato: no sube documentos ni espera aprobación del administrador.</li>
          <li>Al aceptar un pedido podrás asignárselo directamente. Solo verá los pedidos que tú le asignes.</li>
        </ol>
        <button className="btn ghost sm" type="button" onClick={copy}>
          {copied ? '✔ Enlace copiado' : '📋 Copiar enlace para domiciliarios'}
        </button>
      </div>

      <form className="card pad form mt" onSubmit={add}>
        <h3>Inscribir domiciliario propio</h3>
        <Field label="Nombre completo">
          <input className="input" required value={f.full_name} onChange={set('full_name')} />
        </Field>
        <div className="row2">
          <Field label="Celular">
            <input className="input" required type="tel" value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="Placa (opcional)">
            <input className="input" value={f.vehicle_plate} onChange={set('vehicle_plate')} placeholder="ABC12D" />
          </Field>
        </div>
        <Field label="Correo con el que va a ingresar" hint="Debe ser el mismo correo con el que inicie sesión en la app de domiciliarios">
          <input className="input" required type="email" value={f.email} onChange={set('email')} placeholder="domi@gmail.com" />
        </Field>
        <ErrorText>{err}</ErrorText>
        {msg && <p className="success">{msg}</p>}
        <button className="btn block" disabled={busy}>
          {busy ? 'Guardando…' : '＋ Inscribir domiciliario'}
        </button>
      </form>

      {invites.length > 0 && (
        <>
          <h3 className="section-title">⏳ Pendientes de ingresar</h3>
          {invites.map((i) => (
            <div key={i.id} className="card pad row-between">
              <div className="grow">
                <b>{i.full_name}</b>
                <div className="muted small">
                  {i.email} · {i.phone}
                </div>
                <div className="muted small">Aún no ha ingresado a la app de domiciliarios con este correo.</div>
              </div>
              <button className="btn danger sm" onClick={() => removeInvite(i.id)}>
                Quitar
              </button>
            </div>
          ))}
        </>
      )}

      <h3 className="section-title">✅ Domiciliarios activos</h3>
      {couriers.length === 0 ? (
        <Empty icon="🛵" text="Aún no tienes domiciliarios propios vinculados" />
      ) : (
        couriers.map((c) => (
          <div key={c.id} className={`card pad row-between ${c.active ? '' : 'off'}`}>
            <div className="grow">
              <b>{c.full_name}</b>
              <div className="muted small">
                {c.email} · {c.phone} {c.vehicle_plate && `· ${c.vehicle_plate}`}
              </div>
            </div>
            <button className={`btn sm ${c.active ? 'ok' : ''}`} onClick={() => toggle(c)}>
              {c.active ? 'Activo' : 'Inactivo'}
            </button>
          </div>
        ))
      )}
    </div>
  )
}
