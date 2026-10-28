import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

// Se suscribe a cambios de una tabla (filtrados) y llama onChange(payload)
export function useRealtime(table, filter, onChange, enabled = true) {
  const cb = useRef(onChange)
  cb.current = onChange
  useEffect(() => {
    if (!enabled) return
    const ch = supabase
      .channel(`rt-${table}-${filter || 'all'}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, (p) => cb.current(p))
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [table, filter, enabled])
}
