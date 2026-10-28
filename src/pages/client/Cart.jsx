import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthForm } from '../../components/AuthForm'
import { Empty, ErrorText, Field, Img } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { money, qtyLabel } from '../../lib/format'
import { supabase, uploadFile } from '../../lib/supabase'

export default function Cart() {
  const { items, groups } = useCart()
  const { session } = useAuth()
  const [biz, setBiz] = useState({})
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
        <CheckoutGroup key={bid} bid={bid} business={biz[bid]} list={list} canOrder={!!session} />
      ))}
    </div>
  )
}

function CheckoutGroup({ bid, business, list, canOrder }) {
  const { setQty, remove, clearBusiness } = useCart()
  const { user, profile, updateProfile } = useAuth()
  const nav = useNavigate()
  const [method, setMethod] = useState('')
  const [file, setFile] = useState(null)
  const [note, setNote] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (profile) {
      setAddress((a) => a || profile.address || '')
      setPhone((p) => p || profile.phone || '')
    }
  }, [profile])

  useEffect(() => {
    if (business && !method) setMethod(business.accepts_cash ? 'efectivo' : 'transferencia')
  }, [business, method])

  const subtotal = list.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const fee = Number(business?.delivery_fee || 0)

  const order = async () => {
    setErr('')
    if (!address.trim() || !phone.trim()) return setErr('Escribe tu dirección y celular')
    if (method === 'transferencia' && !file) return setErr('Adjunta la foto del comprobante de la transferencia')
    setBusy(true)
    try {
      let proof = null
      if (method === 'transferencia') proof = await uploadFile('comprobantes', file, user.id)
      const { data, error } = await supabase
        .from('orders')
        .insert({
          business_id: bid,
          items: list.map((i) => ({ product_id: i.product_id, qty: i.qty, half_product_id: i.half_product_id || null, note: i.note || null })),
          payment_method: method,
          payment_proof_url: proof,
          note: note.trim() || null,
          address: address.trim(),
          phone: phone.trim(),
          customer_name: profile?.full_name || user.email,
        })
        .select('id')
        .single()
      if (error) throw error
      if (!profile?.address || !profile?.phone) updateProfile({ address: address.trim(), phone: phone.trim() }).catch(() => {})
      clearBusiness(bid)
      nav(`/pedidos/${data.id}`)
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

      <div className="row2">
        <Field label="Dirección de entrega">
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, barrio" />
        </Field>
        <Field label="Celular">
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>

      {business && (
        <div className="pay-methods">
          {business.accepts_cash && (
            <button className={`pay ${method === 'efectivo' ? 'active' : ''}`} onClick={() => setMethod('efectivo')}>
              💵 Efectivo
            </button>
          )}
          {business.accepts_transfer && (
            <button className={`pay ${method === 'transferencia' ? 'active' : ''}`} onClick={() => setMethod('transferencia')}>
              🏦 Transferencia
            </button>
          )}
        </div>
      )}

      {method === 'transferencia' && business && (
        <div className="transfer-box">
          <p className="small">
            <b>Datos para transferir:</b>
          </p>
          <pre className="small">{business.transfer_info || 'Consulta los datos con el negocio en el chat.'}</pre>
          <Field label={`Comprobante (transfiere ${money(subtotal + fee)})`}>
            <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} />
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
          <span>Domicilio</span>
          <span>{money(fee)}</span>
        </div>
        <div className="grand">
          <span>Total</span>
          <span>{money(subtotal + fee)}</span>
        </div>
      </div>

      {business && !business.is_open && <p className="error">Este negocio está cerrado ahora.</p>}
      <ErrorText>{err}</ErrorText>
      <button className="btn block pulse" disabled={!canOrder || busy || !business?.is_open} onClick={order}>
        {busy ? 'Enviando pedido…' : canOrder ? `Hacer pedido · ${money(subtotal + fee)}` : 'Ingresa para hacer el pedido'}
      </button>
    </div>
  )
}
