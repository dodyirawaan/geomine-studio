import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildSystemPrompt } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { Badge, Button, Card, Select } from '../../components/ui'
import { shortCite } from '../../literature/library'
import { MATRIX_COLUMNS, matrixRequest, parseMatrixReply } from '../../literature/prompts'
import { syncIncludedToLibrary } from '../../review/build'
import { QUALITY_CRITERIA } from '../../review/methods'
import { includedRecords } from '../../review/prisma'
import type { Save } from '../../review/project'
import { methodById } from '../../review/prompts'
import type { ReviewProject } from '../../review/types'
import { db } from '../../store/db'
import { useIncludedPapers } from './usePapers'

export function ExtractionTab({ p, save }: { p: ReviewProject; save: Save }) {
  const llm = useLLM()
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

  async function extract() {
    if (!papers) return
    stop.current = false
    setErrors([])
    const todo = papers.filter((x) => !x.matrix)
    for (const [i, paper] of todo.entries()) {
      if (stop.current) break
      setBusy(`Extracting ${i + 1}/${todo.length}: ${shortCite(paper)}`)
      try {
        let source: Parameters<typeof matrixRequest>[1] = { kind: 'abstract' }
        if (paper.pdfPages) {
          const chunks = await db.chunks.where('paperId').equals(paper.id).sortBy('id')
          source = { kind: 'fulltext', text: chunks.map((c) => c.text).join('\n') }
        } else if (!paper.abstract) throw new Error('no abstract or PDF text — attach the PDF in the Library')
        const { text } = await llm.run(buildSystemPrompt('literature', ''), matrixRequest(paper, source, p.protocol.questions.join(' ')), { feature: 'Review: extraction' })
        await db.papers.update(paper.id, { matrix: parseMatrixReply(text), matrixSource: source.kind, updatedAt: Date.now() })
      } catch (e) {
        setErrors((x) => [...x, `${shortCite(paper)}: ${(e as Error).message}`])
      }
    }
    setBusy('')
  }

  const score = (paperId: string, crit: string, v: number) => save((cur) => ({ quality: { ...cur.quality, [paperId]: { ...cur.quality[paperId], [crit]: v } } }))
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
          <p className="mb-2 text-xs text-stone-500">0 = not met · 1 = partly · 2 = fully met. Scores weight the synthesis; they do not exclude studies.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Study</th>
                  {QUALITY_CRITERIA.map((q) => (
                    <th key={q.id} className="py-1 pr-2" title={q.label}>
                      {q.label}
                    </th>
                  ))}
                  <th className="py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((x) => {
                  const s = p.quality[x.id] ?? {}
                  const total = QUALITY_CRITERIA.reduce((n, q) => n + (s[q.id] ?? 0), 0)
                  return (
                    <tr key={x.id} className="border-t border-stone-200 dark:border-stone-800">
                      <td className="py-1 pr-2 font-medium whitespace-nowrap">{shortCite(x)}</td>
                      {QUALITY_CRITERIA.map((q) => (
                        <td key={q.id} className="py-1 pr-2">
                          <Select value={s[q.id] == null ? '' : String(s[q.id])} onChange={(e) => score(x.id, q.id, Number(e.target.value))} className="min-h-7 w-16 px-1.5 py-0.5 text-xs">
                            <option value="" disabled>
                              –
                            </option>
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                          </Select>
                        </td>
                      ))}
                      <td className="py-1 font-semibold tabular-nums">
                        {total}/{QUALITY_CRITERIA.length * 2}
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
