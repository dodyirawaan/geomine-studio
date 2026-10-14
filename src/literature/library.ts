import { db, type Paper } from '../store/db'
import { makeBibKey } from './bib'
import { crossrefByDoi, crossrefToMeta } from './crossref'
import { bareDoi, workByDoi, type PaperMeta } from './openalex'
import { chunkPages } from './retrieval'

/** Saves a work to the library, or returns the existing copy when its DOI or OpenAlex id is already there. */
export async function addPaper(meta: PaperMeta): Promise<{ paper: Paper; existed: boolean }> {
  const existing =
    (meta.doi && (await db.papers.where('doi').equals(meta.doi).first())) ||
    (meta.openalexId && (await db.papers.filter((p) => p.openalexId === meta.openalexId).first()))
  if (existing) return { paper: existing, existed: true }
  // OpenAlex has no abstracts for many publishers; Crossref sometimes does.
  if (!meta.abstract && meta.doi) {
    const it = await crossrefByDoi(meta.doi).catch(() => null)
    if (it?.abstract) meta = { ...meta, abstract: crossrefToMeta(it).abstract }
  }
  const taken = new Set((await db.papers.toArray()).map((p) => p.bibKey))
  const now = Date.now()
  const paper: Paper = { ...meta, id: crypto.randomUUID(), bibKey: makeBibKey(meta, taken), tags: [], notes: '', addedAt: now, updatedAt: now }
  await db.papers.add(paper)
  return { paper, existed: false }
}

/** Metadata for a DOI from OpenAlex (has abstracts), falling back to Crossref. */
export async function lookupDoi(doi: string, openalexKey?: string): Promise<PaperMeta | null> {
  const d = bareDoi(doi)
  try {
    const w = await workByDoi(d, openalexKey)
    if (w) return w
  } catch {
    // OpenAlex quota or outage: Crossref still works.
  }
  const it = await crossrefByDoi(d)
  return it ? crossrefToMeta(it) : null
}

async function readPdf(file: File, onProgress?: (msg: string) => void): Promise<string[]> {
  const { extractPdfPages } = await import('./pdf')
  return extractPdfPages(await file.arrayBuffer(), (i, n) => onProgress?.(`Reading page ${i}/${n}`))
}

async function storePages(paperId: string, pdfName: string, pages: string[]): Promise<void> {
  const chunks = chunkPages(pages).map((c) => ({ ...c, paperId }))
  await db.transaction('rw', db.papers, db.chunks, async () => {
    await db.chunks.where('paperId').equals(paperId).delete()
    await db.chunks.bulkAdd(chunks)
    await db.papers.update(paperId, { pdfName, pdfPages: pages.length, updatedAt: Date.now() })
  })
  if (!chunks.length) throw new Error('No text found in this PDF — it may be a scanned image without OCR.')
}

export async function attachPdf(paperId: string, file: File, onProgress?: (msg: string) => void): Promise<void> {
  await storePages(paperId, file.name, await readPdf(file, onProgress))
}

/** Adds a PDF as a new library entry, identified by the DOI printed in it when there is one. */
export async function importPdf(file: File, openalexKey?: string, onProgress?: (msg: string) => void): Promise<{ paper: Paper; matched: boolean }> {
  const pages = await readPdf(file, onProgress)
  const { findDoi } = await import('./pdf')
  const doi = findDoi(pages.slice(0, 2).join('\n'))
  onProgress?.(doi ? `Looking up ${doi}` : 'No DOI found in the PDF')
  const meta = doi ? await lookupDoi(doi, openalexKey).catch(() => null) : null
  const { paper } = await addPaper(
    meta ?? { title: file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '), authors: [], doi: doi ?? undefined },
  )
  await storePages(paper.id, file.name, pages)
  return { paper: { ...paper, pdfName: file.name, pdfPages: pages.length }, matched: !!meta }
}

export async function removePdf(paperId: string): Promise<void> {
  await db.transaction('rw', db.papers, db.chunks, async () => {
    await db.chunks.where('paperId').equals(paperId).delete()
    await db.papers.update(paperId, { pdfName: undefined, pdfPages: undefined, updatedAt: Date.now() })
  })
}

export async function deletePapers(ids: string[]): Promise<void> {
  await db.transaction('rw', db.papers, db.chunks, async () => {
    await db.chunks.where('paperId').anyOf(ids).delete()
    await db.papers.bulkDelete(ids)
  })
}

export function shortCite(p: Pick<Paper, 'authors' | 'year'>): string {
  const fam = (n: string) => n.split(/\s+/).pop() ?? n
  const a = p.authors
  const who = a.length === 0 ? 'Anon.' : a.length === 1 ? fam(a[0]) : a.length === 2 ? `${fam(a[0])} & ${fam(a[1])}` : `${fam(a[0])} et al.`
  return `${who} ${p.year ?? 'n.d.'}`
}
