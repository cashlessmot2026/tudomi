import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { CartProvider } from './lib/cart'
import { registerSW } from './lib/pwa'
import AdminApp from './pages/admin/AdminApp'
import BusinessApp from './pages/business/BusinessApp'
import ClientApp from './pages/client/ClientApp'
import CourierApp from './pages/courier/CourierApp'
import './styles.css'

registerSW()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/negocio/*" element={<BusinessApp />} />
          <Route path="/domiciliario/*" element={<CourierApp />} />
          <Route path="/admin" element={<AdminApp />} />
          <Route
            path="/*"
            element={
              <CartProvider>
                <ClientApp />
              </CartProvider>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
)
