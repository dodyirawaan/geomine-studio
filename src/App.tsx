import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import ChatPage from './pages/Chat'
import Dashboard from './pages/Dashboard'
import EditorPage from './pages/Editor'
import LiteraturePage from './pages/literature/Literature'
import MethodsPage from './pages/Methods'
import WorkspacePage from './pages/workspace/Workspace'
import UsagePage from './pages/Usage'
import VLabPage from './pages/vlab/VLab'
import ExperimentPage from './pages/vlab/Experiment'
import { SyncAgent } from './components/SyncCard'
import ManuscriptsPage from './pages/Manuscripts'
import SettingsPage from './pages/Settings'
import { useVault } from './store/vault'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/manuscripts', label: 'Manuscripts', end: false },
  { to: '/literature', label: 'Literature', end: false },
  { to: '/methods', label: 'Methods', end: false },
  { to: '/vlab', label: 'VLab', end: false },
  { to: '/chat', label: 'Assistant', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

export default function App() {
  const { status } = useVault()
  const online = useOnline()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 sm:gap-4 border-b border-stone-200 bg-white/90 px-4 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <span className="font-semibold whitespace-nowrap">⛏️ <span className="hidden sm:inline">GeoMine Studio</span><span className="sm:hidden">GeoMine</span></span>
        <nav className="flex min-w-0 gap-1 overflow-x-auto text-sm">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `shrink-0 rounded px-2 py-1 sm:px-2.5 ${isActive ? 'bg-stone-200 font-medium dark:bg-stone-800' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <span className="ml-auto hidden text-xs text-stone-500 sm:inline" title="Key vault status">
          {status === 'unlocked' ? '🔓 unlocked' : status === 'locked' ? '🔒 locked' : 'no vault'}
        </span>
        {!online && (
          <span className="ml-auto rounded bg-stone-200 px-2 py-0.5 text-xs text-stone-700 sm:ml-0 dark:bg-stone-800 dark:text-stone-300" title="Writing, calculators and exports work offline; AI, search and sync need a connection">
            offline
          </span>
        )}
      </header>
      <SyncAgent />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Page><Dashboard /></Page>} />
          <Route path="/manuscripts" element={<Page><ManuscriptsPage /></Page>} />
          <Route path="/manuscripts/:id" element={<EditorPage />} />
          <Route path="/manuscripts/:id/workspace" element={<Page><WorkspacePage /></Page>} />
          <Route path="/literature" element={<Page><LiteraturePage /></Page>} />
          <Route path="/methods" element={<Page><MethodsPage /></Page>} />
          <Route path="/vlab" element={<Page><VLabPage /></Page>} />
          <Route path="/vlab/:id" element={<Page><ExperimentPage /></Page>} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:convId" element={<ChatPage />} />
          <Route path="/settings" element={<Page><SettingsPage /></Page>} />
          <Route path="/usage" element={<Page><UsagePage /></Page>} />
        </Routes>
      </main>
    </div>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="p-4 sm:p-6">{children}</div>
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
