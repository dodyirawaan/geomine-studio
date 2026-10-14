import { Download, Upload, Users } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, Input } from '../../components/ui'
import { downloadBlob } from '../../lib/download'
import { agreement, blindSheet, castVote, DECISIONS, disableDual, enableDual, kappaLabel, readSheet, vote, type Reviewer } from '../../review/dual'
import type { Save } from '../../review/project'
import type { ReviewProject } from '../../review/types'

/** Two independent reviewers: who is screening here, agreement (Cohen's kappa), and exchange with a reviewer working elsewhere. */
export function DualCard({ p, save, aiLabel }: { p: ReviewProject; save: Save; aiLabel: string }) {
  const dual = p.dual
  const [names, setNames] = useState<[string, string]>(dual?.names ?? ['Reviewer 1', 'Reviewer 2'])
  const [sheetFor, setSheetFor] = useState<Reviewer>(dual?.active === 2 ? 1 : 2)
  const [status, setStatus] = useState('')

  if (!dual?.enabled) {
    return (
      <Card title="Two independent reviewers">
        <div className="flex gap-3 text-sm">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-stone-600 dark:text-stone-400">
              Q1 journals expect screening by two reviewers working independently, with their agreement reported (Cohen’s kappa). Each reviewer decides blind to the other;
              agreements become final, disagreements are resolved by discussion. The second reviewer can screen in this browser, in their own copy of the app, or in Excel.
              Decisions made so far count as the first reviewer’s.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input value={names[0]} onChange={(e) => setNames([e.target.value, names[1]])} className="w-40" aria-label="Name of reviewer 1" />
              <Input value={names[1]} onChange={(e) => setNames([names[0], e.target.value])} className="w-40" aria-label="Name of reviewer 2" />
              <Button variant="ghost" onClick={() => save((cur) => enableDual(cur, [names[0].trim() || 'Reviewer 1', names[1].trim() || 'Reviewer 2']))}>
                Turn on two-reviewer screening
              </Button>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  const a = agreement(p.records)
  const left = (who: Reviewer) => p.records.filter((r) => !vote(r, who)).length
  const aiForR2 = p.records.filter((r) => r.ai && !r.ta2).length

  async function importSheet(file: File) {
    const known = new Set(p.records.map((r) => r.id))
    try {
      const res = readSheet(await file.text(), known)
      await save((cur) => ({ records: cur.records.map((r) => (res.votes.has(r.id) ? castVote(r, sheetFor, res.votes.get(r.id)!.d, res.votes.get(r.id)!.reason, false, false) : r)) }))
      setStatus(
        `${res.votes.size} decisions imported for ${dual!.names[sheetFor - 1]}` +
          [res.blank && `${res.blank} rows left blank`, res.invalid && `${res.invalid} with an unreadable decision`, res.unknown && `${res.unknown} unknown ids`].filter(Boolean).map((x) => `; ${x}`).join('') +
          '.',
      )
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  return (
    <Card title="Two independent reviewers">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span>Screening in this browser as</span>
          {([1, 2] as Reviewer[]).map((w) => (
            <Button key={w} variant={dual.active === w ? 'primary' : 'ghost'} className="min-h-8 text-xs" onClick={() => save({ dual: { ...dual, active: w } })}>
              {dual.names[w - 1]} ({left(w)} left)
            </Button>
          ))}
          <Button variant="subtle" className="ml-auto min-h-8 text-xs" onClick={() => window.confirm('Return to single-reviewer screening? Final decisions are kept; open records take reviewer 1’s decision.') && save((cur) => disableDual(cur))}>
            Turn off
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            {a.n ? (
              <>
                <p>
                  <b>Cohen’s κ = {a.kappa.toFixed(2)}</b> <span className="text-stone-500">(95% CI {a.ci[0].toFixed(2)}–{a.ci[1].toFixed(2)})</span> · {kappaLabel(a.kappa)} agreement ·{' '}
                  {(a.po * 100).toFixed(1)}% of {a.n} records decided by both
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {a.conflicts ? (
                    <>
                      <Badge tone="amber">{a.conflicts} disagreements open</Badge> — choose “Disagreements to resolve” in the list below.
                    </>
                  ) : (
                    'No open disagreements.'
                  )}
                  {a.resolved ? ` ${a.resolved} resolved.` : ''} Kappa above 0.6 is usually considered acceptable; if it is low early on, discuss the criteria and refine them before continuing.
                </p>
              </>
            ) : (
              <p className="text-stone-500">Agreement appears once both reviewers have decided the same records.</p>
            )}
          </div>
          {a.n > 0 && (
            <table className="text-xs tabular-nums">
              <caption className="pb-1 text-left text-stone-500">
                rows {dual.names[0]}, columns {dual.names[1]}
              </caption>
              <thead>
                <tr>
                  <th />
                  {DECISIONS.map((d) => (
                    <th key={d} className="px-2 font-medium">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DECISIONS.map((r) => (
                  <tr key={r}>
                    <th className="pr-2 text-left font-medium">{r}</th>
                    {DECISIONS.map((c) => (
                      <td key={c} className={`px-2 text-center ${!a.table[r][c] ? 'text-stone-400' : r === c ? 'font-semibold text-green-700 dark:text-green-400' : a.table[r][c] ? 'text-amber-800 dark:text-amber-400' : 'text-stone-400'}`}>
                        {a.table[r][c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800/60">
          <p className="font-medium">Reviewer working elsewhere (Excel or another device)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs">Sheet for</span>
            {([1, 2] as Reviewer[]).map((w) => (
              <Button key={w} variant={sheetFor === w ? 'primary' : 'ghost'} className="min-h-8 text-xs" onClick={() => setSheetFor(w)}>
                {dual.names[w - 1]}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="min-h-8 text-xs"
              disabled={!left(sheetFor)}
              onClick={() => downloadBlob(new Blob([blindSheet(p, sheetFor)], { type: 'text/csv;charset=utf-8' }), `screening-${dual.names[sheetFor - 1].replace(/\W+/g, '-').toLowerCase()}.csv`)}
            >
              <Download className="h-3.5 w-3.5" /> Download blind sheet ({left(sheetFor)} records)
            </Button>
            <label className="inline-flex cursor-pointer">
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importSheet(f)
                  e.target.value = ''
                }}
              />
              <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
                <Upload className="h-3.5 w-3.5" /> Import filled sheet
              </span>
            </label>
          </div>
          <p className="mt-1.5 text-xs text-stone-500">
            The sheet holds titles and abstracts only — no decisions of the other reviewer or the AI. Fill the decision column with include, exclude or maybe and a reason
            (criterion code), save as CSV and import it here.
          </p>
          {status && <p className="mt-1.5 text-xs text-stone-700 dark:text-stone-300">{status}</p>}
        </div>

        <div className="text-xs text-stone-500">
          <p>
            Working alone? The AI can act as the second screener: its suggestions become {dual.names[1]}’s decisions, and the Methods state that a language model was the second
            screener. Screen as {dual.names[0]} first without looking at the suggestions.
          </p>
          <Button
            variant="ghost"
            className="mt-1.5 min-h-8 text-xs"
            disabled={!aiForR2}
            onClick={() =>
              window.confirm(`Use ${aiForR2} AI suggestions (${aiLabel}) as ${dual.names[1]}'s decisions? Record the model name and version in the Methods.`) &&
              save((cur) => ({ records: cur.records.map((r) => (r.ai && !r.ta2 ? castVote(r, 2, r.ai.decision, r.ai.reason, true) : r)) }))
            }
          >
            Use {aiForR2} AI suggestions as {dual.names[1]}
          </Button>
        </div>
      </div>
    </Card>
  )
}
