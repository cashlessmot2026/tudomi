import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://xvyldsknuacajphzeivc.supabase.co'
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2eWxkc2tudWFjYWpwaHplaXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMzcxMDEsImV4cCI6MjEwODcxMzEwMX0.Pkw-fBVbdPatcj6P1azsf9kM6MRHnFCH_yav-shWywM'

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// Sube un archivo a <bucket>/<userId>/<uuid>.<ext> y devuelve su URL pública
export async function uploadFile(bucket, file, userId) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
