import { Plus, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { countWorks } from '../literature/openalex'
import { readJson, writeJson } from '../lib/storage'
import { buildQuery, KEYWORD_BLOCKS, TOPICS, type KeywordBlock } from '../review/keywords'
import { useVault } from '../store/vault'
import { Badge, Button, Input } from './ui'

const BANK_KEY = 'gm.keywordBank'

interface Bank {
  /** Your own concept blocks. */
  custom: KeywordBlock[]
  /** Terms you added to or removed from built-in blocks. */
  terms: Record<string, string[]>
}

function loadBank(): Bank {
  return readJson<Bank>(BANK_KEY, { custom: [], terms: {} })
}

function useBank(): [Bank, (b: Bank) => void] {
  const [bank, setBank] = useState<Bank>(loadBank)
  return [
    bank,
    (b: Bank) => {
      setBank(b)
      writeJson(BANK_KEY, b)
    },
  ]
}

/** All blocks with your edits applied. */
function allBlocks(bank: Bank): KeywordBlock[] {
  return [...KEYWORD_BLOCKS.map((b) => ({ ...b, terms: bank.terms[b.id] ?? b.terms })), ...bank.custom]
}

/**
 * Browse concept blocks by topic, pick one per concept, and build a Boolean query whose hit count is checked live on
 * OpenAlex. `onUse` receives the query (e.g. to add it to a review protocol).
 */
export function KeywordBank({ onUse, useLabel = 'Use this query' }: { onUse?: (query: string) => void; useLabel?: string }) {
  const { secrets } = useVault()
  const [bank, setBank] = useBank()
  const [topic, setTopic] = useState<string>(TOPICS[0])
  const [picked, setPicked] = useState<string[]>([])
  const [exclude, setExclude] = useState('')
  const [hits, setHits] = useState<{ query: string; n: number; reviews: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newTerm, setNewTerm] = useState<Record<string, string>>({})
  const [custom, setCustom] = useState({ concept: '', terms: '' })
  const blocks = allBlocks(bank)
  const topics = [...TOPICS, ...(bank.custom.length ? ['My keywords'] : [])]
  const shown = blocks.filter((b) => b.topic === topic)
  const chosen = picked.map((id) => blocks.find((b) => b.id === id)).filter((b): b is KeywordBlock => !!b)
  const query = chosen.length ? buildQuery(chosen, exclude.split(',').map((x) => x.trim())) : ''

  const setTerms = (b: KeywordBlock, terms: string[]) => {
    if (b.topic === 'My keywords') setBank({ ...bank, custom: bank.custom.map((c) => (c.id === b.id ? { ...c, terms } : c)) })
    else setBank({ ...bank, terms: { ...bank.terms, [b.id]: terms } })
  }

  async function count() {
    setBusy(true)
    setError('')
    try {
      const [n, reviews] = await Promise.all([countWorks(query, { apiKey: secrets.openalexKey }), countWorks(query, { apiKey: secrets.openalexKey, reviewsOnly: true })])
      setHits({ query, n, reviews })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t) => (
          <button
            key={t}
            onClick={() => setTopic(t)}
            className={`rounded-full border px-3 py-1 text-xs ${topic === t ? 'border-amber-500 bg-amber-50 font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300' : 'border-stone-300 text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((b) => {
          const on = picked.includes(b.id)
          return (
            <div key={b.id} className={`rounded-lg border p-3 ${on ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : 'border-stone-200 dark:border-stone-700'}`}>
              <div className="flex items-center gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== b.id) : [...picked, b.id])} />
                  {b.concept}
                </label>
                {b.topic === 'My keywords' && (
                  <button title="Delete block" className="text-stone-400 hover:text-red-600" onClick={() => setBank({ ...bank, custom: bank.custom.filter((c) => c.id !== b.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {b.terms.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                    {t}
                    <button aria-label={`Remove ${t}`} className="text-stone-400 hover:text-red-600" onClick={() => setTerms(b, b.terms.filter((x) => x !== t))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <form
                className="mt-2 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  const t = (newTerm[b.id] ?? '').trim()
                  if (!t) return
                  setTerms(b, [...b.terms, t.includes(' ') && !t.startsWith('"') ? `"${t}"` : t])
                  setNewTerm({ ...newTerm, [b.id]: '' })
                }}
              >
                <Input value={newTerm[b.id] ?? ''} onChange={(e) => setNewTerm({ ...newTerm, [b.id]: e.target.value })} placeholder="add a synonym" className="min-h-8 min-w-0 flex-1 text-xs" />
                <Button type="submit" variant="ghost" className="min-h-8 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          )
        })}
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-stone-300 p-3 dark:border-stone-700"
        onSubmit={(e) => {
          e.preventDefault()
          const terms = custom.terms.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (t.includes(' ') && !t.startsWith('"') ? `"${t}"` : t))
          if (!custom.concept.trim() || !terms.length) return
          setBank({ ...bank, custom: [...bank.custom, { id: `my-${Date.now()}`, topic: 'My keywords', concept: custom.concept.trim(), terms }] })
          setCustom({ concept: '', terms: '' })
          setTopic('My keywords')
        }}
      >
        <span className="w-full text-xs font-medium text-stone-600 dark:text-stone-400">Add your own concept to the bank</span>
        <Input value={custom.concept} onChange={(e) => setCustom({ ...custom, concept: e.target.value })} placeholder="Concept, e.g. Grasberg caving" className="w-48" />
        <Input value={custom.terms} onChange={(e) => setCustom({ ...custom, terms: e.target.value })} placeholder="terms, comma-separated" className="min-w-0 flex-1" />
        <Button type="submit" variant="ghost">
          Save to my bank
        </Button>
      </form>

      <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-800/50">
        <p className="mb-1 text-xs font-medium text-stone-600 dark:text-stone-400">
          Query {chosen.length ? `(${chosen.map((c) => c.concept).join(' AND ')})` : '— tick one block per concept, across topics'}
        </p>
        <code className="block text-xs break-words whitespace-pre-wrap">{query || '…'}</code>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="exclude terms (NOT), comma-separated — e.g. concrete, slope" className="min-h-8 min-w-0 flex-1 text-xs" />
          <Button variant="ghost" className="min-h-8 text-xs" disabled={!query || busy} onClick={count}>
            <Search className="h-3.5 w-3.5" /> {busy ? 'Counting…' : 'Count hits'}
          </Button>
          <Button variant="ghost" className="min-h-8 text-xs" disabled={!query} onClick={() => navigator.clipboard.writeText(query)}>
            Copy
          </Button>
          {onUse && (
            <Button className="min-h-8 text-xs" disabled={!query} onClick={() => onUse(query)}>
              {useLabel}
            </Button>
          )}
        </div>
        {hits && hits.query === query && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge>{hits.n.toLocaleString()} articles & reviews</Badge>
            <Badge tone="amber">{hits.reviews.toLocaleString()} reviews</Badge>
            <span className="text-stone-500">
              {hits.n > 3000 ? 'Very broad — add a concept or NOT terms.' : hits.n < 30 ? 'Very narrow — add synonyms or drop a concept.' : 'A workable size for screening.'}
            </span>
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    </div>
  )
}
