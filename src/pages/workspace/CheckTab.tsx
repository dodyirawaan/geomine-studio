import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildSystemPrompt } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { Button, Card } from '../../components/ui'
import { checkManuscript, type Issue, type Severity } from '../../pipeline/check'
import { consistencyRequest, parseFindings, type AiFinding } from '../../pipeline/prompts'
import type { Manuscript } from '../../store/db'

const BADGE: Record<Severity, string> = {
  error: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  info: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
}

export default function CheckTab({ m }: { m: Manuscript }) {
  const issues = useMemo(() => checkManuscript(m), [m])
  const [show, setShow] = useState<Record<Severity, boolean>>({ error: true, warning: true, info: true })
  const counts = issues.reduce<Record<Severity, number>>((c, i) => ({ ...c, [i.severity]: c[i.severity] + 1 }), { error: 0, warning: 0, info: 0 })
  const categories = [...new Set(issues.map((i) => i.category))]

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Rule-based check</span>
          <span className="text-xs text-stone-500">Runs on every change: citations, placeholders, figure/table numbering, abbreviations, units, spelling, summary values.</span>
          <span className="ml-auto flex gap-1.5">
            {(['error', 'warning', 'info'] as Severity[]).map((s) => (
              <button
                key={s}
                onClick={() => setShow({ ...show, [s]: !show[s] })}
                className={`rounded px-2 py-0.5 text-xs ${BADGE[s]} ${show[s] ? '' : 'opacity-40'}`}
              >
                {counts[s]} {s}
                {counts[s] === 1 ? '' : 's'}
              </button>
            ))}
          </span>
        </div>
        {!issues.length && <p className="mt-3 text-sm text-green-700">No issues found.</p>}
        <div className="mt-3 space-y-3">
          {categories.map((cat) => {
            const list = issues.filter((i) => i.category === cat && show[i.severity])
            if (!list.length) return null
            return (
              <div key={cat}>
                <p className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{cat}</p>
                <ul className="space-y-1">
                  {list.map((i, k) => (
                    <IssueRow key={k} m={m} issue={i} />
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </Card>
      <AiCheck m={m} />
    </div>
  )
}

function IssueRow({ m, issue }: { m: Manuscript; issue: Issue }) {
  return (
    <li className="flex gap-2 text-sm">
      <span className={`h-fit shrink-0 rounded px-1.5 py-0.5 text-xs ${BADGE[issue.severity]}`}>{issue.severity}</span>
      <span className="min-w-0">
        {issue.message}
        {issue.sectionId && (
          <Link to={`/manuscripts/${m.id}?section=${issue.sectionId}`} className="ml-1.5 text-xs text-amber-700 underline dark:text-amber-500">
            {issue.section}
          </Link>
        )}
        {issue.excerpt && <span className="block text-xs text-stone-500 italic">{issue.excerpt}</span>}
      </span>
    </li>
  )
}

function AiCheck({ m }: { m: Manuscript }) {
  const llm = useLLM()
  const [findings, setFindings] = useState<AiFinding[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  async function run() {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(true)
    setError('')
    try {
      const { text } = await llm.run(buildSystemPrompt('reviewer', m.journal), consistencyRequest(m), { signal: ctrl.signal, feature: 'AI consistency check' })
      setFindings(parseFindings(text))
    } catch (e) {
      if (!ctrl.signal.aborted) setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="AI consistency check">
      <p className="mb-2 text-sm text-stone-600 dark:text-stone-400">
        The model reads the whole manuscript looking for contradictions the rules cannot see: values that differ between sections, claims the
        results do not support, inconsistent symbols or terms. <span className="text-xs text-stone-500">{llm.missing || llm.label}</span>
      </p>
      {busy ? (
        <Button variant="danger" onClick={() => abortRef.current?.abort()}>
          Stop
        </Button>
      ) : (
        <Button disabled={!llm.ready} onClick={run}>
          {findings ? 'Run again' : 'Run AI check'}
        </Button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {findings && (
        <ul className="mt-3 space-y-2">
          {!findings.length && <li className="text-sm text-green-700">No inconsistencies reported.</li>}
          {findings.map((f, i) => {
            const s = m.sections.find((x) => x.title.toLowerCase() === f.section?.toLowerCase())
            return (
              <li key={i} className="rounded-md border border-stone-200 p-2.5 text-sm dark:border-stone-800">
                {s ? (
                  <Link to={`/manuscripts/${m.id}?section=${s.id}`} className="text-xs text-amber-700 underline dark:text-amber-500">
                    {s.title}
                  </Link>
                ) : (
                  <span className="text-xs text-stone-500">{f.section}</span>
                )}
                <span className="block">{f.problem}</span>
                {f.quote && <span className="block text-xs text-stone-500 italic">“{f.quote}”</span>}
                {f.fix && <span className="block text-xs text-stone-600 dark:text-stone-400">Fix: {f.fix}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
