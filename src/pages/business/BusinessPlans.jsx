import { useEffect, useState } from 'react'
import { Empty, Spinner } from '../../components/ui'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'

// Suscripciones opcionales. Los planes (precio, detalles y link de Mercado Pago) los edita el admin.
export default function BusinessPlans() {
  const [plans, setPlans] = useState(null)
  useEffect(() => {
    supabase
      .from('subscription_plans')
      .select('*')
      .order('sort')
      .then(({ data }) => setPlans(data || []))
  }, [])

  if (plans === null) return <Spinner />
  if (!plans.length) return <Empty icon="⭐" text="Por ahora no hay planes disponibles" />
  return (
    <div>
      <p className="muted small">Suscripciones opcionales para tu negocio. El pago es mensual y se gestiona en Mercado Pago.</p>
      <div className="plans">
        {plans.map((p) => (
          <div key={p.id} className="card pad plan">
            <h3>{p.name}</h3>
            <div className="price">
              {money(p.price)} <small>/ {p.period}</small>
            </div>
            {p.details && <p className="small muted">{p.details}</p>}
            <a className="btn block" href={p.checkout_url} target="_blank" rel="noreferrer">
              🟦 Suscribirme con Mercado Pago
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
