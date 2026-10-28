import { useCallback, useEffect, useState } from 'react'
import { DateRange, dayLabel, useDateRange } from '../../components/DateRange'
import { Empty, ErrorText, Field, Spinner } from '../../components/ui'
import { fmtDate, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'

// Consolidado de ventas, comisiones y liquidaciones (pedidos entregados)
export function AdminAnalytics({ pass }) {
  const [range, setRange] = useDateRange('7')
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setD(null)
    supabase.rpc('admin_analytics', { p_pass: pass, p_from: range.from, p_to: range.to }).then(({ data, error }) => {
      if (error) setErr(error.message)
      setD(data || { summary: { daily: [], totals: {} }, by_business: [], by_courier: [] })
    })
  }, [pass, range.from, range.to])

  const t = d?.summary?.totals || {}
  const daily = d?.summary?.daily || []
  const max = Math.max(1, ...daily.map((r) => Number(r.total)))
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
              <b>{money(t.total)}</b>
              <span>Total vendido</span>
            </div>
            <div className="stat card">
              <b>{money(t.subtotal)}</b>
              <span>Venta neta (sin domicilio)</span>
            </div>
            <div className="stat card">
              <b className="earn">{money(t.commission)}</b>
              <span>Comisiones plataforma</span>
            </div>
            <div className="stat card">
              <b>{money(t.mp_total)}</b>
              <span>🟦 Cobrado por Mercado Pago</span>
            </div>
            <div className="stat card">
              <b>{money(t.delivery)}</b>
              <span>Domicilios ({money(t.rain)} 🌧️)</span>
            </div>
            <div className="stat card">
              <b>{money(t.tips)}</b>
              <span>Propinas</span>
            </div>
            <div className="stat card">
              <b>{t.orders || 0}</b>
              <span>Pedidos entregados</span>
            </div>
          </div>

          <h3>Por día</h3>
          {daily.length === 0 ? (
            <Empty icon="📊" text="No hay ventas entregadas en estas fechas" />
          ) : (
            <div className="table-wrap card">
              <table>
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Pedidos</th>
                    <th>Total</th>
                    <th></th>
                    <th>Venta neta</th>
                    <th>Domicilios</th>
                    <th>Propinas</th>
                    <th>Comisión</th>
                    <th>Mercado Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((r) => (
                    <tr key={r.day}>
                      <td>{dayLabel(r.day)}</td>
                      <td>{r.orders}</td>
                      <td>{money(r.total)}</td>
                      <td style={{ width: 90 }}>
                        <div className="bar" style={{ width: `${(Number(r.total) / max) * 100}%` }} />
                      </td>
                      <td>{money(r.subtotal)}</td>
                      <td>{money(r.delivery)}</td>
                      <td>{money(r.tips)}</td>
                      <td className="earn">{money(r.commission)}</td>
                      <td>{money(r.mp_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Liquidación por negocio</h3>
          <p className="muted small">
            Saldo = venta cobrada por Mercado Pago − comisiones. Positivo: la plataforma le transfiere al negocio. Negativo: el negocio le debe
            comisiones a la plataforma.
          </p>
          {d.by_business.length === 0 ? (
            <Empty icon="🏪" text="Sin ventas" />
          ) : (
            <div className="table-wrap card">
              <table>
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th>Pedidos</th>
                    <th>Venta neta</th>
                    <th>Comisión</th>
                    <th>Venta por MP</th>
                    <th>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.by_business.map((b) => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{b.orders}</td>
                      <td>{money(b.subtotal)}</td>
                      <td>{money(b.commission)}</td>
                      <td>{money(b.mp_subtotal)}</td>
                      <td className={Number(b.balance) >= 0 ? 'earn' : 'error'}>
                        {Number(b.balance) >= 0 ? 'Pagarle ' : 'Nos debe '}
                        {money(Math.abs(Number(b.balance)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Domiciliarios</h3>
          <p className="muted small">"A pagar por MP" son domicilios y propinas que el cliente pagó con Mercado Pago y que la plataforma le debe al domiciliario.</p>
          {d.by_courier.length === 0 ? (
            <Empty icon="🛵" text="Sin entregas" />
          ) : (
            <div className="table-wrap card">
              <table>
                <thead>
                  <tr>
                    <th>Domiciliario</th>
                    <th>Entregas</th>
                    <th>Domicilios</th>
                    <th>Propinas</th>
                    <th>Ganancia</th>
                    <th>A pagar por MP</th>
                  </tr>
                </thead>
                <tbody>
                  {d.by_courier.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.deliveries}</td>
                      <td>{money(c.delivery)}</td>
                      <td>{money(c.tips)}</td>
                      <td className="earn">{money(c.earnings)}</td>
                      <td>{money(c.mp_to_pay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Ajustes de la plataforma: comisión opcional y recargo por lluvia
export function PlatformSettings({ pass }) {
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_settings', { p_pass: pass })
    if (error) setErr(error.message)
    setS(data)
  }, [pass])
  useEffect(() => {
    load()
  }, [load])

  const save = async (patch) => {
    setErr('')
    setMsg('')
    const { error } = await supabase.rpc('admin_set_settings', { p_pass: pass, p: patch })
    if (error) return setErr(error.message)
    setMsg('Guardado ✔')
    load()
  }
  const checkNow = async () => {
    setErr('')
    const { error } = await supabase.functions.invoke('rain-check')
    if (error) setErr(error.message)
    load()
  }

  if (!s) return <Spinner />
  const w = s.rain_checked
  return (
    <>
      <div className="card pad narrow">
        <h3>💼 Comisión sobre ventas</h3>
        <p className="muted small">
          Se cobra sobre la venta neta (sin domicilio ni propina) de los pagos en efectivo, datáfono, transferencia, QR y link. En Mercado Pago
          siempre es 10%, sin importar este ajuste.
        </p>
        <label className="check">
          <input type="checkbox" checked={s.commission_enabled} onChange={(e) => save({ commission_enabled: String(e.target.checked) })} /> Cobrar
          comisión en los demás métodos de pago
        </label>
        <Field label="Porcentaje (%)">
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            step={0.5}
            defaultValue={s.commission_pct}
            onBlur={(e) => Number(e.target.value) !== Number(s.commission_pct) && save({ commission_pct: String(Number(e.target.value) || 0) })}
          />
        </Field>
      </div>

      <div className="card pad narrow">
        <div className="row-between">
          <div>
            <h3>🌧️ Recargo por lluvia</h3>
            <p className="muted small">Sube el domicilio un % mientras llueve. El recargo completo es para el domiciliario.</p>
          </div>
          <button className={`btn sm ${s.rain_mode ? 'ok' : 'ghost'}`} disabled={s.rain_auto} onClick={() => save({ rain_mode: String(!s.rain_mode) })}>
            {s.rain_mode ? '● Lloviendo' : '○ Sin lluvia'}
          </button>
        </div>
        <Field label="Recargo (%)">
          <input
            className="input"
            type="number"
            min={0}
            max={300}
            step={5}
            defaultValue={s.rain_pct}
            onBlur={(e) => Number(e.target.value) !== Number(s.rain_pct) && save({ rain_pct: String(Number(e.target.value) || 0) })}
          />
        </Field>
        <label className="check">
          <input type="checkbox" checked={s.rain_auto} onChange={(e) => save({ rain_auto: String(e.target.checked) })} /> Automático: revisar el
          clima cada 15 minutos (Open-Meteo) en la zona de los negocios
        </label>
        {s.rain_auto && (
          <>
            <p className="muted small">
              {w
                ? `Última revisión ${fmtDate(w.at)}: ${w.raining ? 'lloviendo' : 'sin lluvia'} (${w.precipitation} mm, código ${w.code}).`
                : 'Aún no se ha revisado el clima.'}
            </p>
            <button className="btn ghost sm" onClick={checkNow}>
              ↻ Revisar clima ahora
            </button>
          </>
        )}
      </div>
      {(err || msg) && <p className={err ? 'error' : 'muted small'}>{err || msg}</p>}
    </>
  )
}
