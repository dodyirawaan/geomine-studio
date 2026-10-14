import { CloudOff, Lock, LockOpen, Menu, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Logo } from './components/Logo'
import { SyncAgent } from './components/SyncCard'
import { NAV, SETTINGS, titleFor } from './nav'
import ChatPage from './pages/Chat'
import Dashboard from './pages/Dashboard'
import EditorPage from './pages/Editor'
import LiteraturePage from './pages/literature/Literature'
import ManuscriptsPage from './pages/Manuscripts'
import MethodsPage from './pages/Methods'
import SettingsPage from './pages/Settings'
import ReviewProjectPage from './pages/review/ReviewProject'
import ReviewsPage from './pages/review/Reviews'
import UsagePage from './pages/Usage'
import ExperimentPage from './pages/vlab/Experiment'
import VLabPage from './pages/vlab/VLab'
import WorkspacePage from './pages/workspace/Workspace'
import { useVault } from './store/vault'

export default function App() {
  const location = useLocation()

  // Each page starts at the top and names the browser tab.
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = titleFor(location.pathname)
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>
      <Header />
      <SyncAgent />
      <main id="main" className="flex-1">
        <Routes>
          <Route path="/" element={<Page><Dashboard /></Page>} />
          <Route path="/manuscripts" element={<Page><ManuscriptsPage /></Page>} />
          <Route path="/manuscripts/:id" element={<EditorPage />} />
          <Route path="/manuscripts/:id/workspace" element={<Page><WorkspacePage /></Page>} />
          <Route path="/literature" element={<Page><LiteraturePage /></Page>} />
          <Route path="/reviews" element={<Page><ReviewsPage /></Page>} />
          <Route path="/reviews/:id" element={<Page><ReviewProjectPage /></Page>} />
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

function Header() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/85 backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/85">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-3 sm:px-5">
        <Link to="/" className="shrink-0 rounded-md" aria-label="GeoMine Studio home">
          <Logo size={28} compact />
        </Link>
        <nav className="ml-4 hidden items-center gap-0.5 xl:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-stone-100 font-medium text-stone-900 dark:bg-stone-800 dark:text-white'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className={`h-4 w-4 ${isActive ? 'text-amber-700 dark:text-amber-400' : 'text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-300'}`} />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <OfflineBadge />
          <VaultPill />
          <NavLink
            to={SETTINGS.to}
            title="Settings"
            aria-label="Settings"
            className={({ isActive }) =>
              `hidden h-9 w-9 items-center justify-center rounded-lg xl:flex ${isActive ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-white' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white'}`
            }
          >
            <SETTINGS.icon className="h-[18px] w-[18px]" />
          </NavLink>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 xl:hidden dark:text-stone-300 dark:hover:bg-stone-800"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 top-14 z-30 bg-stone-950/30 xl:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div id="mobile-nav" className="absolute inset-x-0 top-14 z-40 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-stone-200 bg-white p-2 shadow-lg xl:hidden dark:border-stone-800 dark:bg-stone-900">
            <nav aria-label="Main" className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-4">
              {[...NAV, SETTINGS].map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 ${isActive ? 'bg-amber-50 dark:bg-amber-950/40' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`
                  }
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    <n.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{n.label}</span>
                    <span className="block truncate text-xs text-stone-500">{n.description}</span>
                  </span>
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      )}
    </header>
  )
}

function VaultPill() {
  const { status } = useVault()
  const label = status === 'unlocked' ? 'Unlocked' : status === 'locked' ? 'Locked' : 'Set up keys'
  const Icon = status === 'unlocked' ? LockOpen : Lock
  return (
    <Link
      to="/settings"
      title={status === 'unlocked' ? 'Key vault unlocked for this session' : status === 'locked' ? 'Unlock the key vault to use AI features' : 'Create a key vault to use AI features'}
      className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${
        status === 'unlocked'
          ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300'
          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  )
}

function OfflineBadge() {
  const online = useOnline()
  if (online) return null
  return (
    <span
      className="flex h-8 items-center gap-1.5 rounded-full bg-stone-200 px-2.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300"
      title="Writing, calculators and exports work offline; AI, search and sync need a connection"
    >
      <CloudOff className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Offline</span>
    </span>
  )
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      <footer className="border-t border-stone-200 px-4 py-5 text-xs text-stone-500 sm:px-6 dark:border-stone-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} GeoMine Studio</span>
          <span>Your data stay in this browser unless you turn on sync.</span>
          <span className="ml-auto flex gap-4">
            <a className="hover:text-stone-800 dark:hover:text-stone-200" href="https://github.com/dodyirawaan/geomine-studio/blob/main/docs/VLAB.md" target="_blank" rel="noreferrer">
              VLab guide
            </a>
            <a className="hover:text-stone-800 dark:hover:text-stone-200" href="https://github.com/dodyirawaan/geomine-studio" target="_blank" rel="noreferrer">
              Source
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
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
