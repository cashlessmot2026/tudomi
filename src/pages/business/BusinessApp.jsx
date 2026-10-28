import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RequireAuth } from '../../components/AuthForm'
import { Img, InstallButton, PushButton, Spinner, Tabs } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { catLabel } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import BusinessCouriers from './BusinessCouriers'
import BusinessForm from './BusinessForm'
import BusinessOrders from './BusinessOrders'
import BusinessPlans from './BusinessPlans'
import BusinessSales from './BusinessSales'
import BusinessProducts from './BusinessProducts'

export default function BusinessApp() {
  return (
    <div className="app app-negocio">
      <header className="topbar">
        <Link to="/negocio" className="logo">
          Tu<span>Domi</span> <small>Negocios</small>
        </Link>
        <InstallButton />
      </header>
      <RequireAuth title="Panel de negocios" subtitle="Publica tus productos y recibe pedidos a domicilio">
        <BusinessInner />
      </RequireAuth>
    </div>
  )
}

// Enlace directo a la tienda para redes sociales: el cliente abre el menú y se registra al pedir
function ShareStore({ business }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}${import.meta.env.BASE_URL}tienda/${business.id}`
  const text = `Haz tu pedido en ${business.name} 🛵`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copia este enlace:', url)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  const share = () => (navigator.share ? navigator.share({ title: business.name, text, url }).catch(() => {}) : copy())
  return (
    <div className="card pad stack">
      <b>🔗 Tu enlace para redes sociales</b>
      <p className="muted small">Pégalo en Instagram, Facebook, TikTok o WhatsApp: tus clientes entran directo a tu menú y se registran para pedir.</p>
      <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
      <div className="row2">
        <button className="btn sm" onClick={copy}>
          {copied ? '✔ Enlace copiado' : '📋 Copiar enlace'}
        </button>
        <button className="btn ghost sm" onClick={share}>
          📤 Compartir
        </button>
      </div>
      <a className="btn ghost sm" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noreferrer">
        💬 Enviar por WhatsApp
      </a>
    </div>
  )
}

function BusinessInner() {
  const { user, signOut } = useAuth()
  const [b, setB] = useState(undefined)
  const [tab, setTab] = useState('pedidos')

  const load = useCallback(async () => {
    const { data } = await supabase.from('businesses').select('*').eq('owner_id', user.id).order('created_at').limit(1).maybeSingle()
    setB(data)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  if (b === undefined) return <Spinner />
  if (!b)
    return (
      <div className="page narrow">
        <h2 className="title">Registra tu negocio</h2>
        <p className="muted">Restaurante, minimarket o tienda de tecnología. Después agregas tus productos.</p>
        <BusinessForm onSaved={load} />
        <button className="btn ghost sm mt" onClick={signOut}>
          Cerrar sesión
        </button>
      </div>
    )

  const toggleOpen = async () => {
    await supabase.from('businesses').update({ is_open: !b.is_open }).eq('id', b.id)
    load()
  }

  return (
    <div className="page">
      {!b.active && <div className="card pad alert bad">Tu negocio fue desactivado por el administrador y no es visible para los clientes.</div>}
      <div className="card pad biz-head">
        <Img src={b.logo_url} alt="" className="biz-logo lg" fallback="🏪" />
        <div className="grow">
          <h2>{b.name}</h2>
          <p className="muted small">{catLabel(b.category)}</p>
        </div>
        <button className={`btn sm ${b.is_open ? 'ok' : 'danger'}`} onClick={toggleOpen}>
          {b.is_open ? '● Abierto' : '● Cerrado'}
        </button>
      </div>
      <ShareStore business={b} />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ['pedidos', '📦 Pedidos'],
          ['productos', '🛍️ Productos'],
          ['ventas', '📊 Ventas'],
          ['domis', '🛵 Domiciliarios'],
          ['planes', '⭐ Planes'],
          ['ajustes', '⚙️ Ajustes'],
        ]}
      />

      {tab === 'pedidos' && <BusinessOrders business={b} />}
      {tab === 'productos' && <BusinessProducts business={b} />}
      {tab === 'domis' && <BusinessCouriers business={b} />}
      {tab === 'planes' && <BusinessPlans business={b} />}
      {tab === 'ventas' && <BusinessSales business={b} />}
      {tab === 'ajustes' && (
        <div className="narrow">
          <BusinessForm initial={b} onSaved={load} />
          <div className="card pad stack mt">
            <PushButton app="negocio" />
            <Link className="btn ghost sm" to={`/tienda/${b.id}`} target="_blank" rel="noreferrer">
              👀 Ver mi tienda como cliente
            </Link>
            <button className="btn danger sm" onClick={signOut}>
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
