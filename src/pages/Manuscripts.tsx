import { FileText } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { JOURNALS, journalsByTopic, type JournalId } from '../ai/prompts'
import { Button, Card, Input, Label, PageHeader, Select } from '../components/ui'
import { ARTICLE_TYPES, countWords, createManuscript } from '../manuscript/templates'
import { db } from '../store/db'

export default function ManuscriptsPage() {
  const navigate = useNavigate()
  const manuscripts = useLiveQuery(() => db.manuscripts.orderBy('updatedAt').reverse().toArray(), [])
  const [title, setTitle] = useState('')
  const [journal, setJournal] = useState<JournalId | ''>('tust')
  const [type, setType] = useState(ARTICLE_TYPES[0].id)

  async function create(e: FormEvent) {
    e.preventDefault()
    const m = createManuscript(title.trim(), journal, type)
    await db.manuscripts.add(m)
    navigate(`/manuscripts/${m.id}`)
  }

  async function duplicate(id: string) {
    const m = await db.manuscripts.get(id)
    if (!m) return
    const now = Date.now()
    await db.manuscripts.add({ ...m, id: crypto.randomUUID(), title: `${m.title} (copy)`, createdAt: now, updatedAt: now })
  }

  async function remove(id: string, title: string) {
    if (window.confirm(`Delete "${title || 'Untitled'}"? This cannot be undone.`)) await db.manuscripts.delete(id)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader icon={FileText} title="Manuscripts" description="Write section by section with an AI co-author, check consistency, and export to Word or the journal's LaTeX template." />

      <Card title="New manuscript">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
          <label className="md:col-span-2">
            <Label>Working title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Energy-based rockburst risk assessment of deep drifts using…" required />
          </label>
          <label>
            <Label>Target journal</Label>
            <Select value={journal} onChange={(e) => setJournal(e.target.value as JournalId | '')}>
              {journalsByTopic().map(([topic, list]) => (
                <optgroup key={topic} label={topic}>
                  {list.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name} ({j.publisher})
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="">Other / undecided (Elsevier layout)</option>
            </Select>
          </label>
          <label>
            <Label>Article type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {ARTICLE_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-xs text-stone-500 md:col-span-2">
            {ARTICLE_TYPES.find((t) => t.id === type)?.description} The template adds Highlights, Abstract, Keywords, the body sections, and the
            publisher's required declarations. Sections can be renamed, reordered, added or removed later.
          </p>
          <div className="md:col-span-2">
            <Button type="submit" disabled={!title.trim()}>
              Create manuscript
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Your manuscripts">
        {!manuscripts?.length ? (
          <p className="text-sm text-stone-500">None yet. Manuscripts are stored in this browser only — export regularly as a backup.</p>
        ) : (
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {manuscripts.map((m) => {
              const words = m.sections.filter((s) => s.role === 'body').reduce((n, s) => n + countWords(s.content), 0)
              const j = JOURNALS.find((x) => x.id === m.journal)
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Link to={`/manuscripts/${m.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                    {m.title || 'Untitled'}
                  </Link>
                  <span className="text-xs text-stone-500">
                    {j ? j.abbr : 'no journal'} · {words.toLocaleString()} words · {new Date(m.updatedAt).toLocaleDateString()}
                  </span>
                  <span className="flex gap-2 text-xs">
                    <Link to={`/manuscripts/${m.id}/workspace`} className="text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">
                      Workspace
                    </Link>
                    <button className="text-stone-500 hover:text-stone-800 dark:hover:text-stone-200" onClick={() => duplicate(m.id)}>
                      Duplicate
                    </button>
                    <button className="text-stone-500 hover:text-red-600" onClick={() => remove(m.id, m.title)}>
                      Delete
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
