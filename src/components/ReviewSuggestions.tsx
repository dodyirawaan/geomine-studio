import { Gauge } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { explainError } from '../ai/errors'
import { countWorks } from '../literature/openalex'
import { buildQuery, KEYWORD_BLOCKS, REVIEW_SUGGESTIONS, type ReviewSuggestion } from '../review/keywords'
import { REVIEW_METHODS } from '../review/methods'
import { newReview } from '../review/project'
import { db } from '../store/db'
import { useVault } from '../store/vault'
import { Badge, Button } from './ui'

interface Opportunity {
  primary: number
  reviews: number
}

const SINCE = new Date().getFullYear() - 10

function queryFor(s: ReviewSuggestion): string {
  return buildQuery(s.blocks.map((id) => KEYWORD_BLOCKS.find((b) => b.id === id)!).filter(Boolean))
}

/** How crowded a topic is with reviews compared with its primary literature (live from OpenAlex). */
function verdict(o: Opportunity): { label: string; tone: 'green' | 'amber' | 'red' | 'stone' } {
  if (o.primary < 40) return { label: 'Small literature — a scoping or narrative review fits better', tone: 'stone' }
  const per100 = (100 * o.reviews) / o.primary
  if (o.reviews === 0 || per100 < 1.5) return { label: 'Under-reviewed — good opportunity', tone: 'green' }
  if (per100 < 4) return { label: 'Some reviews exist — needs a clear new angle', tone: 'amber' }
  return { label: 'Crowded with reviews — narrow the question', tone: 'red' }
}

export function ReviewSuggestions() {
  const navigate = useNavigate()
  const { secrets } = useVault()
  const [checked, setChecked] = useState<Record<string, Opportunity>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function check(s: ReviewSuggestion) {
    setBusy(s.id)
    setError('')
    try {
      const q = queryFor(s)
      const [primary, reviews] = await Promise.all([countWorks(q, { fromYear: SINCE, apiKey: secrets.openalexKey }), countWorks(q, { reviewsOnly: true, apiKey: secrets.openalexKey })])
      setChecked((c) => ({ ...c, [s.id]: { primary, reviews } }))
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(null)
    }
  }

  async function checkAll() {
    for (const s of REVIEW_SUGGESTIONS) if (!checked[s.id]) await check(s)
  }

  async function start(s: ReviewSuggestion) {
    const r = newReview(s.title, s.method, 'ijmst')
    r.protocol.topic = s.title
    r.protocol.queries = [queryFor(s)]
    await db.reviews.add(r)
    navigate(`/reviews/${r.id}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-stone-600 dark:text-stone-400">
          Starting points built from the keyword bank. <b>Check</b> counts, on OpenAlex, the articles since {SINCE} and the review articles on each topic — a large
          primary literature with few reviews is the strongest opportunity.
        </p>
        <Button variant="ghost" className="text-xs" disabled={!!busy} onClick={checkAll}>
          <Gauge className="h-3.5 w-3.5" /> Check all
        </Button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {REVIEW_SUGGESTIONS.map((s) => {
          const o = checked[s.id]
          const v = o && verdict(o)
          return (
            <div key={s.id} className="flex flex-col rounded-lg border border-stone-200 p-3 dark:border-stone-700">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">{s.title}</p>
                <Badge>{REVIEW_METHODS.find((m) => m.id === s.method)?.short}</Badge>
              </div>
              <p className="mt-1 flex-1 text-xs text-stone-600 dark:text-stone-400">{s.why}</p>
              <code className="mt-2 line-clamp-2 text-[11px] text-stone-500" title={queryFor(s)}>
                {queryFor(s)}
              </code>
              {o && (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge>{o.primary.toLocaleString()} articles since {SINCE}</Badge>
                  <Badge>{o.reviews.toLocaleString()} reviews</Badge>
                  <Badge tone={v!.tone}>{v!.label}</Badge>
                </p>
              )}
              <div className="mt-2.5 flex gap-2">
                <Button variant="ghost" className="min-h-8 text-xs" disabled={busy === s.id} onClick={() => check(s)}>
                  {busy === s.id ? 'Checking…' : o ? 'Re-check' : 'Check'}
                </Button>
                <Button className="min-h-8 text-xs" onClick={() => start(s)}>
                  Start this review
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-stone-500">The indicator is a starting point, not a verdict: read the existing reviews before claiming a gap.</p>
    </div>
  )
}
