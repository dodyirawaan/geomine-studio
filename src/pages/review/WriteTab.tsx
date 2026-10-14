import { AlertTriangle, CheckCircle2, FileText, Wand2, XCircle } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildSystemPrompt, type JournalId } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { Markdown } from '../../components/Markdown'
import { Badge, Button, ButtonLink, Card, Label, Select } from '../../components/ui'
import { paperToBibtex } from '../../literature/bib'
import { CITE_RE, parseBibtex } from '../../manuscript/bibtex'
import { CITATION_STYLES, makeCiter, type CitationStyle } from '../../manuscript/citations'
import { styleOf } from '../../manuscript/templates'
import { limitationsText, methodsText, overviewText, writeManuscript } from '../../review/build'
import { evidenceFacts, evidenceStats } from '../../review/evidence'
import { readiness } from '../../review/readiness'
import { REVIEW_REFS, type OutlineItem } from '../../review/methods'
import { prismaCounts } from '../../review/prisma'
import type { Save } from '../../review/project'
import { abstractRequest, methodById, parseAbstract, parseThemePlan, sectionRequest, themePlanRequest, themeRequest } from '../../review/prompts'
import type { ReviewProject } from '../../review/types'
import { db } from '../../store/db'
import { useIncludedPapers } from './usePapers'

export function WriteTab({ p, save }: { p: ReviewProject; save: Save }) {
  const llm = useLLM()
  const m = methodById(p.method)
  const c = prismaCounts(p, m.fullText)
  const { included, papers } = useIncludedPapers(p)
  const [busy, setBusy] = useState('')
  const [stream, setStream] = useState<{ id: string; text: string } | null>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const stop = useRef(false)
  const style: CitationStyle = p.citationStyle ?? styleOf({ journal: p.journal as JournalId })
  const ready = !!papers && papers.length > 0 && papers.length === included

  const bib = useMemo(() => parseBibtex([...(papers ?? []).map(paperToBibtex), ...m.refs.map((k) => REVIEW_REFS[k])].join('\n')), [papers, m.refs])
  const citer = useMemo(() => makeCiter(style, bib, [...m.outline.map((o) => p.drafts[o.id] ?? '')]), [style, bib, m.outline, p.drafts])

  const setDraft = (id: string, text: string) => save((cur) => ({ drafts: { ...cur.drafts, [id]: text } }))

  const facts = useMemo(() => evidenceFacts(evidenceStats(papers ?? [])), [papers])
  const clean = (t: string) => t.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/, '$1').trim()

  async function ai(prompt: string, id: string, prefix = ''): Promise<string> {
    const { text } = await llm.run(buildSystemPrompt('review', p.journal as JournalId), prompt, {
      feature: 'Review: writing',
      onText: (t) => setStream({ id, text: prefix + t }),
    })
    return clean(text)
  }

  async function draftSection(o: OutlineItem): Promise<string> {
    if (o.deterministic) {
      const text = o.id === 'methods' ? methodsText(p, m, c) : o.id === 'limitations' ? limitationsText(p, m, papers ?? []) : overviewText(p, m, papers ?? [])
      await setDraft(o.id, text)
      return text
    }
    const fresh = (await db.reviews.get(p.id))?.drafts ?? p.drafts
    let text: string
    if (o.id === 'synthesis') {
      // Two stages: plan the themes with their studies, then write each theme in depth.
      setBusy('Writing: planning the themes')
      const keys = new Set((papers ?? []).map((x) => x.bibKey))
      const plan = parseThemePlan(await ai(themePlanRequest(p, m, papers ?? [], facts), o.id), keys)
      if (!plan.length) throw new Error('The model returned no themes.')
      let acc = ''
      for (const [i, t] of plan.entries()) {
        if (stop.current) break
        setBusy(`Writing theme ${i + 1}/${plan.length}: ${t.title}`)
        const body = await ai(themeRequest(p, m, t, plan, papers ?? [], facts), o.id, `${acc}## ${t.title}\n\n`)
        acc += `## ${t.title}\n\n${body}\n\n`
      }
      text = acc.trim()
    } else {
      text = await ai(sectionRequest(p, m, o, papers ?? [], c, fresh, facts), o.id)
    }
    await setDraft(o.id, text)
    setStream(null)
    return text
  }

  async function draftAbstract() {
    const fresh = (await db.reviews.get(p.id))?.drafts ?? p.drafts
    const body = m.outline.map((o) => `## ${o.title}\n${fresh[o.id] ?? ''}`).join('\n\n')
    const { text } = await llm.run(buildSystemPrompt('general', p.journal as JournalId), abstractRequest(p, m, c, body), { feature: 'Review: abstract' })
    const a = parseAbstract(text)
    await save((cur) => ({ drafts: { ...cur.drafts, abstract: a.abstract, highlights: a.highlights, keywords: a.keywords } }))
  }

  async function run(task: () => Promise<unknown>, label: string) {
    setBusy(label)
    setError('')
    try {
      await task()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy('')
      setStream(null)
    }
  }

  async function draftAll() {
    stop.current = false
    // Data-driven sections first, then the synthesis, then gaps and conclusions, then the abstract.
    for (const o of m.outline) {
      if (stop.current) return
      if ((await db.reviews.get(p.id))?.drafts[o.id]?.trim()) continue
      setBusy(`Writing: ${o.title}`)
      await draftSection(o)
    }
    if (!stop.current) {
      setBusy('Writing: abstract, highlights and keywords')
      await draftAbstract()
    }
  }

  async function toManuscript() {
    const ms = await writeManuscript(p, m, papers ?? [])
    await db.manuscripts.update(ms.id, { citationStyle: style })
    await save({ manuscriptId: ms.id })
  }

  const missing = m.outline.filter((o) => !p.drafts[o.id]?.trim()).length
  const resolve = (t: string) => t.replace(CITE_RE, (_, g: string) => citer.cite(g))

  return (
    <div className="space-y-4">
      {!ready && (
        <Card>
          <p className="text-sm text-amber-800 dark:text-amber-400">
            {included === 0 ? 'Include studies in the screening steps first.' : 'Add the included studies to the library in the Extraction step, so the writer can cite them.'}
          </p>
        </Card>
      )}
      <Card title="Write the review">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <Label hint="applied to the manuscript and every export">Citation style</Label>
            <Select value={style} onChange={(e) => save({ citationStyle: e.target.value as CitationStyle })}>
              {CITATION_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.example}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex flex-wrap gap-2">
            {busy ? (
              <Button variant="danger" onClick={() => (stop.current = true)}>
                Stop
              </Button>
            ) : (
              <Button disabled={!ready || !llm.ready} onClick={() => run(draftAll, 'Writing…')}>
                <Wand2 className="h-4 w-4" /> {missing ? `Write ${missing} missing section${missing === 1 ? '' : 's'} + abstract` : 'Rewrite the abstract'}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          {busy || llm.missing || `${llm.label}. Methods and the overview are written from your data without AI; the synthesis may cite only the ${papers?.length ?? 0} included studies.`}
        </p>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </Card>

      {[...m.outline, { id: 'abstract', title: 'Abstract', brief: '' }, { id: 'highlights', title: 'Highlights', brief: '' }, { id: 'keywords', title: 'Keywords', brief: '' }].map((o) => {
        const text = stream?.id === o.id ? stream.text : (p.drafts[o.id] ?? '')
        const isOutline = m.outline.some((x) => x.id === o.id)
        return (
          <Card key={o.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-semibold tracking-tight">{o.title}</h3>
              {(o as OutlineItem).deterministic && <Badge tone="green">from data</Badge>}
              <span className="ml-auto flex gap-1.5">
                {isOutline && (
                  <Button variant="ghost" className="min-h-8 text-xs" disabled={!!busy || !ready || (!(o as OutlineItem).deterministic && !llm.ready)} onClick={() => run(() => draftSection(o as OutlineItem), `Writing: ${o.title}`)}>
                    {(o as OutlineItem).deterministic ? 'Generate' : text ? 'Rewrite' : 'Draft'}
                  </Button>
                )}
                {text && (
                  <Button variant="subtle" className="min-h-8 text-xs" onClick={() => setPreview(preview === o.id ? null : o.id)}>
                    {preview === o.id ? 'Edit' : 'Preview'}
                  </Button>
                )}
              </span>
            </div>
            {(o as OutlineItem).brief && <p className="mb-2 text-xs text-stone-500">{(o as OutlineItem).brief}</p>}
            {preview === o.id ? (
              <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                <Markdown text={resolve(text)} />
              </div>
            ) : (
              <textarea
                key={`${o.id}-${p.drafts[o.id]?.length ?? 0}-${stream?.id === o.id}`}
                defaultValue={text}
                onBlur={(e) => e.target.value !== (p.drafts[o.id] ?? '') && setDraft(o.id, e.target.value)}
                rows={Math.min(18, Math.max(o.id === 'keywords' ? 1 : 4, Math.ceil(text.length / 110)))}
                className="w-full resize-y rounded-lg border border-stone-300 bg-white p-3 font-mono text-[13px] leading-relaxed dark:border-stone-700 dark:bg-stone-900"
                placeholder={isOutline ? 'Draft with AI, or write here. Cite included studies as [@key].' : ''}
              />
            )}
          </Card>
        )
      })}

      <ReadinessCard checks={readiness(p, m, c, papers ?? [], m.refs)} />

      <Card title="Manuscript">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Creates a manuscript with these sections, the included studies and method references as its bibliography, and the citation style above. Then use the
          editor and the workspace (consistency check, Reviewer 2, Q1 checklist) and export to Word or LaTeX.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={!ready || !!busy} onClick={() => run(toManuscript, 'Creating manuscript…')}>
            <FileText className="h-4 w-4" /> {p.manuscriptId ? 'Update the manuscript' : 'Create the manuscript'}
          </Button>
          {p.manuscriptId && (
            <>
              <ButtonLink to={`/manuscripts/${p.manuscriptId}`} variant="ghost">
                Open in editor
              </ButtonLink>
              <Link to={`/manuscripts/${p.manuscriptId}/workspace?tab=check`} className="text-sm text-amber-800 hover:underline dark:text-amber-400">
                Consistency check →
              </Link>
            </>
          )}
        </div>
        {p.manuscriptId && <p className="mt-2 text-xs text-stone-500">Updating saves a snapshot of the current manuscript first (History).</p>}
      </Card>
    </div>
  )
}

function ReadinessCard({ checks }: { checks: ReturnType<typeof readiness> }) {
  const must = checks.filter((x) => x.level === 'must')
  const should = checks.filter((x) => x.level === 'should')
  const score = Math.round((100 * checks.filter((x) => x.ok).length) / checks.length)
  const blocked = must.filter((x) => !x.ok).length
  return (
    <Card title="Publication readiness">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded bg-stone-200 dark:bg-stone-800">
          <div className={`h-full ${blocked ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${score}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums">{score}%</span>
      </div>
      <p className="mb-3 text-xs text-stone-500">
        {blocked ? `${blocked} required item${blocked === 1 ? '' : 's'} still open.` : 'All required items done.'} Then run the manuscript's consistency check and Reviewer 2, and verify references against Crossref.
      </p>
      {[
        ['Required', must],
        ['Strongly recommended for Q1', should],
      ].map(([title, list]) => (
        <div key={title as string} className="mb-3">
          <p className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{title as string}</p>
          <ul className="space-y-1">
            {(list as ReturnType<typeof readiness>).map((x) => (
              <li key={x.label} className="flex items-start gap-2 text-sm">
                {x.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : x.level === 'must' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                <span>
                  {x.label}
                  {x.detail && <span className="ml-1.5 text-xs text-stone-500">({x.detail})</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  )
}
