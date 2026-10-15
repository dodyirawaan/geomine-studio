import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { explainError } from '../../ai/errors'
import { buildSystemPrompt, journalsByTopic, type JournalId } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { KeywordBank } from '../../components/KeywordBank'
import { TaskModel } from '../../components/TaskModel'
import { Badge, Button, Card, Input, Label, Select } from '../../components/ui'
import { lookupDoi } from '../../literature/library'
import { prismaCounts } from '../../review/prisma'
import { updateReview, type Save } from '../../review/project'
import { methodById, parseProtocol, protocolRequest } from '../../review/prompts'
import { importExport, mergeWorks, runSearches } from '../../review/search'
import { parseExport } from '../../review/importers'
import type { Protocol, ReviewProject } from '../../review/types'
import { db } from '../../store/db'
import { useVault } from '../../store/vault'
import { AnalysisTab } from './AnalysisTab'
import { ExtractionTab } from './ExtractionTab'
import { ReviewGuide } from './ReviewGuide'
import { FullTextTab, ScreeningTab } from './ScreeningTab'
import { SnowballCard } from './SnowballCard'
import { WriteTab } from './WriteTab'

export default function ReviewProjectPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const p = useLiveQuery(async () => (id ? ((await db.reviews.get(id)) ?? null) : null), [id])
  if (p === undefined) return <p className="text-sm text-stone-500">Loading…</p>
  if (p === null)
    return (
      <p className="text-sm">
        Review not found.{' '}
        <Link to="/reviews" className="underline">
          Back to reviews
        </Link>
      </p>
    )
  const m = methodById(p.method)
  const c = prismaCounts(p, m.fullText)
  const tabs = [
    { id: 'protocol', label: '1 Protocol' },
    { id: 'search', label: `2 Search${p.records.length ? ` (${p.records.length})` : ''}` },
    { id: 'screening', label: `3 Screening${c.awaitingTA ? ` (${c.awaitingTA} left)` : ''}` },
    ...(m.fullText ? [{ id: 'fulltext', label: `4 Full text${c.awaitingFT ? ` (${c.awaitingFT} left)` : ''}` }] : []),
    { id: 'extraction', label: `${m.fullText ? 5 : 4} Extraction${m.quality ? ' & quality' : ''}` },
    { id: 'analysis', label: `${m.fullText ? 6 : 5} Analysis` },
    { id: 'write', label: `${m.fullText ? 7 : 6} Write` },
    { id: 'guide', label: 'Tutorial' },
  ]
  const tab = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'protocol'
  const save = (patch: Parameters<typeof updateReview>[1]) => updateReview(p.id, patch)

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stone-500">
            <Link to="/reviews" className="hover:underline">
              Review writer
            </Link>{' '}
            / {m.name} · {m.guideline}
          </p>
          <input defaultValue={p.title} onBlur={(e) => e.target.value.trim() && save({ title: e.target.value.trim() })} className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none" title="Review title" />
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge>{c.identified} identified</Badge>
          <Badge>{c.screened} screened</Badge>
          <Badge tone="green">{c.included} included</Badge>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 text-sm dark:border-stone-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams({ tab: t.id })}
            className={`shrink-0 border-b-2 px-3 py-2 ${tab === t.id ? 'border-amber-600 font-medium' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'protocol' && <ProtocolTab p={p} save={save} />}
      {tab === 'search' && <SearchTab p={p} save={save} />}
      {tab === 'screening' && <ScreeningTab p={p} save={save} />}
      {tab === 'fulltext' && <FullTextTab p={p} save={save} />}
      {tab === 'extraction' && <ExtractionTab p={p} save={save} />}
      {tab === 'analysis' && <AnalysisTab p={p} />}
      {tab === 'write' && <WriteTab p={p} save={save} />}
      {tab === 'guide' && <ReviewGuide method={p.method} />}
    </div>
  )
}


// ---------------------------------------------------------------- Protocol

function ListEditor({ label, items, onChange, placeholder, prefix }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; prefix?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={`${i}-${it}`} className="flex gap-1.5">
            {prefix && <span className="mt-2 w-7 shrink-0 text-xs font-semibold text-stone-500">{`${prefix}${i + 1}`}</span>}
            <textarea
              defaultValue={it.replace(/^[IE]\d+[:.)]?\s*/, '')}
              rows={Math.min(4, Math.max(1, Math.ceil(it.length / 90)))}
              onBlur={(e) => onChange(items.map((x, j) => (j === i ? (prefix ? `${prefix}${i + 1}: ${e.target.value.trim()}` : e.target.value.trim()) : x)))}
              className="min-h-9 flex-1 resize-y rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
              placeholder={placeholder}
            />
            <Button variant="subtle" title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i).map((x, j) => (prefix ? x.replace(/^[IE]\d+/, `${prefix}${j + 1}`) : x)))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="subtle" className="mt-1 text-xs" onClick={() => onChange([...items, prefix ? `${prefix}${items.length + 1}: ` : ''])}>
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  )
}

function ProtocolTab({ p, save }: { p: ReviewProject; save: Save }) {
  const llm = useLLM('protocol')
  const m = methodById(p.method)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [topic, setTopic] = useState(p.protocol.topic)
  const [version, setVersion] = useState(0)
  const pr = p.protocol
  const setPr = (patch: Partial<Protocol>) => save((cur) => ({ protocol: { ...cur.protocol, ...patch } }))

  async function draft() {
    setBusy(true)
    setError('')
    try {
      const { text } = await llm.run(buildSystemPrompt('review', p.journal as JournalId), protocolRequest(topic, m, p.journal), { feature: 'Review: protocol' })
      await save((cur) => ({ protocol: parseProtocol(text, { ...cur.protocol, topic }) }))
      setVersion((v) => v + 1)
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" key={version}>
      <Card title="Topic and protocol">
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <label className="block">
            <Label hint="what the review is about, scope, and why now">Topic / idea</Label>
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)} onBlur={() => setPr({ topic })} rows={3} className="w-full rounded-lg border border-stone-300 bg-white p-2.5 text-sm dark:border-stone-700 dark:bg-stone-900" placeholder="e.g. Machine-learning prediction of rockburst intensity from case histories and microseismic data in deep hard-rock mines" />
          </label>
          <label className="block">
            <Label>Target journal</Label>
            <Select value={p.journal} onChange={(e) => save({ journal: e.target.value })}>
              {journalsByTopic().map(([t, list]) => (
                <optgroup key={t} label={t}>
                  {list.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.abbr}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={!llm.ready || busy || !topic.trim()} onClick={draft}>
            {busy ? 'Drafting…' : 'Draft protocol with AI'}
          </Button>
          <span className="text-xs text-stone-500">{llm.missing || `${llm.label} · you can edit everything below`}</span>
        </div>
        <TaskModel llm={llm} className="mt-2" />
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </Card>

      <Card title="Research questions">
        <ListEditor label="" items={pr.questions} onChange={(questions) => setPr({ questions })} placeholder="RQ: What …?" />
      </Card>

      <Card title={`${m.framework.name} framework`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {m.framework.fields.map((f) => (
            <label key={f} className="block">
              <Label>{f}</Label>
              <Input defaultValue={pr.framework[f] ?? ''} onBlur={(e) => setPr({ framework: { ...pr.framework, [f]: e.target.value } })} />
            </label>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Inclusion criteria">
          <ListEditor label="" prefix="I" items={pr.inclusion} onChange={(inclusion) => setPr({ inclusion })} placeholder="e.g. Field or case-history data from underground mines" />
        </Card>
        <Card title="Exclusion criteria">
          <ListEditor label="" prefix="E" items={pr.exclusion} onChange={(exclusion) => setPr({ exclusion })} placeholder="e.g. Open-pit slopes or civil tunnels only" />
        </Card>
      </div>

      <Card title="Search strings">
        <p className="mb-2 text-xs text-stone-500">
          Boolean search on titles and abstracts: AND, OR, NOT, (parentheses) and "quoted phrases". Example: <code>(rockburst OR "rock burst") AND ("machine learning" OR "deep learning")</code>
        </p>
        <ListEditor label="" items={pr.queries} onChange={(queries) => setPr({ queries })} placeholder='(rockburst OR "rock burst") AND prediction' />
        <details className="mt-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <summary className="cursor-pointer text-sm font-medium">Build a search string from the keyword bank</summary>
          <div className="mt-3">
            <KeywordBank useLabel="Add to search strings" onUse={(q) => setPr({ queries: [...pr.queries.filter((x) => x.trim()), q] })} />
          </div>
        </details>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label>
            <Label>From year</Label>
            <Input type="number" defaultValue={pr.yearFrom ?? ''} onBlur={(e) => setPr({ yearFrom: Number(e.target.value) || undefined })} />
          </label>
          <label>
            <Label>To year</Label>
            <Input type="number" defaultValue={pr.yearTo ?? ''} placeholder="now" onBlur={(e) => setPr({ yearTo: Number(e.target.value) || undefined })} />
          </label>
          <label>
            <Label hint="per search string">Max records</Label>
            <Select value={String(pr.perQueryLimit)} onChange={(e) => setPr({ perQueryLimit: Number(e.target.value) })}>
              {[200, 400, 600, 1000, 2000].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </label>
          <label>
            <Label>Language</Label>
            <Input defaultValue={pr.language} onBlur={(e) => setPr({ language: e.target.value })} />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pr.articlesOnly} onChange={(e) => setPr({ articlesOnly: e.target.checked })} />
          Journal articles and reviews only
        </label>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- Search

function SearchTab({ p, save }: { p: ReviewProject; save: Save }) {
  const { secrets } = useVault()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [doi, setDoi] = useState('')
  const m = methodById(p.method)
  const c = prismaCounts(p, m.fullText)

  async function run() {
    setBusy(true)
    setError('')
    try {
      const out = await runSearches(p, secrets.openalexKey, setProgress)
      await save(out)
      setProgress(`Done: ${out.records.length} unique records.`)
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  async function addManual() {
    setError('')
    const meta = await lookupDoi(doi, secrets.openalexKey).catch(() => null)
    if (!meta) return setError('DOI not found on OpenAlex or Crossref.')
    await save((cur) => ({ records: mergeWorks(cur.records, [meta], -1, true).records }))
    setDoi('')
  }

  return (
    <div className="space-y-4">
      <Card title="Run the database search">
        {!p.protocol.queries.some((q) => q.trim()) ? (
          <p className="text-sm text-amber-800 dark:text-amber-400">Add at least one search string in the Protocol step.</p>
        ) : (
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm">
            {p.protocol.queries.filter((q) => q.trim()).map((q, i) => {
              const s = p.searches[i]
              return (
                <li key={i}>
                  <code className="text-xs">{q}</code>
                  {s && s.query === q.trim() && (
                    <span className="ml-2 text-xs text-stone-500">
                      {s.found.toLocaleString()} found, {s.fetched.toLocaleString()} retrieved · {new Date(s.at).toLocaleDateString()}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || !p.protocol.queries.some((q) => q.trim())} onClick={run}>
            {busy ? 'Searching…' : p.searches.length ? 'Run the search again' : 'Run search on OpenAlex'}
          </Button>
          {progress && <span className="text-xs text-stone-500">{progress}</span>}
        </div>
        <p className="mt-2 text-xs text-stone-500">Running again keeps every screening decision; new records are added and duplicates merged. Report the date of the final run.</p>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </Card>
      <ImportCard p={p} save={save} />
      <SnowballCard p={p} save={save} />
      <Card title="Records">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Identified', c.identified],
            ['Duplicates removed', c.duplicates],
            ['Other sources', c.otherSources],
            ['Unique records', p.records.length],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
              <p className="text-xs text-stone-500">{l}</p>
              <p className="text-xl font-semibold tabular-nums">{Number(v).toLocaleString()}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="Add a record by DOI (citation chasing, expert suggestion)" className="min-w-0 flex-1" />
          <Button variant="ghost" disabled={!doi.trim()} onClick={addManual}>
            Add
          </Button>
        </div>
      </Card>
    </div>
  )
}

function ImportCard({ p, save }: { p: ReviewProject; save: Save }) {
  const [database, setDatabase] = useState('Scopus')
  const [query, setQuery] = useState(p.protocol.queries[0] ?? '')
  const [status, setStatus] = useState('')
  return (
    <Card title="Add other databases (Scopus, Web of Science)">
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
        Q1 reviewers usually expect at least two databases. Run the same search string in Scopus or Web of Science through your institution, export the results as
        BibTeX or RIS (with abstracts), and import the file here; duplicates with OpenAlex are merged and each database is counted in the PRISMA diagram.
      </p>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Select value={database} onChange={(e) => setDatabase(e.target.value)}>
          {['Scopus', 'Web of Science', 'Dimensions', 'Google Scholar', 'CNKI', 'Other'].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search string used in that database (for the Methods)" />
      </div>
      <label className="mt-3 inline-flex cursor-pointer">
        <input
          type="file"
          accept=".bib,.ris,.txt"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const works = parseExport(await f.text())
            if (!works.length) return setStatus('No records found — export as BibTeX or RIS.')
            const before = p.records.length
            await save((cur) => importExport(cur, works, database, query))
            const after = (await db.reviews.get(p.id))?.records.length ?? before
            setStatus(`${works.length} records imported from ${database}: ${after - before} new, ${works.length - (after - before)} already present.`)
            e.target.value = ''
          }}
        />
        <span className="inline-flex min-h-9 items-center rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-medium hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900">Import BibTeX / RIS file…</span>
      </label>
      {status && <p className="mt-2 text-xs text-stone-600 dark:text-stone-400">{status}</p>}
      {(p.imports ?? []).length > 0 && (
        <ul className="mt-2 text-xs text-stone-500">
          {p.imports!.map((x, i) => (
            <li key={i}>
              {x.database}: {x.fetched} records · {new Date(x.at).toLocaleDateString()}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
