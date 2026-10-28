import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdsCarousel } from '../../components/AdsCarousel'
import { Empty, Img, Spinner } from '../../components/ui'
import { CATEGORIES, CITIES, acceptedMethods, catLabel, money } from '../../lib/format'
import { distLabel, distanceKm, getPosition, hasCoords, normCity, reverseGeocodeDetail } from '../../lib/geo'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

const LOC_KEY = 'tudomi_ubicacion'
const loadLoc = () => {
  try {
    return JSON.parse(localStorage.getItem(LOC_KEY)) || {}
  } catch {
    return {}
  }
}

export default function Home() {
  const [cat, setCat] = useState('todos')
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const { profile } = useAuth()
  const [loc, setLoc] = useState(loadLoc) // { city, lat, lng }
  const [locBusy, setLocBusy] = useState(false)
  const [locMsg, setLocMsg] = useState('')

  const saveLoc = (next) => {
    setLoc(next)
    try {
      localStorage.setItem(LOC_KEY, JSON.stringify(next))
    } catch {
      // Sin almacenamiento: la ciudad solo dura mientras la app está abierta
    }
  }

  // Cambiar de ciudad a mano; las coordenadas viejas ya no sirven para ordenar
  const pickCity = (city) => saveLoc({ city, lat: null, lng: null })

  const detect = async () => {
    setLocBusy(true)
    setLocMsg('')
    try {
      const p = await getPosition()
      const { city } = await reverseGeocodeDetail(p.lat, p.lng).catch(() => ({ city: '' }))
      saveLoc({ city: city || loc.city || '', lat: p.lat, lng: p.lng })
      if (!city) setLocMsg('Te ubicamos, pero no pudimos saber tu ciudad. Elígela en la lista.')
    } catch (e) {
      setLocMsg(e.message)
    }
    setLocBusy(false)
  }

  useEffect(() => {
    supabase
      .from('businesses')
      .select('*')
      .eq('active', true)
      .order('is_open', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => setList(data || []))
  }, [])

  // Punto de referencia para ordenar: GPS reciente o la dirección guardada en el perfil
  const me = hasCoords(loc) ? loc : !loc.city && hasCoords(profile) ? profile : null
  const cities = [...new Set([...CITIES, ...(list || []).map((b) => b.city).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'es'))
  if (loc.city && !cities.some((c) => normCity(c) === normCity(loc.city))) cities.unshift(loc.city)

  const shown = (list || [])
    .filter(
      (b) =>
        (!loc.city || !b.city || normCity(b.city) === normCity(loc.city)) &&
        (cat === 'todos' || b.category === cat) &&
        b.name.toLowerCase().includes(q.trim().toLowerCase()),
    )
    .map((b) => ({ ...b, km: me && hasCoords(b) ? distanceKm(me, b) : null }))
    .sort((a, b) => Number(b.is_open) - Number(a.is_open) || (a.km ?? Infinity) - (b.km ?? Infinity))

  return (
    <div className="page">
      <section className="hero">
        <h1>
          ¿Qué te <span className="neon-text">llevamos</span> hoy?
        </h1>
        <p className="muted">Restaurantes, mercado fresco y tecnología a la puerta de tu casa.</p>
        <input className="input search" placeholder="🔎 Buscar negocios…" value={q} onChange={(e) => setQ(e.target.value)} />
      </section>

      <div className="card pad city-bar">
        <label className="field">
          <span>📍 Mi ciudad</span>
          <select className="input" value={cities.find((c) => normCity(c) === normCity(loc.city)) || ''} onChange={(e) => pickCity(e.target.value)}>
            <option value="">Todas las ciudades</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn ghost sm" onClick={detect} disabled={locBusy}>
          {locBusy ? 'Ubicando…' : hasCoords(loc) ? '↻ Actualizar mi ubicación' : '📍 Detectar mi ubicación'}
        </button>
        {locMsg && <small className="muted">{locMsg}</small>}
        {!me && <small className="muted">Activa tu ubicación para ver primero los negocios más cercanos.</small>}
      </div>

      <AdsCarousel />

      <div className="cat-grid">
        <button className={`cat ${cat === 'todos' ? 'active' : ''}`} onClick={() => setCat('todos')}>
          <i>✨</i>
          <span>Todos</span>
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`cat ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
            <i>{c.icon}</i>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {list === null ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <Empty icon="🏪" text={loc.city ? `Aún no hay negocios en ${loc.city} para esta búsqueda` : 'Aún no hay negocios en esta categoría'} />
      ) : (
        <div className="grid">
          {shown.map((b) => (
            <Link to={`/tienda/${b.id}`} key={b.id} className={`biz-card card ${b.is_open ? '' : 'closed'}`}>
              <div className="biz-cover">
                <Img src={b.cover_url || b.logo_url} alt={b.name} fallback={CATEGORIES.find((c) => c.id === b.category)?.icon} />
                {!b.is_open && <span className="closed-tag">Cerrado</span>}
              </div>
              <div className="biz-info">
                <Img src={b.logo_url} alt="" className="biz-logo" fallback="🏪" />
                <div>
                  <h3>{b.name}</h3>
                  <p className="muted small">
                    {catLabel(b.category)}
                    {b.km !== null && ` · 📍 ${distLabel(b.km)}`} · Domicilio {Number(b.delivery_fee) ? money(b.delivery_fee) : 'gratis'}
                  </p>
                  <p className="small">
                    {acceptedMethods(b).map((m) => (
                      <span key={m.id} className="pill">
                        {m.icon} {m.label}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
