import { useMemo } from 'react'
import { Card } from '../../components/ui'
import { checkManuscript } from '../../pipeline/check'
import { checklistFor, type ChecklistItem } from '../../pipeline/checklist'
import { db, type Manuscript } from '../../store/db'

const GROUPS: ChecklistItem['group'][] = ['Content', 'Integrity', 'Declarations', 'Submission']

export default function ChecklistTab({ m }: { m: Manuscript }) {
  const issues = useMemo(() => checkManuscript(m), [m])
  const items = checklistFor(m)
  const state = items.map((it) => {
    const auto = it.auto?.(m, issues)
    return { it, auto, ok: auto ? auto.ok : !!m.checklist?.[it.id] }
  })
  const done = state.filter((s) => s.ok).length

  const toggle = (id: string) => db.manuscripts.update(m.id, { checklist: { ...m.checklist, [id]: !m.checklist?.[id] } })

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded bg-stone-200 dark:bg-stone-800">
            <div className="h-full bg-green-600 transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
          <span className="text-sm font-medium tabular-nums">
            {done}/{items.length}
          </span>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Items marked <b>auto</b> are evaluated from the manuscript and update as you write; tick the others yourself when done.
        </p>
      </Card>
      {GROUPS.map((g) => (
        <Card key={g} title={g}>
          <ul className="space-y-1.5">
            {state
              .filter((s) => s.it.group === g)
              .map(({ it, auto, ok }) => (
                <li key={it.id} className="flex items-start gap-2 text-sm">
                  {auto ? (
                    <span className={`mt-0.5 w-4 shrink-0 text-center ${ok ? 'text-green-600' : 'text-red-600'}`}>{ok ? '✓' : '✗'}</span>
                  ) : (
                    <input type="checkbox" className="mt-1 w-4 shrink-0" checked={ok} onChange={() => toggle(it.id)} />
                  )}
                  <span className="min-w-0 flex-1">
                    {it.label}
                    {auto && <span className="ml-1.5 rounded bg-stone-100 px-1 text-[10px] text-stone-500 uppercase dark:bg-stone-800">auto</span>}
                    {auto?.detail && <span className="block text-xs text-stone-500">{auto.detail}</span>}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}
