import { RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { explainError } from '../ai/errors'
import { buildTaskPrompt } from '../ai/prompts'
import { useLLM } from '../ai/useLLM'
import { TOPICS } from '../review/keywords'
import { findLiveTopics, liveTitlesRequest, loadLiveTopics, parseLiveTitles, saveLiveTopics, type LiveTopic, type LiveTopicsResult } from '../review/liveTopics'
import { REVIEW_METHODS } from '../review/methods'
import { newReview } from '../review/project'
import { db } from '../store/db'
import { useVault } from '../store/vault'
import { TaskModel } from './TaskModel'
import { Badge, Button, Select } from './ui'

/** Same reading as the curated list: many recent articles and few reviews is the strongest opportunity. */
function tone(t: LiveTopic): 'green' | 'amber' | 'red' | 'stone' {
  if (t.primary < 40) return 'stone'
  const per100 = (100 * t.reviews) / t.primary
  return t.reviews === 0 || per100 < 1.5 ? 'green' : per100 < 4 ? 'amber' : 'red'
}

/** Review topics generated from current OpenAlex data: growing keywords within an area, with article and review counts. */
export function LiveTopics() {
  const navigate = useNavigate()
  const { secrets } = useVault()
  const llm = useLLM('topicIdeas')
  const [area, setArea] = useState<string>(TOPICS[0])
  const [saved, setSaved] = useState(loadLiveTopics)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const result: LiveTopicsResult | undefined = saved[area]

  const keep = (r: LiveTopicsResult) => {
    saveLiveTopics(r)
    setSaved((s) => ({ ...s, [r.area]: r }))
  }

  async function find() {
    setError('')
    try {
      keep(await findLiveTopics(area, secrets.openalexKey, setBusy))
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy('')
    }
  }

  async function titles() {
    if (!result) return
    setError('')
    setBusy('Writing titles…')
    try {
      const { text } = await llm.run(buildTaskPrompt(), liveTitlesRequest(result.area, result.topics), { feature: 'Review: topic titles', light: true })
      const out = parseLiveTitles(text)
      keep({ ...result, topics: result.topics.map((t) => (out[t.id] ? { ...t, ...out[t.id], why: `${out[t.id].why} ${t.why}`.trim() } : t)) })
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy('')
    }
  }

  async function start(t: LiveTopic) {
    const r = newReview(t.title, t.method, 'ijmst')
    r.protocol.topic = t.title
    r.protocol.queries = [t.query]
    await db.reviews.add(r)
    navigate(`/reviews/${r.id}`)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Generated from current OpenAlex data: the keywords growing fastest in an area over the last three years, with the number of articles and reviews on each. No AI
        tokens are used; AI is optional, only to turn the keywords into review titles.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={area} onChange={(e) => setArea(e.target.value)} className="w-auto">
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        <Button variant="ghost" disabled={!!busy} onClick={find}>
          <RefreshCw className="h-4 w-4" /> {result ? 'Refresh from OpenAlex' : 'Find current topics'}
        </Button>
        {result && (
          <Button variant="ghost" disabled={!!busy || !llm.ready || !result.topics.length} onClick={titles}>
            <Sparkles className="h-4 w-4" /> Write titles with AI
          </Button>
        )}
        <span className="text-xs text-stone-500">{busy || (result ? `Updated ${new Date(result.at).toLocaleDateString()}` : '')}</span>
      </div>
      {result && <TaskModel llm={llm} />}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {result && !result.topics.length && <p className="text-sm text-stone-500">No growing keywords with enough articles were found in this area.</p>}
      {result && result.topics.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {result.topics.map((t) => (
            <div key={t.id} className="flex flex-col rounded-lg border border-stone-200 p-3 dark:border-stone-700">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">{t.title}</p>
                <Badge>{REVIEW_METHODS.find((m) => m.id === t.method)?.short}</Badge>
              </div>
              <p className="mt-1 flex-1 text-xs text-stone-600 dark:text-stone-400">{t.why}</p>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <Badge>keyword: {t.keyword}</Badge>
                <Badge>{t.primary.toLocaleString()} articles / 10 yr</Badge>
                <Badge tone={tone(t)}>{t.reviews.toLocaleString()} reviews</Badge>
              </p>
              <div className="mt-2.5">
                <Button className="min-h-8 text-xs" onClick={() => start(t)}>
                  Start this review
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
