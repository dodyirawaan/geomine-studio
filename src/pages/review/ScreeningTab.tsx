import { Bot, Check, ExternalLink, HelpCircle, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { explainError } from '../../ai/errors'
import { buildTaskPrompt } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { TaskModel } from '../../components/TaskModel'
import { Badge, Button, Card, Input, Select } from '../../components/ui'
import type { Save } from '../../review/project'
import { castVote, isConflict, resolveConflict, vote, type Reviewer } from '../../review/dual'
import { eligibilityRequest, parseEligibility, parseScreening, screeningRequest } from '../../review/prompts'
import type { Decision, ReviewProject, ReviewRecord } from '../../review/types'
import { buildFeatures, relevant, scoreRecords } from '../../review/prioritise'
import { DualCard } from './DualCard'
import { db } from '../../store/db'
import { ExchangeCard, PrioritiseCard } from './ScreeningAids'

const PAGE = 25
type Filter = 'todo' | 'conflicts' | 'check' | 'maybe' | 'include' | 'exclude' | 'ai-include' | 'ai-exclude' | 'all'

const FT_REASONS = ['Not underground mining / rock', 'No original data or method', 'Outcome not reported', 'Full text not available', 'Not in English', 'Duplicate publication']

/** Short codes of the exclusion criteria ("E1", "E2", …) with their text, for one-click reasons. */
function exclusionCodes(p: ReviewProject): { code: string; text: string }[] {
  return p.protocol.exclusion.map((e, i) => ({ code: `E${i + 1}`, text: e.replace(/^E\d+[:.)]?\s*/, '') }))
}

export function ScreeningTab({ p, save }: { p: ReviewProject; save: Save }) {
  const llm = useLLM('screening')
  const [filter, setFilter] = useState<Filter>('todo')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const stop = useRef(false)
  const ctrl = useRef<AbortController | null>(null)
  const codes = exclusionCodes(p)
  const dual = p.dual?.enabled ? p.dual : undefined
  const me: Reviewer = dual?.active ?? 1
  /** The decision of whoever is screening now: the active reviewer's vote in dual mode, else the final decision. */
  const mine = (r: ReviewRecord) => (dual ? vote(r, me) : r.ta)

  // Active learning: features are rebuilt only when the set of records changes, the model after every decision.
  const prioritised = !!p.aids?.prioritised
  const recordKey = p.records.map((r) => r.id).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const features = useMemo(() => (prioritised ? buildFeatures(p.records) : null), [prioritised, recordKey])
  const decisionKey = p.records.map((r) => (r.auto ? '' : (mine(r) ?? ''))).join('|')
  const model = useMemo(() => {
    if (!features) return null
    const labels = new Map<string, Decision>()
    for (const r of p.records) {
      const d = !r.auto && mine(r)
      if (d) labels.set(r.id, d)
    }
    const scores = scoreRecords(features, labels)
    const ls = [...labels.values()]
    return { scores, trained: scores ? { relevant: ls.filter(relevant).length, irrelevant: ls.filter((d) => !relevant(d)).length } : null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, decisionKey])
  const scores = model?.scores ?? null

  const shown = useMemo(() => {
    const f = q.trim().toLowerCase()
    const list = p.records.filter((r) => {
      if (f && !`${r.meta.title} ${r.meta.abstract ?? ''}`.toLowerCase().includes(f)) return false
      switch (filter) {
        case 'todo':
          return !mine(r)
        case 'conflicts':
          return isConflict(r)
        case 'check':
          return !!r.check && !mine(r)
        case 'maybe':
          return r.ta === 'maybe'
        case 'include':
          return r.ta === 'include'
        case 'exclude':
          return r.ta === 'exclude'
        case 'ai-include':
          return !mine(r) && r.ai?.decision === 'include'
        case 'ai-exclude':
          return !mine(r) && r.ai?.decision === 'exclude'
        default:
          return true
      }
    })
    if (!scores || !['todo', 'ai-include', 'ai-exclude'].includes(filter)) return list
    return [...list].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.records, filter, q, dual?.enabled, me, scores])
  const pageItems = shown.slice(page * PAGE, page * PAGE + PAGE)

  const decide = (id: string, ta: Decision, taReason = '') =>
    save((cur) => ({
      records: cur.records.map((r) =>
        r.id !== id
          ? r
          : cur.dual?.enabled
            ? castVote(r, cur.dual.active, ta, taReason)
            : { ...r, ta, taReason, auto: undefined, decidedAt: Date.now(), ...(ta !== 'include' ? { ft: undefined, ftReason: undefined } : {}) },
      ),
    }))
  const resolve = (id: string, d: Decision, reason: string) => save((cur) => ({ records: cur.records.map((r) => (r.id === id ? resolveConflict(r, d, reason) : r)) }))

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

  /** AI suggestions for records without one; `again` also redoes the suggestions of records still undecided (e.g. with another model). */
  async function suggest(again = false) {
    const todo = p.records.filter((r) => (again ? !mine(r) : !r.ai && (p.dual?.enabled || !r.ta)))
    if (!todo.length) return
    setBusy(true)
    setError('')
    stop.current = false
    ctrl.current = new AbortController()
    // Larger batches mean fewer requests, which matters on free tiers that count requests per minute and per day.
    const size = 20
    try {
      for (let i = 0; i < todo.length && !stop.current; i += size) {
        const batch = todo.slice(i, i + size)
        const label = `AI screening ${Math.min(i + size, todo.length)} of ${todo.length}…`
        setProgress(label)
        const { text } = await llm.run(buildTaskPrompt(), screeningRequest(p.protocol, batch), {
          feature: 'Review: screening',
          light: true,
          signal: ctrl.current.signal,
          onWait: (s) => setProgress(s ? `Provider rate limit — waiting ${s} s, then continuing (${label.replace('…', '')})` : label),
        })
        const out = parseScreening(text)
        await save((cur) => ({ records: cur.records.map((r) => (out[r.id] ? { ...r, ai: out[r.id] } : r)) }))
      }
      setProgress(stop.current ? 'Stopped.' : 'Suggestions ready — review them below.')
    } catch (e) {
      if ((e as Error).name === 'AbortError') setProgress('Stopped.')
      else setError(explainError(e))
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
    todo: p.records.filter((r) => !mine(r)).length,
    conflicts: p.records.filter(isConflict).length,
    maybe: p.records.filter((r) => r.ta === 'maybe').length,
    include: p.records.filter((r) => r.ta === 'include').length,
    exclude: p.records.filter((r) => r.ta === 'exclude').length,
    aiInc: p.records.filter((r) => !mine(r) && r.ai?.decision === 'include').length,
    aiExc: p.records.filter((r) => !mine(r) && r.ai?.decision === 'exclude').length,
    noAi: p.records.filter((r) => !r.ai && (dual || !r.ta)).length,
    undecided: p.records.filter((r) => !mine(r)).length,
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
            <Button variant="danger" onClick={() => ((stop.current = true), ctrl.current?.abort())}>
              Stop
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={!llm.ready || !counts.noAi || !p.protocol.inclusion.length} onClick={() => suggest()}>
                <Bot className="h-4 w-4" /> AI suggestions for {counts.noAi} record{counts.noAi === 1 ? '' : 's'}
              </Button>
              {!counts.noAi && counts.undecided > 0 && (
                <Button
                  variant="subtle"
                  className="text-xs"
                  disabled={!llm.ready || !p.protocol.inclusion.length}
                  onClick={() => window.confirm(`Ask the AI again for the ${counts.undecided} undecided records? Their current suggestions are replaced.`) && suggest(true)}
                >
                  Ask again for {counts.undecided} undecided
                </Button>
              )}
            </>
          )}
          {!dual && counts.aiInc > 0 && (
            <Button variant="subtle" className="text-xs" onClick={() => acceptAi('include')}>
              Accept {counts.aiInc} AI includes
            </Button>
          )}
          {!dual && counts.aiExc > 0 && (
            <Button variant="subtle" className="text-xs" onClick={() => acceptAi('exclude')}>
              Accept {counts.aiExc} AI excludes
            </Button>
          )}
          <span className="text-xs text-stone-500">
            {busy
              ? progress
              : !p.protocol.inclusion.length
                ? 'Add inclusion criteria in the Protocol step to get AI suggestions.'
                : llm.missing ||
                  progress ||
                  (!counts.noAi ? (counts.undecided ? 'Every undecided record already has an AI suggestion — filter “AI says include/exclude” below.' : 'All records are decided.') : '')}
          </span>
        </div>
        <TaskModel llm={llm} className="mt-2" />
        {error && <p className="mt-2 whitespace-pre-line text-sm text-red-700">{error}</p>}
        {dual && <p className="mt-2 text-xs text-stone-500">With two reviewers, AI suggestions stay hidden on a record until the active reviewer has decided it, so they cannot influence the independent decision.</p>}
      </Card>

      <PrioritiseCard p={p} save={save} trained={model?.trained ?? null} />
      <DualCard p={p} save={save} aiLabel={llm.label} />
      <ExchangeCard p={p} save={save} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onChange={(e) => (setFilter(e.target.value as Filter), setPage(0), setActive(0))} className="w-auto">
          <option value="todo">{dual ? `To screen by ${dual.names[me - 1]}` : 'To screen'} ({counts.todo})</option>
          {dual && <option value="conflicts">Disagreements to resolve ({counts.conflicts})</option>}
          {p.records.some((r) => r.check) && <option value="check">Random check sample ({p.records.filter((r) => r.check && !mine(r)).length} left)</option>}
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
            <RecordCard
              key={r.id}
              r={r}
              active={i === active}
              onFocus={() => setActive(i)}
              codes={codes}
              onDecide={(d, reason) => decide(r.id, d, reason)}
              dual={dual ? { me, names: dual.names } : undefined}
              onResolve={(d, reason) => resolve(r.id, d, reason)}
              score={!mine(r) ? scores?.get(r.id) : undefined}
            />
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

function RecordCard({
  r,
  active,
  onFocus,
  codes,
  onDecide,
  dual,
  onResolve,
  score,
}: {
  r: ReviewRecord
  active: boolean
  onFocus: () => void
  codes: { code: string; text: string }[]
  onDecide: (d: Decision, reason?: string) => void
  dual?: { me: Reviewer; names: [string, string] }
  onResolve: (d: Decision, reason: string) => void
  score?: number
}) {
  const mine = dual ? vote(r, dual.me) : r.ta
  const mineReason = dual ? (dual.me === 1 ? r.ta1Reason : r.ta2Reason) : r.taReason
  const other: Reviewer = dual?.me === 1 ? 2 : 1
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  const tone = r.ta === 'include' ? 'border-green-300 dark:border-green-900' : r.ta === 'exclude' ? 'border-stone-200 opacity-70 dark:border-stone-800' : r.ta === 'maybe' ? 'border-amber-300 dark:border-amber-900' : 'border-stone-200 dark:border-stone-800'
  return (
    <li ref={ref} onClick={onFocus} className={`rounded-xl border bg-white p-3.5 text-sm dark:bg-stone-900 ${tone} ${active ? 'ring-2 ring-amber-500/50' : ''}`}>
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 font-medium">{r.meta.title}</p>
        {score !== undefined && (
          <span title="Estimated probability of relevance from your decisions so far" className="rounded-md bg-stone-100 px-1.5 py-0.5 text-xs tabular-nums text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            relevance {Math.round(score * 100)}%
          </span>
        )}
        {r.check && <Badge>check sample</Badge>}
        {r.auto && <Badge>not screened (stopping rule)</Badge>}
        {dual && isConflict(r) && <Badge tone="amber">disagreement</Badge>}
        {r.ta && <Badge tone={r.ta === 'include' ? 'green' : r.ta === 'exclude' ? 'red' : 'amber'}>{dual ? `final: ${r.ta}` : r.ta}</Badge>}
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
      {r.ai && (dual ? !!mine : !r.ta) && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-stone-50 p-2 text-xs dark:bg-stone-800/60">
          <Bot className="h-3.5 w-3.5 shrink-0 text-stone-500" />
          <span>
            AI suggests <b>{r.ai.decision}</b>: {r.ai.reason}
          </span>
        </p>
      )}
      {mineReason && mine !== 'include' && <p className="mt-1 text-xs text-stone-500">Reason: {mineReason}</p>}
      {dual && mine && (
        <p className="mt-1 text-xs text-stone-500">
          {dual.names[other - 1]}: {vote(r, other) ? <b>{vote(r, other)}</b> : 'not decided yet'}
          {vote(r, other) && (other === 1 ? r.ta1Reason : r.ta2Reason) ? ` — ${other === 1 ? r.ta1Reason : r.ta2Reason}` : ''}
          {other === 2 && r.ta2Ai ? ' (AI)' : ''}
          {r.taResolved ? ' · disagreement resolved' : ''}
        </p>
      )}
      {dual && isConflict(r) && <ResolveBar r={r} names={dual.names} onResolve={onResolve} />}
      {r.via && r.via !== 'manual' && <p className="mt-1 text-xs text-stone-500">Found by {r.via} citation searching{r.links?.length ? ` · linked to ${r.links.length} included stud${r.links.length === 1 ? 'y' : 'ies'}` : ''}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Button variant={mine === 'include' ? 'primary' : 'ghost'} className="min-h-8 text-xs" onClick={() => onDecide('include', !dual && r.ai?.decision === 'include' ? r.ai.reason : '')}>
          <Check className="h-3.5 w-3.5" /> Include
        </Button>
        <Button variant={mine === 'maybe' ? 'primary' : 'ghost'} className="min-h-8 text-xs" onClick={() => onDecide('maybe')}>
          <HelpCircle className="h-3.5 w-3.5" /> Maybe
        </Button>
        <span className="mx-1 text-xs text-stone-400">Exclude:</span>
        {codes.map((c) => (
          <button
            key={c.code}
            title={c.text}
            onClick={() => onDecide('exclude', `${c.code}: ${c.text}`)}
            className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-xs ${mine === 'exclude' && mineReason?.startsWith(c.code) ? 'border-red-400 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300' : 'border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800'}`}
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

function ResolveBar({ r, names, onResolve }: { r: ReviewRecord; names: [string, string]; onResolve: (d: Decision, reason: string) => void }) {
  const [note, setNote] = useState('')
  const reasonFor = (d: Decision) => note.trim() || (r.ta1 === d ? r.ta1Reason : r.ta2 === d ? r.ta2Reason : '') || 'Resolved by discussion'
  return (
    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900 dark:bg-amber-950/30" onClick={(e) => e.stopPropagation()}>
      <p>
        <b>Disagreement:</b> {names[0]} said <b>{r.ta1}</b>, {names[1]} said <b>{r.ta2}</b>. Decide together (or ask a third reviewer):
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="reason (optional, e.g. E2)" className="min-h-8 w-48 text-xs" />
        {(['include', 'exclude', 'maybe'] as Decision[]).map((d) => (
          <Button key={d} variant="ghost" className="min-h-8 text-xs" onClick={() => onResolve(d, reasonFor(d))}>
            Final: {d}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function FullTextTab({ p, save }: { p: ReviewProject; save: Save }) {
  const list = p.records.filter((r) => r.ta === 'include')
  const llm = useLLM('eligibility')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const stop = useRef(false)
  const checked = (r: ReviewRecord) => (r.ftAi ? { ftAi: { ...r.ftAi, checked: true } } : {})
  const set = (id: string, ft: 'include' | 'exclude' | undefined, ftReason = '') =>
    save((cur) => ({ records: cur.records.map((r) => (r.id === id ? { ...r, ft, ftReason, ...checked(r) } : r)) }))
  const markChecked = (id: string) => save((cur) => ({ records: cur.records.map((r) => (r.id === id ? { ...r, ...checked(r) } : r)) }))
  const todo = list.filter((r) => !r.ft && r.ftAi?.decision !== 'unclear')
  const unchecked = list.filter((r) => r.ftAi && !r.ftAi.checked).length

  /** The PDF text when the report is already in the library with a PDF attached (by paper id or DOI). */
  async function fullTextOf(r: ReviewRecord): Promise<string | undefined> {
    const paper = (r.paperId ? await db.papers.get(r.paperId) : undefined) ?? (r.meta.doi ? await db.papers.where('doi').equals(r.meta.doi).first() : undefined)
    if (!paper?.pdfPages) return undefined
    const chunks = await db.chunks.where('paperId').equals(paper.id).sortBy('id')
    return chunks.map((c) => c.text).join('\n') || undefined
  }

  async function assess() {
    stop.current = false
    setErrors([])
    for (const [i, r] of todo.entries()) {
      if (stop.current) break
      setBusy(`Assessing ${i + 1}/${todo.length}: ${r.meta.title.slice(0, 60)}`)
      try {
        const text = await fullTextOf(r)
        if (!text && !r.meta.abstract) throw new Error('no abstract or PDF text — attach the PDF in the Library')
        const source = text ? ({ kind: 'fulltext', text } as const) : ({ kind: 'abstract' } as const)
        const reply = await llm.run(buildTaskPrompt(), eligibilityRequest(p.protocol, r, source, FT_REASONS), { feature: 'Review: full-text eligibility', light: true })
        const a = parseEligibility(reply.text)
        const ftAi = { ...a, source: source.kind, at: Date.now() }
        await save((cur) => ({
          records: cur.records.map((x) =>
            x.id !== r.id || x.ft ? x : { ...x, ftAi, ...(a.decision === 'unclear' ? {} : { ft: a.decision, ftReason: a.decision === 'exclude' ? a.reason : '' }) },
          ),
        }))
      } catch (e) {
        setErrors((x) => [...x, `${r.meta.title.slice(0, 60)}: ${explainError(e)}`])
      }
    }
    setBusy('')
  }

  return (
    <div className="space-y-4">
      <Card title="Full-text eligibility">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Open each report (DOI or open-access link) and confirm it meets all criteria. Record a reason for every exclusion — it appears in the PRISMA diagram. Attach PDFs later in the
          Library for full-text extraction.
        </p>
        {list.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {busy ? (
              <Button variant="danger" onClick={() => (stop.current = true)}>
                Stop
              </Button>
            ) : (
              <Button variant="ghost" disabled={!llm.ready || !todo.length} onClick={assess}>
                <Bot className="h-4 w-4" /> Assess {todo.length} with AI
              </Button>
            )}
            <span className="text-xs text-stone-500">{busy || `${llm.missing || llm.label} · uses the PDF when it is in the Library, otherwise the abstract`}</span>
            <TaskModel llm={llm} className="w-full" />
          </div>
        )}
        {unchecked > 0 && (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-400">
            {unchecked} AI decision{unchecked === 1 ? '' : 's'} not checked yet — read the AI note under each report, change the decision if you disagree, or press Checked.
          </p>
        )}
        {errors.length > 0 && <pre className="mt-2 text-xs whitespace-pre-wrap text-red-700">{errors.join('\n')}</pre>}
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
              {r.ftAi && (
                <div className="mt-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs text-stone-600 dark:bg-stone-800/60 dark:text-stone-300">
                  <Bot className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                  <b>Note by AI</b> ({r.ftAi.source === 'fulltext' ? 'full text' : 'abstract only'}) — {r.ftAi.decision === 'unclear' ? 'unclear, decide yourself' : r.ftAi.decision === 'include' ? 'eligible' : `exclude: ${r.ftAi.reason}`}
                  {r.ftAi.note && <span className="block">{r.ftAi.note}</span>}
                  <span className="mt-0.5 block text-stone-400">
                    {r.ftAi.checked ? (
                      'Checked by reviewer'
                    ) : (
                      <button className="text-amber-800 hover:underline dark:text-amber-400" onClick={() => markChecked(r.id)}>
                        Checked
                      </button>
                    )}
                  </span>
                </div>
              )}
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
