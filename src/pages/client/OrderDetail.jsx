import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Chat } from '../../components/Chat'
import { CourierTracker } from '../../components/CourierTracker'
import { ItemLine, OrderTicket } from '../../components/OrderTicket'
import { Empty, ErrorText, Spinner, StatusBadge } from '../../components/ui'
import { FLOW, STATUS, isOnline, money, ticketReady } from '../../lib/format'
import { payWithMercadoPago } from '../../lib/payments'
import { notifyLocal } from '../../lib/pwa'
import { supabase } from '../../lib/supabase'
import { useOrderCodes } from '../../lib/useOrderCodes'
import { useRealtime } from '../../lib/useRealtime'

export default function OrderDetail() {
  const { id } = useParams()
  const [o, setO] = useState(null)
  const [chat, setChat] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payErr, setPayErr] = useState('')
  const codes = useOrderCodes(id)

  const load = useCallback(async () => {
    const { data } = await supabase.from('orders').select('*, businesses(name, phone, address, lat, lng)').eq('id', id).maybeSingle()
    setO(data || false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useRealtime('orders', `id=eq.${id}`, (p) => {
    if (p.new?.status && p.old?.status !== p.new.status) notifyLocal('Tu pedido', `Estado: ${STATUS[p.new.status]?.label}`, `/pedidos/${id}`)
    load()
  })

  if (o === null) return <Spinner />
  if (!o) return <Empty text="Pedido no encontrado" />

  const step = FLOW.indexOf(o.status)
  const ready = ticketReady(o)
  const mpPending = isOnline(o.payment_method) && o.payment_status === 'pendiente' && o.status === 'pendiente'

  const pay = async () => {
    setPayErr('')
    setPaying(true)
    try {
      await payWithMercadoPago(o.id)
    } catch (e) {
      setPayErr(e.message)
      setPaying(false)
    }
  }

  return (
    <div className="page narrow">
      <Link to="/pedidos" className="muted small">
        ← Mis pedidos
      </Link>

      {o.status !== 'rechazado' ? (
        <div className="timeline card pad">
          {FLOW.map((s, i) => (
            <div key={s} className={`tl-step ${i <= step ? 'done' : ''} ${i === step ? 'now' : ''}`}>
              <i>{STATUS[s].icon}</i>
              <span>{STATUS[s].label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card pad alert bad">
          <b>Pedido rechazado</b>
          {o.reject_reason && <p>{o.reject_reason}</p>}
        </div>
      )}

      {o.courier_name && o.status !== 'entregado' && (
        <div className="card pad">
          🛵 <b>{o.courier_name}</b> lleva tu pedido {o.courier_phone && <a href={`tel:${o.courier_phone}`}>· 📞 {o.courier_phone}</a>}
          <CourierTracker order={o} business={o.businesses} />
        </div>
      )}

      {ready ? (
        <>
          <OrderTicket order={o} businessName={o.businesses?.name} code={codes?.delivery_code} showCode={o.status !== 'entregado'} />
          <button className="btn ghost block no-print" onClick={() => window.print()}>
            🖨 Guardar / imprimir ticket
          </button>
        </>
      ) : (
        o.status !== 'rechazado' && (
          <div className="card pad waiting">
            <div className="spinner" />
            <h3>{mpPending ? 'Pago pendiente' : 'Validando tu pago…'}</h3>
            <p className="muted">
              {isOnline(o.payment_method)
                ? o.payment_status === 'rechazado'
                  ? 'El pago fue reversado en Mercado Pago. Escríbele al negocio en el chat.'
                  : o.mp_status && o.mp_status !== 'approved'
                    ? `Mercado Pago reporta el pago como "${o.mp_status}". Si fue rechazado, intenta de nuevo.`
                    : 'Completa el pago en Mercado Pago. Apenas se apruebe verás aquí tu ticket y el código de entrega.'
                : o.payment_status === 'rechazado'
                  ? 'El negocio rechazó el comprobante. Escríbele en el chat.'
                  : 'El negocio está revisando tu comprobante. Cuando lo apruebe verás aquí tu ticket y el código de entrega.'}
            </p>
            {mpPending && (
              <>
                <button className="btn block" disabled={paying} onClick={pay}>
                  {paying ? 'Abriendo Mercado Pago…' : `🟦 Pagar con Mercado Pago · ${money(o.total)}`}
                </button>
                <ErrorText>{payErr}</ErrorText>
              </>
            )}
            <StatusBadge status={o.status} />
            <div className="ticket-sec">
              {o.items.map((it, i) => (
                <ItemLine key={i} it={it} />
              ))}
              <div className="item-line grand">
                <b>Total</b>
                <b>{money(o.total)}</b>
              </div>
            </div>
          </div>
        )
      )}

      <div className="card pad no-print">
        <button className="btn ghost block" onClick={() => setChat((c) => !c)}>
          💬 {chat ? 'Ocultar chat' : `Chat con ${o.businesses?.name || 'el negocio'}`}
        </button>
        {chat && <Chat orderId={o.id} me="cliente" />}
      </div>
    </div>
  )
}
