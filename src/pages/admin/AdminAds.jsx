import { useCallback, useEffect, useState } from 'react'
import { Empty, ErrorText, Field, Img, Modal, Spinner } from '../../components/ui'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const plusDays = (d, n) => new Date(new Date(`${d}T12:00:00`).getTime() + n * 86400000).toISOString().slice(0, 10)
const EMPTY = { business_id: '', title: '', subtitle: '', cta: '', image_url: '', link_url: '', amount_paid: '', active: true, sort: 0 }

const adState = (a) =>
  !a.active ? ['Pausado', ''] : a.ends_on < today() ? ['Vencido', 'bad'] : a.starts_on > today() ? ['Programado', ''] : ['Al aire', 'ok']

// Publicidad pagada por los negocios: carrusel en el inicio de la app de clientes
export function AdminAds({ pass }) {
  const [d, setD] = useState(null)
  const [biz, setBiz] = useState([])
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_ads', { p_pass: pass })
    if (error) setErr(error.message)
    setD(data || { enabled: false, ads: [] })
  }, [pass])
  useEffect(() => {
    load()
    supabase.rpc('admin_list_businesses', { p_pass: pass }).then(({ data }) => setBiz(data || []))
  }, [load, pass])

  const toggle = async () => {
    setErr('')
    const { error } = await supabase.rpc('admin_set_ads_enabled', { p_pass: pass, p_enabled: !d.enabled })
    if (error) return setErr(error.message)
    load()
  }
  const save = async (e) => {
    e.preventDefault()
    setErr('')
    const { error } = await supabase.rpc('admin_save_ad', { p_pass: pass, p: edit })
    if (error) return setErr(error.message)
    setEdit(null)
    load()
  }
  const del = async (a) => {
    if (!window.confirm(`¿Eliminar el anuncio "${a.title}"?`)) return
    const { error } = await supabase.rpc('admin_delete_ad', { p_pass: pass, p_id: a.id })
    if (error) return setErr(error.message)
    load()
  }
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  if (!d) return <Spinner />
  const live = d.ads.filter((a) => adState(a)[0] === 'Al aire').length
  return (
    <div className="stack">
      <div className="card pad">
        <div className="row-between">
          <div>
            <h3>📣 Carrusel de publicidad</h3>
            <p className="muted small">
              Se muestra arriba en el inicio de la app de clientes, pasa solo cada 4,5 segundos y se puede deslizar. {live} anuncio(s) al aire.
            </p>
          </div>
          <button className={`btn sm ${d.enabled ? 'ok' : 'danger'}`} onClick={toggle}>
            {d.enabled ? '● Activado' : '● Desactivado'}
          </button>
        </div>
      </div>

      <div className="card pad">
        <div className="row-between">
          <h3>Anuncios</h3>
          <button className="btn sm" onClick={() => setEdit({ ...EMPTY, starts_on: today(), ends_on: plusDays(today(), 30), sort: d.ads.length + 1 })}>
            + Nuevo anuncio
          </button>
        </div>
        <ErrorText>{err}</ErrorText>
        {d.ads.length === 0 && <Empty icon="📣" text="Aún no hay anuncios" />}
        {d.ads.map((a) => {
          const [label, cls] = adState(a)
          return (
            <div key={a.id} className="ad-row">
              <Img src={a.image_url} alt="" fallback="🖼️" />
              <div className="grow">
                <b>{a.title}</b> <span className={`pill ${cls}`}>{label}</span>
                <div className="muted small">
                  {a.business_name || (a.link_url ? 'Enlace externo' : 'Sin enlace')} · {a.starts_on} → {a.ends_on} · {money(a.amount_paid)} · 👆{' '}
                  {a.clicks} clics
                </div>
              </div>
              <button className="btn ghost sm" onClick={() => setEdit({ ...a, business_id: a.business_id || '', link_url: a.link_url || '' })}>
                ✏️
              </button>
              <button className="btn danger sm" onClick={() => del(a)}>
                🗑
              </button>
            </div>
          )
        })}
      </div>

      {edit && (
        <Modal title={edit.id ? 'Editar anuncio' : 'Nuevo anuncio'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={save}>
            <Field label="Negocio que pauta (al tocar, abre su tienda)">
              <select className="input" value={edit.business_id} onChange={set('business_id')}>
                <option value="">— Ninguno —</option>
                {biz.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Título">
              <input className="input" required maxLength={60} value={edit.title} onChange={set('title')} placeholder="2x1 en hamburguesas" />
            </Field>
            <Field label="Texto (opcional)">
              <input className="input" maxLength={120} value={edit.subtitle || ''} onChange={set('subtitle')} placeholder="Solo este fin de semana" />
            </Field>
            <Field label="Imagen (enlace; horizontal, idealmente 1600×700)" hint="Sirven enlaces de Google Drive o Dropbox">
              <input className="input" required value={edit.image_url} onChange={set('image_url')} placeholder="https://…" />
            </Field>
            {edit.image_url && <Img src={edit.image_url} alt="" className="proof" fallback="🖼️" />}
            <Field label="Texto del botón (opcional)">
              <input className="input" maxLength={24} value={edit.cta || ''} onChange={set('cta')} placeholder="Pedir ahora" />
            </Field>
            <Field label="Enlace externo (opcional; reemplaza la tienda)">
              <input className="input" type="url" value={edit.link_url} onChange={set('link_url')} placeholder="https://…" />
            </Field>
            <div className="row-between">
              <Field label="Desde">
                <input className="input" type="date" required value={edit.starts_on} onChange={set('starts_on')} />
              </Field>
              <Field label="Hasta">
                <input className="input" type="date" required min={edit.starts_on} value={edit.ends_on} onChange={set('ends_on')} />
              </Field>
            </div>
            <div className="row-between">
              <Field label="Valor pagado (COP)">
                <input className="input" type="number" min={0} step={1000} value={edit.amount_paid} onChange={set('amount_paid')} />
              </Field>
              <Field label="Orden">
                <input className="input" type="number" value={edit.sort} onChange={set('sort')} />
              </Field>
            </div>
            <label className="check">
              <input type="checkbox" checked={!!edit.active} onChange={set('active')} /> Anuncio activo
            </label>
            <ErrorText>{err}</ErrorText>
            <button className="btn block">Guardar anuncio</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
