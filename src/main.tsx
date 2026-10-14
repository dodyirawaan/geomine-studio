import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'
import { VaultProvider } from './store/vault.tsx'
import { installTombstoneHooks } from './sync/dataset'

installTombstoneHooks()
if (import.meta.env.DEV) void import('./vlab/devhook')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <VaultProvider>
        <App />
      </VaultProvider>
    </HashRouter>
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${__BUILD_ID__}`).catch(() => {})
  })
}
