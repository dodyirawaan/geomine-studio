import { RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { explainError } from '../../ai/errors'
import { buildTaskPrompt } from '../../ai/prompts'
import { asRateLimit } from '../../ai/rateLimit'
import { useLLM } from '../../ai/useLLM'
import { TaskModel } from '../../components/TaskModel'
import { Badge, Button, Card, Select } from '../../components/ui'
import { shortCite } from '../../literature/library'
import { MATRIX_COLUMNS, matrixRequest, parseMatrixReply } from '../../literature/prompts'
import { syncIncludedToLibrary } from '../../review/build'
import { QUALITY_CRITERIA } from '../../review/methods'
import { includedRecords } from '../../review/prisma'
import type { Save } from '../../review/project'
import { methodById, parseQuality, qualityRequest } from '../../review/prompts'
import type { ReviewProject } from '../../review/types'
import { db, type Paper } from '../../store/db'
import { useIncludedPapers } from './usePapers'

export function ExtractionTab({ p, save }: { p: ReviewProject; save: Save }) {
  const llm = useLLM('extraction')
  const llmQ = useLLM('appraisal')
  const m = methodById(p.method)
  const inc = includedRecords(p, m.fullText)
  const { papers } = useIncludedPapers(p)
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const stop = useRef(false)
  const missingInLibrary = inc.filter((r) => !r.paperId).length

  async function addToLibrary() {
    setBusy('Adding to library…')
    const { records } = await syncIncludedToLibrary(p, inc)
    await save({ records })
    setBusy('')
  }

  async function sourceOf(paper: Paper): Promise<Parameters<typeof matrixRequest>[1]> {
    if (paper.pdfPages) {
      const chunks = await db.chunks.where('paperId').equals(paper.id).sortBy('id')
      return { kind: 'fulltext', text: chunks.map((c) => c.text).join('\n') }
    }
    if (!paper.abstract) throw new Error('There is no abstract or PDF text to read. Attach the PDF in the Library.')
    return { kind: 'abstract' }
  }

  async function extract() {
    if (!papers) return
    stop.current = false
    setErrors([])
    const todo = papers.filter((x) => !x.matrix)
    for (const [i, paper] of todo.entries()) {
      if (stop.current) break
      setBusy(`Extracting ${i + 1}/${todo.length}: ${shortCite(paper)}`)
      try {
        const source = await sourceOf(paper)
        const { text } = await llm.run(buildTaskPrompt(), matrixRequest(paper, source, p.protocol.questions.join(' ')), { feature: 'Review: extraction', light: true })
        await db.papers.update(paper.id, { matrix: parseMatrixReply(text), matrixSource: source.kind, updatedAt: Date.now() })
      } catch (e) {
        if (asRateLimit(e)?.daily) {
          setErrors((x) => [...x, explainError(e)])
          break
        }
        setErrors((x) => [...x, `${shortCite(paper)}: ${explainError(e)}`])
      }
    }
    setBusy('')
  }

  async function appraise() {
    if (!papers) return
    stop.current = false
    setErrors([])
    const todo = papers.filter((x) => !Object.keys(p.quality[x.id] ?? {}).length)
    for (const [i, paper] of todo.entries()) {
      if (stop.current) break
      setBusy(`Appraising ${i + 1}/${todo.length}: ${shortCite(paper)}`)
      try {
        const source = await sourceOf(paper)
        const { text } = await llmQ.run(buildTaskPrompt(), qualityRequest(paper, source), { feature: 'Review: quality appraisal', light: true })
        const { scores, reasons } = parseQuality(text)
        await save((cur) => ({
          quality: { ...cur.quality, [paper.id]: scores },
          qualityAi: { ...cur.qualityAi, [paper.id]: { reasons, source: source.kind, at: Date.now() } },
        }))
      } catch (e) {
        if (asRateLimit(e)?.daily) {
          setErrors((x) => [...x, explainError(e)])
          break
        }
        setErrors((x) => [...x, `${shortCite(paper)}: ${explainError(e)}`])
      }
    }
    setBusy('')
  }

  const markChecked = (paperId: string) =>
    save((cur) => (cur.qualityAi?.[paperId] ? { qualityAi: { ...cur.qualityAi, [paperId]: { ...cur.qualityAi[paperId], checked: true } } } : {}))
  const score = (paperId: string, crit: string, v: number) =>
    save((cur) => ({
      quality: { ...cur.quality, [paperId]: { ...cur.quality[paperId], [crit]: v } },
      ...(cur.qualityAi?.[paperId] ? { qualityAi: { ...cur.qualityAi, [paperId]: { ...cur.qualityAi[paperId], checked: true } } } : {}),
    }))
  const resetScores = (paper: Paper) => {
    if (!window.confirm(`Clear the quality scores for ${shortCite(paper)}? The study can then be appraised again with AI.`)) return
    save((cur) => {
      const quality = { ...cur.quality }
      const qualityAi = { ...cur.qualityAi }
      delete quality[paper.id]
      delete qualityAi[paper.id]
      return { quality, qualityAi }
    })
  }
  const unscored = papers?.filter((x) => !Object.keys(p.quality[x.id] ?? {}).length).length ?? 0
  const unchecked = papers?.filter((x) => p.qualityAi?.[x.id] && !p.qualityAi[x.id].checked).length ?? 0
  const extracted = papers?.filter((x) => x.matrix).length ?? 0

  return (
    <div className="space-y-4">
      <Card title="Included studies">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {inc.length} studies are included. They are added to your literature library (tagged <Badge>review: {p.title.slice(0, 40)}</Badge>) so they get citation keys, can hold PDFs and appear in the
          manuscript's references.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={!inc.length || !!busy} onClick={addToLibrary}>
            {missingInLibrary ? `Add ${missingInLibrary} studies to the library` : 'Library is up to date'}
          </Button>
          <Link to="/literature?tab=library" className="text-sm text-amber-800 hover:underline dark:text-amber-400">
            Open library (attach PDFs) →
          </Link>
        </div>
      </Card>

      {papers && papers.length > 0 && (
        <Card title={`Data ${m.id === 'scoping' ? 'charting' : 'extraction'} (${extracted}/${papers.length})`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {busy ? (
              <Button variant="danger" onClick={() => (stop.current = true)}>
                Stop
              </Button>
            ) : (
              <Button variant="ghost" disabled={!llm.ready || extracted === papers.length} onClick={extract}>
                Extract {papers.length - extracted} with AI
              </Button>
            )}
            <span className="text-xs text-stone-500">{busy || `${llm.missing || llm.label} · uses the PDF text when attached, otherwise the abstract`}</span>
          </div>
          <TaskModel llm={llm} className="mb-3" />
          {errors.length > 0 && <pre className="mb-2 text-xs whitespace-pre-wrap text-red-700">{errors.join('\n')}</pre>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Study</th>
                  {MATRIX_COLUMNS.filter((c) => c.id !== 'relevance').map((c) => (
                    <th key={c.id} className="py-1 pr-2">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {papers.map((x) => (
                  <tr key={x.id} className="border-t border-stone-200 align-top dark:border-stone-800">
                    <td className="py-1.5 pr-2 font-medium whitespace-nowrap">
                      {shortCite(x)}
                      <span className="block font-normal text-stone-400">{x.matrixSource ?? 'not extracted'}</span>
                    </td>
                    {MATRIX_COLUMNS.filter((c) => c.id !== 'relevance').map((c) => (
                      <td key={c.id} className={`py-1.5 pr-2 ${/^not reported/i.test(x.matrix?.[c.id] ?? '') ? 'text-stone-400' : ''}`}>
                        {x.matrix?.[c.id] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {m.quality && papers && papers.length > 0 && (
        <Card title="Quality appraisal">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {busy ? (
              <Button variant="danger" onClick={() => (stop.current = true)}>
                Stop
              </Button>
            ) : (
              <Button variant="ghost" disabled={!llmQ.ready || !unscored} onClick={appraise}>
                Appraise {unscored} with AI
              </Button>
            )}
            <span className="text-xs text-stone-500">{busy || `${llmQ.missing || llmQ.label} · AI proposes each score with a reason; you check or change it`}</span>
          </div>
          <TaskModel llm={llmQ} className="mb-2" />
          {errors.length > 0 && <pre className="mb-2 text-xs whitespace-pre-wrap text-red-700">{errors.join('\n')}</pre>}
          <p className="mb-2 text-xs text-stone-500">
            0 = not met · 1 = partly · 2 = fully met. Scores weight the synthesis; they do not exclude studies.
            {unchecked > 0 && ` ${unchecked} AI-scored ${unchecked === 1 ? 'study is' : 'studies are'} not checked yet — read the reasons, change any score you disagree with, or press Checked.`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-xs">
              <thead className="text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Study</th>
                  {QUALITY_CRITERIA.map((q) => (
                    <th key={q.id} className="py-1 pr-2" title={q.label}>
                      {q.label}
                    </th>
                  ))}
                  <th className="py-1 pr-2">Total</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {papers.map((x) => {
                  const s = p.quality[x.id] ?? {}
                  const ai = p.qualityAi?.[x.id]
                  const total = QUALITY_CRITERIA.reduce((n, q) => n + (s[q.id] ?? 0), 0)
                  return (
                    <tr key={x.id} className="border-t border-stone-200 align-top dark:border-stone-800">
                      <td className="py-1 pr-2 font-medium whitespace-nowrap">
                        {shortCite(x)}
                        {ai && (
                          <span className="block font-normal text-stone-400">
                            AI · {ai.source}
                            {ai.checked ? (
                              ' · checked'
                            ) : (
                              <button className="ml-1 text-amber-800 hover:underline dark:text-amber-400" onClick={() => markChecked(x.id)}>
                                Checked
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                      {QUALITY_CRITERIA.map((q) => (
                        <td key={q.id} className="py-1 pr-2" title={ai?.reasons[q.id] || undefined}>
                          <Select value={s[q.id] == null ? '' : String(s[q.id])} onChange={(e) => score(x.id, q.id, Number(e.target.value))} className="min-h-7 w-16 px-1.5 py-0.5 text-xs">
                            <option value="" disabled>
                              –
                            </option>
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                          </Select>
                          {ai?.reasons[q.id] && <span className="mt-0.5 block max-w-48 text-[11px] leading-snug text-stone-500">{ai.reasons[q.id]}</span>}
                        </td>
                      ))}
                      <td className="py-1 pr-2 font-semibold tabular-nums">
                        {total}/{QUALITY_CRITERIA.length * 2}
                      </td>
                      <td className="py-1">
                        {Object.keys(s).length > 0 && (
                          <Button
                            variant="ghost"
                            className="min-h-7 px-2 py-0.5 text-xs"
                            disabled={!!busy}
                            title="Clear these scores so the study can be appraised again with AI"
                            onClick={() => resetScores(x)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Reset
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
