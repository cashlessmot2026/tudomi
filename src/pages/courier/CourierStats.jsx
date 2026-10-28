import { useEffect, useState } from 'react'
import { DateRange, dayLabel, useDateRange } from '../../components/DateRange'
import { Empty, ErrorText, Spinner } from '../../components/ui'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'

// Estadísticas del domiciliario: el valor del pedido es del negocio; lo suyo es el domicilio (+ lluvia) y la propina
export default function CourierStats() {
  const [range, setRange] = useDateRange('7')
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setD(null)
    supabase.rpc('courier_stats', { p_from: range.from, p_to: range.to }).then(({ data, error }) => {
      if (error) setErr(error.message)
      setD(data || { daily: [], totals: {} })
    })
  }, [range.from, range.to])

  const t = d?.totals || {}
  return (
    <div>
      <DateRange value={range} onChange={setRange} />
      <ErrorText>{err}</ErrorText>
      {!d ? (
        <Spinner />
      ) : (
        <>
          <div className="kpis">
            <div className="stat card">
              <b className="earn">{money(t.earnings)}</b>
              <span>Tus ganancias</span>
            </div>
            <div className="stat card">
              <b>{t.deliveries || 0}</b>
              <span>Entregas</span>
            </div>
            <div className="stat card">
              <b>{money(t.delivery)}</b>
              <span>Domicilios</span>
            </div>
            <div className="stat card">
              <b>{money(t.rain)}</b>
              <span>🌧️ Recargo lluvia</span>
            </div>
            <div className="stat card">
              <b>{money(t.tips)}</b>
              <span>Propinas</span>
            </div>
            <div className="stat card">
              <b>{money(t.order_value)}</b>
              <span>Valor de pedidos (del negocio)</span>
            </div>
          </div>
          {d.daily.length === 0 ? (
            <Empty icon="📊" text="No tienes entregas en estas fechas" />
          ) : (
            <div className="table-wrap card">
              <table>
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Entregas</th>
                    <th>Pedidos</th>
                    <th>Domicilios</th>
                    <th>Lluvia</th>
                    <th>Propinas</th>
                    <th>Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {d.daily.map((r) => (
                    <tr key={r.day}>
                      <td>{dayLabel(r.day)}</td>
                      <td>{r.deliveries}</td>
                      <td>{money(r.order_value)}</td>
                      <td>{money(r.delivery)}</td>
                      <td>{money(r.rain)}</td>
                      <td>{money(r.tips)}</td>
                      <td className="earn">{money(r.earnings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">El valor de los pedidos es del negocio. Tu ganancia es el domicilio (con el recargo por lluvia) más las propinas.</p>
        </>
      )}
    </div>
  )
}
