import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id

  const reloadProfile = useCallback(async () => {
    if (!uid) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data)
  }, [uid])

  useEffect(() => {
    reloadProfile()
  }, [reloadProfile])

  const updateProfile = async (fields) => {
    const { error } = await supabase.from('profiles').upsert({ id: uid, email: session.user.email, ...fields })
    if (error) throw error
    await reloadProfile()
  }

  const here = () => window.location.origin + window.location.pathname

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    reloadProfile,
    updateProfile,
    signInGoogle: () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: ({ email, password, full_name, phone, address }) =>
      supabase.auth.signUp({ email, password, options: { data: { full_name, phone, address }, emailRedirectTo: here() } }),
    signOut: () => supabase.auth.signOut(),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
