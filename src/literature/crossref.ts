// Crossref lookups used to check that references exist and that their DOIs point to the cited work.
import { familyNames, type BibEntry } from '../manuscript/bibtex'
import { bareDoi, type PaperMeta } from './openalex'

const BASE = 'https://api.crossref.org'

interface CrossrefItem {
  DOI: string
  title?: string[]
  'container-title'?: string[]
  author?: { given?: string; family?: string; name?: string }[]
  issued?: { 'date-parts'?: number[][] }
  volume?: string
  issue?: string
  page?: string
  URL?: string
  abstract?: string
}

function itemYear(it: CrossrefItem): number | undefined {
  return it.issued?.['date-parts']?.[0]?.[0] ?? undefined
}

export function crossrefToMeta(it: CrossrefItem): PaperMeta {
  return {
    doi: bareDoi(it.DOI),
    title: it.title?.[0]?.replace(/<[^>]+>/g, '') ?? '[untitled]',
    authors: (it.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean),
    year: itemYear(it),
    venue: it['container-title']?.[0],
    volume: it.volume,
    issue: it.issue,
    pages: it.page?.replace('-', '–'),
    abstract: it.abstract?.replace(/<[^>]+>/g, '').trim() || undefined,
    url: `https://doi.org/${bareDoi(it.DOI)}`,
  }
}

export async function crossrefByDoi(doi: string): Promise<CrossrefItem | null> {
  const res = await fetch(`${BASE}/works/${encodeURIComponent(bareDoi(doi))}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Crossref: HTTP ${res.status}`)
  return ((await res.json()) as { message: CrossrefItem }).message
}

export async function crossrefSearch(text: string, rows = 3): Promise<CrossrefItem[]> {
  const q = new URLSearchParams({ 'query.bibliographic': text, rows: String(rows), select: 'DOI,title,author,issued,container-title,volume,issue,page' })
  const res = await fetch(`${BASE}/works?${q}`)
  if (!res.ok) throw new Error(`Crossref: HTTP ${res.status}`)
  return ((await res.json()) as { message: { items: CrossrefItem[] } }).message.items
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

/** Dice similarity of title word sets, 0–1. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (!ta.size || !tb.size) return 0
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  return (2 * common) / (ta.size + tb.size)
}

export type VerifyStatus = 'verified' | 'mismatch' | 'doi-not-found' | 'suggested' | 'not-found' | 'error'

export interface VerifyResult {
  key: string
  status: VerifyStatus
  /** The DOI Crossref matched (for 'suggested', the DOI to add). */
  doi?: string
  found?: { title: string; year?: number; authors: string; venue?: string }
  note: string
}

function describe(it: CrossrefItem): VerifyResult['found'] {
  const m = crossrefToMeta(it)
  return { title: m.title, year: m.year, authors: m.authors.slice(0, 3).join(', ') + (m.authors.length > 3 ? ' et al.' : ''), venue: m.venue }
}

function familyMatches(e: BibEntry, it: CrossrefItem): boolean {
  const ours = familyNames(e)[0]?.toLowerCase()
  if (!ours) return true
  return (it.author ?? []).some((a) => (a.family ?? a.name ?? '').toLowerCase().includes(ours))
}

/**
 * Checks one BibTeX entry against Crossref. With a DOI, the DOI must resolve to a work with the same title and
 * year; without one, a close bibliographic match is offered as a suggested DOI.
 */
export async function verifyEntry(e: BibEntry): Promise<VerifyResult> {
  const title = e.fields.title ?? ''
  const year = Number(e.fields.year) || undefined
  try {
    if (e.fields.doi) {
      const it = await crossrefByDoi(e.fields.doi)
      if (!it) return { key: e.key, status: 'doi-not-found', note: 'This DOI does not resolve on Crossref. It may be mistyped or invented.' }
      const sim = titleSimilarity(title, it.title?.[0] ?? '')
      const y = itemYear(it)
      const yearOk = !year || !y || Math.abs(y - year) <= 1
      if (sim >= 0.75 && yearOk && familyMatches(e, it)) return { key: e.key, status: 'verified', doi: bareDoi(it.DOI), found: describe(it), note: 'DOI, title, year and first author match.' }
      const why = [sim < 0.75 && `title similarity ${(sim * 100).toFixed(0)}%`, !yearOk && `year ${y} vs ${year}`, !familyMatches(e, it) && 'first author differs']
        .filter(Boolean)
        .join(', ')
      return { key: e.key, status: 'mismatch', doi: bareDoi(it.DOI), found: describe(it), note: `The DOI points to a different record (${why}).` }
    }
    if (!title) return { key: e.key, status: 'not-found', note: 'No DOI and no title to search with.' }
    const query = [title, familyNames(e)[0], e.fields.year].filter(Boolean).join(' ')
    const items = await crossrefSearch(query)
    const best = items
      .map((it) => ({ it, sim: titleSimilarity(title, it.title?.[0] ?? '') }))
      .sort((a, b) => b.sim - a.sim)[0]
    if (best && best.sim >= 0.85 && familyMatches(e, best.it)) {
      return { key: e.key, status: 'suggested', doi: bareDoi(best.it.DOI), found: describe(best.it), note: 'No DOI in the entry; Crossref has a close match.' }
    }
    return {
      key: e.key,
      status: 'not-found',
      found: best ? describe(best.it) : undefined,
      note: 'No close Crossref match. Books, theses and conference papers are often missing — check this one by hand.',
    }
  } catch (err) {
    return { key: e.key, status: 'error', note: (err as Error).message }
  }
}
