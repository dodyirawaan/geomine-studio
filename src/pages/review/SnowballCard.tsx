import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, Select } from '../../components/ui'
import { methodById } from '../../review/prompts'
import type { Save } from '../../review/project'
import { addChased, chase, chasedBefore, chaseSeeds, type ChaseResult, type Direction } from '../../review/snowball'
import type { ReviewProject } from '../../review/types'
import { useVault } from '../../store/vault'

const LABEL: Record<Direction, string> = { backward: 'Backward — reference lists', forward: 'Forward — citing works' }

export function SnowballCard({ p, save }: { p: ReviewProject; save: Save }) {
  const { secrets } = useVault()
  const m = methodById(p.method)
  const [onlyNew, setOnlyNew] = useState(true)
  const [applyLimits, setApplyLimits] = useState(true)
  const [limit, setLimit] = useState(1000)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ChaseResult | null>(null)
  const [minLinks, setMinLinks] = useState(1)

  const all = chaseSeeds(p, m.fullText)
  const seedsFor = (d: Direction) => {
    const done = chasedBefore(p, d)
    return onlyNew ? all.filter((r) => !done.has(r.id)) : all
  }

  async function run(d: Direction) {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const r = await chase(p, d, seedsFor(d), { apiKey: secrets.openalexKey, limit, applyLimits, onProgress: setProgress })
      setResult(r)
      setMinLinks(1)
      setProgress('')
    } catch (e) {
      setError((e as Error).message)
      setProgress('')
    } finally {
      setBusy(false)
    }
  }

  async function add() {
    if (!result) return
    await save((cur) => addChased(cur, result, minLinks))
    setProgress(`${result.candidates.filter((c) => c.links.length >= minLinks).length} records added — screen them in the Screening step (filter “To screen”).`)
    setResult(null)
  }

  const atLeast = (k: number) => result?.candidates.filter((c) => c.links.length >= k).length ?? 0
  const runs = p.snowballs ?? []

  return (
    <Card title="Citation searching (snowballing)">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Finds studies the database search missed: <b>backward</b> through the reference lists of your included studies and <b>forward</b> through the works that cite them
        (OpenAlex citation links). New works are added as records from other methods, screened with the same criteria and shown separately in the PRISMA diagram and Methods.
        Repeat after screening until a round finds nothing new.
      </p>
      {!all.length ? (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-400">Include studies first{m.fullText ? ' (title/abstract and full text)' : ''} — they are the starting set.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span>
              Starting set: <b>{all.length}</b> included stud{all.length === 1 ? 'y' : 'ies'}
            </span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
              only studies not chased before
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={applyLimits} onChange={(e) => setApplyLimits(e.target.checked)} />
              apply the protocol's year{p.protocol.articlesOnly ? ' and document-type' : ''} limits
            </label>
            <label className="flex items-center gap-1.5">
              at most
              <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} className="w-auto">
                {[500, 1000, 2000, 5000].map((n) => (
                  <option key={n} value={n}>
                    {n.toLocaleString()}
                  </option>
                ))}
              </Select>
              works per run
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="ghost" disabled={busy || !seedsFor('backward').length} onClick={() => run('backward')}>
              <ArrowDownLeft className="h-4 w-4" /> Backward ({seedsFor('backward').length})
            </Button>
            <Button variant="ghost" disabled={busy || !seedsFor('forward').length} onClick={() => run('forward')}>
              <ArrowUpRight className="h-4 w-4" /> Forward ({seedsFor('forward').length})
            </Button>
            {progress && <span className="text-xs text-stone-500">{progress}</span>}
          </div>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
          <p className="font-medium">{LABEL[result.direction]}</p>
          <p className="mt-1 text-stone-600 dark:text-stone-400">
            {result.total.toLocaleString()} linked works in OpenAlex; <b>{result.candidates.length.toLocaleString()}</b> are new to this review
            {result.truncated ? ` (retrieval stopped at ${limit.toLocaleString()} — the most ${result.direction === 'backward' ? 'shared' : 'cited'} were kept)` : ''}.
          </p>
          {result.candidates.length > 0 && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span>Add works linked to at least</span>
                <Select value={String(minLinks)} onChange={(e) => setMinLinks(Number(e.target.value))} className="w-auto">
                  {[1, 2, 3, 5].map((k) => (
                    <option key={k} value={k}>
                      {k} included stud{k === 1 ? 'y' : 'ies'} ({atLeast(k).toLocaleString()})
                    </option>
                  ))}
                </Select>
                <Button disabled={!atLeast(minLinks)} onClick={add}>
                  Add {atLeast(minLinks).toLocaleString()} records to screening
                </Button>
                <Button variant="subtle" onClick={() => setResult(null)}>
                  Discard
                </Button>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Screening every new work is the standard; a threshold above 1 keeps the most connected ones and is reported in the Methods.
              </p>
              <ul className="mt-3 space-y-1.5">
                {result.candidates.slice(0, 8).map((c) => (
                  <li key={c.meta.openalexId} className="flex gap-2 text-xs">
                    <Badge tone={c.links.length > 1 ? 'amber' : 'stone'}>{c.links.length}×</Badge>
                    <span className="min-w-0">
                      {c.meta.title} <span className="text-stone-500">· {c.meta.year ?? 'n.d.'} · {c.meta.venue ?? ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {result.candidates.length > 8 && <p className="mt-1 text-xs text-stone-500">…and {(result.candidates.length - 8).toLocaleString()} more.</p>}
            </>
          )}
        </div>
      )}

      {runs.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-stone-500">
          {runs.map((r, i) => (
            <li key={i}>
              {new Date(r.at).toLocaleDateString()} · {r.direction} from {r.seeds.length} studies: {r.found.toLocaleString()} new, {r.added.toLocaleString()} added
              {r.minLinks > 1 ? ` (linked to ≥ ${r.minLinks})` : ''}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
