import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RequireAuth } from '../../components/AuthForm'
import { ItemLine } from '../../components/OrderTicket'
import { Empty, ErrorText, Field, InstallButton, PushButton, Spinner, StatusBadge, Tabs } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { fmtDate, money, waUrl } from '../../lib/format'
import { directionsLink, hasCoords, mapsLink } from '../../lib/geo'
import { beep, notifyLocal } from '../../lib/pwa'
import { supabase, uploadFile } from '../../lib/supabase'
import { useRealtime } from '../../lib/useRealtime'

export default function CourierApp() {
  return (
    <div className="app app-domi">
      <header className="topbar">
        <Link to="/domiciliario" className="logo">
          Tu<span>Domi</span> <small>Domiciliarios</small>
        </Link>
        <InstallButton />
      </header>
      <RequireAuth title="Domiciliarios" subtitle="Crea tu cuenta y envía tus documentos para empezar a hacer domicilios">
        <CourierInner />
      </RequireAuth>
    </div>
  )
}

function CourierInner() {
  const { user, signOut } = useAuth()
  const [c, setC] = useState(undefined)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('couriers').select('*').eq('id', user.id).maybeSingle()
    setC(data)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  if (c === undefined) return <Spinner />

  if (!c || editing)
    return (
      <div className="page narrow">
        <CourierRegister
          existing={c}
          onSaved={() => {
            setEditing(false)
            load()
          }}
        />
        <button className="btn ghost sm mt" onClick={signOut}>
          Cerrar sesión
        </button>
      </div>
    )

  if (c.status !== 'aprobado')
    return (
      <div className="page narrow">
        <div className="card pad waiting">
          {c.status === 'pendiente' ? (
            <>
              <div className="empty-icon">🕵️</div>
              <h2>Documentos en revisión</h2>
              <p className="muted">El administrador está validando tu SOAT, tecnomecánica, licencia y cédula. Te avisaremos cuando estés aprobado.</p>
              <button className="btn ghost sm" onClick={load}>
                ↻ Actualizar estado
              </button>
            </>
          ) : (
            <>
              <div className="empty-icon">⚠️</div>
              <h2>Registro rechazado</h2>
              {c.admin_note && <p className="error">{c.admin_note}</p>}
              <button className="btn" onClick={() => setEditing(true)}>
                Corregir y reenviar documentos
              </button>
            </>
          )}
        </div>
        <div className="card pad stack mt">
          <PushButton app="domi" />
          <button className="btn danger sm" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    )

  return <CourierDashboard courier={c} />
}

const DOCS = [
  ['soat_url', 'SOAT vigente'],
  ['tecnomecanica_url', 'Revisión tecnomecánica'],
  ['license_url', 'Licencia de conducción'],
  ['id_card_url', 'Cédula del conductor'],
]

function CourierRegister({ existing, onSaved }) {
  const { user, profile } = useAuth()
  const [f, setF] = useState(() => ({
    full_name: existing?.full_name || profile?.full_name || '',
    document_number: existing?.document_number || '',
    phone: existing?.phone || profile?.phone || '',
    vehicle_plate: existing?.vehicle_plate || '',
    vehicle_model: existing?.vehicle_model || '',
  }))
  const [files, setFiles] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const missing = DOCS.filter(([k]) => !files[k] && !existing?.[k])
    if (missing.length) return setErr(`Falta: ${missing.map(([, l]) => l).join(', ')}`)
    setBusy(true)
    try {
      const urls = {}
      for (const [k] of DOCS) urls[k] = files[k] ? await uploadFile('documentos', files[k], user.id) : existing[k]
      const row = { ...f, vehicle_plate: f.vehicle_plate.toUpperCase(), ...urls }
      const { error } = existing
        ? await supabase.from('couriers').update({ ...row, status: 'pendiente' }).eq('id', user.id)
        : await supabase.from('couriers').insert(row)
      if (error) throw error
      onSaved()
    } catch (x) {
      setErr(x.message)
      setBusy(false)
    }
  }

  return (
    <form className="card pad form" onSubmit={submit}>
      <h2 className="title">Pre-registro de domiciliario</h2>
      <p className="muted small">Sube fotos claras de tus documentos. Un administrador los valida antes de que puedas tomar pedidos.</p>
      <Field label="Nombre completo">
        <input className="input" required value={f.full_name} onChange={set('full_name')} />
      </Field>
      <div className="row2">
        <Field label="Número de cédula">
          <input className="input" required inputMode="numeric" value={f.document_number} onChange={set('document_number')} />
        </Field>
        <Field label="Celular">
          <input className="input" required type="tel" value={f.phone} onChange={set('phone')} />
        </Field>
      </div>
      <div className="row2">
        <Field label="Placa de la moto">
          <input className="input" required value={f.vehicle_plate} onChange={set('vehicle_plate')} placeholder="ABC12D" />
        </Field>
        <Field label="Marca / modelo">
          <input className="input" value={f.vehicle_model} onChange={set('vehicle_model')} />
        </Field>
      </div>
      {DOCS.map(([k, label]) => (
        <Field key={k} label={`📄 ${label}`} hint={existing?.[k] && !files[k] ? 'Ya cargado. Sube otro solo si quieres reemplazarlo.' : null}>
          <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => setFiles({ ...files, [k]: e.target.files[0] })} />
        </Field>
      ))}
      <ErrorText>{err}</ErrorText>
      <button className="btn block" disabled={busy}>
        {busy ? 'Subiendo documentos…' : 'Enviar a validación'}
      </button>
    </form>
  )
}

function CourierDashboard({ courier }) {
  const { signOut } = useAuth()
  const [tab, setTab] = useState('disponibles')
  const [avail, setAvail] = useState(null)
  const [mine, setMine] = useState(null)
  const [err, setErr] = useState('')

  const loadAvail = useCallback(async () => {
    const { data } = await supabase.rpc('available_orders')
    setAvail((prev) => {
      if (prev && data && data.some((o) => !prev.find((p) => p.id === o.id))) {
        beep()
        notifyLocal('Nuevo domicilio disponible 🛵', 'Hay un pedido listo para tomar', '/domiciliario')
      }
      return data || []
    })
  }, [])

  const loadMine = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, businesses(name, address, phone, lat, lng)')
      .eq('courier_id', courier.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setMine(data || [])
  }, [courier.id])

  useEffect(() => {
    loadAvail()
    loadMine()
    const t = setInterval(loadAvail, 15000)
    return () => clearInterval(t)
  }, [loadAvail, loadMine])

  useRealtime('orders', `courier_id=eq.${courier.id}`, loadMine)

  const take = async (id) => {
    setErr('')
    const { error } = await supabase.rpc('take_order', { p_order: id })
    if (error) setErr(error.message)
    await Promise.all([loadAvail(), loadMine()])
    if (!error) setTab('mios')
  }

  const active = (mine || []).filter((o) => o.status !== 'entregado' && o.status !== 'rechazado')
  const live = useLiveLocation(courier.id, active.length > 0)

  return (
    <div className="page">
      <div className="card pad biz-head">
        <div className="empty-icon sm">🛵</div>
        <div className="grow">
          <h2>{courier.full_name}</h2>
          <p className="muted small">
            Placa {courier.vehicle_plate} · <span className="pill ok">Aprobado</span>
          </p>
        </div>
      </div>
      {active.length > 0 && (
        <div className={`card pad live-banner ${live.error ? 'warn' : ''}`}>
          {live.error ? (
            <>⚠️ {live.error}</>
          ) : (
            <>
              <span className="live-dot on">●</span> Compartiendo tu ubicación en vivo con el cliente y el negocio mientras tengas entregas activas.
              {live.at && <span className="muted small"> Última: {new Date(live.at).toLocaleTimeString('es-CO')}</span>}
            </>
          )}
          <div className="muted small">Mantén la app abierta y la pantalla encendida durante la entrega.</div>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ['disponibles', `📦 Disponibles (${avail?.length || 0})`],
          ['mios', `🛵 Mis entregas (${active.length})`],
          ['cuenta', '👤 Cuenta'],
        ]}
      />
      <ErrorText>{err}</ErrorText>

      {tab === 'disponibles' &&
        (avail === null ? (
          <Spinner />
        ) : avail.length === 0 ? (
          <Empty icon="😴" text="No hay pedidos disponibles por ahora. Se actualiza solo." />
        ) : (
          <div className="orders-grid">
            {avail.map((o) => (
              <div key={o.id} className="card pad order-card">
                <div className="row-between">
                  <h3>#{o.number}</h3>
                  <StatusBadge status={o.status} />
                </div>
                <p className="small">
                  🏪 <b>{o.business_name}</b>
                  <br />
                  <span className="muted">{o.business_address}</span>
                </p>
                <p className="small">📍 Entregar en: {o.address}</p>
                <p className="small">
                  {o.items_count} producto(s) · <b>{money(o.total)}</b> · {o.payment_method === 'efectivo' ? '💵 Cobrar efectivo' : '🏦 Ya pagado'}
                </p>
                <button className="btn block pulse" onClick={() => take(o.id)}>
                  Tomar pedido
                </button>
              </div>
            ))}
          </div>
        ))}

      {tab === 'mios' &&
        (mine === null ? (
          <Spinner />
        ) : mine.length === 0 ? (
          <Empty icon="🛵" text="Aún no has tomado pedidos" />
        ) : (
          <div className="orders-grid">
            {mine.map((o) => (
              <DeliveryCard key={o.id} o={o} onChange={loadMine} />
            ))}
          </div>
        ))}

      {tab === 'cuenta' && (
        <div className="card pad stack narrow">
          <PushButton app="domi" />
          <button className="btn danger sm" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

// Envía la posición del domi a courier_locations mientras tenga entregas activas
function useLiveLocation(courierId, enabled) {
  const [state, setState] = useState({ at: null, error: '' })
  useEffect(() => {
    if (!enabled) return
    if (!navigator.geolocation) {
      setState({ at: null, error: 'Tu dispositivo no permite compartir la ubicación' })
      return
    }
    let last = 0
    let lastPos = null
    let lock = null
    // Mantener la pantalla encendida ayuda a que el GPS siga activo
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    const send = async (c) => {
      const { error } = await supabase.from('courier_locations').upsert({
        courier_id: courierId,
        lat: c.latitude,
        lng: c.longitude,
        accuracy: c.accuracy,
        heading: Number.isFinite(c.heading) ? c.heading : null,
        speed: Number.isFinite(c.speed) ? c.speed : null,
        updated_at: new Date().toISOString(),
      })
      setState(error ? { at: null, error: `No se pudo enviar la ubicación: ${error.message}` } : { at: Date.now(), error: '' })
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now()
        const moved = !lastPos || Math.hypot(p.coords.latitude - lastPos.latitude, p.coords.longitude - lastPos.longitude) > 0.00012
        // Máximo una actualización cada 5 s, o cada 30 s si está quieto
        if (now - last < 5000 || (!moved && now - last < 30000)) return
        last = now
        lastPos = p.coords
        send(p.coords)
      },
      (e) => setState({ at: null, error: e.code === 1 ? 'Activa el permiso de ubicación para que el cliente y el negocio vean tu recorrido' : 'No se pudo obtener tu ubicación. Activa el GPS' }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    )
    return () => {
      navigator.geolocation.clearWatch(id)
      lock?.release?.().catch(() => {})
    }
  }, [courierId, enabled])
  return state
}

// Posición actual del dispositivo al cerrar la entrega (se envía al servidor, no se muestra)
const getGps = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ p_gps_status: 'no_disponible' })
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ p_lat: p.coords.latitude, p_lng: p.coords.longitude, p_accuracy: p.coords.accuracy }),
      (e) => resolve({ p_gps_status: e.code === 1 ? 'sin_permiso' : 'no_disponible' }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  })

function DeliveryCard({ o, onChange }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const call = async (fn, args) => {
    setBusy(true)
    setErr('')
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) setErr(error.message)
    else onChange()
  }

  return (
    <div className={`card pad order-card st-${o.status}`}>
      <div className="row-between">
        <h3>#{o.number}</h3>
        <StatusBadge status={o.status} />
      </div>
      <div className="muted small">{fmtDate(o.created_at)}</div>
      <div className="ticket-sec small">
        <b>Recoger en:</b> {o.businesses?.name}
        <br />
        <a href={mapsLink(o.businesses?.address, o.businesses?.lat, o.businesses?.lng)} target="_blank" rel="noreferrer">
          📍 {o.businesses?.address}
        </a>
        {hasCoords(o.businesses) && ['aceptado', 'preparando'].includes(o.status) && (
          <a className="btn ghost sm nav-btn" href={directionsLink(o.businesses.lat, o.businesses.lng)} target="_blank" rel="noreferrer">
            🧭 Cómo llegar al negocio
          </a>
        )}
      </div>
      <div className="ticket-sec small">
        <b>Entregar a:</b> {o.customer_name}
        <br />
        <a href={mapsLink(o.address, o.lat, o.lng)} target="_blank" rel="noreferrer">
          📍 {o.address}
        </a>
        {hasCoords(o) && ['aceptado', 'preparando', 'enviado'].includes(o.status) && (
          <a className="btn ghost sm nav-btn" href={directionsLink(o.lat, o.lng)} target="_blank" rel="noreferrer">
            🧭 Cómo llegar al cliente
          </a>
        )}
        {o.phone && (
          <>
            <br />
            <a href={`tel:${o.phone}`}>📞 {o.phone}</a> ·{' '}
            <a href={waUrl(o.phone)} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </>
        )}
      </div>
      <div className="ticket-sec">
        {o.items.map((it, i) => (
          <ItemLine key={i} it={it} />
        ))}
      </div>
      {o.note && <div className="note-box">📝 {o.note}</div>}
      <div className="totals">
        <div className="grand">
          <span>{o.payment_method === 'efectivo' ? '💵 Cobrar' : '🏦 Pagado'}</span>
          <span>{money(o.total)}</span>
        </div>
      </div>
      <div className="code-row">
        <span>Código del pedido</span>
        <b className="code-sm">{o.delivery_code}</b>
      </div>

      {['aceptado', 'preparando'].includes(o.status) && (
        <button className="btn block" disabled={busy} onClick={() => call('courier_mark_sent', { p_order: o.id })}>
          📦 Recogí el pedido · voy en camino
        </button>
      )}
      {['aceptado', 'preparando', 'enviado'].includes(o.status) && (
        <div className="code-check">
          <p className="small muted">Pídele al cliente su código de 4 dígitos para finalizar la entrega.</p>
          <input
            className="input code-input"
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button
            className="btn ok block"
            disabled={busy || code.length !== 4}
            onClick={async () => {
              setBusy(true)
              const gps = await getGps()
              call('complete_delivery', { p_order: o.id, p_code: code, ...gps })
            }}
          >
            {busy ? 'Finalizando…' : '✔ Validar código y finalizar'}
          </button>
        </div>
      )}
      <ErrorText>{err}</ErrorText>
    </div>
  )
}
