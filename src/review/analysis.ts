// Descriptive bibliometrics of a review's records: output per year, venues, most cited works and frequent terms.
import type { PaperMeta } from '../literature/openalex'

const STOP = new Set(
  `a an the and or of in on for to with by from at as is are was were be been this that these those it its into than then which who whom what when where how we our their there such can may also not no using used use based between within both each per via study studies paper results result method methods approach analysis proposed new two three one model models data under during after before however while among more most less high low large small different various effect effects significant significantly respectively show shows shown found case review research present presented obtained provide provides further well therefore thus`.split(
    /\s+/,
  ),
)

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t))
}

export interface Bibliometrics {
  years: { year: number; n: number }[]
  venues: { venue: string; n: number }[]
  cited: PaperMeta[]
  terms: { term: string; n: number }[]
  periods: { label: string; terms: { term: string; n: number }[] }[]
  medianYear: number
  shareRecent: number
}

function topCounts(items: string[], k: number): { term: string; n: number }[] {
  const c = new Map<string, number>()
  for (const i of items) c.set(i, (c.get(i) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k).map(([term, n]) => ({ term, n }))
}

/** Unigrams and bigrams counted once per document (document frequency). */
function docTerms(m: PaperMeta): string[] {
  const t = tokens(`${m.title} ${m.abstract ?? ''}`)
  const bi = t.slice(1).map((w, i) => `${t[i]} ${w}`)
  return [...new Set([...t, ...bi])]
}

export function bibliometrics(works: PaperMeta[]): Bibliometrics {
  const withYear = works.filter((w) => w.year)
  const ys = withYear.map((w) => w.year!).sort((a, b) => a - b)
  const yearCount = new Map<number, number>()
  ys.forEach((y) => yearCount.set(y, (yearCount.get(y) ?? 0) + 1))
  const years = ys.length ? Array.from({ length: ys[ys.length - 1] - ys[0] + 1 }, (_, i) => ys[0] + i).map((year) => ({ year, n: yearCount.get(year) ?? 0 })) : []
  const venues = topCounts(works.map((w) => w.venue).filter(Boolean) as string[], 10).map((x) => ({ venue: x.term, n: x.n }))
  const cited = [...works].filter((w) => w.citedBy != null).sort((a, b) => (b.citedBy ?? 0) - (a.citedBy ?? 0)).slice(0, 10)
  // Bigrams are more informative; keep unigrams only when frequent.
  const all = works.flatMap(docTerms)
  const terms = topCounts(all, 80)
    .filter((x) => x.term.includes(' ') || x.n >= Math.max(3, works.length * 0.15))
    .slice(0, 25)
  // Theme evolution: three equal periods.
  const periods: Bibliometrics['periods'] = []
  if (ys.length >= 6) {
    const cuts = [ys[0], ys[Math.floor(ys.length / 3)], ys[Math.floor((2 * ys.length) / 3)], ys[ys.length - 1] + 1]
    for (let i = 0; i < 3; i++) {
      const lo = cuts[i]
      const hi = i === 2 ? cuts[3] : cuts[i + 1]
      const sub = withYear.filter((w) => w.year! >= lo && w.year! < hi)
      if (!sub.length) continue
      periods.push({ label: `${lo}–${hi - 1}`, terms: topCounts(sub.flatMap(docTerms).filter((t) => t.includes(' ')), 8) })
    }
  }
  const now = new Date().getFullYear()
  return {
    years,
    venues,
    cited,
    terms,
    periods,
    medianYear: ys.length ? ys[Math.floor(ys.length / 2)] : NaN,
    shareRecent: ys.length ? ys.filter((y) => y >= now - 5).length / ys.length : NaN,
  }
}
