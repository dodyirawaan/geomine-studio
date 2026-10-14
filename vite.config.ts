import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from https://dodyirawaan.github.io/geomine-studio/
export default defineConfig({
  base: '/geomine-studio/',
  plugins: [react(), tailwindcss()],
  // Lists every built file so the service worker can cache the whole app for offline use.
  build: { manifest: 'asset-manifest.json' },
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
})
