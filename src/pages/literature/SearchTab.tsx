import { useState, type FormEvent } from 'react'
import { Button, Card, Input, Select } from '../../components/ui'
import { addPaper, shortCite } from '../../literature/library'
import { searchWorks, type PaperMeta, type SortBy } from '../../literature/openalex'
import type { Paper } from '../../store/db'
import { useVault } from '../../store/vault'

const PRESETS = [
  'rockburst prediction machine learning',
  'microseismic monitoring deep mine',
  'dynamic ground support yielding rockbolt',
  'strainburst numerical modelling',
  'tunnel convergence deep learning',
  'Hoek-Brown GSI rock mass',
  'infrared radiation rock failure precursor',
  'acoustic emission infrared coal damage',
  'water-conserving mining aquifer protection',
  'water-conducting fractured zone height prediction',
  'CO2 mineralization fly ash backfill',
  'critical slowing down rock failure',
]

export default function SearchTab({ papers }: { papers: Paper[] }) {
  const { secrets } = useVault()
  const thisYear = new Date().getFullYear()
  const [query, setQuery] = useState('')
  const [fromYear, setFromYear] = useState(String(thisYear - 10))
  const [toYear, setToYear] = useState('')
  const [sort, setSort] = useState<SortBy>('relevance')
  const [articlesOnly, setArticlesOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<{ total: number; works: PaperMeta[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const inLibrary = new Set(papers.flatMap((p) => [p.doi, p.openalexId].filter(Boolean) as string[]))

  async function search(p = 1, q = query) {
    if (!q.trim()) return
    setBusy(true)
    setError('')
    try {
      setResult(
        await searchWorks({
          query: q,
          fromYear: Number(fromYear) || undefined,
          toYear: Number(toYear) || undefined,
          sort,
          articlesOnly,
          page: p,
          apiKey: secrets.openalexKey,
        }),
      )
      setPage(p)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    search(1)
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keywords in title or abstract, e.g. rockburst intensity classification XGBoost" />
            <Button type="submit" disabled={busy || !query.trim()}>
              {busy ? 'Searching…' : 'Search'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-stone-500">Years</span>
            <Input value={fromYear} onChange={(e) => setFromYear(e.target.value)} className="w-20" placeholder="from" inputMode="numeric" />
            <span>–</span>
            <Input value={toYear} onChange={(e) => setToYear(e.target.value)} className="w-20" placeholder="to" inputMode="numeric" />
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortBy)} className="w-auto">
              <option value="relevance">Most relevant</option>
              <option value="cited">Most cited</option>
              <option value="recent">Newest</option>
            </Select>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={articlesOnly} onChange={(e) => setArticlesOnly(e.target.checked)} />
              Journal articles & reviews only
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setQuery(p)
                  search(1, p)
                }}
                className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                {p}
              </button>
            ))}
          </div>
        </form>
      </Card>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40">{error}</p>}

      {result && (
        <div className="space-y-2">
          <p className="text-sm text-stone-500">
            {result.total.toLocaleString()} results · page {page} of {Math.max(1, Math.ceil(result.total / 25))}
            {' · '}source: OpenAlex
          </p>
          {result.works.map((w) => (
            <ResultRow key={w.openalexId ?? w.doi ?? w.title} w={w} added={inLibrary.has(w.doi ?? '') || inLibrary.has(w.openalexId ?? '')} />
          ))}
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" disabled={busy || page <= 1} onClick={() => search(page - 1)}>
              ← Previous
            </Button>
            <Button variant="ghost" disabled={busy || page * 25 >= result.total} onClick={() => search(page + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultRow({ w, added }: { w: PaperMeta; added: boolean }) {
  const [state, setState] = useState<'idle' | 'adding' | 'added'>(added ? 'added' : 'idle')
  const done = added || state === 'added'
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <a href={w.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
            {w.title}
          </a>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {shortCite(w)} · <span className="italic">{w.venue ?? 'unknown venue'}</span>
            {w.citedBy !== undefined && <> · cited by {w.citedBy.toLocaleString()}</>}
            {w.oaUrl && (
              <>
                {' · '}
                <a href={w.oaUrl} target="_blank" rel="noreferrer" className="text-green-700 underline dark:text-green-500">
                  open access PDF
                </a>
              </>
            )}
          </p>
          {w.abstract && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-xs text-stone-500">Abstract</summary>
              <p className="mt-1 text-stone-700 dark:text-stone-300">{w.abstract}</p>
            </details>
          )}
        </div>
        <Button
          variant={done ? 'ghost' : 'primary'}
          className="shrink-0 self-start text-xs"
          disabled={done || state === 'adding'}
          onClick={async () => {
            setState('adding')
            await addPaper(w)
            setState('added')
          }}
        >
          {done ? '✓ In library' : state === 'adding' ? 'Adding…' : '+ Add'}
        </Button>
      </div>
    </div>
  )
}
