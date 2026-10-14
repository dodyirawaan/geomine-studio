import { useRef, useState } from 'react'
import { buildSystemPrompt } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { Markdown } from '../../components/Markdown'
import { Button, Card, Input } from '../../components/ui'
import { downloadText } from '../../lib/download'
import { readJson, writeJson } from '../../lib/storage'
import { shortCite } from '../../literature/library'
import { MATRIX_COLUMNS, matrixMarkdown, matrixRequest, parseMatrixReply, synthesisRequest } from '../../literature/prompts'
import { db, type Paper } from '../../store/db'
import { useScope } from './scope'

const TOPIC_KEY = 'gm.litTopic'

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function MatrixTab({ papers, selected }: { papers: Paper[]; selected: Set<string> }) {
  const llm = useLLM()
  const { inScope, picker } = useScope(papers, selected)
  const [topic, setTopicState] = useState(() => readJson(TOPIC_KEY, ''))
  const [preferFulltext, setPreferFulltext] = useState(true)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [synthesis, setSynthesis] = useState('')
  const [busy, setBusy] = useState<'extract' | 'synth' | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const setTopic = (t: string) => {
    setTopicState(t)
    writeJson(TOPIC_KEY, t)
  }
  const rows = inScope.filter((p) => p.matrix)

  async function extract(all: boolean) {
    const todo = inScope.filter((p) => all || !p.matrix)
    if (!todo.length) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy('extract')
    setErrors([])
    const system = buildSystemPrompt('literature', '')
    for (const [i, p] of todo.entries()) {
      if (ctrl.signal.aborted) break
      setProgress(`${i + 1}/${todo.length}: ${p.title}`)
      try {
        let source: Parameters<typeof matrixRequest>[1] = { kind: 'abstract' }
        if (preferFulltext && p.pdfPages) {
          const chunks = await db.chunks.where('paperId').equals(p.id).sortBy('id')
          source = { kind: 'fulltext', text: chunks.map((c) => c.text).join('\n') }
        } else if (!p.abstract) {
          throw new Error('no abstract or PDF text to extract from')
        }
        const { text } = await llm.run(system, matrixRequest(p, source, topic), { signal: ctrl.signal })
        await db.papers.update(p.id, { matrix: parseMatrixReply(text), matrixSource: source.kind, updatedAt: Date.now() })
      } catch (e) {
        if (!ctrl.signal.aborted) setErrors((prev) => [...prev, `${shortCite(p)}: ${(e as Error).message}`])
      }
    }
    setProgress(ctrl.signal.aborted ? 'Stopped.' : 'Done.')
    setBusy(null)
  }

  async function synthesize() {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy('synth')
    setSynthesis('')
    try {
      await llm.run(buildSystemPrompt('gap', ''), synthesisRequest(rows, topic), { signal: ctrl.signal, onText: setSynthesis })
    } catch (e) {
      if (!ctrl.signal.aborted) setSynthesis((s) => `${s}\n\n**Error:** ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  function exportCsv() {
    const head = ['Key', 'Citation', 'Title', 'Year', 'DOI', 'Source', ...MATRIX_COLUMNS.map((c) => c.label)]
    const lines = rows.map((p) =>
      [p.bibKey, shortCite(p), p.title, String(p.year ?? ''), p.doi ?? '', p.matrixSource ?? '', ...MATRIX_COLUMNS.map((c) => p.matrix?.[c.id] ?? '')].map(csvCell).join(','),
    )
    // BOM so Excel opens UTF-8 (σ, °, –) correctly.
    downloadText('﻿' + [head.join(','), ...lines].join('\n'), 'literature-matrix.csv', 'text/csv')
  }

  const missing = inScope.filter((p) => !p.matrix).length

  return (
    <div className="space-y-3">
      <Card>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {picker}
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={preferFulltext} onChange={(e) => setPreferFulltext(e.target.checked)} />
              Use PDF full text when attached (otherwise the abstract)
            </label>
          </div>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Your topic, for the Relevance column — e.g. deep learning for short-term rockburst warning from microseismic data" />
          <div className="flex flex-wrap items-center gap-2">
            {busy ? (
              <Button variant="danger" onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <>
                <Button disabled={!llm.ready || !missing} onClick={() => extract(false)}>
                  Extract {missing} missing row{missing === 1 ? '' : 's'}
                </Button>
                <Button variant="ghost" disabled={!llm.ready || !inScope.length} onClick={() => window.confirm(`Re-extract all ${inScope.length} rows? This replaces existing rows.`) && extract(true)}>
                  Re-extract all
                </Button>
                <Button variant="ghost" disabled={!llm.ready || rows.length < 2} onClick={synthesize}>
                  Synthesise themes & gaps
                </Button>
                <Button variant="ghost" disabled={!rows.length} onClick={exportCsv}>
                  Export CSV
                </Button>
                <Button variant="ghost" disabled={!rows.length} onClick={() => navigator.clipboard.writeText(matrixMarkdown(rows))}>
                  Copy as Markdown
                </Button>
              </>
            )}
            <span className="text-xs text-stone-500">{llm.missing || llm.label}</span>
          </div>
          {progress && <p className="text-xs text-stone-500">{progress}</p>}
          {errors.length > 0 && <pre className="text-xs whitespace-pre-wrap text-red-700">{errors.join('\n')}</pre>}
        </div>
      </Card>

      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">
          No matrix rows yet for this scope. Extraction reads each paper's PDF text or abstract and fills the columns below; values that are not in
          the text are marked "not reported".
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 dark:bg-stone-950 dark:text-stone-400">
              <tr>
                <th className="sticky left-0 bg-stone-50 p-2 dark:bg-stone-950">Study</th>
                {MATRIX_COLUMNS.map((c) => (
                  <th key={c.id} className="p-2">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-stone-200 align-top dark:border-stone-800">
                  <td className="sticky left-0 w-40 bg-white p-2 dark:bg-stone-900" title={p.title}>
                    <span className="font-medium">{shortCite(p)}</span>
                    <span className="block text-stone-500">@{p.bibKey}</span>
                    <span className="block text-stone-400">{p.matrixSource === 'fulltext' ? 'from full text' : 'from abstract'}</span>
                  </td>
                  {MATRIX_COLUMNS.map((c) => {
                    const v = p.matrix?.[c.id] ?? ''
                    return (
                      <td key={c.id} className={`p-2 ${/^not reported/i.test(v) ? 'text-stone-400' : ''}`}>
                        {v}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {synthesis && (
        <Card
          title={
            <span className="flex items-center justify-between">
              Synthesis
              <Button variant="ghost" className="text-xs" onClick={() => navigator.clipboard.writeText(synthesis)}>
                Copy
              </Button>
            </span>
          }
        >
          <Markdown text={synthesis} />
        </Card>
      )}
    </div>
  )
}
