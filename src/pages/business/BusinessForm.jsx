import { useState } from 'react'
import { ErrorText, Field, Img } from '../../components/ui'
import { CATEGORIES, imageUrl } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const EMPTY = {
  name: '',
  category: 'restaurante',
  description: '',
  logo_url: '',
  cover_url: '',
  address: '',
  phone: '',
  delivery_fee: 0,
  accepts_cash: true,
  accepts_transfer: false,
  transfer_info: '',
}

export default function BusinessForm({ initial, onSaved }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...(initial || {}) }))
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setErr('')
    setMsg('')
    if (!f.accepts_cash && !f.accepts_transfer) return setErr('Elige al menos un método de pago')
    setBusy(true)
    const row = {
      name: f.name.trim(),
      category: f.category,
      description: f.description || null,
      logo_url: imageUrl(f.logo_url) || null,
      cover_url: imageUrl(f.cover_url) || null,
      address: f.address,
      phone: f.phone,
      delivery_fee: Number(f.delivery_fee) || 0,
      accepts_cash: f.accepts_cash,
      accepts_transfer: f.accepts_transfer,
      transfer_info: f.transfer_info || null,
    }
    const { error } = initial ? await supabase.from('businesses').update(row).eq('id', initial.id) : await supabase.from('businesses').insert(row)
    setBusy(false)
    if (error) return setErr(error.message)
    setMsg('Guardado ✔')
    onSaved?.()
  }

  return (
    <form className="card pad form" onSubmit={save}>
      <Field label="Nombre del negocio">
        <input className="input" required value={f.name} onChange={set('name')} />
      </Field>
      <Field label="Tipo de negocio">
        <div className="pay-methods">
          {CATEGORIES.map((c) => (
            <button type="button" key={c.id} className={`pay ${f.category === c.id ? 'active' : ''}`} onClick={() => setF({ ...f, category: c.id })}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Descripción">
        <textarea className="input" rows={2} value={f.description || ''} onChange={set('description')} />
      </Field>
      <div className="row2">
        <Field label="URL del logo" hint="Sirve un enlace de Google Drive (compartido con “Cualquier persona con el enlace”) o cualquier URL de imagen">
          <input className="input" type="url" value={f.logo_url || ''} onChange={set('logo_url')} placeholder="https://…" />
        </Field>
        <Field label="URL de la portada">
          <input className="input" type="url" value={f.cover_url || ''} onChange={set('cover_url')} placeholder="https://…" />
        </Field>
      </div>
      {(f.logo_url || f.cover_url) && (
        <div className="preview-row">
          {f.logo_url && <Img src={f.logo_url} alt="logo" className="biz-logo lg" />}
          {f.cover_url && <Img src={f.cover_url} alt="portada" className="cover-prev" />}
        </div>
      )}
      <div className="row2">
        <Field label="Dirección">
          <input className="input" required value={f.address || ''} onChange={set('address')} />
        </Field>
        <Field label="Teléfono / WhatsApp">
          <input className="input" required type="tel" value={f.phone || ''} onChange={set('phone')} />
        </Field>
      </div>
      <Field label="Valor del domicilio (COP)">
        <input className="input" type="number" min="0" step="100" value={f.delivery_fee} onChange={set('delivery_fee')} />
      </Field>

      <Field label="Métodos de pago que aceptas">
        <label className="check">
          <input type="checkbox" checked={f.accepts_cash} onChange={set('accepts_cash')} />
          <span>💵 Efectivo contra entrega</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={f.accepts_transfer} onChange={set('accepts_transfer')} />
          <span>🏦 Transferencia (el cliente sube el comprobante)</span>
        </label>
      </Field>
      {f.accepts_transfer && (
        <Field label="Datos para transferir" hint="Banco, tipo y número de cuenta, Nequi, Daviplata, titular…">
          <textarea className="input" rows={3} value={f.transfer_info || ''} onChange={set('transfer_info')} />
        </Field>
      )}
      <ErrorText>{err}</ErrorText>
      {msg && <p className="success">{msg}</p>}
      <button className="btn block" disabled={busy}>
        {busy ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear mi negocio'}
      </button>
    </form>
  )
}
