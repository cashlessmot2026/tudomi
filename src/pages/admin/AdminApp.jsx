import { useCallback, useEffect, useState } from 'react'
import { DeliveryLocation } from '../../components/DeliveryLocation'
import MapView from '../../components/MapView'
import { hasCoords, normCity, timeAgo } from '../../lib/geo'
import { OrderTicket } from '../../components/OrderTicket'
import { Empty, ErrorText, Field, Img, Modal, Spinner, StatusBadge, Tabs } from '../../components/ui'
import { catLabel, fmtDate, isPrepaid, money, payLabel } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { AdminAds } from './AdminAds'
import { AdminAnalytics, PlatformSettings } from './AdminFinance'

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
            ['analitica', '📊 Analítica'],
            ['publicidad', '📣 Publicidad'],
            ['ajustes', '⚙️ Ajustes'],
          ]}
        />
        {tab === 'domis' && <Couriers pass={pass} onChange={refreshStats} />}
        {tab === 'negocios' && <Businesses pass={pass} />}
        {tab === 'pedidos' && <AllOrders pass={pass} />}
        {tab === 'analitica' && <AdminAnalytics pass={pass} />}
        {tab === 'publicidad' && <AdminAds pass={pass} />}
        {tab === 'ajustes' && (
          <div className="stack">
            <MercadoPagoSwitch pass={pass} />
            <PlatformSettings pass={pass} />
            <Plans pass={pass} />
            <Services pass={pass} />
            <ChangePass pass={pass} onDone={logout} />
          </div>
        )}
      </div>
    </div>
  )
}

const DOC_LABELS = { soat_url: 'SOAT', tecnomecanica_url: 'Tecnomecánica', license_url: 'Licencia', id_card_url: 'Cédula', other_platform_url: 'Otra plataforma' }

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
            {c.kind === 'propio' ? (
              <p className="small muted">
                <span className="pill">🏪 Propio de un negocio · {c.active ? 'activo' : 'inactivo'}</span>
                <br />
                {c.email} · 📞 {c.phone}
                <br />
                Inscrito por su negocio sin documentos; solo recibe los pedidos que ese negocio le asigna.
              </p>
            ) : (
              <p className="small muted">
                CC {c.document_number} · 📞 {c.phone}
                <br />
                🏍️ {c.vehicle_plate} {c.vehicle_model && `· ${c.vehicle_model}`}
                <br />
                Registrado: {fmtDate(c.created_at)}
              </p>
            )}
            {c.kind !== 'propio' && (
            <div className="docs">
              {Object.entries(DOC_LABELS).filter(([k]) => c[k]).map(([k, label]) => (
                <a key={k} href={c[k]} target="_blank" rel="noreferrer" className="doc">
                  {/\.pdf($|\?)/i.test(c[k]) ? <div className="img-fallback">📄</div> : <Img src={c[k]} alt={label} fallback="📄" />}
                  <span>{label}</span>
                </a>
              ))}
            </div>
            )}
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

const SERVICE_ICON = { externos: '🛵', publicidad_app: '📣', publicidad_push: '🔔' }

function Businesses({ pass }) {
  const [list, setList] = useState(null)
  const [city, setCity] = useState('')
  const [plans, setPlans] = useState([])
  const [services, setServices] = useState([])
  const [billing, setBilling] = useState({})
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const [b, pl, sv, bi] = await Promise.all([
      supabase.rpc('admin_list_businesses', { p_pass: pass }),
      supabase.rpc('admin_list_plans', { p_pass: pass }),
      supabase.rpc('admin_list_services', { p_pass: pass }),
      supabase.rpc('admin_business_billing', { p_pass: pass }),
    ])
    setList(b.data || [])
    setPlans(pl.data || [])
    setServices(sv.data || [])
    setBilling(Object.fromEntries((bi.data || []).map((x) => [x.business_id, x])))
  }, [pass])
  useEffect(() => {
    load()
  }, [load])
  const toggle = async (b) => {
    await supabase.rpc('admin_set_business_active', { p_pass: pass, p_id: b.id, p_active: !b.active })
    load()
  }
  const run = async (fn, args) => {
    setErr('')
    const { error } = await supabase.rpc(fn, { p_pass: pass, ...args })
    if (error) return setErr(error.message)
    load()
  }
  if (list === null) return <Spinner />
  if (!list.length) return <Empty icon="🏪" text="Aún no hay negocios registrados" />
  const cities = [...new Map(list.filter((b) => b.city).map((b) => [normCity(b.city), b.city])).values()].sort((a, b) => a.localeCompare(b, 'es'))
  const shown = list.filter((b) => (city === '__none' ? !b.city : !city || normCity(b.city) === normCity(city)))
  return (
    <>
      <div className="tab-row">
        <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Todas las ciudades ({list.length})</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c} ({list.filter((b) => normCity(b.city) === normCity(c)).length})
            </option>
          ))}
          <option value="__none">Sin ciudad ({list.filter((b) => !b.city).length})</option>
        </select>
      </div>
      <ErrorText>{err}</ErrorText>
      {!shown.length && <Empty icon="🏪" text="No hay negocios en esta ciudad" />}
      <div className="orders-grid">
        {shown.map((b) => {
          const info = billing[b.id] || {}
          const bl = info.billing
          const on = info.services || []
          const planOn = bl?.active
          return (
            <div key={b.id} className={`card pad ${b.active ? '' : 'off'}`}>
              <div className="row-between">
                <Img src={b.logo_url} alt="" className="biz-logo" fallback="🏪" />
                <div className="grow">
                  <b>{b.name}</b>
                  <div className="muted small">
                    {catLabel(b.category)} · {b.phone}
                  </div>
                  <div className="small">{b.city ? `🏙️ ${b.city}` : <span className="pill bad">Sin ciudad</span>}</div>
                </div>
              </div>
              <p className="small muted">{b.address}</p>

              <div className="ticket-sec small">
                <b>⭐ Plan</b>
                <div className="dispatch-row">
                  <select
                    className="input"
                    value={bl?.plan_id || ''}
                    onChange={(e) => run('admin_set_business_plan', { p_business: b.id, p_plan: e.target.value || null, p_active: true })}
                  >
                    <option value="">Sin plan</option>
                    {plans.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name} · {money(pl.price)}
                        {Number(pl.commission_pct) > 0 ? ` + ${Number(pl.commission_pct)}%` : ''}
                      </option>
                    ))}
                  </select>
                  {bl && (
                    <button className={`btn sm ${planOn ? 'danger' : 'ok'}`} onClick={() => run('admin_set_business_plan', { p_business: b.id, p_plan: bl.plan_id, p_active: !planOn })}>
                      {planOn ? 'Pausar' : 'Activar'}
                    </button>
                  )}
                </div>
                {planOn && Number(bl.commission_pct) > 0 && (
                  <div>
                    <span className="pill ok">💼 {Number(bl.commission_pct)}% de cada venta</span> <span className="pill">{money(bl.price)} / mes</span>
                  </div>
                )}
                {planOn && (
                  <div className="muted">
                    Ciclo {bl.cycle_start} → {bl.cycle_end} · ventas {money(bl.cycle.sales)} · comisión {money(bl.cycle.commission)}
                    <br />
                    Corte y cobro: <b>{bl.cycle_cut}</b>
                    {bl.due && (
                      <>
                        {' '}
                        · <b>Por cobrar (ciclo {bl.due.start} → {bl.due.end}): {money(bl.due.total)}</b>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="ticket-sec small">
                <b>🧩 Servicios</b>
                <div className="chips">
                  {services.map((sv) => {
                    const active = on.includes(sv.key)
                    return (
                      <button
                        key={sv.key}
                        className={`chip ${active ? 'active' : ''}`}
                        onClick={() => run('admin_set_business_service', { p_business: b.id, p_key: sv.key, p_active: !active })}
                      >
                        {SERVICE_ICON[sv.key] || '🧩'} {sv.name} {active ? '✔' : ''}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button className={`btn sm ${b.active ? 'danger' : 'ok'}`} onClick={() => toggle(b)}>
                {b.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          )
        })}
      </div>
    </>
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
              {payLabel(o.payment_method)}
              {isPrepaid(o.payment_method) && ` · ${o.payment_status}`}
              {o.mp_payment_id && <span className="muted">MP #{o.mp_payment_id} · {o.mp_status}</span>}
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

          <OrderTicket order={o} businessName={d.business?.name} code={d.codes?.delivery_code} />
          {d.codes && (
            <p className="muted small">
              🔐 Código de retiro (domi → negocio): <b>{d.codes.pickup_code}</b>
              {d.codes.picked_up_at && ` · retirado ${fmtDate(d.codes.picked_up_at)}`} · Código de entrega (cliente → domi): <b>{d.codes.delivery_code}</b>
            </p>
          )}
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

function MercadoPagoSwitch({ pass }) {
  const [on, setOn] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('payment_config').then(({ data }) => setOn(!!data?.mp_enabled))
  }, [])
  const toggle = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_set_mp_enabled', { p_pass: pass, p_enabled: !on })
    if (error) return setErr(error.message)
    setOn(!on)
  }
  return (
    <div className="card pad narrow">
      <div className="row-between">
        <div>
          <h3>🟦 Pagos con Mercado Pago</h3>
          <p className="muted small">Muestra a los clientes de todos los negocios el botón para pagar en línea con tarjeta crédito, débito o PSE.</p>
        </div>
        {on !== null && (
          <button className={`btn sm ${on ? 'ok' : 'danger'}`} onClick={toggle}>
            {on ? '● Activado' : '● Desactivado'}
          </button>
        )}
      </div>
      <ErrorText>{err}</ErrorText>
    </div>
  )
}

const EMPTY_PLAN = { name: '', price: '', period: 'mes', details: '', checkout_url: '', commission_pct: 0, active: true, sort: 0 }

function Plans({ pass }) {
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_plans', { p_pass: pass })
    if (error) setErr(error.message)
    setList(data || [])
  }, [pass])
  useEffect(() => {
    load()
  }, [load])

  const save = async (e) => {
    e.preventDefault()
    setErr('')
    const { error } = await supabase.rpc('admin_save_plan', { p_pass: pass, p_plan: { ...edit, price: Number(edit.price || 0), commission_pct: Number(edit.commission_pct || 0) } })
    if (error) return setErr(error.message)
    setEdit(null)
    load()
  }
  const del = async (p) => {
    if (!window.confirm(`¿Eliminar el plan "${p.name}"?`)) return
    const { error } = await supabase.rpc('admin_delete_plan', { p_pass: pass, p_id: p.id })
    if (error) return setErr(error.message)
    load()
  }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <div className="card pad narrow">
      <div className="row-between">
        <h3>⭐ Planes de suscripción para negocios</h3>
        <button className="btn sm" onClick={() => setEdit({ ...EMPTY_PLAN, sort: (list?.length || 0) + 1 })}>
          + Nuevo plan
        </button>
      </div>
      <p className="muted small">
        Crea el plan en Mercado Pago (Suscripciones) y pega aquí su link. Los negocios lo ven en la pestaña ⭐ Planes.
      </p>
      <ErrorText>{err}</ErrorText>
      {list === null && <Spinner />}
      {list?.map((p) => (
        <div key={p.id} className={`row-between plan-row ${p.active ? '' : 'off'}`}>
          <div className="grow">
            <b>{p.name}</b> · {money(p.price)} / {p.period} {Number(p.commission_pct) > 0 && <span className="pill ok">+{Number(p.commission_pct)}% por venta</span>} {!p.active && <span className="pill">oculto</span>}
            {p.details && <div className="muted small">{p.details}</div>}
          </div>
          <button className="btn ghost sm" onClick={() => setEdit(p)}>
            ✏️
          </button>
          <button className="btn danger sm" onClick={() => del(p)}>
            🗑
          </button>
        </div>
      ))}
      {edit && (
        <Modal title={edit.id ? 'Editar plan' : 'Nuevo plan'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={save}>
            <Field label="Nombre">
              <input className="input" required value={edit.name} onChange={set('name')} />
            </Field>
            <Field label="Valor (COP)">
              <input className="input" type="number" min={0} step={1000} required value={edit.price} onChange={set('price')} />
            </Field>
            <Field label="Periodo">
              <input className="input" value={edit.period} onChange={set('period')} placeholder="mes" />
            </Field>
            <Field label="Detalles">
              <textarea className="input" rows={4} value={edit.details || ''} onChange={set('details')} placeholder="Qué incluye el plan" />
            </Field>
            <Field label="Comisión por venta (%)" hint="0 = sin comisión. Se cobra sobre el subtotal de cada pedido entregado, mes vencido con corte cada 30 días.">
              <input className="input" type="number" min={0} max={100} step={0.5} value={edit.commission_pct ?? 0} onChange={set('commission_pct')} />
            </Field>
            <Field label="Link de suscripción de Mercado Pago (opcional)">
              <input className="input" type="url" value={edit.checkout_url || ''} onChange={set('checkout_url')} placeholder="https://www.mercadopago.com.co/subscriptions/checkout?preapproval_plan_id=…" />
            </Field>
            <Field label="Orden">
              <input className="input" type="number" value={edit.sort} onChange={set('sort')} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={!!edit.active} onChange={set('active')} /> Visible para los negocios
            </label>
            <ErrorText>{err}</ErrorText>
            <button className="btn block">Guardar plan</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Services({ pass }) {
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_services', { p_pass: pass })
    if (error) setErr(error.message)
    setList(data || [])
  }, [pass])
  useEffect(() => {
    load()
  }, [load])

  const save = async (e) => {
    e.preventDefault()
    setErr('')
    const { error } = await supabase.rpc('admin_save_service', { p_pass: pass, p: { ...edit, price: Number(edit.price || 0) } })
    if (error) return setErr(error.message)
    setEdit(null)
    load()
  }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <div className="card pad narrow">
      <h3>🧩 Servicios para negocios</h3>
      <p className="muted small">
        Fija el precio y el link de pago de cada servicio. El negocio lo ve en su pestaña ⭐ Planes con un botón para pagar; tú lo activas en la tarjeta del
        negocio. Sin el servicio "Domiciliarios externos" activo, el negocio no puede publicar pedidos para externos.
      </p>
      <ErrorText>{err}</ErrorText>
      {list === null && <Spinner />}
      {list?.map((sv) => (
        <div key={sv.key} className={`row-between plan-row ${sv.active ? '' : 'off'}`}>
          <div className="grow">
            <b>
              {SERVICE_ICON[sv.key]} {sv.name}
            </b>{' '}
            · {money(sv.price)} / {sv.period} {!sv.active && <span className="pill">oculto</span>}
            {!sv.checkout_url && <span className="pill bad">sin link de pago</span>}
            {sv.details && <div className="muted small">{sv.details}</div>}
          </div>
          <button className="btn ghost sm" onClick={() => setEdit(sv)}>
            ✏️
          </button>
        </div>
      ))}
      {edit && (
        <Modal title={`Editar: ${edit.name}`} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={save}>
            <Field label="Valor (COP / mes)">
              <input className="input" type="number" min={0} step={1000} required value={edit.price} onChange={set('price')} />
            </Field>
            <Field label="Detalles">
              <textarea className="input" rows={3} value={edit.details || ''} onChange={set('details')} />
            </Field>
            <Field label="Link de pago (Mercado Pago, Wompi, etc.)">
              <input className="input" type="url" value={edit.checkout_url || ''} onChange={set('checkout_url')} placeholder="https://…" />
            </Field>
            <label className="check">
              <input type="checkbox" checked={!!edit.active} onChange={set('active')} /> Visible para los negocios
            </label>
            <ErrorText>{err}</ErrorText>
            <button className="btn block">Guardar</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
