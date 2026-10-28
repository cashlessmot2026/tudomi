import { useState } from 'react'
import AddressPicker from '../../components/AddressPicker'
import { ErrorText, Field, Img } from '../../components/ui'
import { CATEGORIES, CITIES, PAY_METHODS, imageUrl } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const EMPTY = {
  name: '',
  category: 'restaurante',
  description: '',
  logo_url: '',
  cover_url: '',
  address: '',
  city: '',
  phone: '',
  delivery_fee: 0,
  accepts_cash: true,
  accepts_transfer: false,
  accepts_card: false,
  accepts_qr: false,
  accepts_link: false,
  transfer_info: '',
  qr_image_url: '',
  payment_link_url: '',
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
    if (!PAY_METHODS.some((m) => f[m.flag])) return setErr('Elige al menos un método de pago')
    if (f.accepts_qr && !f.qr_image_url) return setErr('Pega el enlace de la imagen de tu código QR')
    if (f.accepts_link && !/^https?:\/\//i.test(f.payment_link_url || '')) return setErr('Pega tu link de pago (debe empezar por https://)')
    setBusy(true)
    const row = {
      name: f.name.trim(),
      category: f.category,
      description: f.description || null,
      logo_url: imageUrl(f.logo_url) || null,
      cover_url: imageUrl(f.cover_url) || null,
      address: f.address,
      city: f.city.trim(),
      lat: f.lat ?? null,
      lng: f.lng ?? null,
      phone: f.phone,
      delivery_fee: Number(f.delivery_fee) || 0,
      accepts_cash: !!f.accepts_cash,
      accepts_transfer: !!f.accepts_transfer,
      accepts_card: !!f.accepts_card,
      accepts_qr: !!f.accepts_qr,
      accepts_link: !!f.accepts_link,
      transfer_info: f.transfer_info || null,
      qr_image_url: imageUrl(f.qr_image_url) || null,
      payment_link_url: (f.payment_link_url || '').trim() || null,
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
      <AddressPicker
        label="Dirección del negocio"
        required
        value={f}
        onChange={(a) => setF((prev) => ({ ...prev, address: a.address ?? '', lat: a.lat ?? null, lng: a.lng ?? null, city: a.city || prev.city }))}
      />
      <Field label="Ciudad" hint="Los clientes solo ven los negocios de su ciudad">
        <input className="input" required list="ciudades" value={f.city || ''} onChange={set('city')} placeholder="Ej: Bogotá" />
        <datalist id="ciudades">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Teléfono / WhatsApp">
        <input className="input" required type="tel" value={f.phone || ''} onChange={set('phone')} />
      </Field>
      <Field label="Valor del domicilio (COP)">
        <input className="input" type="number" min="0" step="100" value={f.delivery_fee} onChange={set('delivery_fee')} />
      </Field>

      <Field label="Métodos de pago que aceptas">
        {PAY_METHODS.map((m) => (
          <label key={m.id} className="check">
            <input type="checkbox" checked={!!f[m.flag]} onChange={set(m.flag)} />
            <span>
              {m.icon} {m.label} <small className="muted">· {m.hint.replace('Pagas', 'El cliente paga').replace('Transfieres', 'El cliente transfiere').replace('Escaneas', 'El cliente escanea')}</small>
            </span>
          </label>
        ))}
      </Field>
      {f.accepts_card && <p className="muted small">💳 Recuerda que el domiciliario debe llevar el datáfono al entregar.</p>}
      {f.accepts_transfer && (
        <Field label="Datos para transferir" hint="Banco, tipo y número de cuenta, Nequi, Daviplata, titular…">
          <textarea className="input" rows={3} value={f.transfer_info || ''} onChange={set('transfer_info')} />
        </Field>
      )}
      {f.accepts_qr && (
        <Field label="Imagen de tu código QR" hint="Enlace de la imagen del QR (Bancolombia, Nequi, Daviplata…). Sirve un enlace de Google Drive compartido.">
          <input className="input" type="url" value={f.qr_image_url || ''} onChange={set('qr_image_url')} placeholder="https://…" />
          {f.qr_image_url && <Img src={f.qr_image_url} alt="QR" className="qr-img" fallback="📱" />}
        </Field>
      )}
      {f.accepts_link && (
        <Field label="Tu link de pago" hint="Link de Wompi, Mercado Pago, Bold, PayU, Nequi, etc. El cliente lo abre, paga y sube el comprobante.">
          <input className="input" type="url" value={f.payment_link_url || ''} onChange={set('payment_link_url')} placeholder="https://checkout.wompi.co/l/…" />
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
