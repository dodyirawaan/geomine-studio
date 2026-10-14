// OpenAlex works search (https://docs.openalex.org). Free without a key, with a daily quota per IP.
import type { Paper } from '../store/db'

const BASE = 'https://api.openalex.org'

/** Paper metadata before it is saved to the library. */
export type PaperMeta = Omit<Paper, 'id' | 'bibKey' | 'tags' | 'notes' | 'addedAt' | 'updatedAt'>

export type SortBy = 'relevance' | 'cited' | 'recent'

export interface SearchOptions {
  query: string
  fromYear?: number
  toYear?: number
  sort: SortBy
  articlesOnly: boolean
  page: number
  apiKey?: string
}

const SELECT = 'id,doi,title,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index,open_access,biblio'

interface RawWork {
  id: string
  doi?: string | null
  title?: string | null
  publication_year?: number | null
  authorships?: { author?: { display_name?: string } }[]
  primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null
  cited_by_count?: number
  abstract_inverted_index?: Record<string, number[]> | null
  open_access?: { oa_url?: string | null } | null
  biblio?: { volume?: string | null; issue?: string | null; first_page?: string | null; last_page?: string | null }
}

export function bareDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase()
}

function abstractFrom(index?: Record<string, number[]> | null): string | undefined {
  if (!index) return undefined
  const words: string[] = []
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word
  return words.filter(Boolean).join(' ') || undefined
}

function toMeta(w: RawWork): PaperMeta {
  const b = w.biblio ?? {}
  return {
    openalexId: w.id.replace('https://openalex.org/', ''),
    doi: w.doi ? bareDoi(w.doi) : undefined,
    title: (w.title ?? '[untitled]').replace(/<[^>]+>/g, ''),
    authors: (w.authorships ?? []).map((a) => a.author?.display_name ?? '').filter(Boolean),
    year: w.publication_year ?? undefined,
    venue: w.primary_location?.source?.display_name ?? undefined,
    volume: b.volume ?? undefined,
    issue: b.issue ?? undefined,
    pages: b.first_page ? (b.last_page && b.last_page !== b.first_page ? `${b.first_page}–${b.last_page}` : b.first_page) : undefined,
    abstract: abstractFrom(w.abstract_inverted_index),
    citedBy: w.cited_by_count,
    url: w.doi ?? w.primary_location?.landing_page_url ?? undefined,
    oaUrl: w.open_access?.oa_url ?? undefined,
  }
}

async function get(path: string, params: Record<string, string>, apiKey?: string): Promise<unknown> {
  const q = new URLSearchParams(params)
  if (apiKey) q.set('api_key', apiKey)
  const res = await fetch(`${BASE}${path}?${q}`)
  if (res.status === 429) throw new Error('OpenAlex daily quota reached. Add a free OpenAlex API key in Settings, or try again tomorrow.')
  if (!res.ok) throw new Error(`OpenAlex: HTTP ${res.status}`)
  return res.json()
}

export async function searchWorks(o: SearchOptions): Promise<{ total: number; works: PaperMeta[] }> {
  // Commas separate filters in OpenAlex syntax, so they cannot appear inside the search text.
  const filters = [`title_and_abstract.search:${o.query.replace(/[,:]/g, ' ').trim()}`]
  if (o.fromYear || o.toYear) filters.push(`publication_year:${o.fromYear ?? ''}-${o.toYear ?? ''}`)
  if (o.articlesOnly) filters.push('type:article|review')
  const sort = o.sort === 'cited' ? 'cited_by_count:desc' : o.sort === 'recent' ? 'publication_date:desc' : 'relevance_score:desc'
  const body = (await get('/works', { filter: filters.join(','), sort, 'per-page': '25', page: String(o.page), select: SELECT }, o.apiKey)) as {
    meta: { count: number }
    results: RawWork[]
  }
  return { total: body.meta.count, works: body.results.map(toMeta) }
}

/** Look up one work by DOI; null when OpenAlex does not know it. */
export async function workByDoi(doi: string, apiKey?: string): Promise<PaperMeta | null> {
  try {
    return toMeta((await get(`/works/doi:${bareDoi(doi)}`, { select: SELECT }, apiKey)) as RawWork)
  } catch (e) {
    if ((e as Error).message.includes('404')) return null
    throw e
  }
}

/**
 * All works matching a boolean title/abstract query (AND, OR, NOT, quotes, parentheses), up to `limit`, using
 * cursor paging. Returns the total count OpenAlex reports and the fetched works.
 */
export async function searchAllWorks(
  query: string,
  o: { fromYear?: number; toYear?: number; articlesOnly: boolean; limit: number; apiKey?: string },
  onProgress?: (fetched: number, total: number) => void,
): Promise<{ total: number; works: PaperMeta[] }> {
  // OpenAlex rejects wildcards and stems words itself, so trailing asterisks are dropped.
  const filters = [`title_and_abstract.search:${query.replace(/,/g, ' ').replace(/\*/g, '').trim()}`]
  if (o.fromYear || o.toYear) filters.push(`publication_year:${o.fromYear ?? ''}-${o.toYear ?? ''}`)
  if (o.articlesOnly) filters.push('type:article|review')
  const works: PaperMeta[] = []
  let cursor = '*'
  let total = 0
  while (cursor && works.length < o.limit) {
    const body = (await get('/works', { filter: filters.join(','), 'per-page': '200', cursor, select: SELECT }, o.apiKey)) as {
      meta: { count: number; next_cursor: string | null }
      results: RawWork[]
    }
    total = body.meta.count
    works.push(...body.results.map(toMeta))
    onProgress?.(Math.min(works.length, o.limit), total)
    if (!body.results.length) break
    cursor = body.meta.next_cursor ?? ''
  }
  return { total, works: works.slice(0, o.limit) }
}

/** Number of works matching a boolean title/abstract query, optionally restricted to review articles. */
export async function countWorks(query: string, o: { fromYear?: number; reviewsOnly?: boolean; apiKey?: string } = {}): Promise<number> {
  const filters = [`title_and_abstract.search:${query.replace(/,/g, ' ').replace(/\*/g, '').trim()}`]
  if (o.fromYear) filters.push(`publication_year:${o.fromYear}-`)
  filters.push(o.reviewsOnly ? 'type:review' : 'type:article|review')
  const body = (await get('/works', { filter: filters.join(','), 'per-page': '1', select: 'id' }, o.apiKey)) as { meta: { count: number } }
  return body.meta.count
}
