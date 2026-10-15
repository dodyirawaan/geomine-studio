import { useLiveQuery } from 'dexie-react-hooks'
import { NotebookPen } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { journalsByTopic } from '../../ai/prompts'
import { KeywordBank } from '../../components/KeywordBank'
import { LiveTopics } from '../../components/LiveTopics'
import { ReviewSuggestions } from '../../components/ReviewSuggestions'
import { Badge, Button, Card, Input, Label, PageHeader, Select } from '../../components/ui'
import { REVIEW_METHODS } from '../../review/methods'
import { newReview } from '../../review/project'
import type { ReviewMethodId } from '../../review/types'
import { db } from '../../store/db'

export default function ReviewsPage() {
  const navigate = useNavigate()
  const reviews = useLiveQuery(() => db.reviews.orderBy('updatedAt').reverse().toArray(), [])
  const [title, setTitle] = useState('')
  const [method, setMethod] = useState<ReviewMethodId>('systematic')
  const [journal, setJournal] = useState('ijmst')

  async function create(e: FormEvent) {
    e.preventDefault()
    const r = newReview(title.trim(), method, journal)
    await db.reviews.add(r)
    navigate(`/reviews/${r.id}`)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        icon={NotebookPen}
        title="Review writer"
        description="Write a systematic, scoping, bibliometric or narrative review end to end: protocol, search, screening, extraction, PRISMA flow, synthesis and a manuscript with clean citations."
        actions={
          <a href="https://github.com/dodyirawaan/geomine-studio/blob/main/docs/REVIEW.md" target="_blank" rel="noreferrer" className="text-sm font-medium text-amber-800 hover:underline dark:text-amber-400">
            Tutorial ↗
          </a>
        }
      />

      <Card title="Current review topics (OpenAlex)">
        <LiveTopics />
      </Card>

      <Card title="Suggested review topics">
        <ReviewSuggestions />
      </Card>

      <Card title="New review">
        <form onSubmit={create} className="space-y-4">
          <label className="block">
            <Label>Working title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Machine learning for rockburst prediction: a systematic review" required />
          </label>
          <div>
            <Label>Review method</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {REVIEW_METHODS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors ${method === m.id ? 'border-amber-500 bg-amber-50/70 dark:border-amber-600 dark:bg-amber-950/30' : 'border-stone-200 hover:border-stone-300 dark:border-stone-700'}`}
                >
                  <input type="radio" name="method" className="mt-1" checked={method === m.id} onChange={() => setMethod(m.id)} />
                  <span>
                    <span className="font-medium">{m.name}</span> <Badge>{m.short}</Badge>
                    <span className="mt-1 block text-stone-600 dark:text-stone-400">{m.whenToUse}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <Label>Target journal</Label>
            <Select value={journal} onChange={(e) => setJournal(e.target.value)}>
              {journalsByTopic().map(([topic, list]) => (
                <optgroup key={topic} label={topic}>
                  {list.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </label>
          <Button type="submit" disabled={!title.trim()}>
            Create review project
          </Button>
        </form>
      </Card>

      <Card title="Keyword bank">
        <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
          Concept blocks with synonyms and spelling variants for every GeoMine topic. Tick one block per concept to build a Boolean search string and check its size on
          OpenAlex before you start. Your edits and own concepts are saved in this browser.
        </p>
        <KeywordBank />
      </Card>

      <Card title="Review projects">
        {!reviews?.length ? (
          <p className="text-sm text-stone-500">No review projects yet.</p>
        ) : (
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {reviews.map((r) => {
              const m = REVIEW_METHODS.find((x) => x.id === r.method)
              const included = r.records.filter((x) => x.ta === 'include' && (!m?.fullText || x.ft === 'include')).length
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Link to={`/reviews/${r.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                    {r.title}
                  </Link>
                  <Badge tone="amber">{m?.short}</Badge>
                  <span className="text-xs text-stone-500">
                    {r.records.length} records · {included} included · {new Date(r.updatedAt).toLocaleDateString()}
                  </span>
                  <button className="text-xs text-stone-500 hover:text-red-600" onClick={() => window.confirm(`Delete "${r.title}"? The manuscript and library papers are kept.`) && db.reviews.delete(r.id)}>
                    Delete
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
