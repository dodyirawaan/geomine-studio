import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button, Card, Input } from '../../components/ui'
import { countWords } from '../../manuscript/templates'
import { restoreSnapshot, takeSnapshot } from '../../pipeline/snapshots'
import { db, type Manuscript } from '../../store/db'

export default function HistoryTab({ m }: { m: Manuscript }) {
  const snaps = useLiveQuery(() => db.snapshots.where('manuscriptId').equals(m.id).reverse().sortBy('createdAt'), [m.id])
  const [label, setLabel] = useState('')
  const words = (sections: Manuscript['sections']) => sections.filter((s) => s.role === 'body').reduce((n, s) => n + countWords(s.content), 0)

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            await takeSnapshot(m, label.trim() || 'Manual snapshot')
            setLabel('')
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Submitted to TUST, Round 1 revision" className="min-w-0 flex-1" />
          <Button type="submit">Save snapshot</Button>
        </form>
        <p className="mt-2 text-xs text-stone-500">
          Snapshots are also saved automatically before AI text is accepted and before a restore. The newest 50 per manuscript are kept, in this
          browser only.
        </p>
      </Card>
      {!snaps?.length ? (
        <p className="text-sm text-stone-500">No snapshots yet.</p>
      ) : (
        <ul className="space-y-2">
          {snaps.map((s) => (
            <li key={s.id} className="rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-800 dark:bg-stone-900">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-stone-500">
                    {new Date(s.createdAt).toLocaleString()} · {words(s.sections).toLocaleString()} words
                  </span>
                  <span className="ml-auto flex gap-1.5">
                    <Button
                      variant="ghost"
                      className="text-xs"
                      onClick={(e) => {
                        e.preventDefault()
                        if (window.confirm(`Restore "${s.label}"? The current text is saved as a snapshot first.`)) restoreSnapshot(s)
                      }}
                    >
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-xs hover:text-red-600"
                      onClick={(e) => {
                        e.preventDefault()
                        if (window.confirm('Delete this snapshot?')) db.snapshots.delete(s.id!)
                      }}
                    >
                      Delete
                    </Button>
                  </span>
                </summary>
                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {s.sections.map((sec) => {
                      const now = m.sections.find((x) => x.id === sec.id)
                      const changed = !now || now.content !== sec.content
                      return (
                        <tr key={sec.id} className="border-t border-stone-200 dark:border-stone-800">
                          <td className="py-1">{sec.title}</td>
                          <td className="py-1 text-right tabular-nums">{countWords(sec.content)} w</td>
                          <td className={`py-1 pl-3 ${changed ? 'text-amber-700' : 'text-stone-400'}`}>{changed ? 'differs from current' : 'same'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
