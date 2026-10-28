import { useCallback, useEffect, useState } from 'react'
import { Chat } from '../../components/Chat'
import { CourierTracker } from '../../components/CourierTracker'
import { DeliveryLocation } from '../../components/DeliveryLocation'
import { ItemLine } from '../../components/OrderTicket'
import { Empty, ErrorText, Spinner, StatusBadge, Tabs } from '../../components/ui'
import { fmtDate, money, needsProof, payLabel, waUrl } from '../../lib/format'
import { mapsLink } from '../../lib/geo'
import { beep, notifyLocal } from '../../lib/pwa'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/useRealtime'

const ACTIVE = ['pendiente', 'aceptado', 'preparando', 'enviado']

export default function BusinessOrders({ business }) {
  const [list, setList] = useState(null)
  const [filter, setFilter] = useState('activos')
  const [own, setOwn] = useState([])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, delivery_locations(*)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })
      .limit(150)
    setList(data || [])
    const { data: c } = await supabase
      .from('couriers')
      .select('id, full_name, phone')
      .eq('business_id', business.id)
      .eq('kind', 'propio')
      .eq('active', true)
      .order('full_name')
    setOwn(c || [])
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtime('orders', `business_id=eq.${business.id}`, (p) => {
    if (p.eventType === 'INSERT') {
      beep()
      notifyLocal('¡Nuevo pedido! 🛎️', `Pedido #${p.new.number} por ${money(p.new.total)}`, '/negocio')
    }
    load()
  })

  if (list === null) return <Spinner />
  const shown = list.filter((o) => (filter === 'activos' ? ACTIVE.includes(o.status) : !ACTIVE.includes(o.status)))

  return (
    <div>
      <Tabs
        value={filter}
        onChange={setFilter}
        items={[
          ['activos', `Activos (${list.filter((o) => ACTIVE.includes(o.status)).length})`],
          ['historial', 'Historial'],
        ]}
      />
      {shown.length === 0 && <Empty icon="📦" text={filter === 'activos' ? 'No hay pedidos activos. ¡Te avisamos cuando llegue uno!' : 'Sin pedidos aún'} />}
      <div className="orders-grid">
        {shown.map((o) => (
          <OrderCard key={o.id} o={o} business={business} own={own} onChange={load} />
        ))}
      </div>
    </div>
  )
}

function OrderCard({ o, business, own, onChange }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [chat, setChat] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [pick, setPick] = useState('')

  const act = async (fields) => {
    setBusy(true)
    setErr('')
    const { error } = await supabase.from('orders').update(fields).eq('id', o.id)
    setBusy(false)
    if (error) setErr(error.message)
    else {
      setRejecting(false)
      onChange()
    }
  }

  const transferPending = needsProof(o.payment_method) && o.payment_status === 'pendiente'
  // Sin domiciliarios propios, al aceptar el pedido se publica de una para los externos
  const acceptFields = own.length ? {} : { dispatch: 'externo' }
  const needsCourier = ['aceptado', 'preparando'].includes(o.status) && !o.courier_id

  const assign = async () => {
    if (!pick) return setErr('Elige un domiciliario')
    setBusy(true)
    setErr('')
    const { error } = await supabase.rpc('assign_own_courier', { p_order: o.id, p_courier: pick })
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

      <div className="ticket-sec">
        <b>{o.customer_name}</b>
        <div className="small">
          <a href={mapsLink(o.address, o.lat, o.lng)} target="_blank" rel="noreferrer">
            📍 {o.address}
          </a>
        </div>
        {o.phone && (
          <div className="small">
            <a href={`tel:${o.phone}`}>📞 {o.phone}</a> ·{' '}
            <a href={waUrl(o.phone)} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </div>
        )}
      </div>

      <div className="ticket-sec">
        {o.items.map((it, i) => (
          <ItemLine key={i} it={it} />
        ))}
      </div>
      {o.note && <div className="note-box">📝 {o.note}</div>}

      <div className="totals">
        <div>
          <span>Domicilio</span>
          <span>{money(o.delivery_fee)}</span>
        </div>
        <div className="grand">
          <span>Total</span>
          <span>{money(o.total)}</span>
        </div>
      </div>

      <div className="small">
        {!needsProof(o.payment_method) ? (
          <>{payLabel(o.payment_method)} · se cobra al entregar</>
        ) : (
          <>
            {payLabel(o.payment_method)} · pago <b>{o.payment_status}</b>{' '}
            {o.payment_proof_url && (
              <a href={o.payment_proof_url} target="_blank" rel="noreferrer">
                · Ver comprobante
              </a>
            )}
          </>
        )}
      </div>
      {o.payment_proof_url && transferPending && (
        <a href={o.payment_proof_url} target="_blank" rel="noreferrer">
          <img src={o.payment_proof_url} alt="Comprobante" className="proof" />
        </a>
      )}

      <div className="code-row">
        <span>Código de entrega</span>
        <b className="code-sm">{o.delivery_code}</b>
      </div>
      {o.courier_name && (
        <div className="small">
          🛵 {o.courier_name} <span className="pill">{o.dispatch === 'propio' ? 'Propio' : 'Externo'}</span>{' '}
          {o.courier_phone && <a href={`tel:${o.courier_phone}`}>· {o.courier_phone}</a>}
        </div>
      )}
      {o.reject_reason && <div className="small error">Motivo: {o.reject_reason}</div>}
      <CourierTracker order={o} business={business} />
      {o.status === 'entregado' && <DeliveryLocation loc={[].concat(o.delivery_locations ?? [])[0]} />}

      {needsCourier && (
        <div className="dispatch-box">
          <b className="small">🛵 ¿Quién lleva este pedido?</b>
          {own.length > 0 && (
            <div className="dispatch-row">
              <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Mi domiciliario de confianza…</option>
                {own.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
              <button className="btn ok sm" disabled={busy || !pick} onClick={assign}>
                Asignar
              </button>
            </div>
          )}
          {o.dispatch === 'externo' ? (
            <p className="muted small">⏳ Publicado para domiciliarios externos. Esperando que uno lo tome…</p>
          ) : (
            <button className="btn ghost sm" disabled={busy} onClick={() => act({ dispatch: 'externo' })}>
              🌐 Enviar a domiciliarios externos
            </button>
          )}
        </div>
      )}

      <ErrorText>{err}</ErrorText>

      <div className="actions">
        {o.status === 'pendiente' && transferPending && (
          <button className="btn ok sm" disabled={busy} onClick={() => act({ payment_status: 'validado', status: 'aceptado', ...acceptFields })}>
            ✔ Validar pago y aceptar
          </button>
        )}
        {o.status === 'pendiente' && !needsProof(o.payment_method) && (
          <button className="btn ok sm" disabled={busy} onClick={() => act({ status: 'aceptado', ...acceptFields })}>
            ✔ Aceptar
          </button>
        )}
        {o.status === 'aceptado' && (
          <button className="btn sm" disabled={busy} onClick={() => act({ status: 'preparando' })}>
            👨‍🍳 Preparando
          </button>
        )}
        {['aceptado', 'preparando'].includes(o.status) && (
          <button className="btn sm" disabled={busy} onClick={() => act({ status: 'enviado' })}>
            🛵 Enviado
          </button>
        )}
        {o.status === 'pendiente' && !rejecting && (
          <button className="btn danger sm" disabled={busy} onClick={() => setRejecting(true)}>
            ✖ Rechazar
          </button>
        )}
        <button className="btn ghost sm" onClick={() => setChat((c) => !c)}>
          💬 Chat
        </button>
      </div>

      {rejecting && (
        <div className="reject-box">
          <input className="input" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="actions">
            <button
              className="btn danger sm"
              disabled={busy}
              onClick={() =>
                act({ status: 'rechazado', reject_reason: reason || null, ...(transferPending ? { payment_status: 'rechazado' } : {}) })
              }
            >
              Confirmar rechazo
            </button>
            <button className="btn ghost sm" onClick={() => setRejecting(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {chat && <Chat orderId={o.id} me="negocio" />}
    </div>
  )
}
