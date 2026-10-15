import { Download, Gauge, Upload } from 'lucide-react'
import { useState } from 'react'
import { explainError } from '../../ai/errors'
import { Badge, Button, Card, Select } from '../../components/ui'
import { downloadBlob } from '../../lib/download'
import { castVote, myDecision } from '../../review/dual'
import { asreviewCsv, readToolExport, screeningRis } from '../../review/exchange'
import { randomSample, relevant, stopStatus } from '../../review/prioritise'
import type { Save } from '../../review/project'
import type { ReviewProject } from '../../review/types'

/** Records nobody has decided yet: the ones a stopping rule may close. */
const untouched = (p: ReviewProject) => p.records.filter((r) => !r.ta && !r.ta1 && !r.ta2 && !r.auto)

export function PrioritiseCard({ p, save, trained }: { p: ReviewProject; save: Save; trained: { relevant: number; irrelevant: number } | null }) {
  const aids = p.aids ?? {}
  const k = aids.stopAfter ?? 50
  const mine = myDecision(p)
  const st = stopStatus(p.records, mine, k)
  const rest = untouched(p)
  const checks = p.records.filter((r) => r.check)
  const checksOpen = checks.filter((r) => !mine(r)).length
  // A check sample that turned up relevant records means screening goes on; once the run is reached again, draw another.
  const checksRelevant = checks.filter((r) => mine(r) && relevant(mine(r)!)).length
  const canDraw = rest.some((r) => !r.check) && st.runReached && checksOpen === 0 && (checks.length === 0 || checksRelevant > 0)
  // Stopping is only offered when every criterion is met, so the Methods can state them truthfully.
  const canStop = st.minFraction && st.runReached && checks.length > 0 && checksOpen === 0 && rest.some((r) => !r.check)
  const pool = rest.filter((r) => !r.check)
  const sampleN = Math.min(pool.length, Math.max(20, Math.round(0.05 * pool.length)))

  async function drawSample() {
    const ids = new Set(randomSample(pool, sampleN, Date.now() % 100000).map((r) => r.id))
    await save((cur) => ({ records: cur.records.map((r) => (ids.has(r.id) ? { ...r, check: true } : r)), aids: { ...cur.aids, sampleSize: (cur.aids?.sampleSize ?? 0) + ids.size } }))
  }

  async function stop() {
    if (!window.confirm(`Mark the ${rest.filter((r) => !r.check).length} records nobody has screened as ineligible (stopping rule)? This is reported in PRISMA and the Methods, and can be undone.`)) return
    await save((cur) => {
      const left = new Set(untouched(cur).filter((r) => !r.check).map((r) => r.id))
      const sample = cur.records.filter((r) => r.check)
      const dec = myDecision(cur)
      return {
        records: cur.records.map((r) => (left.has(r.id) ? { ...r, ta: 'exclude' as const, taReason: 'Not screened — stopping rule of prioritised screening', auto: true } : r)),
        aids: {
          ...cur.aids,
          stopped: { at: Date.now(), screened: st.screened, total: st.total, run: st.run, k, marked: left.size, sample: sample.length, sampleRelevant: sample.filter((r) => dec(r) && relevant(dec(r)!)).length },
        },
      }
    })
  }

  const undoStop = () =>
    save((cur) => ({ records: cur.records.map((r) => (r.auto ? { ...r, ta: undefined, taReason: undefined, auto: undefined } : r)), aids: { ...cur.aids, stopped: undefined } }))

  return (
    <Card title="Prioritised screening (active learning, no AI provider)">
      <div className="flex gap-3 text-sm">
        <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-stone-600 dark:text-stone-400">
            Like ASReview: a small model learns from your own include/exclude decisions and shows the records most likely to be relevant first, so most relevant studies are
            found after screening a fraction of the list. It runs in this browser — no API key, no quota — and only orders the records; you still make every decision.
          </p>
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={!!aids.prioritised} onChange={(e) => {
              // Read the value now: the update runs later, after React has reset the controlled input.
              const on = e.target.checked
              void save((cur) => ({ aids: { ...cur.aids, prioritised: on } }))
            }} />
            Show the most likely relevant records first
          </label>
          {aids.prioritised && (
            <>
              <p className="text-xs text-stone-500">
                {trained
                  ? `Model trained on ${trained.relevant} relevant (include/maybe) and ${trained.irrelevant} irrelevant decisions; it updates after every decision.`
                  : 'Start by deciding at least one relevant and one irrelevant record (search the list for a study you know belongs in the review); the order then adapts.'}
              </p>
              <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800/60">
                <p className="font-medium">When to stop (SAFE procedure)</p>
                <ul className="mt-1.5 space-y-1 text-xs">
                  <li>
                    <Badge tone={st.minFraction ? 'green' : 'stone'}>{st.minFraction ? '✓' : '…'}</Badge> At least 10% screened: {st.screened} of {st.total} (
                    {st.total ? ((100 * st.screened) / st.total).toFixed(1) : 0}%)
                  </li>
                  <li className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={st.runReached ? 'green' : 'stone'}>{st.runReached ? '✓' : '…'}</Badge> Irrelevant in a row since the last relevant record: {st.run} of
                    <Select value={String(k)} onChange={(e) => {
                        const n = Number(e.target.value)
                        void save((cur) => ({ aids: { ...cur.aids, stopAfter: n } }))
                      }} className="min-h-7 w-auto py-0 text-xs">
                      {[50, 100, 150, 200].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </li>
                  <li>
                    <Badge tone={checks.length && !checksOpen ? 'green' : 'stone'}>{checks.length && !checksOpen ? '✓' : '…'}</Badge> Random check of the unscreened records:{' '}
                    {checks.length ? `${checks.length - checksOpen} of ${checks.length} screened (filter “Random check sample”)` : 'not drawn yet'}
                  </li>
                </ul>
                {aids.stopped ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span>
                      Stopped on {new Date(aids.stopped.at).toLocaleDateString()}: {aids.stopped.marked} records marked ineligible by the stopping rule
                      {aids.stopped.sample ? `; check sample ${aids.stopped.sampleRelevant} relevant of ${aids.stopped.sample}` : ''}.
                    </span>
                    <Button variant="subtle" className="min-h-8 text-xs" onClick={() => window.confirm('Undo the stop and screen the remaining records?') && undoStop()}>
                      Undo stop
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button variant="ghost" className="min-h-8 text-xs" disabled={!canDraw} onClick={drawSample}>
                      {checksRelevant ? 'Draw another' : 'Draw a'} random check sample ({sampleN})
                    </Button>
                    <Button className="min-h-8 text-xs" disabled={!canStop} onClick={stop}>
                      Stop screening…
                    </Button>
                  </div>
                )}
                <p className="mt-2 text-xs text-stone-500">
                  If the check sample turns up relevant records, keep screening — the model has not found them all yet. Everything here is written into the Methods and PRISMA.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

const TOOLS = ['ASReview LAB', 'Rayyan', 'Covidence', 'EPPI-Reviewer']

export function ExchangeCard({ p, save }: { p: ReviewProject; save: Save }) {
  const [status, setStatus] = useState('')
  const mine = myDecision(p)
  const slug = p.title.replace(/\W+/g, '-').toLowerCase().slice(0, 40)

  async function importFile(f: File) {
    try {
      const res = readToolExport(await f.text(), p.records)
      if (!res.votes.size) return setStatus(`No decisions found (${res.unmatched} rows did not match a record, ${res.undecided} had no decision).`)
      await save((cur) => ({
        records: cur.records.map((r) => {
          const v = res.votes.get(r.id)
          if (!v) return r
          if (cur.dual?.enabled) return castVote(r, cur.dual.active, v.d, v.reason, false, false)
          return { ...r, ta: v.d, taReason: v.reason, auto: undefined, ...(v.d !== 'include' ? { ft: undefined, ftReason: undefined } : {}) }
        }),
        aids: { ...cur.aids, external: [...(cur.aids?.external ?? []), { tool: res.tool, at: Date.now(), decisions: res.votes.size }] },
      }))
      setStatus(`${res.votes.size} decisions imported from ${res.tool}${res.unmatched ? `; ${res.unmatched} rows did not match a record` : ''}${res.undecided ? `; ${res.undecided} rows without a decision` : ''}.`)
    } catch (e) {
      setStatus(explainError(e))
    }
  }

  return (
    <Card title="Screen in ASReview, Rayyan or Covidence">
      <div className="space-y-2 text-sm">
        <p className="text-stone-600 dark:text-stone-400">
          Prefer an established, citable tool? Export the records, screen them in {TOOLS.join(', ')}, and import the decisions back — they are matched by id, DOI or title,
          and the Methods name the tool (add its version).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" className="min-h-8 text-xs" onClick={() => downloadBlob(new Blob([asreviewCsv(p, mine)], { type: 'text/csv;charset=utf-8' }), `${slug}-asreview.csv`)}>
            <Download className="h-3.5 w-3.5" /> CSV for ASReview LAB
          </Button>
          <Button variant="ghost" className="min-h-8 text-xs" onClick={() => downloadBlob(new Blob([screeningRis(p)], { type: 'application/x-research-info-systems' }), `${slug}-screening.ris`)}>
            <Download className="h-3.5 w-3.5" /> RIS for Rayyan / Covidence
          </Button>
          <label className="inline-flex cursor-pointer">
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importFile(f)
                e.target.value = ''
              }}
            />
            <span className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
              <Upload className="h-3.5 w-3.5" /> Import decisions (CSV export)
            </span>
          </label>
        </div>
        <p className="text-xs text-stone-500">
          ASReview: decisions you already made are passed as labels, so it starts from them; export the project as CSV afterwards. Rayyan: export the review as CSV (the
          decisions are read from the notes). With two reviewers, imported decisions count for the reviewer screening in this browser.
        </p>
        {status && <p className="text-xs text-stone-700 dark:text-stone-300">{status}</p>}
      </div>
    </Card>
  )
}
