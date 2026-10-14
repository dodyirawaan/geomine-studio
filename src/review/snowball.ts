// Citation chasing (snowballing): backward through the reference lists of the included studies and forward through the
// works that cite them, using OpenAlex. New candidates are added as records from "other methods" for screening.
import { citingWorks, referencesOf, worksByIds, type PaperMeta } from '../literature/openalex'
import { includedRecords } from './prisma'
import { findSame, recordId } from './search'
import type { ReviewProject, ReviewRecord, SnowballRun } from './types'

export type Direction = 'backward' | 'forward'

export interface Candidate {
  meta: PaperMeta
  /** Ids of the included records it is linked to. */
  links: string[]
}

export interface ChaseResult {
  direction: Direction
  seeds: string[]
  candidates: Candidate[]
  /** Links found in OpenAlex before removing records already present. */
  total: number
  truncated: boolean
}

/** Included studies that can be chased (they need an OpenAlex id). */
export function chaseSeeds(p: ReviewProject, needsFullText: boolean): ReviewRecord[] {
  return includedRecords(p, needsFullText).filter((r) => r.meta.openalexId)
}

/** Seeds already chased in this direction by an earlier run. */
export function chasedBefore(p: ReviewProject, direction: Direction): Set<string> {
  return new Set((p.snowballs ?? []).filter((s) => s.direction === direction).flatMap((s) => s.seeds))
}

export async function chase(
  p: ReviewProject,
  direction: Direction,
  seeds: ReviewRecord[],
  o: { apiKey?: string; limit: number; applyLimits: boolean; onProgress?: (msg: string) => void },
): Promise<ChaseResult> {
  const pr = p.protocol
  const seedOf = new Map(seeds.map((r) => [r.meta.openalexId!, r.id]))
  const known = new Set(p.records.map((r) => r.meta.openalexId).filter(Boolean))
  let candidates: Candidate[] = []
  let total = 0
  let truncated = false

  if (direction === 'backward') {
    o.onProgress?.(`Reading the reference lists of ${seeds.length} studies…`)
    const refs = await referencesOf([...seedOf.keys()], o.apiKey)
    const links = new Map<string, Set<string>>()
    for (const [seed, list] of refs) for (const w of list) (links.get(w) ?? links.set(w, new Set()).get(w)!).add(seedOf.get(seed)!)
    total = links.size
    // Most-linked first, so a retrieval limit keeps the references shared by several included studies.
    const fresh = [...links.entries()].filter(([w]) => !known.has(w)).sort((a, b) => b[1].size - a[1].size)
    truncated = fresh.length > o.limit
    const ids = fresh.slice(0, o.limit).map(([w]) => w)
    const metas = await worksByIds(ids, o.apiKey, (n) => o.onProgress?.(`Fetching references: ${n} of ${ids.length}`))
    candidates = metas
      .filter((m) => !o.applyLimits || ((!pr.yearFrom || !m.year || m.year >= pr.yearFrom) && (!pr.yearTo || !m.year || m.year <= pr.yearTo)))
      .map((m) => ({ meta: m, links: [...(links.get(m.openalexId!) ?? [])] }))
  } else {
    const res = await citingWorks(
      [...seedOf.keys()],
      { fromYear: o.applyLimits ? pr.yearFrom : undefined, toYear: o.applyLimits ? pr.yearTo : undefined, articlesOnly: o.applyLimits && pr.articlesOnly, limit: o.limit, apiKey: o.apiKey },
      (n, t) => o.onProgress?.(`Fetching citing works: ${n.toLocaleString()} of ${t.toLocaleString()}`),
    )
    total = res.total
    truncated = res.total > res.works.length
    candidates = res.works.filter((w) => !known.has(w.meta.openalexId)).map((w) => ({ meta: w.meta, links: w.cites.map((x) => seedOf.get(x)!).filter(Boolean) }))
  }

  // Also drop works already present under another identifier (DOI or title).
  candidates = candidates.filter((c) => findSame(p.records, c.meta) < 0)
  candidates.sort((a, b) => b.links.length - a.links.length || (b.meta.citedBy ?? 0) - (a.meta.citedBy ?? 0))
  return { direction, seeds: seeds.map((s) => s.id), candidates, total, truncated }
}

/** Adds the candidates linked to at least `minLinks` included studies as records to screen, and logs the run. */
export function addChased(cur: ReviewProject, r: ChaseResult, minLinks: number): Pick<ReviewProject, 'records' | 'snowballs'> {
  const records = [...cur.records]
  let added = 0
  for (const c of r.candidates) {
    if (c.links.length < minLinks || findSame(records, c.meta) >= 0) continue
    records.push({ id: recordId(c.meta), meta: c.meta, queries: [], manual: true, via: r.direction, links: c.links })
    added++
  }
  const run: SnowballRun = { direction: r.direction, at: Date.now(), seeds: r.seeds, found: r.candidates.length, added, minLinks, truncated: r.truncated || undefined }
  return { records, snowballs: [...(cur.snowballs ?? []), run] }
}
