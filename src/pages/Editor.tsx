import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { JOURNALS, type JournalId } from '../ai/prompts'
import { AssistPanel } from '../components/AssistPanel'
import { LibraryImport, VerifyReferences } from '../components/ReferenceTools'
import { Markdown } from '../components/Markdown'
import { Button, Input, Label, Select } from '../components/ui'
import { downloadBlob, downloadText, slug } from '../lib/download'
import { citedKeys, CITE_RE, citeLabel, formatCitation, parseBibtex, type BibEntry } from '../manuscript/bibtex'
import { exportMarkdown } from '../manuscript/exportMarkdown'
import { countWords, highlightList, newSection, publisherOf } from '../manuscript/templates'
import { db, type Author, type Manuscript, type ManuscriptSection, type SectionRole } from '../store/db'

type Pane = 'authors' | 'references' | string

const ROLE_GROUP: Record<SectionRole, string> = {
  highlights: 'Front matter',
  abstract: 'Front matter',
  keywords: 'Front matter',
  body: 'Main text',
  back: 'Declarations',
}

export default function EditorPage() {
  const { id } = useParams()
  const [doc, setDoc] = useState<Manuscript | null | undefined>(undefined)
  const [saved, setSaved] = useState(true)
  const docRef = useRef(doc)
  docRef.current = doc

  useEffect(() => {
    if (id) db.manuscripts.get(id).then((m) => setDoc(m ?? null))
  }, [id])

  // Debounced autosave; also flush when leaving the page.
  useEffect(() => {
    if (!doc || saved) return
    const t = setTimeout(async () => {
      await db.manuscripts.put(doc)
      if (docRef.current === doc) setSaved(true)
    }, 600)
    return () => clearTimeout(t)
  }, [doc, saved])
  useEffect(() => {
    const flush = () => {
      if (docRef.current) db.manuscripts.put(docRef.current)
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])

  const change = useCallback((fn: (m: Manuscript) => Manuscript) => {
    setDoc((prev) => (prev ? { ...fn(prev), updatedAt: Date.now() } : prev))
    setSaved(false)
  }, [])

  const [params] = useSearchParams()
  const [pane, setPane] = useState<Pane>(() => params.get('section') ?? '')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [assistOpen, setAssistOpen] = useState(false)
  const [undo, setUndo] = useState<{ sectionId: string; content: string } | null>(null)

  const entries = useMemo(() => parseBibtex(doc?.bibtex ?? ''), [doc?.bibtex])

  if (doc === undefined) return <p className="p-6 text-sm text-stone-500">Loading…</p>
  if (doc === null)
    return (
      <p className="p-6 text-sm">
        Manuscript not found.{' '}
        <Link to="/manuscripts" className="underline">
          Back to manuscripts
        </Link>
      </p>
    )

  const section = doc.sections.find((s) => s.id === pane) ?? (pane === 'authors' || pane === 'references' ? undefined : doc.sections.find((s) => s.role === 'body'))
  const activePane = section?.id ?? pane

  const updateSection = (sid: string, patch: Partial<ManuscriptSection>) =>
    change((m) => ({ ...m, sections: m.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }))

  function setFromAI(sid: string, content: string) {
    const prev = doc!.sections.find((s) => s.id === sid)
    if (prev) setUndo({ sectionId: sid, content: prev.content })
    updateSection(sid, { content })
  }

  function addSection(role: SectionRole, after?: string) {
    const s = newSection(role)
    change((m) => {
      const list = [...m.sections]
      const idx = after ? list.findIndex((x) => x.id === after) + 1 : list.map((x) => x.role).lastIndexOf(role) + 1
      list.splice(idx || list.length, 0, s)
      return { ...m, sections: list }
    })
    setPane(s.id)
  }

  function moveSection(sid: string, dir: -1 | 1) {
    change((m) => {
      const list = [...m.sections]
      const i = list.findIndex((x) => x.id === sid)
      const j = i + dir
      if (j < 0 || j >= list.length || list[j].role !== list[i].role) return m
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...m, sections: list }
    })
  }

  function deleteSection(sid: string) {
    const s = doc!.sections.find((x) => x.id === sid)
    if (!s || !window.confirm(`Delete section "${s.title}"${s.content.trim() ? ' and its text' : ''}?`)) return
    change((m) => ({ ...m, sections: m.sections.filter((x) => x.id !== sid) }))
    setPane('')
  }

  async function doExport(kind: 'docx' | 'latex' | 'md' | 'bib') {
    const name = slug(doc!.title)
    // The Word and zip libraries are large, so they load only when exporting.
    if (kind === 'docx') downloadBlob(await (await import('../manuscript/exportDocx')).exportDocx(doc!), `${name}.docx`)
    if (kind === 'latex') downloadBlob(await (await import('../manuscript/exportLatex')).exportLatexZip(doc!), `${name}-latex.zip`)
    if (kind === 'md') downloadText(exportMarkdown(doc!), `${name}.md`, 'text/markdown')
    if (kind === 'bib') downloadText(doc!.bibtex, `${name}.bib`, 'application/x-bibtex')
  }

  const bodyWords = doc.sections.filter((s) => s.role === 'body').reduce((n, s) => n + countWords(s.content), 0)
  let bodyNo = 0
  const groups = (['Front matter', 'Main text', 'Declarations'] as const).map((g) => ({
    name: g,
    items: doc.sections.filter((s) => ROLE_GROUP[s.role] === g),
  }))

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-2 dark:border-stone-800">
        <Input
          value={doc.title}
          onChange={(e) => change((m) => ({ ...m, title: e.target.value }))}
          className="min-w-0 basis-full font-medium sm:flex-1 sm:basis-0"
          placeholder="Manuscript title"
          title="Title"
        />
        <Button variant="ghost" className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
          ☰ Sections
        </Button>
        <Select
          value={doc.journal}
          onChange={(e) => change((m) => ({ ...m, journal: e.target.value as JournalId | '' }))}
          className="w-auto max-w-40"
          title="Target journal (changes the AI's conventions and the LaTeX class)"
        >
          {JOURNALS.map((j) => (
            <option key={j.id} value={j.id}>
              {j.id.toUpperCase()}
            </option>
          ))}
          <option value="">Other</option>
        </Select>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800">
            Export ▾
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-stone-200 bg-white p-1 text-sm shadow-lg dark:border-stone-700 dark:bg-stone-900">
            {[
              { k: 'docx' as const, label: 'Word (.docx)', sub: 'Native equations, line numbers, author–year references' },
              { k: 'latex' as const, label: 'LaTeX project (.zip)', sub: publisherOf(doc.journal) === 'Springer' ? 'sn-jnl class + references.bib' : 'elsarticle class + references.bib' },
              { k: 'md' as const, label: 'Markdown (.md)', sub: 'Whole manuscript, citations resolved' },
              { k: 'bib' as const, label: 'BibTeX (.bib)', sub: 'Reference library' },
            ].map((o) => (
              <button
                key={o.k}
                onClick={(e) => {
                  ;(e.currentTarget.closest('details') as HTMLDetailsElement).open = false
                  doExport(o.k)
                }}
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                {o.label}
                <span className="block text-xs text-stone-500">{o.sub}</span>
              </button>
            ))}
          </div>
        </details>
        <Link
          to={`/manuscripts/${doc.id}/workspace`}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
          title="Automated pipeline, consistency check, Q1 checklist and version history"
        >
          Workspace
        </Link>
        <Button variant="ghost" className="xl:hidden" onClick={() => setAssistOpen(!assistOpen)}>
          ✨ AI
        </Button>
        <span className="w-full text-xs text-stone-500 sm:w-auto" title="Changes are saved in this browser">
          {bodyWords.toLocaleString()} words · {saved ? 'Saved' : 'Saving…'}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Section list */}
        <aside
          className={`${sidebarOpen ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-20 w-64 flex-col overflow-y-auto border-r border-stone-200 bg-white text-sm md:static md:flex dark:border-stone-800 dark:bg-stone-900`}
        >
          {groups.map((g) => (
            <div key={g.name} className="px-2 pt-3">
              <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{g.name}</p>
              {g.items.map((s) => {
                const num = s.role === 'body' ? `${++bodyNo}. ` : ''
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setPane(s.id)
                      setSidebarOpen(false)
                    }}
                    className={`flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800 ${
                      activePane === s.id ? 'bg-stone-100 font-medium dark:bg-stone-800' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {num}
                      {s.title}
                    </span>
                    <span className={`text-xs ${s.content.trim() ? 'text-stone-500' : 'text-stone-300 dark:text-stone-600'}`}>{countWords(s.content)}</span>
                  </button>
                )
              })}
              {(g.name === 'Main text' || g.name === 'Declarations') && (
                <button
                  onClick={() => addSection(g.name === 'Main text' ? 'body' : 'back')}
                  className="w-full rounded px-2 py-1 text-left text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  + Add {g.name === 'Main text' ? 'section' : 'statement'}
                </button>
              )}
            </div>
          ))}
          <div className="mt-2 border-t border-stone-200 px-2 py-3 dark:border-stone-800">
            {(
              [
                ['authors', `Authors (${doc.authors.filter((a) => a.name.trim()).length})`],
                ['references', `References (${entries.length})`],
              ] as const
            ).map(([p, label]) => (
              <button
                key={p}
                onClick={() => {
                  setPane(p)
                  setSidebarOpen(false)
                }}
                className={`block w-full rounded px-2 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800 ${activePane === p ? 'bg-stone-100 font-medium dark:bg-stone-800' : ''}`}
              >
                {label}
              </button>
            ))}
            <Link to="/manuscripts" className="mt-2 block px-2 text-xs text-stone-500 hover:underline">
              ← All manuscripts
            </Link>
          </div>
        </aside>

        {/* Main pane */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {activePane === 'authors' ? (
            <AuthorsPane authors={doc.authors} onChange={(authors) => change((m) => ({ ...m, authors }))} />
          ) : activePane === 'references' ? (
            <ReferencesPane doc={doc} entries={entries} onChange={(bibtex) => change((m) => ({ ...m, bibtex }))} />
          ) : section ? (
            <SectionPane
              key={section.id}
              section={section}
              entries={entries}
              canUndo={undo?.sectionId === section.id}
              onUndo={() => {
                if (undo) updateSection(undo.sectionId, { content: undo.content })
                setUndo(null)
              }}
              onChange={(patch) => updateSection(section.id, patch)}
              onMove={(d) => moveSection(section.id, d)}
              onDelete={() => deleteSection(section.id)}
              onAddAfter={() => addSection(section.role, section.id)}
            />
          ) : null}
        </div>

        {/* AI panel */}
        {section && (
          <aside
            className={`${assistOpen ? 'flex' : 'hidden'} absolute inset-y-0 right-0 z-20 w-full max-w-md flex-col border-l border-stone-200 bg-white xl:static xl:flex xl:w-[26rem] dark:border-stone-800 dark:bg-stone-900`}
          >
            <AssistPanel
              manuscript={doc}
              section={section}
              onReplace={(t) => setFromAI(section.id, t)}
              onAppend={(t) => setFromAI(section.id, section.content.trim() ? `${section.content.trimEnd()}\n\n${t}` : t)}
            />
          </aside>
        )}
      </div>
    </div>
  )
}

function SectionPane({
  section,
  entries,
  canUndo,
  onUndo,
  onChange,
  onMove,
  onDelete,
  onAddAfter,
}: {
  section: ManuscriptSection
  entries: BibEntry[]
  canUndo: boolean
  onUndo: () => void
  onChange: (patch: Partial<ManuscriptSection>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
  onAddAfter: () => void
}) {
  const [preview, setPreview] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const byKey = useMemo(() => new Map(entries.map((e) => [e.key, e])), [entries])
  const movable = section.role === 'body' || section.role === 'back'

  function insert(text: string) {
    const el = ta.current
    if (!el) return onChange({ content: section.content + text })
    const { selectionStart: a, selectionEnd: b } = el
    const next = section.content.slice(0, a) + text + section.content.slice(b)
    onChange({ content: next })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + text.length, a + text.length)
    })
  }

  const previewText = section.content.replace(CITE_RE, (_, g: string) => formatCitation(g, byKey))

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {movable ? (
          <Input value={section.title} onChange={(e) => onChange({ title: e.target.value })} className="min-w-0 flex-1 text-base font-semibold" title="Section title" />
        ) : (
          <h2 className="flex-1 text-lg font-semibold">{section.title}</h2>
        )}
        {movable && (
          <span className="flex gap-1">
            <Button variant="ghost" title="Move up" onClick={() => onMove(-1)}>
              ↑
            </Button>
            <Button variant="ghost" title="Move down" onClick={() => onMove(1)}>
              ↓
            </Button>
            <Button variant="ghost" title="Add a section after this one" onClick={onAddAfter}>
              +
            </Button>
            <Button variant="ghost" title="Delete section" onClick={onDelete} className="hover:text-red-600">
              🗑
            </Button>
          </span>
        )}
      </div>
      {section.hint && <p className="text-xs text-stone-500">{section.hint}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-stone-300 p-0.5 text-xs dark:border-stone-700">
          {(['Write', 'Preview'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setPreview(t === 'Preview')}
              className={`rounded px-2.5 py-1 ${preview === (t === 'Preview') ? 'bg-stone-200 font-medium dark:bg-stone-800' : ''}`}
            >
              {t}
            </button>
          ))}
        </div>
        {!preview && entries.length > 0 && (
          <Select
            value=""
            onChange={(e) => e.target.value && insert(`[@${e.target.value}]`)}
            className="w-auto max-w-56 text-xs"
            title="Insert a citation at the cursor"
          >
            <option value="">Insert citation…</option>
            {entries.map((e) => (
              <option key={e.key} value={e.key}>
                {citeLabel(e)} — {e.fields.title?.slice(0, 50)}
              </option>
            ))}
          </Select>
        )}
        {canUndo && (
          <Button variant="ghost" className="text-xs" onClick={onUndo}>
            ↶ Undo AI change
          </Button>
        )}
        <span className="ml-auto text-xs text-stone-500">{countWords(section.content)} words</span>
      </div>

      {preview ? (
        <div className="min-h-[50vh] rounded-md border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          {section.content.trim() ? <Markdown text={previewText} /> : <p className="text-sm text-stone-400">Nothing to preview yet.</p>}
        </div>
      ) : (
        <textarea
          ref={ta}
          value={section.content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder={
            section.role === 'highlights'
              ? '- First highlight (≤ 85 characters)\n- Second highlight\n- Third highlight'
              : section.role === 'keywords'
                ? 'Rockburst, Microseismic monitoring, Deep learning, Ground support'
                : 'Write here, or jot down notes and ask the AI to draft from them.\n\nMarkdown: ## subsection, **bold**, *italic*, $\\sigma_1$ inline math, $$ … $$ display math, tables, and [@citekey] citations.'
          }
          className="min-h-[60vh] w-full resize-y rounded-md border border-stone-300 bg-white p-3 font-mono text-sm leading-relaxed outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-900"
        />
      )}

      {section.role === 'highlights' && <HighlightCheck section={section} />}
    </div>
  )
}

function HighlightCheck({ section }: { section: ManuscriptSection }) {
  const lines = highlightList({ sections: [section] } as Manuscript)
  if (!lines.length) return null
  return (
    <ul className="space-y-0.5 text-xs">
      {lines.map((l, i) => (
        <li key={i} className={l.length > 85 ? 'text-red-600' : 'text-stone-500'}>
          {l.length}/85 — {l.slice(0, 60)}
          {l.length > 60 ? '…' : ''}
        </li>
      ))}
      {(lines.length < 3 || lines.length > 5) && <li className="text-amber-700">Elsevier asks for 3–5 highlights (you have {lines.length}).</li>}
    </ul>
  )
}

function AuthorsPane({ authors, onChange }: { authors: Author[]; onChange: (a: Author[]) => void }) {
  const set = (i: number, patch: Partial<Author>) =>
    onChange(
      authors.map((a, j) => {
        if (j === i) return { ...a, ...patch }
        // Only one corresponding author.
        return patch.corresponding ? { ...a, corresponding: false } : a
      }),
    )
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <h2 className="text-lg font-semibold">Authors</h2>
      <p className="text-xs text-stone-500">Authors sharing the same affiliation text get the same affiliation number on export.</p>
      {authors.map((a, i) => (
        <div key={i} className="grid gap-2 rounded-md border border-stone-200 p-3 sm:grid-cols-2 dark:border-stone-800">
          <label>
            <Label>Full name</Label>
            <Input value={a.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Given names Family name" />
          </label>
          <label>
            <Label>Email</Label>
            <Input type="email" value={a.email ?? ''} onChange={(e) => set(i, { email: e.target.value })} />
          </label>
          <label className="sm:col-span-2">
            <Label>Affiliation</Label>
            <Input value={a.affiliation} onChange={(e) => set(i, { affiliation: e.target.value })} placeholder="Department, University, City, Country" />
          </label>
          <div className="flex items-center gap-3 text-sm sm:col-span-2">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!!a.corresponding} onChange={() => set(i, { corresponding: true })} />
              Corresponding author
            </label>
            <span className="ml-auto flex gap-1">
              <Button variant="ghost" disabled={i === 0} onClick={() => onChange(swap(authors, i, i - 1))}>
                ↑
              </Button>
              <Button variant="ghost" disabled={i === authors.length - 1} onClick={() => onChange(swap(authors, i, i + 1))}>
                ↓
              </Button>
              <Button variant="ghost" onClick={() => onChange(authors.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </span>
          </div>
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange([...authors, { name: '', affiliation: authors[authors.length - 1]?.affiliation ?? '', email: '' }])}>
        + Add author
      </Button>
    </div>
  )
}

function swap<T>(list: T[], i: number, j: number): T[] {
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

function ReferencesPane({ doc, entries, onChange }: { doc: Manuscript; entries: BibEntry[]; onChange: (bib: string) => void }) {
  const cited = citedKeys(doc.sections.map((s) => s.content))
  const known = new Set(entries.map((e) => e.key))
  const missing = [...cited].filter((k) => !known.has(k))
  const duplicates = entries.map((e) => e.key).filter((k, i, all) => all.indexOf(k) !== i)

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <h2 className="text-lg font-semibold">References</h2>
      <p className="text-xs text-stone-500">
        Paste BibTeX exported from Zotero, Mendeley, Google Scholar or a DOI lookup. Cite in any section with <code>[@key]</code> or{' '}
        <code>[@key1; @key2]</code>. Only cited entries appear in the exported reference list.
      </p>
      <LibraryImport bibtex={doc.bibtex} entries={entries} missing={missing} onChange={onChange} />
      <VerifyReferences bibtex={doc.bibtex} entries={entries} onChange={onChange} />
      <textarea
        value={doc.bibtex}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder={'@article{hoek2019,\n  author = {Hoek, Evert and Brown, Edwin T.},\n  title = {The Hoek–Brown failure criterion and GSI – 2018 edition},\n  journal = {Journal of Rock Mechanics and Geotechnical Engineering},\n  year = {2019},\n  volume = {11},\n  number = {3},\n  pages = {445--463},\n  doi = {10.1016/j.jrmge.2018.08.001}\n}'}
        className="min-h-[40vh] w-full resize-y rounded-md border border-stone-300 bg-white p-3 font-mono text-xs outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-900"
      />
      {missing.length > 0 && (
        <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40">
          Cited but not in the library: {missing.map((k) => `[@${k}]`).join(', ')}
        </p>
      )}
      {duplicates.length > 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/40">Duplicate keys: {[...new Set(duplicates)].join(', ')}</p>
      )}
      {entries.length > 0 && (
        <table className="w-full text-left text-xs">
          <thead className="text-stone-500">
            <tr>
              <th className="py-1 pr-2">Key</th>
              <th className="py-1 pr-2">Citation</th>
              <th className="py-1 pr-2">Title</th>
              <th className="py-1">Cited</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.key}-${i}`} className="border-t border-stone-200 dark:border-stone-800">
                <td className="py-1 pr-2 font-mono">{e.key}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{citeLabel(e)}</td>
                <td className="py-1 pr-2">{e.fields.title}</td>
                <td className="py-1">{cited.has(e.key) ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
