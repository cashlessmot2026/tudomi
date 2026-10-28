// Genera los íconos PNG de las 3 apps (cliente, negocio, domi) a partir de un SVG
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const APPS = {
  cliente: ['#ff4d2e', '#ffae1a'],
  negocio: ['#a855f7', '#ec4899'],
  domi: ['#22c55e', '#a3e635'],
}

const svg = ([a, b], pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#07070d"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
    <rect x="40" y="40" width="432" height="432" rx="100" fill="url(#g)"/>
    <path d="M256 104c-68 0-122 53-122 120 0 90 122 190 122 190s122-100 122-190c0-67-54-120-122-120z" fill="#fff"/>
    <circle cx="256" cy="222" r="50" fill="url(#g)"/>
  </g>
</svg>`

mkdirSync('public/icons', { recursive: true })
for (const [app, colors] of Object.entries(APPS)) {
  for (const size of [180, 192, 512]) {
    await sharp(Buffer.from(svg(colors))).resize(size, size).png().toFile(`public/icons/${app}-${size}.png`)
  }
  await sharp(Buffer.from(svg(colors, 56))).resize(512, 512).png().toFile(`public/icons/${app}-maskable-512.png`)
}
console.log('Íconos generados en public/icons')
