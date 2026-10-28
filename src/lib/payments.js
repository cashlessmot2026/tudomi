import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Configuración pública de pagos (hoy: si el admin activó Mercado Pago)
export function usePaymentConfig() {
  const [cfg, setCfg] = useState({ mp_enabled: false })
  useEffect(() => {
    supabase.rpc('payment_config').then(({ data }) => data && setCfg(data))
  }, [])
  return cfg
}

// Crea el pago en Mercado Pago (Edge Function) y lleva al cliente al checkout
export async function payWithMercadoPago(orderId) {
  const return_url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/pedidos/${orderId}`
  const { data, error } = await supabase.functions.invoke('mp-create-preference', { body: { order_id: orderId, return_url } })
  if (error) {
    const msg = await error.context?.json?.().then((b) => b.error).catch(() => null)
    throw new Error(msg || error.message)
  }
  if (!data?.init_point) throw new Error(data?.error || 'No se pudo abrir Mercado Pago')
  window.location.href = data.init_point
}
