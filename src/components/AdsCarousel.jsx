import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { imageUrl } from '../lib/format'
import { supabase } from '../lib/supabase'

const INTERVAL = 4500

// Carrusel de publicidad pagada: avanza solo, se puede deslizar y se pausa al tocarlo.
// La base de datos solo entrega los anuncios vigentes y solo si el superadmin activó el carrusel.
export function AdsCarousel() {
  const [ads, setAds] = useState([])
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const track = useRef(null)
  const autoScrollUntil = useRef(0)
  const nav = useNavigate()

  useEffect(() => {
    supabase
      .from('ads')
      .select('id, business_id, title, subtitle, cta, image_url, link_url')
      .order('sort')
      .order('created_at', { ascending: false })
      .then(({ data }) => setAds(data || []))
  }, [])

  // Avance automático
  useEffect(() => {
    if (ads.length < 2 || paused) return
    const t = setInterval(() => setI((n) => (n + 1) % ads.length), INTERVAL)
    return () => clearInterval(t)
  }, [ads.length, paused])

  // Mueve el carrusel a la diapositiva actual
  useEffect(() => {
    const el = track.current
    if (!el || Math.round(el.scrollLeft / el.clientWidth) === i) return
    autoScrollUntil.current = Date.now() + 900
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }, [i])

  if (!ads.length) return null

  const open = (a) => {
    supabase.rpc('ad_click', { p_id: a.id }).then(() => {})
    if (a.link_url) window.open(a.link_url, '_blank', 'noopener')
    else if (a.business_id) nav(`/tienda/${a.business_id}`)
  }

  return (
    <section
      className="ads"
      aria-roledescription="carrusel"
      aria-label="Promociones"
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setTimeout(() => setPaused(false), 6000)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="ads-track"
        ref={track}
        onScroll={(e) => {
          // Solo cuenta el deslizamiento del usuario, no la animación automática
          if (Date.now() < autoScrollUntil.current) return
          const el = e.currentTarget
          const n = Math.round(el.scrollLeft / el.clientWidth)
          if (n !== i && Math.abs(el.scrollLeft - n * el.clientWidth) < 4) setI(n)
        }}
      >
        {ads.map((a) => (
          <button key={a.id} type="button" className="ad-slide" onClick={() => open(a)} aria-label={a.title}>
            <img src={imageUrl(a.image_url)} alt="" loading="lazy" referrerPolicy="no-referrer" />
            <div className="ad-text">
              <span className="ad-tag">Publicidad</span>
              <h3>{a.title}</h3>
              {a.subtitle && <p>{a.subtitle}</p>}
              {(a.link_url || a.business_id) && <span className="ad-cta">{a.cta || 'Ver promoción'} →</span>}
            </div>
          </button>
        ))}
      </div>
      {ads.length > 1 && (
        <div className="ad-dots">
          {ads.map((a, n) => (
            <button key={a.id} type="button" className={n === i ? 'on' : ''} onClick={() => setI(n)} aria-label={`Promoción ${n + 1}`} />
          ))}
        </div>
      )}
    </section>
  )
}
