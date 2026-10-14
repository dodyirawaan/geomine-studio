import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from https://dodyirawaan.github.io/geomine-studio/
export default defineConfig({
  base: '/geomine-studio/',
  plugins: [react(), tailwindcss()],
})
