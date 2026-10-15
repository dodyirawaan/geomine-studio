import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ReactNode } from 'react'
import { explainError } from '../../ai/errors'
import { buildSystemPrompt } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { Markdown } from '../../components/Markdown'
import { TaskModel } from '../../components/TaskModel'
import { Button, Card } from '../../components/ui'
import { downloadText, slug } from '../../lib/download'
import { ASSIST_ACTIONS, buildAssistMessage, modeFor } from '../../manuscript/assist'
import { countWords } from '../../manuscript/templates'
import { outlineRequest, parseOutline, parseReview, parseRevision, responseLetter, reviewRequest, revisionRequest, sectionForComment } from '../../pipeline/prompts'
import { applyTexts } from '../../pipeline/snapshots'
import { db, type Manuscript, type PipelineRun, type ReviewComment } from '../../store/db'

const EMPTY_RUN = (id: string): PipelineRun => ({ manuscriptId: id, idea: '', proposals: {}, review: [], updatedAt: Date.now() })

async function saveRun(id: string, patch: Partial<PipelineRun> | ((r: PipelineRun) => Partial<PipelineRun>)) {
  await db.transaction('rw', db.runs, async () => {
    const cur = (await db.runs.get(id)) ?? EMPTY_RUN(id)
    const p = typeof patch === 'function' ? patch(cur) : patch
    await db.runs.put({ ...cur, ...p, updatedAt: Date.now() })
  })
}

/** Body sections first, then the front matter that summarises them. */
const DRAFT_ORDER = { body: 0, abstract: 1, highlights: 2, keywords: 3, back: 4 } as const

export default function PipelineTab({ m }: { m: Manuscript }) {
  const llm = useLLM('pipeline')
  const run = useLiveQuery(async () => (await db.runs.get(m.id)) ?? EMPTY_RUN(m.id), [m.id])
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [stream, setStream] = useState('')
  const [error, setError] = useState('')
  const [draftSel, setDraftSel] = useState<Set<string> | null>(null)
  const [ideaDraft, setIdeaDraft] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  if (!run) return null
  const r = run
  const idea = ideaDraft ?? r.idea

  const draftable = m.sections.filter((s) => s.role !== 'back').sort((a, b) => DRAFT_ORDER[a.role] - DRAFT_ORDER[b.role])
  const selected = draftSel ?? new Set(draftable.filter((s) => countWords(s.content) < 150).map((s) => s.id))

  async function task(name: string, fn: (signal: AbortSignal) => Promise<void>) {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(name)
    setError('')
    setStream('')
    try {
      await fn(ctrl.signal)
      setProgress(ctrl.signal.aborted ? 'Stopped.' : '')
    } catch (e) {
      if (ctrl.signal.aborted) setProgress('Stopped.')
      else setError(explainError(e))
    } finally {
      setBusy(null)
      setStream('')
    }
  }

  const outline = () =>
    task('outline', async (signal) => {
      await saveRun(m.id, { idea })
      setProgress('Planning the manuscript…')
      const { text } = await llm.run(buildSystemPrompt('gap', m.journal), outlineRequest(m, idea), { signal, onText: setStream, feature: 'Pipeline: outline' })
      if (!signal.aborted) await saveRun(m.id, { outline: text })
    })

  function applyOutline() {
    const parsed = parseOutline(r.outline ?? '')
    const texts: Record<string, string> = {}
    for (const s of m.sections.filter((x) => x.role === 'body' && !x.content.trim())) {
      const notes = parsed.sections[s.title.toLowerCase()]
      if (notes) texts[s.id] = notes
    }
    return applyTexts(m.id, texts, 'Before applying outline notes')
  }

  const draft = () =>
    task('draft', async (signal) => {
      // Later sections see earlier drafts, so the abstract summarises the drafted body.
      let working: Manuscript = { ...m, sections: m.sections.map((s) => (r.proposals[s.id] ? { ...s, content: r.proposals[s.id].text } : s)) }
      const todo = draftable.filter((s) => selected.has(s.id))
      const action = ASSIST_ACTIONS.find((a) => a.id === 'draft')!
      for (const [i, s] of todo.entries()) {
        if (signal.aborted) break
        setProgress(`Drafting ${i + 1}/${todo.length}: ${s.title}`)
        const section = working.sections.find((x) => x.id === s.id)!
        const { text } = await llm.run(buildSystemPrompt(modeFor(action, section), m.journal), buildAssistMessage(working, section, action, ''), { signal, onText: setStream, feature: 'Pipeline: draft' })
        if (signal.aborted) break
        const clean = text.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/, '$1').trim()
        working = { ...working, sections: working.sections.map((x) => (x.id === s.id ? { ...x, content: clean } : x)) }
        await saveRun(m.id, (cur) => ({ proposals: { ...cur.proposals, [s.id]: { text: clean, kind: 'draft', createdAt: Date.now() } } }))
      }
    })

  const review = () =>
    task('review', async (signal) => {
      setProgress('Reviewer 2 is reading the manuscript…')
      const { text } = await llm.run(buildSystemPrompt('reviewer', m.journal), reviewRequest(m), { signal, onText: setStream, feature: 'Pipeline: Reviewer 2' })
      if (!signal.aborted) await saveRun(m.id, { review: parseReview(text), responseLetter: undefined })
    })

  const revise = () =>
    task('revise', async (signal) => {
      const chosen = r.review.filter((c) => c.selected)
      const groups = new Map<string, ReviewComment[]>()
      for (const c of chosen) {
        const s = sectionForComment(m, c)
        if (s) groups.set(s.id, [...(groups.get(s.id) ?? []), c])
      }
      let i = 0
      const responses: Record<string, string> = {}
      for (const [sid, comments] of groups) {
        if (signal.aborted) break
        const section = m.sections.find((s) => s.id === sid)!
        setProgress(`Revising ${++i}/${groups.size}: ${section.title} (${comments.map((c) => c.id).join(', ')})`)
        const { text } = await llm.run(buildSystemPrompt('general', m.journal), revisionRequest(m, section, comments), { signal, onText: setStream, feature: 'Pipeline: revision' })
        if (signal.aborted) break
        const parsed = parseRevision(text)
        Object.assign(responses, parsed.responses)
        await saveRun(m.id, (cur) => ({
          proposals: { ...cur.proposals, [sid]: { text: parsed.text, kind: 'revision', createdAt: Date.now() } },
          review: cur.review.map((c) => (parsed.responses[c.id] ? { ...c, response: parsed.responses[c.id] } : c)),
        }))
      }
      const latest = (await db.runs.get(m.id)) ?? r
      await saveRun(m.id, { responseLetter: responseLetter(m, latest.review) })
    })

  async function accept(ids: string[]) {
    const texts = Object.fromEntries(ids.map((id) => [id, r.proposals[id].text]))
    await applyTexts(m.id, texts, ids.length === 1 ? `Before accepting AI text for "${m.sections.find((s) => s.id === ids[0])?.title}"` : `Before accepting ${ids.length} AI proposals`)
    await saveRun(m.id, (cur) => ({ proposals: Object.fromEntries(Object.entries(cur.proposals).filter(([k]) => !ids.includes(k))) }))
  }

  const discard = (ids: string[]) => saveRun(m.id, (cur) => ({ proposals: Object.fromEntries(Object.entries(cur.proposals).filter(([k]) => !ids.includes(k))) }))
  const proposalIds = Object.keys(r.proposals).filter((id) => m.sections.some((s) => s.id === id))
  const parsedOutline = r.outline ? parseOutline(r.outline) : null
  const unmatched = r.review.filter((c) => c.selected && !sectionForComment(m, c))
  const disabled = !!busy || !llm.ready

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        AI output is kept as <b>proposals</b>; nothing changes in the manuscript until you accept it, and a snapshot is saved first (History tab).
        <span className="ml-1 text-xs text-stone-500">{llm.missing || llm.label}</span>
      </p>
      <TaskModel llm={llm} />

      {(busy || error || progress) && (
        <Card>
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm">{error ? <span className="text-red-700">{error}</span> : progress}</p>
            {busy && (
              <Button variant="danger" onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            )}
          </div>
          {busy && stream && <pre className="mt-2 max-h-40 overflow-y-auto text-xs whitespace-pre-wrap text-stone-500">{stream.slice(-1500)}</pre>}
        </Card>
      )}

      <Step n={1} title="Idea → outline" done={!!r.outline}>
        <textarea
          value={idea}
          onChange={(e) => setIdeaDraft(e.target.value)}
          onBlur={() => saveRun(m.id, { idea })}
          rows={5}
          placeholder="Describe the study: problem, site and depth, data you have (e.g. 312 microseismic events, 18 months, 6 stations), methods, main results so far, and what you think is new."
          className="w-full rounded-md border border-stone-300 bg-white p-2.5 text-sm outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-900"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button disabled={disabled || !idea.trim()} onClick={outline}>
            {r.outline ? 'Regenerate outline' : 'Generate outline'}
          </Button>
          {parsedOutline && (
            <Button variant="ghost" onClick={applyOutline} title="Writes the notes into body sections that are still empty">
              Put notes into empty sections
            </Button>
          )}
        </div>
        {parsedOutline && parsedOutline.titles.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-stone-500">Use title:</span>
            {parsedOutline.titles.slice(0, 3).map((t) => (
              <button key={t} onClick={() => applyTexts(m.id, {}, 'Before changing the title', t)} className="rounded border border-stone-300 px-2 py-0.5 text-left hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">
                {t}
              </button>
            ))}
          </div>
        )}
        {r.outline && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-stone-500">Outline</summary>
            <div className="mt-2">
              <Markdown text={r.outline} />
            </div>
          </details>
        )}
      </Step>

      <Step n={2} title="Draft sections" done={draftable.every((s) => countWords(s.content) >= 50)}>
        <p className="mb-2 text-xs text-stone-500">
          Each section is drafted from its current notes and the rest of the manuscript, body first and the abstract, highlights and keywords last.
          Sections with fewer than 150 words are preselected.
        </p>
        <div className="grid gap-1 text-sm sm:grid-cols-2">
          {draftable.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => {
                  const next = new Set(selected)
                  if (next.has(s.id)) next.delete(s.id)
                  else next.add(s.id)
                  setDraftSel(next)
                }}
              />
              <span className="flex-1">{s.title}</span>
              <span className="text-xs text-stone-400">{countWords(s.content)} w</span>
            </label>
          ))}
        </div>
        <Button className="mt-2" disabled={disabled || !selected.size} onClick={draft}>
          Draft {selected.size} section{selected.size === 1 ? '' : 's'}
        </Button>
      </Step>

      <Step n={3} title="Reviewer 2" done={r.review.length > 0}>
        <Button disabled={disabled} onClick={review}>
          {r.review.length ? 'Review again' : 'Run Reviewer 2'}
        </Button>
        {r.review.length > 0 && (
          <ul className="mt-3 space-y-2">
            {r.review.map((c) => (
              <li key={c.id} className="rounded-md border border-stone-200 p-2.5 text-sm dark:border-stone-800">
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={c.selected}
                    onChange={() => saveRun(m.id, (cur) => ({ review: cur.review.map((x) => (x.id === c.id ? { ...x, selected: !x.selected } : x)) }))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`mr-1.5 rounded px-1.5 py-0.5 text-xs ${c.severity === 'major' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'}`}>
                      {c.id} · {c.severity}
                    </span>
                    <span className="text-xs text-stone-500">{c.section}</span>
                    <span className="mt-1 block">{c.comment}</span>
                    {c.quote && <span className="mt-1 block text-xs text-stone-500 italic">“{c.quote}”</span>}
                    {c.suggestion && <span className="mt-1 block text-xs text-stone-600 dark:text-stone-400">Fix: {c.suggestion}</span>}
                    {c.response && <span className="mt-1 block text-xs text-green-700 dark:text-green-500">Response: {c.response}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step n={4} title="Revise & respond" done={!!r.responseLetter}>
        <Button disabled={disabled || !r.review.some((c) => c.selected)} onClick={revise}>
          Revise for {r.review.filter((c) => c.selected).length} selected comment(s)
        </Button>
        {unmatched.length > 0 && (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-400">
            {unmatched.map((c) => c.id).join(', ')} could not be tied to one section and need a manual change; answer them in the letter.
          </p>
        )}
        {r.responseLetter && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-stone-500">Response to reviewers</summary>
            <div className="mt-2 space-y-2">
              <Markdown text={r.responseLetter} />
              <Button variant="ghost" className="text-xs" onClick={() => downloadText(r.responseLetter!, `${slug(m.title)}-response.md`, 'text/markdown')}>
                Download .md
              </Button>
            </div>
          </details>
        )}
      </Step>

      {proposalIds.length > 0 && (
        <Card
          title={
            <span className="flex flex-wrap items-center gap-2">
              Proposals ({proposalIds.length})
              <Button className="ml-auto text-xs" onClick={() => accept(proposalIds)}>
                Accept all
              </Button>
              <Button variant="ghost" className="text-xs" onClick={() => window.confirm('Discard all proposals?') && discard(proposalIds)}>
                Discard all
              </Button>
            </span>
          }
        >
          <ul className="space-y-2">
            {proposalIds.map((id) => {
              const s = m.sections.find((x) => x.id === id)!
              const p = r.proposals[id]
              return (
                <li key={id} className="rounded-md border border-stone-200 dark:border-stone-800">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-2.5 text-sm">
                      <span className="font-medium">{s.title}</span>
                      <span className="text-xs text-stone-500">
                        {p.kind} · {countWords(s.content)} → {countWords(p.text)} words
                      </span>
                      <span className="ml-auto flex gap-1.5">
                        <Button className="text-xs" onClick={(e) => (e.preventDefault(), accept([id]))}>
                          Accept
                        </Button>
                        <Button variant="ghost" className="text-xs" onClick={(e) => (e.preventDefault(), discard([id]))}>
                          Discard
                        </Button>
                      </span>
                    </summary>
                    <div className="grid gap-3 border-t border-stone-200 p-3 lg:grid-cols-2 dark:border-stone-800">
                      <div>
                        <p className="mb-1 text-xs font-semibold text-stone-500 uppercase">Current</p>
                        {s.content.trim() ? <Markdown text={s.content} /> : <p className="text-sm text-stone-400">(empty)</p>}
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold text-amber-700 uppercase">Proposed</p>
                        <Markdown text={p.text} />
                      </div>
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span className={`h-6 w-6 rounded-full text-center text-xs leading-6 ${done ? 'bg-green-600 text-white' : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'}`}>
            {done ? '✓' : n}
          </span>
          {title}
        </span>
      }
    >
      {children}
    </Card>
  )
}
