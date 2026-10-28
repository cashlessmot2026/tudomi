import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Códigos del pedido que le corresponden al usuario actual (los decide el servidor):
//   delivery_code -> cliente y negocio · pickup_code -> domiciliario asignado
export function useOrderCodes(orderId, refreshKey) {
  const [codes, setCodes] = useState(null)
  const load = useCallback(async () => {
    if (!orderId) return
    const { data } = await supabase.rpc('my_order_codes', { p_order: orderId })
    setCodes(data || {})
  }, [orderId])
  useEffect(() => {
    load()
  }, [load, refreshKey])
  return codes
}
