import { supabase } from './supabase'

// ---- Instalación (Android: beforeinstallprompt / iOS: instrucciones) ----
let deferred = null
const listeners = new Set()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e
  listeners.forEach((f) => f())
})

export const onInstallChange = (f) => {
  listeners.add(f)
  return () => listeners.delete(f)
}
export const canPromptInstall = () => !!deferred
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

export async function promptInstall() {
  if (!deferred) return false
  deferred.prompt()
  await deferred.userChoice
  deferred = null
  listeners.forEach((f) => f())
  return true
}

export function registerSW() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const base = import.meta.env.BASE_URL
    window.addEventListener('load', () => navigator.serviceWorker.register(`${base}sw.js`, { scope: base }))
  }
}

// ---- Web Push (listo para conectar el Worker de Cloudflare) ----
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY

function b64ToUint8(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function enablePush(app = 'cliente') {
  if (!('Notification' in window)) throw new Error('Tu navegador no soporta notificaciones. En iPhone instala la app primero (iOS 16.4+).')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Permiso de notificaciones denegado')
  if (!VAPID || !pushSupported()) return { localOnly: true }
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID) }))
  const j = sub.toJSON()
  const { data } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: data.user.id, app, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent }, { onConflict: 'endpoint' })
  if (error) throw error
  return { subscribed: true }
}

// Notificación local (mientras la app está abierta); el push remoto llega por el Worker
export async function notifyLocal(title, body, url = '/') {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) reg.showNotification(title, { body, icon: `${import.meta.env.BASE_URL}icons/cliente-192.png`, data: { url } })
    else new Notification(title, { body })
  } catch {}
}

export function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.value = 880
    g.gain.setValueAtTime(0.15, ctx.currentTime)
    o.start()
    o.stop(ctx.currentTime + 0.25)
  } catch {}
}
