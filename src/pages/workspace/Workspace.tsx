import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { JOURNALS } from '../../ai/prompts'
import { db } from '../../store/db'
import CheckTab from './CheckTab'
import ChecklistTab from './ChecklistTab'
import HistoryTab from './HistoryTab'
import PipelineTab from './PipelineTab'

const TABS = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'check', label: 'Consistency check' },
  { id: 'checklist', label: 'Q1 checklist' },
  { id: 'history', label: 'History' },
] as const

export default function WorkspacePage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'pipeline'
  const m = useLiveQuery(async () => (id ? ((await db.manuscripts.get(id)) ?? null) : null), [id])

  if (m === undefined) return <p className="text-sm text-stone-500">Loading…</p>
  if (m === null)
    return (
      <p className="text-sm">
        Manuscript not found.{' '}
        <Link to="/manuscripts" className="underline">
          Back to manuscripts
        </Link>
      </p>
    )
  const journal = JOURNALS.find((j) => j.id === m.journal)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stone-500">
            <Link to="/manuscripts" className="hover:underline">
              Manuscripts
            </Link>{' '}
            / {journal?.name ?? 'No target journal'}
          </p>
          <h1 className="text-xl font-semibold">{m.title || 'Untitled manuscript'}</h1>
        </div>
        <Link
          to={`/manuscripts/${m.id}`}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
        >
          Open editor
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 text-sm dark:border-stone-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams({ tab: t.id })}
            className={`shrink-0 border-b-2 px-3 py-2 ${tab === t.id ? 'border-amber-600 font-medium' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'pipeline' && <PipelineTab m={m} />}
      {tab === 'check' && <CheckTab m={m} />}
      {tab === 'checklist' && <ChecklistTab m={m} />}
      {tab === 'history' && <HistoryTab m={m} />}
    </div>
  )
}
