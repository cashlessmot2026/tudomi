import { useCallback, useEffect, useState } from 'react'
import { DeliveryLocation } from '../../components/DeliveryLocation'
import MapView from '../../components/MapView'
import { hasCoords, timeAgo } from '../../lib/geo'
import { OrderTicket } from '../../components/OrderTicket'
import { Empty, ErrorText, Field, Img, Modal, Spinner, StatusBadge, Tabs } from '../../components/ui'
import { catLabel, fmtDate, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const KEY = 'tudomi_admin'
const getPass = () => {
  try {
    return sessionStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

// Interfaz oculta: no está enlazada en ninguna parte. Contraseña validada en el servidor.
export default function AdminApp() {
  const [pass, setPass] = useState(getPass)
  const [stats, setStats] = useState(null)
  const [err, setErr] = useState('')
  const [checking, setChecking] = useState(!!getPass())

  const login = useCallback(async (p) => {
    setErr('')
    const { data, error } = await supabase.rpc('admin_stats', { p_pass: p })
    setChecking(false)
    if (error) {
      setErr(error.message)
      setStats(null)
      return
    }
    try {
      sessionStorage.setItem(KEY, p)
    } catch {}
    setStats(data)
  }, [])

  useEffect(() => {
    if (pass) login(pass)
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = () => {
    try {
      sessionStorage.removeItem(KEY)
    } catch {}
    setPass('')
    setStats(null)
  }

  if (checking) return <Spinner />

  if (!stats)
    return (
      <div className="app app-admin">
        <div className="page narrow">
          <form
            className="card pad form auth"
            onSubmit={(e) => {
              e.preventDefault()
              login(pass)
            }}
          >
            <div className="empty-icon">🔐</div>
            <h2 className="title">Administración</h2>
            <Field label="Contraseña">
              <input className="input" type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} />
            </Field>
            <ErrorText>{err}</ErrorText>
            <button className="btn block">Entrar</button>
          </form>
        </div>
      </div>
    )

  return <AdminPanel pass={pass} stats={stats} refreshStats={() => login(pass)} logout={logout} />
}

function AdminPanel({ pass, stats, refreshStats, logout }) {
  const [tab, setTab] = useState('domis')
  return (
    <div className="app app-admin">
      <header className="topbar">
        <div className="logo">
          Tu<span>Domi</span> <small>Admin</small>
        </div>
        <button className="btn ghost sm" onClick={logout}>
          Salir
        </button>
      </header>
      <div className="page">
        <div className="stats">
          <div className="stat card">
            <b>{stats.couriers_pending}</b>
            <span>Domis por validar</span>
          </div>
          <div className="stat card">
            <b>{stats.couriers_approved}</b>
            <span>Domis aprobados</span>
          </div>
          <div className="stat card">
            <b>{stats.businesses}</b>
            <span>Negocios</span>
          </div>
          <div className="stat card">
            <b>{stats.orders_today}</b>
            <span>Pedidos hoy</span>
          </div>
          <div className="stat card">
            <b>{money(stats.sales_delivered)}</b>
            <span>Ventas entregadas</span>
          </div>
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            ['domis', '🛵 Domiciliarios'],
            ['negocios', '🏪 Negocios'],
            ['pedidos', '📦 Pedidos'],
            ['ajustes', '⚙️ Ajustes'],
          ]}
        />
        {tab === 'domis' && <Couriers pass={pass} onChange={refreshStats} />}
        {tab === 'negocios' && <Businesses pass={pass} />}
        {tab === 'pedidos' && <AllOrders pass={pass} />}
        {tab === 'ajustes' && <ChangePass pass={pass} onDone={logout} />}
      </div>
    </div>
  )
}

const DOC_LABELS = { soat_url: 'SOAT', tecnomecanica_url: 'Tecnomecánica', license_url: 'Licencia', id_card_url: 'Cédula' }

function Couriers({ pass, onChange }) {
  const [list, setList] = useState(null)
  const [filter, setFilter] = useState('pendiente')
  const [notes, setNotes] = useState({})
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_couriers', { p_pass: pass })
    if (error) setErr(error.message)
    setList(data || [])
  }, [pass])

  useEffect(() => {
    load()
  }, [load])

  const setStatus = async (id, status) => {
    const { error } = await supabase.rpc('admin_set_courier_status', { p_pass: pass, p_id: id, p_status: status, p_note: notes[id] || null })
    if (error) return setErr(error.message)
    load()
    onChange()
  }

  if (list === null) return <Spinner />
  const shown = list.filter((c) => filter === 'todos' || c.status === filter)

  return (
    <div>
      <div className="chips">
        {['pendiente', 'aprobado', 'rechazado', 'todos'].map((s) => (
          <button key={s} className={`chip ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
            {s} ({s === 'todos' ? list.length : list.filter((c) => c.status === s).length})
          </button>
        ))}
      </div>
      <ErrorText>{err}</ErrorText>
      {shown.length === 0 && <Empty icon="🛵" text="No hay domiciliarios en este estado" />}
      <div className="orders-grid">
        {shown.map((c) => (
          <div key={c.id} className="card pad">
            <div className="row-between">
              <h3>{c.full_name}</h3>
              <span className={`pill ${c.status === 'aprobado' ? 'ok' : c.status === 'rechazado' ? 'bad' : ''}`}>{c.status}</span>
            </div>
            <p className="small muted">
              CC {c.document_number} · 📞 {c.phone}
              <br />
              🏍️ {c.vehicle_plate} {c.vehicle_model && `· ${c.vehicle_model}`}
              <br />
              Registrado: {fmtDate(c.created_at)}
            </p>
            <div className="docs">
              {Object.entries(DOC_LABELS).map(([k, label]) => (
                <a key={k} href={c[k]} target="_blank" rel="noreferrer" className="doc">
                  {/\.pdf($|\?)/i.test(c[k]) ? <div className="img-fallback">📄</div> : <Img src={c[k]} alt={label} fallback="📄" />}
                  <span>{label}</span>
                </a>
              ))}
            </div>
            {c.admin_note && <p className="small error">Nota: {c.admin_note}</p>}
            <input
              className="input"
              placeholder="Nota (motivo de rechazo, etc.)"
              value={notes[c.id] || ''}
              onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
            />
            <div className="actions">
              {c.status !== 'aprobado' && (
                <button className="btn ok sm" onClick={() => setStatus(c.id, 'aprobado')}>
                  ✔ Aprobar
                </button>
              )}
              {c.status !== 'rechazado' && (
                <button className="btn danger sm" onClick={() => setStatus(c.id, 'rechazado')}>
                  ✖ Rechazar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Businesses({ pass }) {
  const [list, setList] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('admin_list_businesses', { p_pass: pass })
    setList(data || [])
  }, [pass])
  useEffect(() => {
    load()
  }, [load])
  const toggle = async (b) => {
    await supabase.rpc('admin_set_business_active', { p_pass: pass, p_id: b.id, p_active: !b.active })
    load()
  }
  if (list === null) return <Spinner />
  if (!list.length) return <Empty icon="🏪" text="Aún no hay negocios registrados" />
  return (
    <div className="orders-grid">
      {list.map((b) => (
        <div key={b.id} className={`card pad ${b.active ? '' : 'off'}`}>
          <div className="row-between">
            <Img src={b.logo_url} alt="" className="biz-logo" fallback="🏪" />
            <div className="grow">
              <b>{b.name}</b>
              <div className="muted small">
                {catLabel(b.category)} · {b.phone}
              </div>
            </div>
          </div>
          <p className="small muted">{b.address}</p>
          <button className={`btn sm ${b.active ? 'danger' : 'ok'}`} onClick={() => toggle(b)}>
            {b.active ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      ))}
    </div>
  )
}

function AllOrders({ pass }) {
  const [list, setList] = useState(null)
  const [open, setOpen] = useState(null)
  useEffect(() => {
    supabase.rpc('admin_list_orders', { p_pass: pass }).then(({ data }) => setList(data || []))
  }, [pass])
  if (list === null) return <Spinner />
  if (!list.length) return <Empty icon="📦" text="Aún no hay pedidos" />
  return (
    <>
      <p className="muted small">Toca un pedido para ver el detalle completo y el ticket.</p>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Negocio</th>
              <th>Cliente</th>
              <th>Domi</th>
              <th>Pago</th>
              <th>Total</th>
              <th>Estado</th>
              <th>GPS</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id} className="clickable" onClick={() => setOpen(o.id)}>
                <td>{o.number}</td>
                <td>{fmtDate(o.created_at)}</td>
                <td>{o.business_name}</td>
                <td>{o.customer_name}</td>
                <td>{o.courier_name || '—'}</td>
                <td>{o.payment_method}</td>
                <td>{money(o.total)}</td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td>{o.has_gps ? '📍' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <OrderDetailModal pass={pass} id={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function OrderDetailModal({ pass, id, onClose }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('admin_get_order', { p_pass: pass, p_id: id }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else setD(data)
    })
  }, [pass, id])

  const o = d?.order
  return (
    <Modal title={o ? `Pedido #${o.number}` : 'Pedido'} onClose={onClose} wide>
      <ErrorText>{err}</ErrorText>
      {!d && !err && <Spinner />}
      {o && (
        <>
          <div className="detail-grid small">
            <div>
              <b>Estado</b>
              <StatusBadge status={o.status} />
            </div>
            <div>
              <b>Creado</b>
              {fmtDate(o.created_at)}
            </div>
            {o.delivered_at && (
              <div>
                <b>Entregado</b>
                {fmtDate(o.delivered_at)}
              </div>
            )}
            <div>
              <b>Negocio</b>
              {d.business?.name}
              <span className="muted">{d.business?.phone}</span>
            </div>
            <div>
              <b>Cliente</b>
              {o.customer_name}
              <span className="muted">{o.phone}</span>
            </div>
            <div>
              <b>Domiciliario</b>
              {o.courier_name || '—'}
              <span className="muted">{o.courier_phone}</span>
            </div>
            <div>
              <b>Pago</b>
              {o.payment_method === 'efectivo' ? '💵 Efectivo' : `🏦 Transferencia · ${o.payment_status}`}
              {o.payment_proof_url && (
                <a href={o.payment_proof_url} target="_blank" rel="noreferrer">
                  Ver comprobante
                </a>
              )}
            </div>
            {o.reject_reason && (
              <div>
                <b>Motivo de rechazo</b>
                <span className="error">{o.reject_reason}</span>
              </div>
            )}
          </div>

          {o.status === 'entregado' && <DeliveryLocation loc={d.location} />}
          {['aceptado', 'preparando', 'enviado'].includes(o.status) && (d.courier_location || hasCoords(o)) && (
            <div className="tracker">
              <div className="row-between small">
                <b>🛵 Última posición del domiciliario</b>
                {d.courier_location && <span className="muted">{timeAgo(d.courier_location.updated_at)}</span>}
              </div>
              <MapView
                height={220}
                points={[
                  hasCoords(d.business) && { id: 'negocio', lat: d.business.lat, lng: d.business.lng, emoji: '🏪', label: d.business.name },
                  hasCoords(o) && { id: 'destino', lat: o.lat, lng: o.lng, emoji: '🏠', label: 'Entrega' },
                  hasCoords(d.courier_location) && { id: 'domi', lat: d.courier_location.lat, lng: d.courier_location.lng, emoji: '🛵', label: o.courier_name, pulse: true },
                ].filter(Boolean)}
              />
            </div>
          )}

          <OrderTicket order={o} businessName={d.business?.name} />
          <button className="btn ghost block" onClick={() => window.print()}>
            🖨 Imprimir ticket
          </button>
        </>
      )}
    </Modal>
  )
}

function ChangePass({ pass, onDone }) {
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const save = async (e) => {
    e.preventDefault()
    const { error } = await supabase.rpc('admin_change_password', { p_pass: pass, p_new: p })
    if (error) return setErr(error.message)
    onDone()
  }
  return (
    <form className="card pad form narrow" onSubmit={save}>
      <h3>Cambiar contraseña de administrador</h3>
      <Field label="Nueva contraseña">
        <input className="input" type="password" minLength={4} required value={p} onChange={(e) => setP(e.target.value)} />
      </Field>
      <ErrorText>{err}</ErrorText>
      <button className="btn">Guardar</button>
    </form>
  )
}
