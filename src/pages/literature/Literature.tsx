import { PageHeader } from '../../components/ui'
import { BookOpenText } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../../store/db'
import AskTab from './AskTab'
import LibraryTab from './LibraryTab'
import MatrixTab from './MatrixTab'
import SearchTab from './SearchTab'

const TABS = [
  { id: 'search', label: 'Search' },
  { id: 'library', label: 'Library' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'ask', label: 'Ask the library' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function LiteraturePage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'search') as TabId
  const papers = useLiveQuery(() => db.papers.orderBy('addedAt').reverse().toArray(), [])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader icon={BookOpenText} title="Literature" description="Find papers on OpenAlex, keep them in a local library with PDFs, build a literature matrix, and ask questions answered from your own sources." />
      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 text-sm dark:border-stone-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams({ tab: t.id })}
            className={`shrink-0 border-b-2 px-3 py-2 ${tab === t.id ? 'border-amber-600 font-medium' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'}`}
          >
            {t.label}
            {t.id === 'library' && papers ? ` (${papers.length})` : ''}
          </button>
        ))}
      </nav>
      {tab === 'search' && <SearchTab papers={papers ?? []} />}
      {tab === 'library' && <LibraryTab papers={papers ?? []} selected={selected} setSelected={setSelected} />}
      {tab === 'matrix' && <MatrixTab papers={papers ?? []} selected={selected} />}
      {tab === 'ask' && <AskTab papers={papers ?? []} selected={selected} />}
    </div>
  )
}
