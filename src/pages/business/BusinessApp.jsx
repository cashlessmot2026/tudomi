import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RequireAuth } from '../../components/AuthForm'
import { Img, InstallButton, PushButton, Spinner, Tabs } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { catLabel } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import BusinessForm from './BusinessForm'
import BusinessOrders from './BusinessOrders'
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

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          ['pedidos', '📦 Pedidos'],
          ['productos', '🛍️ Productos'],
          ['ajustes', '⚙️ Ajustes'],
        ]}
      />

      {tab === 'pedidos' && <BusinessOrders business={b} />}
      {tab === 'productos' && <BusinessProducts business={b} />}
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
