import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH=/tudomi/ para GitHub Pages; "/" para Cloudflare Pages, Vercel o dominio propio
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
})
