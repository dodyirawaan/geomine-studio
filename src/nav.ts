import { BookOpenText, Calculator, FileText, FlaskConical, Home, MessagesSquare, Settings, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  description: string
  icon: LucideIcon
  end?: boolean
}

/** Main sections, in the order of a research workflow. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Home', description: 'Overview and quick start', icon: Home, end: true },
  { to: '/manuscripts', label: 'Manuscripts', description: 'Write, check and export Q1 papers', icon: FileText },
  { to: '/literature', label: 'Literature', description: 'Search, library, matrix and Q&A', icon: BookOpenText },
  { to: '/methods', label: 'Methods', description: 'Rock-engineering calculators', icon: Calculator },
  { to: '/vlab', label: 'VLab', description: 'Machine & deep learning lab', icon: FlaskConical },
  { to: '/chat', label: 'Assistant', description: 'AI co-author chat', icon: MessagesSquare },
]

export const SETTINGS: NavItem = { to: '/settings', label: 'Settings', description: 'Keys, models, sync and backup', icon: Settings }

/** Page title for the browser tab. */
export function titleFor(path: string): string {
  if (path === '/') return 'GeoMine Studio'
  if (path.startsWith('/usage')) return 'Usage · GeoMine Studio'
  const item = [...NAV, SETTINGS].find((n) => n.to !== '/' && path.startsWith(n.to))
  return item ? `${item.label} · GeoMine Studio` : 'GeoMine Studio'
}
