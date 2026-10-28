import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdsCarousel } from '../../components/AdsCarousel'
import { Empty, Img, Spinner } from '../../components/ui'
import { CATEGORIES, acceptedMethods, catLabel, money } from '../../lib/format'
import { supabase } from '../../lib/supabase'

export default function Home() {
  const [cat, setCat] = useState('todos')
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)

  useEffect(() => {
    supabase
      .from('businesses')
      .select('*')
      .eq('active', true)
      .order('is_open', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => setList(data || []))
  }, [])

  const shown = (list || []).filter(
    (b) => (cat === 'todos' || b.category === cat) && b.name.toLowerCase().includes(q.trim().toLowerCase()),
  )

  return (
    <div className="page">
      <section className="hero">
        <h1>
          ¿Qué te <span className="neon-text">llevamos</span> hoy?
        </h1>
        <p className="muted">Restaurantes, mercado fresco y tecnología a la puerta de tu casa.</p>
        <input className="input search" placeholder="🔎 Buscar negocios…" value={q} onChange={(e) => setQ(e.target.value)} />
      </section>

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
        <Empty icon="🏪" text="Aún no hay negocios en esta categoría" />
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
                    {catLabel(b.category)} · Domicilio {Number(b.delivery_fee) ? money(b.delivery_fee) : 'gratis'}
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
