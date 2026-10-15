// Review topics found live on OpenAlex: keywords that are growing within a research area, with the number of articles
// and reviews on each, so the opportunity rests on current data rather than a fixed list.
import { countWorks, keywordCounts } from '../literature/openalex'
import { readJson, writeJson } from '../lib/storage'
import { buildQuery, KEYWORD_BLOCKS } from './keywords'
import type { ReviewMethodId } from './types'

export interface LiveTopic {
  id: string
  keyword: string
  query: string
  /** Articles in the recent window and in the window before it. */
  recent: number
  earlier: number
  primary: number
  reviews: number
  method: ReviewMethodId
  title: string
  why: string
}

export interface LiveTopicsResult {
  area: string
  at: number
  recentFrom: number
  topics: LiveTopic[]
}

const KEY = 'gm.liveTopics'
const CANDIDATES = 8

export function loadLiveTopics(): Record<string, LiveTopicsResult> {
  return readJson(KEY, {})
}

export function saveLiveTopics(r: LiveTopicsResult): void {
  writeJson(KEY, { ...loadLiveTopics(), [r.area]: r })
}

const block = (id: string) => buildQuery([KEYWORD_BLOCKS.find((b) => b.id === id)!])
const MINING = '(mining OR mine OR tunnel OR roadway OR "rock mass" OR rockburst OR backfill)'

/** The defining concepts of each area; generic blocks (e.g. "coal", "prediction") would make the query far too broad. */
const AREA_QUERY: Record<string, () => string> = {
  'Rockburst & seismicity': () => `${block('rockburst')} OR ${block('mis')}`,
  'Deep mining': () => block('deep'),
  'Ground support & tunnels': () => `${block('support')} OR ${block('edz')} OR ${block('caving')}`,
  'Coal mining & water conservation': () => `${block('watercons')} OR ${block('wcfz')}`,
  'Backfill & green mining': () => `${block('backfill')} OR (${block('co2')} AND ${block('waste')})`,
  'IR & AE monitoring': () => `(${block('ir')} OR "acoustic emission") AND (rock OR coal OR sandstone OR granite)`,
  'Rock mass & numerical methods': () => `${block('rockmass')} OR (${block('numerical')} AND ${MINING})`,
  'Machine learning': () => `${block('ml')} AND ${MINING}`,
}

export function areaQuery(area: string): string {
  return AREA_QUERY[area]?.() ?? area
}

const clean = (t: string) => t.replace(/"/g, '').toLowerCase()

function methodFor(primary: number, reviews: number): ReviewMethodId {
  if (primary < 40) return 'scoping'
  if (primary > 1500) return 'bibliometric'
  return reviews === 0 || (100 * reviews) / primary < 4 ? 'systematic' : 'scoping'
}

/** With a key OpenAlex accepts parallel requests; without one it rejects bursts, so requests go one at a time. */
async function runAll<T>(jobs: (() => Promise<T>)[], parallel: boolean): Promise<T[]> {
  if (parallel) return Promise.all(jobs.map((j) => j()))
  const out: T[] = []
  for (const j of jobs) out.push(await j())
  return out
}

/** Keywords growing fastest in the area over the last three years, checked for articles and reviews. */
export async function findLiveTopics(area: string, apiKey?: string, onProgress?: (msg: string) => void): Promise<LiveTopicsResult> {
  const year = new Date().getFullYear()
  const recentFrom = year - 2
  const base = areaQuery(area)
  const own = new Set(KEYWORD_BLOCKS.filter((b) => b.topic === area).flatMap((b) => b.terms.map(clean)))
  onProgress?.('Reading keyword trends on OpenAlex…')
  const all = <T>(jobs: (() => Promise<T>)[]) => runAll(jobs, !!apiKey)
  const [recent, earlier] = await all([() => keywordCounts(base, recentFrom, year, apiKey), () => keywordCounts(base, recentFrom - 3, recentFrom - 1, apiKey)])
  const before = new Map(earlier.map((k) => [k.id, k.count]))
  const scored = recent
    .filter((k) => k.count >= 15 && !own.has(k.name.toLowerCase()))
    .map((k) => ({ ...k, earlier: before.get(k.id) ?? 0 }))
    // Size times growth: a large and rising keyword ranks above a small spike or a large flat one.
    .map((k) => ({ ...k, score: k.count * Math.min(4, (k.count + 5) / (k.earlier + 5)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES)

  let done = 0
  onProgress?.(`Counting articles and reviews for ${scored.length} topics…`)
  const topics = await all(
    scored.map((k) => async (): Promise<LiveTopic> => {
      const query = `(${base}) AND "${k.name}"`
      const [primary, reviews] = await all([() => countWorks(query, { fromYear: year - 10, apiKey }), () => countWorks(query, { reviewsOnly: true, apiKey })])
      onProgress?.(`Counting articles and reviews ${++done}/${scored.length}`)
      return topic(k, query, primary, reviews)
    }),
  )
  const result = { area, at: Date.now(), recentFrom, topics }
  saveLiveTopics(result)
  return result

  function topic(k: (typeof scored)[number], query: string, primary: number, reviews: number): LiveTopic {
    const growth = k.earlier ? Math.round((100 * (k.count - k.earlier)) / k.earlier) : null
    return {
      id: k.id,
      keyword: k.name,
      query,
      recent: k.count,
      earlier: k.earlier,
      primary,
      reviews,
      method: methodFor(primary, reviews),
      title: `${k.name[0].toUpperCase()}${k.name.slice(1)} in ${area.toLowerCase()}`,
      why: `${k.count} articles in ${recentFrom}–${year}${growth == null ? ' (new keyword)' : `, ${growth >= 0 ? '+' : ''}${growth}% on the three years before`}; ${reviews} review${reviews === 1 ? '' : 's'} so far.`,
    }
  }
}

/** One short request that turns the data into review titles; the numbers stay as measured. */
export function liveTitlesRequest(area: string, topics: LiveTopic[]): string {
  return `Propose a precise review title for each candidate topic in underground mining geotechnics, based on the OpenAlex data below.

Area: ${area}
${topics.map((t) => `- id "${t.id}": keyword "${t.keyword}"; ${t.recent} articles in the last 3 years (${t.earlier} in the 3 years before); ${t.primary} articles in 10 years; ${t.reviews} reviews`).join('\n')}

Return only a JSON array: [{"id": "...", "title": "review title (max 15 words, no subtitle 'a systematic review')", "method": "systematic" | "scoping" | "bibliometric" | "narrative", "why": "one sentence on the opportunity, using only the numbers above"}].
Prefer systematic when there are many primary studies and few reviews, scoping for small or heterogeneous literatures, bibliometric for very large fields.`
}

export function parseLiveTitles(text: string): Record<string, { title: string; method: ReviewMethodId; why: string }> {
  const a = text.indexOf('[')
  const b = text.lastIndexOf(']')
  if (a === -1 || b <= a) throw new Error('The model did not return the expected list.')
  const out: Record<string, { title: string; method: ReviewMethodId; why: string }> = {}
  for (const x of JSON.parse(text.slice(a, b + 1)) as { id?: string; title?: string; method?: string; why?: string }[]) {
    if (!x.id || !x.title) continue
    const method = (['systematic', 'scoping', 'bibliometric', 'narrative'].includes(String(x.method)) ? x.method : 'scoping') as ReviewMethodId
    out[x.id] = { title: String(x.title), method, why: String(x.why ?? '') }
  }
  return out
}
