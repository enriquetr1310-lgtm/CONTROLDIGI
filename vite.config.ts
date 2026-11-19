import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Rutas relativas: funciona en https://usuario.github.io/CONTROLDIGI/ y en cualquier otro hosting
  base: './',
  plugins: [react(), tailwindcss()],
})
