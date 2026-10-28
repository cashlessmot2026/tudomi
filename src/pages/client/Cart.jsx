import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AddressPicker from '../../components/AddressPicker'
import { AuthForm } from '../../components/AuthForm'
import { Empty, ErrorText, Field, Img } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { acceptedMethods, isOnline, money, needsProof, payMethod, qtyLabel } from '../../lib/format'
import { payWithMercadoPago, usePaymentConfig } from '../../lib/payments'
import { supabase, uploadFile } from '../../lib/supabase'

export default function Cart() {
  const { items, groups } = useCart()
  const { session } = useAuth()
  const [biz, setBiz] = useState({})
  const cfg = usePaymentConfig()
  const ids = Object.keys(groups).sort().join(',')

  useEffect(() => {
    if (!ids) return
    supabase
      .from('businesses')
      .select('*')
      .in('id', ids.split(','))
      .then(({ data }) => setBiz(Object.fromEntries((data || []).map((b) => [b.id, b]))))
  }, [ids])

  if (!items.length)
    return (
      <div className="page">
        <Empty icon="🛒" text="Tu carrito está vacío">
          <Link to="/" className="btn">
            Explorar negocios
          </Link>
        </Empty>
      </div>
    )

  return (
    <div className="page narrow">
      <h2 className="title">Tu carrito</h2>
      {!session && <AuthForm title="Ingresa para pedir" subtitle="Usa tu cuenta de Google o regístrate" />}
      {Object.entries(groups).map(([bid, list]) => (
        <CheckoutGroup key={bid} bid={bid} business={biz[bid]} list={list} canOrder={!!session} cfg={cfg} />
      ))}
    </div>
  )
}

function CheckoutGroup({ bid, business, list, canOrder, cfg }) {
  const { setQty, remove, clearBusiness } = useCart()
  const { user, profile, updateProfile } = useAuth()
  const nav = useNavigate()
  const [method, setMethod] = useState('')
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [dest, setDest] = useState({ address: '', lat: null, lng: null })
  const [phone, setPhone] = useState('')
  const [tip, setTip] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (profile) {
      setDest((d) => (d.address || d.lat != null ? d : { address: profile.address || '', lat: profile.lat ?? null, lng: profile.lng ?? null }))
      setPhone((p) => p || profile.phone || '')
    }
  }, [profile])

  const methods = acceptedMethods(business, cfg.mp_enabled)
  useEffect(() => {
    if (business && !methods.some((m) => m.id === method)) setMethod(methods[0]?.id || '')
  }, [business, method, methods])

  const subtotal = list.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const baseFee = Number(business?.delivery_fee || 0)
  // El servidor recalcula todo; esto solo muestra el mismo cálculo
  const rain = cfg.rain_mode ? Math.round((baseFee * Number(cfg.rain_pct || 0)) / 100) : 0
  const fee = baseFee + rain
  const total = subtotal + fee + tip

  const order = async () => {
    setErr('')
    if (!dest.address?.trim() || !phone.trim()) return setErr('Escribe tu dirección y celular')
    if (!method) return setErr('Elige un método de pago')
    if (needsProof(method) && !file) return setErr('Adjunta el comprobante del pago')
    setBusy(true)
    try {
      let proof = null
      if (needsProof(method)) proof = await uploadFile('comprobantes', file, user.id)
      const { data, error } = await supabase
        .from('orders')
        .insert({
          business_id: bid,
          items: list.map((i) => ({ product_id: i.product_id, qty: i.qty, half_product_id: i.half_product_id || null, note: i.note || null })),
          payment_method: method,
          tip,
          payment_proof_url: proof,
          note: note.trim() || null,
          address: dest.address.trim(),
          lat: dest.lat ?? null,
          lng: dest.lng ?? null,
          phone: phone.trim(),
          customer_name: profile?.full_name || user.email,
        })
        .select('id')
        .single()
      if (error) throw error
      if (!profile?.address || !profile?.phone || profile?.lat == null)
        updateProfile({ address: dest.address.trim(), lat: dest.lat ?? null, lng: dest.lng ?? null, phone: phone.trim() }).catch(() => {})
      clearBusiness(bid)
      if (isOnline(method)) {
        // Si falla la redirección, el cliente puede reintentar el pago desde el detalle del pedido
        try {
          return await payWithMercadoPago(data.id)
        } catch {}
      }
      nav(`/pedidos/${data.id}`, { state: { nuevo: true } })
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="card pad checkout">
      <h3>🏪 {business?.name || list[0].business_name}</h3>
      {list.map((i) => (
        <div className="cart-item" key={i.key}>
          <Img src={i.image_url} alt="" className="thumb" />
          <div className="grow">
            <b>{i.half_name ? `½ ${i.name} + ½ ${i.half_name}` : i.name}</b>
            {i.note && <div className="muted small">📝 {i.note}</div>}
            <div className="muted small">
              {money(i.unit_price)} {i.sale_type === 'peso' ? `/ ${i.weight_unit}` : ''} · {qtyLabel(i.qty, i.sale_type, i.weight_unit)}
            </div>
          </div>
          <div className="mini-stepper">
            <button onClick={() => setQty(i.key, +(i.qty - (i.sale_type === 'peso' ? 0.5 : 1)).toFixed(2))}>−</button>
            <span>{i.qty}</span>
            <button onClick={() => setQty(i.key, +(i.qty + (i.sale_type === 'peso' ? 0.5 : 1)).toFixed(2))}>+</button>
          </div>
          <button className="icon-btn" onClick={() => remove(i.key)} aria-label="Quitar">
            🗑
          </button>
        </div>
      ))}

      <Field label="Observaciones del pedido">
        <textarea
          className="input"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ej: no colocar salsas, tocar el timbre, empacar aparte…"
        />
      </Field>

      <AddressPicker label="Dirección de entrega" value={dest} onChange={setDest} />
      <Field label="Celular">
        <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>

      {rain > 0 && (
        <p className="note-box small">🌧️ Está lloviendo: el domicilio tiene un recargo de {money(rain)} para el domiciliario.</p>
      )}

      <Field label="Propina voluntaria para el domiciliario">
        <div className="tip-row">
          {[0, 1000, 2000, 3000, 5000].map((v) => (
            <button key={v} type="button" className={`pay ${tip === v ? 'active' : ''}`} onClick={() => setTip(v)}>
              {v ? money(v) : 'Sin propina'}
            </button>
          ))}
          <input
            className="input"
            type="number"
            min={0}
            step={500}
            placeholder="Otro valor"
            value={[0, 1000, 2000, 3000, 5000].includes(tip) ? '' : tip}
            onChange={(e) => setTip(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          />
        </div>
        <small className="muted">El 100% de la propina es para quien te lleva el pedido.</small>
      </Field>

      {business && (
        <Field label="Método de pago">
          <div className="pay-methods">
            {methods.map((m) => (
              <button key={m.id} type="button" className={`pay ${method === m.id ? 'active' : ''}`} onClick={() => setMethod(m.id)}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>
          {method && <small className="muted">{payMethod(method).hint}</small>}
        </Field>
      )}

      {method === 'datafono' && <p className="note-box small">💳 El domiciliario llevará el datáfono. Paga {money(total)} con tu tarjeta al recibir.</p>}

      {method === 'mercadopago' && (
        <p className="note-box small">
          🟦 Al hacer el pedido te llevamos a Mercado Pago para pagar {money(total)} con tarjeta crédito, débito o PSE. El negocio
          recibe el pedido confirmado en cuanto se apruebe el pago.
        </p>
      )}

      {business && needsProof(method) && (
        <div className="transfer-box">
          {method === 'transferencia' && (
            <>
              <p className="small">
                <b>Datos para transferir:</b>
              </p>
              <pre className="small">{business.transfer_info || 'Consulta los datos con el negocio en el chat.'}</pre>
            </>
          )}
          {method === 'qr' && (
            <>
              <p className="small">
                <b>Escanea este QR con la app de tu banco y paga {money(total)}:</b>
              </p>
              <Img src={business.qr_image_url} alt="Código QR de pago" className="qr-img" fallback="📱" />
            </>
          )}
          {method === 'link' && (
            <>
              <p className="small">
                <b>Paga {money(total)} en el link del negocio y vuelve aquí con el comprobante:</b>
              </p>
              <a className="btn ghost block" href={business.payment_link_url} target="_blank" rel="noreferrer">
                🔗 Abrir link de pago
              </a>
            </>
          )}
          <Field label={`Comprobante del pago (${money(total)})`}>
            <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files[0] || null)} />
          </Field>
          <p className="muted small">El negocio validará el pago y luego se genera tu ticket.</p>
        </div>
      )}

      <div className="totals">
        <div>
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </div>
        <div>
          <span>Domicilio{rain > 0 && ' 🌧️'}</span>
          <span>{money(fee)}</span>
        </div>
        {tip > 0 && (
          <div>
            <span>Propina</span>
            <span>{money(tip)}</span>
          </div>
        )}
        <div className="grand">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
      </div>

      {business && !business.is_open && <p className="error">Este negocio está cerrado ahora.</p>}
      <ErrorText>{err}</ErrorText>
      <button className="btn block pulse" disabled={!canOrder || busy || !business?.is_open} onClick={order}>
        {busy
          ? 'Enviando pedido…'
          : !canOrder
            ? 'Ingresa para hacer el pedido'
            : method === 'mercadopago'
              ? `Pagar con Mercado Pago · ${money(total)}`
              : `Hacer pedido · ${money(total)}`}
      </button>
    </div>
  )
}
