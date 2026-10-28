import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Empty, Field, Img, Modal, Spinner } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useCart } from '../../lib/cart'
import { acceptedMethods, catLabel, money, priceLabel } from '../../lib/format'
import { supabase } from '../../lib/supabase'

export default function BusinessPage() {
  const { id } = useParams()
  const [b, setB] = useState(null)
  const [products, setProducts] = useState([])
  const [sel, setSel] = useState(null)
  const [q, setQ] = useState('')
  const { groups } = useCart()
  const { session } = useAuth()

  useEffect(() => {
    supabase.from('businesses').select('*').eq('id', id).maybeSingle().then(({ data }) => setB(data || false))
    supabase
      .from('products')
      .select('*')
      .eq('business_id', id)
      .eq('available', true)
      .order('section')
      .order('name')
      .then(({ data }) => setProducts(data || []))
  }, [id])

  const sections = useMemo(() => {
    const out = {}
    products
      .filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))
      .forEach((p) => (out[p.section || 'Productos'] ||= []).push(p))
    return out
  }, [products, q])

  if (b === null) return <Spinner />
  if (!b) return <Empty icon="🤷" text="Negocio no encontrado" />

  const pizzas = products.filter((p) => p.is_pizza)
  const inCart = groups[id]?.length || 0

  return (
    <div className="page">
      <div className="store-head card">
        <div className="store-cover">
          <Img src={b.cover_url || b.logo_url} alt={b.name} fallback="🏪" />
        </div>
        <div className="store-info">
          <Img src={b.logo_url} alt="" className="biz-logo lg" fallback="🏪" />
          <div>
            <h2>{b.name}</h2>
            <p className="muted small">
              {catLabel(b.category)} · {b.address}
            </p>
            {b.description && <p className="small">{b.description}</p>}
            <p className="small">
              <span className={`pill ${b.is_open ? 'ok' : 'bad'}`}>{b.is_open ? '● Abierto' : '● Cerrado'}</span>
              <span className="pill">🛵 {Number(b.delivery_fee) ? money(b.delivery_fee) : 'Gratis'}</span>
              {acceptedMethods(b).map((m) => (
                <span key={m.id} className="pill">
                  {m.icon} {m.label}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>

      {!session && (
        <div className="card pad alert">
          <b>👋 ¡Bienvenido!</b> Elige tus productos y, para confirmar el pedido, <Link to="/perfil">crea tu cuenta o ingresa</Link>. Es rápido y gratis.
        </div>
      )}

      <input className="input search" placeholder="🔎 Buscar productos…" value={q} onChange={(e) => setQ(e.target.value)} />

      {products.length === 0 && <Empty icon="📦" text="Este negocio aún no tiene productos" />}

      {Object.entries(sections).map(([name, list]) => (
        <section key={name}>
          <h3 className="section-title">{name}</h3>
          <div className="product-list">
            {list.map((p) => (
              <button key={p.id} className="product card" onClick={() => setSel(p)}>
                <div className="product-txt">
                  <h4>
                    {p.name} {p.is_pizza && <span className="pill">🍕 Mitad y mitad</span>}
                  </h4>
                  {p.description && <p className="muted small clamp">{p.description}</p>}
                  <b className="price">{priceLabel(p)}</b>
                  {p.sale_type === 'peso' && <span className="pill">⚖️ Por peso</span>}
                </div>
                <Img src={p.image_url} alt={p.name} className="product-img" />
              </button>
            ))}
          </div>
        </section>
      ))}

      {inCart > 0 && (
        <Link to="/carrito" className="btn floating-cart pulse">
          🛒 Ver carrito ({inCart})
        </Link>
      )}

      {sel && <ProductModal product={sel} business={b} pizzas={pizzas} onClose={() => setSel(null)} />}
    </div>
  )
}

function ProductModal({ product: p, business, pizzas, onClose }) {
  const { add } = useCart()
  const peso = p.sale_type === 'peso'
  const step = peso ? 0.5 : 1
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [half, setHalf] = useState(false)
  const [halfId, setHalfId] = useState('')
  const [done, setDone] = useState(false)

  const others = pizzas.filter((x) => x.id !== p.id)
  const h = others.find((x) => x.id === halfId)
  // Pizza mitad y mitad: se cobra la más costosa
  const unit = half && h ? Math.max(Number(p.price), Number(h.price)) : Number(p.price)
  const canAdd = business.is_open && (!half || h) && qty > 0

  const submit = () => {
    add({
      business_id: business.id,
      business_name: business.name,
      product_id: p.id,
      name: p.name,
      image_url: p.image_url,
      unit_price: unit,
      qty,
      sale_type: p.sale_type,
      weight_unit: p.weight_unit,
      half_product_id: half && h ? h.id : null,
      half_name: half && h ? h.name : null,
      note: note.trim(),
    })
    setDone(true)
    setTimeout(onClose, 600)
  }

  return (
    <Modal title={p.name} onClose={onClose}>
      <Img src={p.image_url} alt={p.name} className="modal-img" />
      {p.description && <p className="muted">{p.description}</p>}
      <p className="price big">{priceLabel(p)}</p>

      {p.is_pizza && others.length > 0 && (
        <div className="half-box">
          <label className="check">
            <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} />
            <span>🍕 Quiero mitad y mitad</span>
          </label>
          {half && (
            <>
              <select className="input" value={halfId} onChange={(e) => setHalfId(e.target.value)}>
                <option value="">Elige la otra mitad…</option>
                {others.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} — {money(x.price)}
                  </option>
                ))}
              </select>
              <p className="muted small">El precio de la pizza es el de la mitad más costosa.</p>
            </>
          )}
        </div>
      )}

      <Field label={peso ? `Cantidad (${p.weight_unit})` : 'Cantidad'}>
        <div className="stepper">
          <button className="btn ghost sm" onClick={() => setQty((q) => Math.max(step, +(q - step).toFixed(2)))}>
            −
          </button>
          <input
            className="input"
            type="number"
            min={step}
            step={step}
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value)))}
          />
          <button className="btn ghost sm" onClick={() => setQty((q) => +(q + step).toFixed(2))}>
            +
          </button>
        </div>
        {peso && (
          <div className="quick">
            {[0.5, 1, 2, 3, 5].map((v) => (
              <button key={v} className={`chip ${qty === v ? 'active' : ''}`} onClick={() => setQty(v)}>
                {v} {p.weight_unit}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="Nota para este producto (opcional)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: sin cebolla, bien maduros…" />
      </Field>

      {!business.is_open && <p className="error">El negocio está cerrado en este momento.</p>}
      <button className="btn block" disabled={!canAdd || done} onClick={submit}>
        {done ? '✔ Agregado' : `Agregar · ${money(unit * qty)}`}
      </button>
    </Modal>
  )
}
