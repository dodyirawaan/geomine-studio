import { Bot, Check, ExternalLink, HelpCircle, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildSystemPrompt, type JournalId } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { Badge, Button, Card, Input, Select } from '../../components/ui'
import type { Save } from '../../review/project'
import { parseScreening, screeningRequest } from '../../review/prompts'
import type { Decision, ReviewProject, ReviewRecord } from '../../review/types'

const PAGE = 25
type Filter = 'todo' | 'maybe' | 'include' | 'exclude' | 'ai-include' | 'ai-exclude' | 'all'

const FT_REASONS = ['Not underground mining / rock', 'No original data or method', 'Outcome not reported', 'Full text not available', 'Not in English', 'Duplicate publication']

/** Short codes of the exclusion criteria ("E1", "E2", …) with their text, for one-click reasons. */
function exclusionCodes(p: ReviewProject): { code: string; text: string }[] {
  return p.protocol.exclusion.map((e, i) => ({ code: `E${i + 1}`, text: e.replace(/^E\d+[:.)]?\s*/, '') }))
}

export function ScreeningTab({ p, save }: { p: ReviewProject; save: Save }) {
  const llm = useLLM()
  const [filter, setFilter] = useState<Filter>('todo')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const stop = useRef(false)
  const codes = exclusionCodes(p)

  const shown = useMemo(() => {
    const f = q.trim().toLowerCase()
    return p.records.filter((r) => {
      if (f && !`${r.meta.title} ${r.meta.abstract ?? ''}`.toLowerCase().includes(f)) return false
      switch (filter) {
        case 'todo':
          return !r.ta
        case 'maybe':
          return r.ta === 'maybe'
        case 'include':
          return r.ta === 'include'
        case 'exclude':
          return r.ta === 'exclude'
        case 'ai-include':
          return !r.ta && r.ai?.decision === 'include'
        case 'ai-exclude':
          return !r.ta && r.ai?.decision === 'exclude'
        default:
          return true
      }
    })
  }, [p.records, filter, q])
  const pageItems = shown.slice(page * PAGE, page * PAGE + PAGE)

  const decide = (id: string, ta: Decision, taReason = '') =>
    save((cur) => ({ records: cur.records.map((r) => (r.id === id ? { ...r, ta, taReason, ...(ta !== 'include' ? { ft: undefined, ftReason: undefined } : {}) } : r)) }))

  // Keyboard: I include, E exclude (first criterion if none chosen), M maybe, ↑/↓ move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const r = pageItems[active]
      if (e.key === 'ArrowDown' || e.key === 'j') setActive((a) => Math.min(pageItems.length - 1, a + 1))
      else if (e.key === 'ArrowUp' || e.key === 'k') setActive((a) => Math.max(0, a - 1))
      else if (r && e.key === 'i') void decide(r.id, 'include')
      else if (r && e.key === 'm') void decide(r.id, 'maybe')
      else if (r && e.key === 'e') void decide(r.id, 'exclude', r.ai?.decision === 'exclude' ? r.ai.reason : (codes[0]?.code ?? 'Excluded'))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function suggest() {
    const todo = p.records.filter((r) => !r.ta && !r.ai)
    if (!todo.length) return
    setBusy(true)
    setError('')
    stop.current = false
    const size = 12
    try {
      for (let i = 0; i < todo.length && !stop.current; i += size) {
        const batch = todo.slice(i, i + size)
        setProgress(`AI screening ${Math.min(i + size, todo.length)} of ${todo.length}…`)
        const { text } = await llm.run(buildSystemPrompt('literature', p.journal as JournalId), screeningRequest(p.protocol, batch), { feature: 'Review: screening' })
        const out = parseScreening(text)
        await save((cur) => ({ records: cur.records.map((r) => (out[r.id] ? { ...r, ai: out[r.id] } : r)) }))
      }
      setProgress(stop.current ? 'Stopped.' : 'Suggestions ready — review them below.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function acceptAi(kind: 'include' | 'exclude') {
    const n = p.records.filter((r) => !r.ta && r.ai?.decision === kind).length
    if (!window.confirm(`Apply the AI's "${kind}" suggestion to ${n} unscreened record(s)? You remain responsible for every decision; spot-check them first.`)) return
    await save((cur) => ({ records: cur.records.map((r) => (!r.ta && r.ai?.decision === kind ? { ...r, ta: kind, taReason: r.ai.reason } : r)) }))
  }

  const counts = {
    todo: p.records.filter((r) => !r.ta).length,
    maybe: p.records.filter((r) => r.ta === 'maybe').length,
    include: p.records.filter((r) => r.ta === 'include').length,
    exclude: p.records.filter((r) => r.ta === 'exclude').length,
    aiInc: p.records.filter((r) => !r.ta && r.ai?.decision === 'include').length,
    aiExc: p.records.filter((r) => !r.ta && r.ai?.decision === 'exclude').length,
    noAi: p.records.filter((r) => !r.ta && !r.ai).length,
  }

  return (
    <div className="space-y-4">
      <Card title="Title and abstract screening">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Decide each record against the criteria. The AI can propose a decision with the criterion it applied; nothing is decided until you accept it.
          Keyboard: <kbd className="rounded border px-1 text-xs">I</kbd> include · <kbd className="rounded border px-1 text-xs">E</kbd> exclude ·{' '}
          <kbd className="rounded border px-1 text-xs">M</kbd> maybe · <kbd className="rounded border px-1 text-xs">↑</kbd>/<kbd className="rounded border px-1 text-xs">↓</kbd> move.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {busy ? (
            <Button variant="danger" onClick={() => (stop.current = true)}>
              Stop
            </Button>
          ) : (
            <Button variant="ghost" disabled={!llm.ready || !counts.noAi || !p.protocol.inclusion.length} onClick={suggest}>
              <Bot className="h-4 w-4" /> AI suggestions for {counts.noAi} record{counts.noAi === 1 ? '' : 's'}
            </Button>
          )}
          {counts.aiInc > 0 && (
            <Button variant="subtle" className="text-xs" onClick={() => acceptAi('include')}>
              Accept {counts.aiInc} AI includes
            </Button>
          )}
          {counts.aiExc > 0 && (
            <Button variant="subtle" className="text-xs" onClick={() => acceptAi('exclude')}>
              Accept {counts.aiExc} AI excludes
            </Button>
          )}
          <span className="text-xs text-stone-500">{progress || llm.missing}</span>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onChange={(e) => (setFilter(e.target.value as Filter), setPage(0), setActive(0))} className="w-auto">
          <option value="todo">To screen ({counts.todo})</option>
          <option value="ai-include">To screen — AI says include ({counts.aiInc})</option>
          <option value="ai-exclude">To screen — AI says exclude ({counts.aiExc})</option>
          <option value="maybe">Maybe ({counts.maybe})</option>
          <option value="include">Included ({counts.include})</option>
          <option value="exclude">Excluded ({counts.exclude})</option>
          <option value="all">All ({p.records.length})</option>
        </Select>
        <Input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Filter by words in title or abstract" className="min-w-0 flex-1" />
      </div>

      {!shown.length ? (
        <p className="text-sm text-stone-500">{p.records.length ? 'Nothing in this view.' : 'Run the search first.'}</p>
      ) : (
        <ul className="space-y-2">
          {pageItems.map((r, i) => (
            <RecordCard key={r.id} r={r} active={i === active} onFocus={() => setActive(i)} codes={codes} onDecide={(d, reason) => decide(r.id, d, reason)} />
          ))}
        </ul>
      )}
      {shown.length > PAGE && (
        <div className="flex items-center gap-2 text-sm">
          <Button variant="ghost" disabled={page === 0} onClick={() => (setPage(page - 1), setActive(0))}>
            ← Previous
          </Button>
          <span className="text-stone-500">
            {page * PAGE + 1}–{Math.min(shown.length, page * PAGE + PAGE)} of {shown.length}
          </span>
          <Button variant="ghost" disabled={(page + 1) * PAGE >= shown.length} onClick={() => (setPage(page + 1), setActive(0))}>
            Next →
          </Button>
        </div>
      )}
    </div>
  )
}

function RecordCard({ r, active, onFocus, codes, onDecide }: { r: ReviewRecord; active: boolean; onFocus: () => void; codes: { code: string; text: string }[]; onDecide: (d: Decision, reason?: string) => void }) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  const tone = r.ta === 'include' ? 'border-green-300 dark:border-green-900' : r.ta === 'exclude' ? 'border-stone-200 opacity-70 dark:border-stone-800' : r.ta === 'maybe' ? 'border-amber-300 dark:border-amber-900' : 'border-stone-200 dark:border-stone-800'
  return (
    <li ref={ref} onClick={onFocus} className={`rounded-xl border bg-white p-3.5 text-sm dark:bg-stone-900 ${tone} ${active ? 'ring-2 ring-amber-500/50' : ''}`}>
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 font-medium">{r.meta.title}</p>
        {r.ta && <Badge tone={r.ta === 'include' ? 'green' : r.ta === 'exclude' ? 'red' : 'amber'}>{r.ta}</Badge>}
      </div>
      <p className="mt-0.5 text-xs text-stone-500">
        {r.meta.authors.slice(0, 3).join(', ')}
        {r.meta.authors.length > 3 ? ' et al.' : ''} · {r.meta.year ?? 'n.d.'} · <i>{r.meta.venue ?? '—'}</i>
        {r.meta.url && (
          <a href={r.meta.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 hover:text-stone-800 dark:hover:text-stone-200" onClick={(e) => e.stopPropagation()}>
            <ExternalLink className="h-3 w-3" /> source
          </a>
        )}
      </p>
      <p className={`mt-2 text-stone-700 dark:text-stone-300 ${active ? '' : 'line-clamp-3'}`}>{r.meta.abstract ?? <span className="text-stone-400">No abstract available — decide from the title or open the source.</span>}</p>
      {r.ai && !r.ta && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-stone-50 p-2 text-xs dark:bg-stone-800/60">
          <Bot className="h-3.5 w-3.5 shrink-0 text-stone-500" />
          <span>
            AI suggests <b>{r.ai.decision}</b>: {r.ai.reason}
          </span>
        </p>
      )}
      {r.taReason && r.ta !== 'include' && <p className="mt-1 text-xs text-stone-500">Reason: {r.taReason}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Button variant={r.ta === 'include' ? 'primary' : 'ghost'} className="min-h-8 text-xs" onClick={() => onDecide('include', r.ai?.decision === 'include' ? r.ai.reason : '')}>
          <Check className="h-3.5 w-3.5" /> Include
        </Button>
        <Button variant="ghost" className="min-h-8 text-xs" onClick={() => onDecide('maybe')}>
          <HelpCircle className="h-3.5 w-3.5" /> Maybe
        </Button>
        <span className="mx-1 text-xs text-stone-400">Exclude:</span>
        {codes.map((c) => (
          <button
            key={c.code}
            title={c.text}
            onClick={() => onDecide('exclude', `${c.code}: ${c.text}`)}
            className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-xs ${r.ta === 'exclude' && r.taReason?.startsWith(c.code) ? 'border-red-400 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300' : 'border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800'}`}
          >
            <X className="h-3 w-3" /> {c.code}
          </button>
        ))}
        {!codes.length && (
          <Button variant="ghost" className="min-h-8 text-xs" onClick={() => onDecide('exclude', 'Excluded')}>
            <X className="h-3.5 w-3.5" /> Exclude
          </Button>
        )}
      </div>
    </li>
  )
}

export function FullTextTab({ p, save }: { p: ReviewProject; save: Save }) {
  const list = p.records.filter((r) => r.ta === 'include')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const set = (id: string, ft: 'include' | 'exclude' | undefined, ftReason = '') => save((cur) => ({ records: cur.records.map((r) => (r.id === id ? { ...r, ft, ftReason } : r)) }))
  return (
    <div className="space-y-4">
      <Card title="Full-text eligibility">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Open each report (DOI or open-access link) and confirm it meets all criteria. Record a reason for every exclusion — it appears in the PRISMA diagram. Attach PDFs later in the
          Library for full-text extraction.
        </p>
      </Card>
      {!list.length ? (
        <p className="text-sm text-stone-500">No records were included at title and abstract screening yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className={`rounded-xl border bg-white p-3.5 text-sm dark:bg-stone-900 ${r.ft === 'include' ? 'border-green-300 dark:border-green-900' : r.ft === 'exclude' ? 'border-stone-200 opacity-70 dark:border-stone-800' : 'border-stone-200 dark:border-stone-800'}`}>
              <div className="flex flex-wrap items-start gap-2">
                <p className="min-w-0 flex-1 font-medium">{r.meta.title}</p>
                {r.ft && <Badge tone={r.ft === 'include' ? 'green' : 'red'}>{r.ft}</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-stone-500">
                {r.meta.authors[0] ?? ''} {r.meta.authors.length > 1 ? 'et al.' : ''} · {r.meta.year} · <i>{r.meta.venue}</i>
                {r.meta.doi && (
                  <a className="ml-2 underline" href={`https://doi.org/${r.meta.doi}`} target="_blank" rel="noreferrer">
                    DOI
                  </a>
                )}
                {r.meta.oaUrl && (
                  <a className="ml-2 text-green-700 underline dark:text-green-500" href={r.meta.oaUrl} target="_blank" rel="noreferrer">
                    open access
                  </a>
                )}
              </p>
              {r.ft === 'exclude' && <p className="mt-1 text-xs text-stone-500">Reason: {r.ftReason}</p>}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Button variant={r.ft === 'include' ? 'primary' : 'ghost'} className="min-h-8 text-xs" onClick={() => set(r.id, 'include')}>
                  <Check className="h-3.5 w-3.5" /> Eligible
                </Button>
                <Select value="" onChange={(e) => e.target.value && set(r.id, 'exclude', e.target.value)} className="min-h-8 w-auto text-xs">
                  <option value="">Exclude because…</option>
                  {FT_REASONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
                <Input value={custom[r.id] ?? ''} onChange={(e) => setCustom({ ...custom, [r.id]: e.target.value })} placeholder="other reason" className="min-h-8 w-44 text-xs" />
                <Button variant="ghost" className="min-h-8 text-xs" disabled={!custom[r.id]?.trim()} onClick={() => set(r.id, 'exclude', custom[r.id].trim())}>
                  Exclude
                </Button>
                {r.ft && (
                  <Button variant="subtle" className="min-h-8 text-xs" onClick={() => set(r.id, undefined)}>
                    Undo
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
