import { useEffect, useState } from 'react'
import { DateRange, dayLabel, useDateRange } from '../../components/DateRange'
import { Empty, ErrorText, Spinner } from '../../components/ui'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'

// Ventas del negocio (pedidos entregados) y su saldo con la plataforma
export default function BusinessSales({ business }) {
  const [range, setRange] = useDateRange('7')
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setD(null)
    supabase.rpc('business_analytics', { p_business: business.id, p_from: range.from, p_to: range.to }).then(({ data, error }) => {
      if (error) setErr(error.message)
      setD(data || { daily: [], totals: {} })
    })
  }, [business.id, range.from, range.to])

  const t = d?.totals || {}
  const max = Math.max(1, ...(d?.daily || []).map((r) => Number(r.subtotal)))
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
              <b>{money(t.subtotal)}</b>
              <span>Ventas (sin domicilio)</span>
            </div>
            <div className="stat card">
              <b>{t.orders || 0}</b>
              <span>Pedidos entregados</span>
            </div>
            <div className="stat card">
              <b>{money(t.commission)}</b>
              <span>Comisión plataforma</span>
            </div>
            <div className="stat card">
              <b>{money(t.mp_total)}</b>
              <span>🟦 Cobrado por Mercado Pago</span>
            </div>
            <div className="stat card">
              <b className={Number(t.balance) >= 0 ? 'earn' : 'error'}>{money(Math.abs(Number(t.balance || 0)))}</b>
              <span>{Number(t.balance) >= 0 ? 'La plataforma te paga' : 'Debes a la plataforma'}</span>
            </div>
          </div>
          {d.daily.length === 0 ? (
            <Empty icon="📊" text="No hay ventas entregadas en estas fechas" />
          ) : (
            <div className="table-wrap card">
              <table>
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Pedidos</th>
                    <th>Ventas</th>
                    <th></th>
                    <th>Domicilios</th>
                    <th>Propinas</th>
                    <th>Comisión</th>
                    <th>Mercado Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {d.daily.map((r) => (
                    <tr key={r.day}>
                      <td>{dayLabel(r.day)}</td>
                      <td>{r.orders}</td>
                      <td>{money(r.subtotal)}</td>
                      <td style={{ width: 90 }}>
                        <div className="bar" style={{ width: `${(Number(r.subtotal) / max) * 100}%` }} />
                      </td>
                      <td>{money(r.delivery)}</td>
                      <td>{money(r.tips)}</td>
                      <td>{money(r.commission)}</td>
                      <td>{money(r.mp_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">
            Comisión: 10% de la venta (sin domicilio ni propina) en pagos con Mercado Pago, y el % que defina la plataforma en los demás
            métodos. El saldo es lo cobrado por Mercado Pago menos todas tus comisiones.
          </p>
        </>
      )}
    </div>
  )
}
