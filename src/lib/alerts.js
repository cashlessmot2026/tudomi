import { beep } from './pwa'

// Voz del navegador en español (prefiere una voz de Colombia o Latinoamérica)
export function speak(text) {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    const u = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    u.voice = voices.find((v) => v.lang === 'es-CO') || voices.find((v) => /^es-(US|MX|419)/.test(v.lang)) || voices.find((v) => v.lang.startsWith('es')) || null
    u.lang = u.voice?.lang || 'es-CO'
    u.rate = 1
    synth.cancel()
    synth.speak(u)
  } catch {}
}

// Monto en palabras que la voz lee bien: "25.000 pesos"
export const pesos = (n) => `${Math.round(Number(n || 0)).toLocaleString('es-CO')} pesos`

export function alertNewService() {
  beep()
  setTimeout(beep, 300)
  setTimeout(() => speak('Tienes un nuevo servicio'), 650)
}

export function alertOrderReceived() {
  beep()
  setTimeout(() => speak('Pedido recibido'), 350)
}

export function alertPaymentReceived(amount) {
  beep()
  setTimeout(() => speak(`Has recibido un pago de ${pesos(amount)}`), 350)
}
