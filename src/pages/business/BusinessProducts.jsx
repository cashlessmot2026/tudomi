import { useCallback, useEffect, useState } from 'react'
import { Empty, ErrorText, Field, Img, Modal, Spinner } from '../../components/ui'
import { imageUrl, priceLabel } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import ImportProducts from './ImportProducts'

const SECTION_HINTS = {
  restaurante: ['Pizzas', 'Hamburguesas', 'Bebidas', 'Postres', 'Combos'],
  minimarket: ['Verduras', 'Frutas', 'Tubérculos', 'Carnes', 'Lácteos', 'Despensa', 'Aseo', 'Bebidas'],
  tecnologia: ['Celulares', 'Accesorios', 'Audio', 'Computadores', 'Cargadores'],
}

export default function BusinessProducts({ business }) {
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').eq('business_id', business.id).order('section').order('name')
    setList(data || [])
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  const toggle = async (p) => {
    await supabase.from('products').update({ available: !p.available }).eq('id', p.id)
    load()
  }
  const del = async (p) => {
    if (confirmDel !== p.id) return setConfirmDel(p.id)
    await supabase.from('products').delete().eq('id', p.id)
    setConfirmDel(null)
    load()
  }

  if (list === null) return <Spinner />

  return (
    <div>
      <div className="actions mb">
        <button className="btn pulse" onClick={() => setEdit({})}>
          ＋ Nuevo producto
        </button>
        <button className="btn ghost" onClick={() => setImporting(true)}>
          📊 Subir desde Excel
        </button>
      </div>
      <div className="note-box small">
        💡 <b>¿Muchos productos?</b> Usa <b>“Subir desde Excel”</b>: descarga la plantilla, llénala (columnas <code>nombre</code>,{' '}
        <code>precio</code>, <code>descripcion</code>, <code>imagen_url</code>, <code>seccion</code>, <code>tipo_venta</code>, <code>unidad_peso</code>,{' '}
        <code>perecedero</code>, <code>pizza</code>, <code>disponible</code>) y súbela. Solo <code>nombre</code> y <code>precio</code> son obligatorias.
      </div>
      {list.length === 0 && <Empty icon="🛍️" text="Agrega tu primer producto" />}
      <div className="grid">
        {list.map((p) => (
          <div key={p.id} className={`card admin-product ${p.available ? '' : 'off'}`}>
            <Img src={p.image_url} alt={p.name} className="admin-product-img" />
            <div className="pad">
              <b>{p.name}</b>
              <div className="muted small">{p.section || 'Sin sección'}</div>
              <div className="price">{priceLabel(p)}</div>
              <div className="small">
                {p.perishable && <span className="pill">🥬 Perecedero</span>}
                {p.sale_type === 'peso' && <span className="pill">⚖️ Por {p.weight_unit}</span>}
                {p.is_pizza && <span className="pill">🍕 Mitad y mitad</span>}
              </div>
              <div className="actions">
                <button className="btn ghost sm" onClick={() => setEdit(p)}>
                  ✏️ Editar
                </button>
                <button className={`btn sm ${p.available ? 'ok' : ''}`} onClick={() => toggle(p)}>
                  {p.available ? 'Disponible' : 'Agotado'}
                </button>
                <button className="btn danger sm" onClick={() => del(p)}>
                  {confirmDel === p.id ? '¿Seguro?' : '🗑'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {importing && <ImportProducts business={business} onClose={() => setImporting(false)} onDone={load} />}
      {edit && (
        <ProductForm
          business={business}
          initial={edit.id ? edit : null}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function ProductForm({ business, initial, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: '',
    description: '',
    image_url: '',
    section: '',
    price: '',
    perishable: false,
    sale_type: 'unidad',
    weight_unit: 'lb',
    is_pizza: false,
    available: true,
    ...(initial || {}),
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  // Perecederos (verduras, tubérculos…) se venden por peso por defecto
  const setPerishable = (e) => {
    const v = e.target.checked
    setF({ ...f, perishable: v, sale_type: v ? 'peso' : f.sale_type, weight_unit: f.weight_unit || 'lb' })
  }

  const save = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const row = {
      business_id: business.id,
      name: f.name.trim(),
      description: f.description || null,
      image_url: imageUrl(f.image_url) || null,
      section: f.section.trim() || null,
      price: Number(f.price),
      perishable: f.perishable,
      sale_type: f.sale_type,
      weight_unit: f.sale_type === 'peso' ? f.weight_unit || 'lb' : null,
      is_pizza: business.category === 'restaurante' && f.is_pizza,
      available: f.available,
    }
    const { error } = initial ? await supabase.from('products').update(row).eq('id', initial.id) : await supabase.from('products').insert(row)
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved()
  }

  return (
    <Modal title={initial ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <Field label="Nombre">
          <input className="input" required value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Descripción">
          <textarea className="input" rows={2} value={f.description || ''} onChange={set('description')} />
        </Field>
        <Field label="URL de la imagen" hint="Pega el enlace de la imagen. Sirve Google Drive (compártela como “Cualquier persona con el enlace”), Dropbox o cualquier URL de imagen.">
          <input className="input" type="url" value={f.image_url || ''} onChange={set('image_url')} placeholder="https://…" />
        </Field>
        {f.image_url && <Img src={f.image_url} alt="" className="modal-img" />}
        <Field label="Sección / categoría">
          <input className="input" list="sections" value={f.section || ''} onChange={set('section')} placeholder="Ej: Pizzas, Verduras, Celulares" />
          <datalist id="sections">
            {(SECTION_HINTS[business.category] || []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>

        {business.category === 'minimarket' && (
          <label className="check">
            <input type="checkbox" checked={f.perishable} onChange={setPerishable} />
            <span>🥬 Producto perecedero (verduras, frutas, tubérculos…)</span>
          </label>
        )}

        <Field label="¿Cómo se vende?">
          <div className="pay-methods">
            <button type="button" className={`pay ${f.sale_type === 'unidad' ? 'active' : ''}`} onClick={() => setF({ ...f, sale_type: 'unidad' })}>
              📦 Por unidad
            </button>
            <button type="button" className={`pay ${f.sale_type === 'peso' ? 'active' : ''}`} onClick={() => setF({ ...f, sale_type: 'peso' })}>
              ⚖️ Por peso
            </button>
          </div>
        </Field>
        {f.sale_type === 'peso' && (
          <Field label="Unidad de peso">
            <div className="pay-methods">
              {['lb', 'kg'].map((u) => (
                <button type="button" key={u} className={`pay ${f.weight_unit === u ? 'active' : ''}`} onClick={() => setF({ ...f, weight_unit: u })}>
                  {u === 'lb' ? 'Libra (lb)' : 'Kilo (kg)'}
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label={f.sale_type === 'peso' ? `Precio por ${f.weight_unit} (COP)` : 'Precio (COP)'}>
          <input className="input" required type="number" min="0" step="50" value={f.price} onChange={set('price')} />
        </Field>

        {business.category === 'restaurante' && (
          <label className="check">
            <input type="checkbox" checked={f.is_pizza} onChange={set('is_pizza')} />
            <span>🍕 Es pizza (permite mitad y mitad, se cobra la más costosa)</span>
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={f.available} onChange={set('available')} />
          <span>Disponible para la venta</span>
        </label>
        <ErrorText>{err}</ErrorText>
        <button className="btn block" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar producto'}
        </button>
      </form>
    </Modal>
  )
}
