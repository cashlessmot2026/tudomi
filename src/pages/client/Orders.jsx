import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, Img, Spinner, StatusBadge } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { fmtDate, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { useRealtime } from '../../lib/useRealtime'

export default function Orders() {
  const { user } = useAuth()
  const [list, setList] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, businesses(name, logo_url)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setList(data || [])
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])
  useRealtime('orders', `customer_id=eq.${user.id}`, load)

  if (list === null) return <Spinner />
  if (!list.length)
    return (
      <Empty icon="🧾" text="Aún no tienes pedidos">
        <Link to="/" className="btn">
          Hacer mi primer pedido
        </Link>
      </Empty>
    )

  return (
    <div className="page narrow">
      <h2 className="title">Mis pedidos</h2>
      {list.map((o) => (
        <Link to={`/pedidos/${o.id}`} key={o.id} className="card pad order-row">
          <Img src={o.businesses?.logo_url} alt="" className="thumb" fallback="🏪" />
          <div className="grow">
            <b>
              #{o.number} · {o.businesses?.name}
            </b>
            <div className="muted small">{fmtDate(o.created_at)}</div>
            <StatusBadge status={o.status} />
          </div>
          <b>{money(o.total)}</b>
        </Link>
      ))}
    </div>
  )
}
