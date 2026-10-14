// Prioritised screening with active learning, following the default model of ASReview (van de Schoot et al., 2021):
// TF-IDF features of title and abstract and a multinomial naive Bayes classifier, retrained on the reviewer's decisions
// after every decision, ranks the unscreened records so that likely relevant ones come first. Runs in the browser and
// needs no AI provider. Stopping follows the data-driven criteria of the SAFE procedure (Boetje & van de Schoot, 2024).
import type { Decision, ReviewRecord } from './types'

/** Smoothing of the naive Bayes model (ASReview's default). */
export const NB_ALPHA = 3.822
export const MODEL_DESCRIPTION = `TF-IDF features (unigrams and bigrams) of titles and abstracts and a multinomial naive Bayes classifier (α = ${NB_ALPHA}, equal class priors)`

const STOP = new Set(
  'a an and are as at be been but by can for from had has have in into is it its of on or our such than that the their them then there these this those to was we were which while with within without using used use based study studies paper results result show shows shown method methods approach new also both however between during after before under over more most may can not no its'.split(' '),
)

function tokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
  const out = [...words]
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]} ${words[i + 1]}`)
  return out
}

/** Sparse TF-IDF vectors (term index → weight), L2-normalised. */
export interface Features {
  ids: string[]
  vectors: Map<number, number>[]
  vocabulary: number
}

export function buildFeatures(records: ReviewRecord[]): Features {
  const docs = records.map((r) => tokens(`${r.meta.title} ${r.meta.abstract ?? ''}`))
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  // Terms in a single record carry no information for ranking the others.
  const index = new Map<string, number>()
  const N = docs.length
  const idf: number[] = []
  for (const [t, n] of df)
    if (n >= 2) {
      index.set(t, index.size)
      idf.push(Math.log((1 + N) / (1 + n)) + 1)
    }
  const vectors = docs.map((d) => {
    const tf = new Map<number, number>()
    for (const t of d) {
      const i = index.get(t)
      if (i !== undefined) tf.set(i, (tf.get(i) ?? 0) + 1)
    }
    let norm = 0
    for (const [i, c] of tf) {
      const w = (1 + Math.log(c)) * idf[i]
      tf.set(i, w)
      norm += w * w
    }
    norm = Math.sqrt(norm) || 1
    for (const [i, w] of tf) tf.set(i, w / norm)
    return tf
  })
  return { ids: records.map((r) => r.id), vectors, vocabulary: index.size }
}

/** Relevant for training: include and maybe (conservative); irrelevant: exclude. */
export const relevant = (d: Decision) => d !== 'exclude'

/**
 * Probability of relevance for every record, from a naive Bayes model trained on the labelled ones.
 * Returns null until there is at least one relevant and one irrelevant decision.
 */
export function scoreRecords(f: Features, labels: Map<string, Decision>): Map<string, number> | null {
  const V = f.vocabulary
  const sum = [new Float64Array(V), new Float64Array(V)]
  const total = [0, 0]
  let n1 = 0
  let n0 = 0
  f.ids.forEach((id, k) => {
    const d = labels.get(id)
    if (!d) return
    const c = relevant(d) ? 1 : 0
    if (c) n1++
    else n0++
    for (const [i, w] of f.vectors[k]) {
      sum[c][i] += w
      total[c] += w
    }
  })
  if (!n1 || !n0) return null
  const logp = [0, 1].map((c) => {
    const denom = total[c] + NB_ALPHA * V
    return Float64Array.from(sum[c], (s) => Math.log((s + NB_ALPHA) / denom))
  })
  const out = new Map<string, number>()
  f.ids.forEach((id, k) => {
    let l1 = 0
    let l0 = 0
    for (const [i, w] of f.vectors[k]) {
      l1 += w * logp[1][i]
      l0 += w * logp[0][i]
    }
    out.set(id, 1 / (1 + Math.exp(l0 - l1)))
  })
  return out
}

export interface StopStatus {
  screened: number
  total: number
  /** Irrelevant decisions in a row since the last relevant one (in decision order). */
  run: number
  minFraction: boolean
  runReached: boolean
}

/** SAFE-style data-driven stopping: at least 10% screened and `k` irrelevant decisions in a row. */
export function stopStatus(records: ReviewRecord[], decision: (r: ReviewRecord) => Decision | undefined, k: number): StopStatus {
  const decided = records.filter((r) => decision(r) && !r.auto)
  const ordered = decided.filter((r) => r.decidedAt).sort((a, b) => b.decidedAt! - a.decidedAt!)
  let run = 0
  for (const r of ordered) {
    if (relevant(decision(r)!)) break
    run++
  }
  const total = records.length
  return { screened: decided.length, total, run, minFraction: decided.length >= 0.1 * total, runReached: run >= k }
}

/** A reproducible random sample (seeded shuffle) of the given records, for the quality check before stopping. */
export function randomSample<T extends { id: string }>(xs: T[], n: number, seed = 20240501): T[] {
  let s = seed >>> 0
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}
