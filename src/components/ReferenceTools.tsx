import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { paperToBibtex, setBibField } from '../literature/bib'
import { verifyEntry, type VerifyResult, type VerifyStatus } from '../literature/crossref'
import { shortCite } from '../literature/library'
import type { BibEntry } from '../manuscript/bibtex'
import { db, type Paper } from '../store/db'
import { Button, Input } from './ui'

function append(bibtex: string, papers: Paper[]): string {
  const add = papers.map(paperToBibtex).join('\n\n')
  return bibtex.trim() ? `${bibtex.trimEnd()}\n\n${add}\n` : `${add}\n`
}

/** Adds library papers to a manuscript's BibTeX. */
export function LibraryImport({ bibtex, entries, missing, onChange }: { bibtex: string; entries: BibEntry[]; missing: string[]; onChange: (bib: string) => void }) {
  const papers = useLiveQuery(() => db.papers.orderBy('addedAt').reverse().toArray(), [])
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  if (!papers) return null

  const keys = new Set(entries.map((e) => e.key))
  const dois = new Set(entries.map((e) => e.fields.doi?.toLowerCase()).filter(Boolean))
  const available = papers.filter((p) => !keys.has(p.bibKey) && !(p.doi && dois.has(p.doi)))
  const f = filter.trim().toLowerCase()
  const shown = available.filter((p) => !f || `${p.title} ${p.authors.join(' ')} ${p.year} ${p.bibKey} ${p.tags.join(' ')}`.toLowerCase().includes(f))
  const fixable = papers.filter((p) => missing.includes(p.bibKey) && !keys.has(p.bibKey))

  return (
    <details className="rounded-md border border-stone-200 p-3 dark:border-stone-800" open={fixable.length > 0}>
      <summary className="cursor-pointer text-sm font-medium">
        Add from literature library <span className="font-normal text-stone-500">({available.length} not yet in this manuscript)</span>
      </summary>
      {!papers.length ? (
        <p className="mt-2 text-xs text-stone-500">
          Your library is empty —{' '}
          <Link to="/literature" className="underline">
            search and add papers
          </Link>{' '}
          first.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {fixable.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded bg-amber-50 p-2 text-xs dark:bg-amber-950/40">
              {fixable.length} cited key{fixable.length === 1 ? ' is' : 's are'} in your library: {fixable.map((p) => `@${p.bibKey}`).join(', ')}
              <Button className="text-xs" onClick={() => onChange(append(bibtex, fixable))}>
                Add {fixable.length === 1 ? 'it' : 'them'}
              </Button>
            </div>
          )}
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter library…" />
          <ul className="max-h-64 overflow-y-auto text-sm">
            {shown.map((p) => (
              <li key={p.id}>
                <label className="flex gap-2 rounded px-1 py-1 hover:bg-stone-100 dark:hover:bg-stone-800">
                  <input
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={() => {
                      const next = new Set(picked)
                      if (next.has(p.id)) next.delete(p.id)
                      else next.add(p.id)
                      setPicked(next)
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    {p.title}
                    <span className="block text-xs text-stone-500">
                      {shortCite(p)} · @{p.bibKey}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            disabled={!picked.size}
            onClick={() => {
              onChange(append(bibtex, papers.filter((p) => picked.has(p.id))))
              setPicked(new Set())
            }}
          >
            Add {picked.size || ''} to references
          </Button>
        </div>
      )}
    </details>
  )
}

const STATUS: Record<VerifyStatus, { label: string; cls: string }> = {
  verified: { label: 'Verified', cls: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' },
  suggested: { label: 'DOI found', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  mismatch: { label: 'Mismatch', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  'doi-not-found': { label: 'Bad DOI', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  'not-found': { label: 'Not found', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  error: { label: 'Error', cls: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300' },
}

/** Checks every BibTeX entry against Crossref, to catch invented or mistyped references before submission. */
export function VerifyReferences({ bibtex, entries, onChange }: { bibtex: string; entries: BibEntry[]; onChange: (bib: string) => void }) {
  const [results, setResults] = useState<VerifyResult[]>([])
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const stopRef = useRef(false)

  async function run() {
    setBusy(true)
    stopRef.current = false
    setResults([])
    for (const [i, e] of entries.entries()) {
      if (stopRef.current) break
      setProgress(`Checking ${i + 1}/${entries.length}: ${e.key}`)
      const r = await verifyEntry(e)
      setResults((prev) => [...prev, r])
    }
    setProgress(stopRef.current ? 'Stopped.' : '')
    setBusy(false)
  }

  const counts = results.reduce<Partial<Record<VerifyStatus, number>>>((c, r) => ({ ...c, [r.status]: (c[r.status] ?? 0) + 1 }), {})

  return (
    <div className="space-y-2 rounded-md border border-stone-200 p-3 dark:border-stone-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Verify references</span>
        <span className="text-xs text-stone-500">Checks each DOI, title, year and first author against Crossref.</span>
        {busy ? (
          <Button variant="danger" className="ml-auto text-xs" onClick={() => (stopRef.current = true)}>
            Stop
          </Button>
        ) : (
          <Button variant="ghost" className="ml-auto text-xs" disabled={!entries.length} onClick={run}>
            Verify {entries.length} entries
          </Button>
        )}
      </div>
      {progress && <p className="text-xs text-stone-500">{progress}</p>}
      {results.length > 0 && (
        <>
          <p className="flex flex-wrap gap-1.5 text-xs">
            {(Object.keys(counts) as VerifyStatus[]).map((s) => (
              <span key={s} className={`rounded px-1.5 py-0.5 ${STATUS[s].cls}`}>
                {STATUS[s].label}: {counts[s]}
              </span>
            ))}
          </p>
          <ul className="space-y-1.5 text-xs">
            {results
              .filter((r) => r.status !== 'verified')
              .map((r) => (
                <li key={r.key} className="rounded border border-stone-200 p-2 dark:border-stone-800">
                  <span className={`mr-2 rounded px-1.5 py-0.5 ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  <code>@{r.key}</code> — {r.note}
                  {r.found && (
                    <span className="mt-1 block text-stone-500">
                      Crossref: {r.found.authors} ({r.found.year ?? 'n.d.'}). {r.found.title}. <i>{r.found.venue}</i>
                      {r.doi && <> · doi:{r.doi}</>}
                    </span>
                  )}
                  {r.status === 'suggested' && r.doi && (
                    <Button
                      variant="ghost"
                      className="mt-1 text-xs"
                      onClick={() => {
                        onChange(setBibField(bibtex, r.key, 'doi', r.doi!))
                        setResults((prev) => prev.map((x) => (x.key === r.key ? { ...x, status: 'verified', note: 'DOI added.' } : x)))
                      }}
                    >
                      Add this DOI to the entry
                    </Button>
                  )}
                </li>
              ))}
          </ul>
          {!busy && results.every((r) => r.status === 'verified') && <p className="text-xs text-green-700">All entries verified.</p>}
        </>
      )}
    </div>
  )
}
