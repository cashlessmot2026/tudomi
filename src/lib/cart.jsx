import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const Ctx = createContext(null)
const KEY = 'tudomi_cart_v1'
const round = (n) => Math.round(n * 100) / 100

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {}
  }, [items])

  const add = (it) =>
    setItems((prev) => {
      const key = [it.product_id, it.half_product_id || '', it.note || ''].join('|')
      const ex = prev.find((p) => p.key === key)
      if (ex) return prev.map((p) => (p.key === key ? { ...p, qty: round(p.qty + it.qty) } : p))
      return [...prev, { ...it, key }]
    })

  const setQty = (key, qty) =>
    setItems((prev) => (qty <= 0 ? prev.filter((p) => p.key !== key) : prev.map((p) => (p.key === key ? { ...p, qty: round(qty) } : p))))

  const remove = (key) => setItems((prev) => prev.filter((p) => p.key !== key))
  const clearBusiness = (bid) => setItems((prev) => prev.filter((p) => p.business_id !== bid))

  const groups = useMemo(
    () =>
      items.reduce((g, i) => {
        ;(g[i.business_id] ||= []).push(i)
        return g
      }, {}),
    [items],
  )

  return (
    <Ctx.Provider value={{ items, groups, count: items.length, add, setQty, remove, clearBusiness }}>{children}</Ctx.Provider>
  )
}

export const useCart = () => useContext(Ctx)
