import { useRef, useState, type FormEvent } from 'react'
import { buildSystemPrompt } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { Markdown } from '../../components/Markdown'
import { Button, Card } from '../../components/ui'
import { shortCite } from '../../literature/library'
import { askRequest } from '../../literature/prompts'
import { bm25, type Passage } from '../../literature/retrieval'
import { db, type Paper } from '../../store/db'
import { useScope } from './scope'

interface Turn {
  question: string
  answer: string
  sources: (Passage & { key: string; score: number })[]
  error?: string
}

export default function AskTab({ papers, selected }: { papers: Paper[]; selected: Set<string> }) {
  const llm = useLLM()
  const { inScope, picker } = useScope(papers, selected)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const withPdf = inScope.filter((p) => p.pdfPages).length

  async function ask(e?: FormEvent) {
    e?.preventDefault()
    const q = question.trim()
    if (!q || busy) return
    setBusy(true)
    const ids = inScope.map((p) => p.id)
    const byId = new Map(inScope.map((p) => [p.id, p]))
    const chunks = await db.chunks.where('paperId').anyOf(ids).toArray()
    const passages: Passage[] = [
      ...chunks.map((c) => ({ paperId: c.paperId, page: c.page, text: c.text })),
      ...inScope.filter((p) => p.abstract).map((p) => ({ paperId: p.id, page: 0, text: `${p.title}. ${p.abstract}` })),
    ]
    const sources = bm25(passages, q, 10).map((s) => ({ ...s, key: byId.get(s.paperId)!.bibKey }))
    const idx = turns.length
    setTurns((t) => [...t, { question: q, answer: '', sources }])
    setQuestion('')
    if (!sources.length) {
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, error: 'No passage in the selected papers matches this question. Try other keywords or attach more PDFs.' } : x)))
      setBusy(false)
      return
    }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await llm.run(buildSystemPrompt('literature', ''), askRequest(q, sources), {
        signal: ctrl.signal,
        onText: (acc) => setTurns((t) => t.map((x, i) => (i === idx ? { ...x, answer: acc } : x))),
      })
    } catch (err) {
      if (!ctrl.signal.aborted) setTurns((t) => t.map((x, i) => (i === idx ? { ...x, error: (err as Error).message } : x)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <form onSubmit={ask} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {picker}
            <span className="text-xs text-stone-500">
              Searching {withPdf} PDF{withPdf === 1 ? '' : 's'} and {inScope.filter((p) => p.abstract).length} abstracts · {llm.missing || llm.label}
            </span>
          </div>
          <div className="flex gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask()
              }}
              rows={2}
              placeholder="e.g. Which input parameters do ML rockburst models use most often, and what accuracies are reported?"
              className="flex-1 resize-y rounded-md border border-stone-300 bg-white p-2.5 text-sm outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-900"
            />
            {busy ? (
              <Button type="button" variant="danger" onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!question.trim() || !llm.ready || !inScope.length}>
                Ask
              </Button>
            )}
          </div>
          <p className="text-xs text-stone-500">
            The most relevant passages (keyword ranking, BM25) are sent to the model, which must cite them as [@key, p. N]. Attach PDFs in the
            Library for answers beyond the abstracts.
          </p>
        </form>
      </Card>

      {[...turns].reverse().map((t, i) => (
        <Card key={turns.length - i}>
          <p className="mb-2 font-medium">{t.question}</p>
          {t.error ? <p className="text-sm text-red-700">{t.error}</p> : <Markdown text={t.answer || '…'} />}
          {t.sources.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-stone-500">{t.sources.length} source passages</summary>
              <ol className="mt-2 space-y-2">
                {t.sources.map((s, j) => {
                  const p = papers.find((x) => x.id === s.paperId)
                  return (
                    <li key={j} className="rounded border border-stone-200 p-2 dark:border-stone-800">
                      <span className="font-medium">
                        S{j + 1} · {p ? shortCite(p) : s.key} · {s.page === 0 ? 'abstract' : `p. ${s.page}`}
                      </span>
                      <span className="text-stone-400"> · @{s.key}</span>
                      <p className="mt-1 text-stone-600 dark:text-stone-400">{s.text.length > 600 ? `${s.text.slice(0, 600)}…` : s.text}</p>
                    </li>
                  )
                })}
              </ol>
            </details>
          )}
        </Card>
      ))}
    </div>
  )
}
