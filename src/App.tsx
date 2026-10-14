import { NavLink, Route, Routes } from 'react-router-dom'
import ChatPage from './pages/Chat'
import Dashboard from './pages/Dashboard'
import EditorPage from './pages/Editor'
import ManuscriptsPage from './pages/Manuscripts'
import SettingsPage from './pages/Settings'
import { useVault } from './store/vault'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/manuscripts', label: 'Manuscripts', end: false },
  { to: '/chat', label: 'Assistant', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

export default function App() {
  const { status } = useVault()
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
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Page><Dashboard /></Page>} />
          <Route path="/manuscripts" element={<Page><ManuscriptsPage /></Page>} />
          <Route path="/manuscripts/:id" element={<EditorPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:convId" element={<ChatPage />} />
          <Route path="/settings" element={<Page><SettingsPage /></Page>} />
        </Routes>
      </main>
    </div>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="p-4 sm:p-6">{children}</div>
}
