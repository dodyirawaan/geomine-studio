// Train/test split and cross-validation folds, computed once so every engine and model sees identical data.
import type { ExperimentConfig, Prepared, Splits } from './types'

/** Small, fast, seedable PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Assigns items to k buckets; stratified by label when `labels` is given. */
function deal(items: number[], k: number, rand: () => number, labels?: number[]): number[][] {
  const buckets: number[][] = Array.from({ length: k }, () => [])
  if (!labels) {
    shuffle(items, rand).forEach((it, i) => buckets[i % k].push(it))
    return buckets
  }
  const byLabel = new Map<number, number[]>()
  for (const it of items) byLabel.set(labels[it], [...(byLabel.get(labels[it]) ?? []), it])
  let offset = 0
  for (const group of byLabel.values()) {
    shuffle(group, rand).forEach((it, i) => buckets[(i + offset) % k].push(it))
    offset += group.length
  }
  return buckets
}

export function makeSplits(p: Prepared, c: ExperimentConfig, timeValues?: number[]): Splits {
  const n = p.y.length
  const rand = rng(c.seed)
  const all = Array.from({ length: n }, (_, i) => i)
  const k = Math.max(2, Math.min(10, c.split.folds))
  const strat = c.task === 'classification' ? p.y : undefined
  const kind = c.sequence ? (c.split.kind === 'time' ? 'time' : 'group') : c.split.kind

  if (kind === 'time') {
    if (!timeValues) throw new Error('A temporal split needs a time column.')
    const order = [...all].sort((a, b) => timeValues[a] - timeValues[b])
    const cut = Math.round(n * (1 - c.split.testFraction))
    const train = order.slice(0, cut)
    const test = order.slice(cut)
    // Expanding-window CV: each fold validates on the next block in time.
    const block = Math.floor(train.length / (k + 1))
    const folds = Array.from({ length: k }, (_, f) => train.slice(block * (f + 1), f === k - 1 ? train.length : block * (f + 2)))
    const foldTrain = Array.from({ length: k }, (_, f) => train.slice(0, block * (f + 1)))
    return { train, test, folds, foldTrain, description: `temporal split: the latest ${Math.round(c.split.testFraction * 100)}% of samples by "${c.timeColumn ?? c.sequence?.orderColumn}" held out for testing; ${k}-fold forward-chaining cross-validation on the earlier samples` }
  }

  if (kind === 'group') {
    if (!p.groups) throw new Error('A grouped split needs a group column.')
    const names = [...new Set(p.groups.map(String))]
    if (names.length < k + 1) throw new Error(`Only ${names.length} groups: a grouped split with ${k} folds needs at least ${k + 1}.`)
    const order = shuffle(names, rand)
    const nTest = Math.max(1, Math.round(names.length * c.split.testFraction))
    const testGroups = new Set(order.slice(0, nTest))
    const train = all.filter((i) => !testGroups.has(String(p.groups![i])))
    const test = all.filter((i) => testGroups.has(String(p.groups![i])))
    const trainGroups = order.slice(nTest)
    const foldOf = new Map<string, number>()
    trainGroups.forEach((g, i) => foldOf.set(g, i % k))
    const folds = Array.from({ length: k }, (_, f) => train.filter((i) => foldOf.get(String(p.groups![i])) === f))
    return { train, test, folds, foldTrain: complement(train, folds), description: `grouped split by "${c.sequence?.seriesColumn ?? c.groupColumn}": ${nTest} of ${names.length} groups held out for testing; ${k}-fold group cross-validation on the remaining ${trainGroups.length} groups, so no group appears in both training and validation` }
  }

  const testBuckets = deal(all, Math.max(2, Math.round(1 / c.split.testFraction)), rand, strat)
  const test = testBuckets[0].sort((a, b) => a - b)
  const testSet = new Set(test)
  const train = all.filter((i) => !testSet.has(i))
  const folds = deal(train, k, rand, strat).map((f) => f.sort((a, b) => a - b))
  return {
    train,
    test,
    folds,
    foldTrain: complement(train, folds),
    description: `${strat ? 'stratified ' : ''}random split: ${test.length} samples (${Math.round((test.length / n) * 100)}%) held out for testing; ${strat ? 'stratified ' : ''}${k}-fold cross-validation on the remaining ${train.length}`,
  }
}

function complement(train: number[], folds: number[][]): number[][] {
  return folds.map((f) => {
    const out = new Set(f)
    return train.filter((i) => !out.has(i))
  })
}
