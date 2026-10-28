import { useEffect, useState } from 'react'
import { Empty, Spinner } from '../../components/ui'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'

const SERVICE_ICON = { externos: '🛵', publicidad_app: '📣', publicidad_push: '🔔' }

// Plan y servicios del negocio. Precios y links de pago los edita el admin; el admin activa cada servicio.
export default function BusinessPlans({ business }) {
  const [plans, setPlans] = useState(null)
  const [services, setServices] = useState([])
  const [active, setActive] = useState([])
  const [billing, setBilling] = useState(null)

  useEffect(() => {
    supabase.from('subscription_plans').select('*').order('sort').then(({ data }) => setPlans(data || []))
    supabase.from('services').select('*').order('sort').then(({ data }) => setServices(data || []))
    supabase
      .from('business_services')
      .select('service_key')
      .eq('business_id', business.id)
      .eq('active', true)
      .then(({ data }) => setActive((data || []).map((x) => x.service_key)))
    supabase.rpc('my_billing', { p_business: business.id }).then(({ data }) => setBilling(data || null))
  }, [business.id])

  if (plans === null) return <Spinner />
  const bl = billing?.active ? billing : null
  return (
    <div>
      {bl && (
        <div className="card pad stack">
          <h3>💼 Tu plan: {bl.plan_name}</h3>
          <p className="small">
            {money(bl.price)} al mes
            {Number(bl.commission_pct) > 0 && (
              <>
                {' '}
                + <b>{Number(bl.commission_pct)}% de cada venta</b>
              </>
            )}
            . Se cobra mes vencido, con corte cada 30 días.
          </p>
          <p className="small muted">
            Ciclo actual: {bl.cycle_start} → {bl.cycle_end} · ventas {money(bl.cycle.sales)} · comisión {money(bl.cycle.commission)}
            <br />
            Próximo corte: <b>{bl.cycle_cut}</b>
          </p>
          {bl.due && (
            <div className="alert">
              <b>Por pagar: {money(bl.due.total)}</b>
              <div className="muted small">
                Ciclo {bl.due.start} → {bl.due.end}: plan {money(bl.price)} + comisión {money(bl.due.commission)} sobre ventas de {money(bl.due.sales)}
              </div>
            </div>
          )}
        </div>
      )}

      <h3 className="section-title">🧩 Servicios</h3>
      <p className="muted small">Paga el servicio con su link y el administrador lo activa en tu negocio.</p>
      <div className="plans">
        {services.map((sv) => {
          const on = active.includes(sv.key)
          return (
            <div key={sv.key} className="card pad plan">
              <h3>
                {SERVICE_ICON[sv.key]} {sv.name}
              </h3>
              <div className="price">
                {money(sv.price)} <small>/ {sv.period}</small>
              </div>
              {sv.details && <p className="small muted">{sv.details}</p>}
              {on ? (
                <span className="pill ok">✔ Activo</span>
              ) : sv.checkout_url ? (
                <a className="btn block" href={sv.checkout_url} target="_blank" rel="noreferrer">
                  💳 Activar / pagar
                </a>
              ) : (
                <span className="pill">Pídelo al administrador</span>
              )}
            </div>
          )
        })}
      </div>

      <h3 className="section-title">⭐ Planes</h3>
      {!plans.length ? (
        <Empty icon="⭐" text="Por ahora no hay planes disponibles" />
      ) : (
        <>
          <p className="muted small">El administrador asigna tu plan. Los planes con link se pagan en Mercado Pago.</p>
          <div className="plans">
            {plans.map((p) => (
              <div key={p.id} className="card pad plan">
                <h3>{p.name}</h3>
                <div className="price">
                  {money(p.price)} <small>/ {p.period}</small>
                </div>
                {Number(p.commission_pct) > 0 && <span className="pill ok">+ {Number(p.commission_pct)}% de cada venta</span>}
                {p.details && <p className="small muted">{p.details}</p>}
                {p.checkout_url ? (
                  <a className="btn block" href={p.checkout_url} target="_blank" rel="noreferrer">
                    🟦 Suscribirme con Mercado Pago
                  </a>
                ) : (
                  <span className="pill">Pídelo al administrador</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
