import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtime } from '../lib/useRealtime'
import { ErrorText } from './ui'

// Chat privado entre el cliente y el negocio de un pedido
export function Chat({ orderId, me }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const box = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('messages').select('*').eq('order_id', orderId).order('created_at')
    setMsgs(data || [])
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  useRealtime('messages', `order_id=eq.${orderId}`, (p) => {
    if (p.eventType === 'INSERT') setMsgs((m) => (m.some((x) => x.id === p.new.id) ? m : [...m, p.new]))
  })

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [msgs])

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    setErr('')
    const { data, error } = await supabase.from('messages').insert({ order_id: orderId, body }).select().single()
    if (error) return setErr(error.message)
    setMsgs((m) => (m.some((x) => x.id === data.id) ? m : [...m, data]))
  }

  return (
    <div className="chat">
      <div className="chat-msgs" ref={box}>
        {msgs.length === 0 && <p className="muted small center">Aún no hay mensajes. Escribe para coordinar tu pedido.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.sender_role === me ? 'mine' : ''}`}>
            <small>{m.sender_role === 'negocio' ? '🏪 Negocio' : '🙋 Cliente'}</small>
            <p>{m.body}</p>
            <time>{new Date(m.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
        ))}
      </div>
      <ErrorText>{err}</ErrorText>
      <form className="chat-form" onSubmit={send}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje…" maxLength={1000} />
        <button className="btn sm">Enviar</button>
      </form>
    </div>
  )
}
