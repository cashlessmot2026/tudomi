import { fmtDate, isPrepaid, money, payLabel, qtyLabel } from '../lib/format'
import { StatusBadge } from './ui'

export const ItemLine = ({ it }) => (
  <div className="item-line">
    <div>
      <b>{qtyLabel(it.qty, it.sale_type, it.weight_unit)}</b> {it.half_name ? `½ ${it.name} + ½ ${it.half_name}` : it.name}
      {it.note && <div className="muted small">📝 {it.note}</div>}
    </div>
    <span>{money(it.line_total ?? it.unit_price * it.qty)}</span>
  </div>
)

export function OrderTicket({ order: o, businessName, code, showCode = true }) {
  return (
    <div className="ticket">
      <div className="ticket-head">
        <div className="logo">
          Tu<span>Domi</span>
        </div>
        <div className="muted small">Ticket de pedido</div>
        <h3>#{o.number}</h3>
        <div className="muted small">{fmtDate(o.created_at)}</div>
        <StatusBadge status={o.status} />
      </div>
      <div className="ticket-sec">
        <b>{businessName}</b>
        <div className="muted small">Cliente: {o.customer_name}</div>
        <div className="muted small">📍 {o.address}</div>
        {o.phone && <div className="muted small">📞 {o.phone}</div>}
      </div>
      <div className="ticket-sec">
        {o.items.map((it, i) => (
          <ItemLine key={i} it={it} />
        ))}
      </div>
      {o.note && (
        <div className="ticket-sec">
          <b>Observaciones:</b> <span>{o.note}</span>
        </div>
      )}
      <div className="ticket-sec totals">
        <div>
          <span>Subtotal</span>
          <span>{money(o.subtotal)}</span>
        </div>
        <div>
          <span>Domicilio{Number(o.rain_surcharge) > 0 && ' 🌧️'}</span>
          <span>{money(o.delivery_fee)}</span>
        </div>
        {Number(o.tip) > 0 && (
          <div>
            <span>Propina para el domiciliario</span>
            <span>{money(o.tip)}</span>
          </div>
        )}
        <div className="grand">
          <span>Total</span>
          <span>{money(o.total)}</span>
        </div>
        <div className="muted small">
          Pago: {payLabel(o.payment_method)}
          {isPrepaid(o.payment_method) ? ' (validado)' : ' · contra entrega'}
        </div>
      </div>
      {showCode && code && (
        <div className="ticket-code">
          <small>Código de entrega</small>
          <div className="code-big">{code}</div>
          <small className="muted">Dáselo al domiciliario solo cuando recibas tu pedido</small>
        </div>
      )}
    </div>
  )
}
