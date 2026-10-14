// Runs the protocol's queries and merges the results into the project's records, removing duplicates.
import { searchAllWorks, type PaperMeta } from '../literature/openalex'
import type { ReviewProject, ReviewRecord, SearchRun } from './types'

export function normTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Index of an existing record that is the same work (same DOI, OpenAlex id or normalised title + year). */
export function findSame(records: ReviewRecord[], m: PaperMeta): number {
  const t = normTitle(m.title)
  return records.findIndex(
    (r) =>
      (m.doi && r.meta.doi === m.doi) ||
      (m.openalexId && r.meta.openalexId === m.openalexId) ||
      (t.length > 20 && normTitle(r.meta.title) === t && (!m.year || !r.meta.year || Math.abs(m.year - r.meta.year) <= 1)),
  )
}

export function recordId(m: PaperMeta): string {
  return m.openalexId ?? (m.doi ? `doi:${m.doi}` : `t:${normTitle(m.title).slice(0, 80)}`)
}

/** Adds works to the record list; returns the new list and how many were duplicates. */
export function mergeWorks(records: ReviewRecord[], works: PaperMeta[], queryIndex: number, manual = false): { records: ReviewRecord[]; duplicates: number } {
  const out = records.map((r) => ({ ...r, queries: [...r.queries] }))
  let duplicates = 0
  for (const w of works) {
    const i = findSame(out, w)
    if (i >= 0) {
      duplicates++
      if (queryIndex >= 0 && !out[i].queries.includes(queryIndex)) out[i].queries.push(queryIndex)
      // Keep the richer metadata (an abstract is often missing from one source).
      if (!out[i].meta.abstract && w.abstract) out[i].meta = { ...out[i].meta, abstract: w.abstract }
    } else {
      out.push({ id: recordId(w), meta: w, queries: queryIndex >= 0 ? [queryIndex] : [], manual })
    }
  }
  return { records: out, duplicates }
}

/** Runs every query of the protocol again; screening decisions on existing records are kept. */
export async function runSearches(p: ReviewProject, apiKey: string | undefined, onProgress: (msg: string) => void): Promise<Pick<ReviewProject, 'records' | 'searches'>> {
  let records = p.records
  const searches: SearchRun[] = []
  const pr = p.protocol
  const queries = pr.queries.map((q) => q.trim()).filter(Boolean)
  for (const [qi, q] of queries.entries()) {
    onProgress(`Query ${qi + 1}/${queries.length}: searching…`)
    const { total, works } = await searchAllWorks(q, { fromYear: pr.yearFrom, toYear: pr.yearTo, articlesOnly: pr.articlesOnly, limit: pr.perQueryLimit, apiKey }, (n, t) =>
      onProgress(`Query ${qi + 1}/${queries.length}: ${n.toLocaleString()} of ${t.toLocaleString()} records`),
    )
    records = mergeWorks(records, works, qi).records
    searches.push({ database: 'OpenAlex', query: q, at: Date.now(), found: total, fetched: works.length })
  }
  return { records, searches }
}

/** Merges an export from another database; it is listed as its own search in PRISMA and the Methods. */
export function importExport(p: ReviewProject, works: PaperMeta[], database: string, query: string): Pick<ReviewProject, 'records' | 'imports'> {
  const imports = [...(p.imports ?? [])]
  const index = 1000 + imports.length
  imports.push({ database, query, at: Date.now(), found: works.length, fetched: works.length })
  return { records: mergeWorks(p.records, works, index).records, imports }
}
