import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Input } from '../../components/ui'
import { downloadText } from '../../lib/download'
import { paperToBibtex } from '../../literature/bib'
import { addPaper, attachPdf, deletePapers, importPdf, lookupDoi, removePdf, shortCite } from '../../literature/library'
import { db, type Paper } from '../../store/db'
import { useVault } from '../../store/vault'

export default function LibraryTab({
  papers,
  selected,
  setSelected,
}: {
  papers: Paper[]
  selected: Set<string>
  setSelected: (s: Set<string>) => void
}) {
  const { secrets } = useVault()
  const [filter, setFilter] = useState('')
  const [doi, setDoi] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const f = filter.trim().toLowerCase()
  const shown = papers.filter(
    (p) =>
      !f ||
      [p.title, p.authors.join(' '), p.venue, p.bibKey, p.tags.join(' '), String(p.year ?? '')].some((x) => x?.toLowerCase().includes(f)),
  )
  const allShownSelected = shown.length > 0 && shown.every((p) => selected.has(p.id))

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  async function addDoi(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus('Looking up DOI…')
    try {
      const meta = await lookupDoi(doi, secrets.openalexKey)
      if (!meta) setStatus('DOI not found on OpenAlex or Crossref.')
      else {
        const { paper, existed } = await addPaper(meta)
        setStatus(existed ? `Already in library: ${paper.title}` : `Added: ${paper.title}`)
        setDoi('')
      }
    } catch (err) {
      setStatus((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    const notes: string[] = []
    for (const [i, file] of [...files].entries()) {
      try {
        const { paper, matched } = await importPdf(file, secrets.openalexKey, (m) => setStatus(`${file.name} (${i + 1}/${files.length}): ${m}`))
        notes.push(matched ? `✓ ${paper.title}` : `⚠ ${file.name}: no DOI match — edit its details by hand`)
      } catch (err) {
        notes.push(`✗ ${file.name}: ${(err as Error).message}`)
      }
    }
    setStatus(notes.join('\n'))
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function exportBib() {
    const list = selected.size ? papers.filter((p) => selected.has(p.id)) : papers
    downloadText(list.map(paperToBibtex).join('\n\n') + '\n', 'library.bib', 'application/x-bibtex')
  }

  async function removeSelected() {
    if (!window.confirm(`Delete ${selected.size} paper(s) and their PDF text from the library?`)) return
    await deletePapers([...selected])
    setSelected(new Set())
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <form onSubmit={addDoi} className="flex gap-2">
            <Input value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="Add by DOI, e.g. 10.1016/j.jrmge.2018.08.001" />
            <Button type="submit" disabled={busy || !doi.trim()}>
              Add
            </Button>
          </form>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => importFiles(e.target.files)} />
            <Button variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
              Import PDFs…
            </Button>
            <span className="text-xs text-stone-500">Reads the DOI from each PDF and fetches its metadata. Text stays in this browser.</span>
          </div>
        </div>
        {status && <pre className="mt-2 text-xs whitespace-pre-wrap text-stone-600 dark:text-stone-400">{status}</pre>}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by title, author, tag, year…" className="max-w-xs" />
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={allShownSelected}
            onChange={() => {
              const next = new Set(selected)
              shown.forEach((p) => (allShownSelected ? next.delete(p.id) : next.add(p.id)))
              setSelected(next)
            }}
          />
          Select all shown
        </label>
        <span className="text-sm text-stone-500">{selected.size} selected</span>
        <span className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={!papers.length} onClick={exportBib}>
            Export BibTeX{selected.size ? ' (selected)' : ''}
          </Button>
          <Button variant="ghost" disabled={!selected.size} onClick={removeSelected} className="hover:text-red-600">
            Delete selected
          </Button>
        </span>
      </div>

      {!papers.length ? (
        <p className="text-sm text-stone-500">
          The library is empty. Add papers from the Search tab, by DOI, or by importing PDFs.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          {shown.map((p) => (
            <li key={p.id} className="p-3">
              <div className="flex gap-3">
                <input type="checkbox" className="mt-1" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === p.id ? null : p.id)}>
                  <span className="font-medium">{p.title}</span>
                  <span className="block text-sm text-stone-600 dark:text-stone-400">
                    {shortCite(p)} · <span className="italic">{p.venue ?? '—'}</span> · <code className="text-xs">@{p.bibKey}</code>
                  </span>
                </button>
                <span className="flex shrink-0 flex-wrap items-start justify-end gap-1 text-xs">
                  {p.pdfPages ? <Badge color="green">PDF {p.pdfPages} p</Badge> : null}
                  {p.matrix ? <Badge color="amber">matrix</Badge> : null}
                  {p.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </span>
              </div>
              {open === p.id && <PaperDetail p={p} />}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-stone-500">
        Cite library papers in a manuscript from its References pane (
        <Link to="/manuscripts" className="underline">
          Manuscripts
        </Link>
        ).
      </p>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color?: 'green' | 'amber' }) {
  const c =
    color === 'green'
      ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
      : color === 'amber'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
  return <span className={`rounded px-1.5 py-0.5 ${c}`}>{children}</span>
}

function PaperDetail({ p }: { p: Paper }) {
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const update = (patch: Partial<Paper>) => db.papers.update(p.id, { ...patch, updatedAt: Date.now() })

  return (
    <div className="mt-3 space-y-3 pl-7 text-sm">
      {p.abstract ? <p className="text-stone-700 dark:text-stone-300">{p.abstract}</p> : <p className="text-stone-500">No abstract available.</p>}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
        <span>{p.authors.join(', ') || 'No authors'}</span>
        {p.doi && (
          <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="underline">
            doi:{p.doi}
          </a>
        )}
        {p.oaUrl && (
          <a href={p.oaUrl} target="_blank" rel="noreferrer" className="text-green-700 underline dark:text-green-500">
            open access PDF
          </a>
        )}
        {p.citedBy !== undefined && <span>cited by {p.citedBy}</span>}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">
          Citation key
          <Input defaultValue={p.bibKey} onBlur={(e) => e.target.value.trim() && update({ bibKey: e.target.value.trim().replace(/\s+/g, '') })} />
        </label>
        <label className="text-xs sm:col-span-2">
          Tags (comma-separated)
          <Input
            defaultValue={p.tags.join(', ')}
            onBlur={(e) =>
              update({
                tags: e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
            placeholder="e.g. intro, ML, dynamic support"
          />
        </label>
      </div>
      <label className="block text-xs">
        Notes
        <textarea
          defaultValue={p.notes}
          onBlur={(e) => update({ notes: e.target.value })}
          rows={3}
          className="mt-0.5 w-full rounded-md border border-stone-300 bg-white p-2 text-sm outline-none focus:border-amber-500 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
              await attachPdf(p.id, file, setStatus)
              setStatus('PDF text stored.')
            } catch (err) {
              setStatus((err as Error).message)
            }
          }}
        />
        <Button variant="ghost" className="text-xs" onClick={() => fileRef.current?.click()}>
          {p.pdfPages ? 'Replace PDF' : 'Attach PDF'}
        </Button>
        {p.pdfPages ? (
          <Button variant="ghost" className="text-xs" onClick={() => removePdf(p.id)}>
            Remove PDF text ({p.pdfName})
          </Button>
        ) : null}
        {p.matrix && (
          <Button variant="ghost" className="text-xs" onClick={() => update({ matrix: undefined, matrixSource: undefined })}>
            Clear matrix row
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-xs hover:text-red-600"
          onClick={() => window.confirm('Delete this paper from the library?') && deletePapers([p.id])}
        >
          Delete
        </Button>
        {status && <span className="text-xs text-stone-500">{status}</span>}
      </div>
    </div>
  )
}
