import { Link, NavLink, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '../../components/AuthForm'
import { InstallButton } from '../../components/ui'
import { useCart } from '../../lib/cart'
import BusinessPage from './BusinessPage'
import Cart from './Cart'
import Home from './Home'
import OrderDetail from './OrderDetail'
import Orders from './Orders'
import Profile from './Profile'

export default function ClientApp() {
  const { count } = useCart()
  return (
    <div className="app app-cliente">
      <header className="topbar">
        <Link to="/" className="logo">
          Tu<span>Domi</span>
        </Link>
        <InstallButton />
      </header>
      <Routes>
        <Route index element={<Home />} />
        <Route path="tienda/:id" element={<BusinessPage />} />
        <Route path="carrito" element={<Cart />} />
        <Route path="pedidos" element={<RequireAuth title="Tus pedidos" subtitle="Ingresa para ver tus pedidos"><Orders /></RequireAuth>} />
        <Route path="pedidos/:id" element={<RequireAuth title="Tu pedido"><OrderDetail /></RequireAuth>} />
        <Route path="perfil" element={<RequireAuth title="Tu cuenta" subtitle="Ingresa con Google o crea tu cuenta"><Profile /></RequireAuth>} />
        <Route path="*" element={<Home />} />
      </Routes>
      <nav className="bottom-nav">
        <NavLink to="/" end>
          <i>🏠</i>
          <span>Inicio</span>
        </NavLink>
        <NavLink to="/carrito">
          <i>🛒</i>
          <span>Carrito</span>
          {count > 0 && <b className="dot">{count}</b>}
        </NavLink>
        <NavLink to="/pedidos">
          <i>🧾</i>
          <span>Pedidos</span>
        </NavLink>
        <NavLink to="/perfil">
          <i>👤</i>
          <span>Perfil</span>
        </NavLink>
      </nav>
    </div>
  )
}
