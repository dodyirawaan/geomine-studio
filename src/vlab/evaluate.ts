// Turns engine predictions into a full evaluation: CV and test metrics, confidence intervals, model comparison
// tests, curves, and data/leakage diagnostics.
import { correlation } from './data'
import { bootstrap, confusion, correctedTTest, meanStd, METRICS, PRIMARY, rocCurve, scores, aucBinary } from './metrics'
import type { EngineInfo, ExperimentConfig, ModelOutput, Prepared, Splits, Table } from './types'

export interface ModelResult extends ModelOutput {
  cvScores: Record<string, number[]>
  cvSummary: Record<string, { mean: number; std: number }>
  testScores: Record<string, number>
  testCI: Record<string, [number, number]>
  confusion?: number[][]
  roc?: { cls: string; fpr: number[]; tpr: number[]; auc: number }[]
}

export interface Comparison {
  id: string
  diff: number
  t: number
  p: number
}

export interface ExperimentResult {
  createdAt: number
  durationSeconds: number
  task: ExperimentConfig['task']
  primary: string
  data: {
    n: number
    nFeatures: number
    featureNames: string[]
    sources: string[]
    classes: string[]
    classCounts?: number[]
    targetSummary?: { mean: number; std: number; min: number; max: number }
    notes: string[]
    sequenceShape?: [number, number]
  }
  split: { description: string; nTrain: number; nTest: number; foldSizes: number[] }
  models: ModelResult[]
  /** Model ids, best first by mean CV primary metric. */
  ranking: string[]
  comparisons: Comparison[]
  yTest: number[]
  testSourceRows: number[]
  engines: EngineInfo[]
  warnings: string[]
}

export function evaluate(table: Table, c: ExperimentConfig, p: Prepared, s: Splits, outputs: ModelOutput[], engines: EngineInfo[], seconds: number): ExperimentResult {
  const task = c.task
  const k = p.classes.length
  const primary = PRIMARY[task]
  const metricIds = METRICS.filter((m) => m.task === task).map((m) => m.id)
  const yTest = s.test.map((i) => p.y[i])

  const models: ModelResult[] = outputs.map((o) => {
    if (o.error || !o.cv.length) return { ...o, cvScores: {}, cvSummary: {}, testScores: {}, testCI: {} }
    const cvScores: Record<string, number[]> = {}
    o.cv.forEach((f, fi) => {
      const yt = s.folds[fi].map((i) => p.y[i])
      const sc = scores(task, yt, f.pred, k, f.proba ?? undefined)
      for (const m of metricIds) (cvScores[m] ??= []).push(sc[m])
    })
    const cvSummary = Object.fromEntries(Object.entries(cvScores).map(([m, v]) => [m, meanStd(v)]))
    const proba = o.testProba ?? undefined
    const testScores = scores(task, yTest, o.test, k, proba)
    const testCI = bootstrap(task, yTest, o.test, k, proba, c.seed)
    const r: ModelResult = { ...o, cvScores, cvSummary, testScores, testCI }
    if (task === 'classification') {
      r.confusion = confusion(yTest, o.test, k)
      if (proba) {
        r.roc = p.classes.map((cls, ci) => {
          const pos = yTest.map((t) => t === ci)
          const sc = proba.map((row) => row[ci])
          return { cls, ...rocCurve(pos, sc), auc: aucBinary(pos, sc) }
        })
      }
    }
    return r
  })

  const def = METRICS.find((m) => m.id === primary)!
  const ok = models.filter((m) => m.cvSummary[primary] && Number.isFinite(m.cvSummary[primary].mean))
  const ranking = [...ok].sort((a, b) => (def.higher ? 1 : -1) * (b.cvSummary[primary].mean - a.cvSummary[primary].mean)).map((m) => m.id)
  const best = ok.find((m) => m.id === ranking[0])
  const nTestFold = s.folds.reduce((a, f) => a + f.length, 0) / s.folds.length
  const nTrainFold = s.foldTrain.reduce((a, f) => a + f.length, 0) / s.foldTrain.length
  const comparisons: Comparison[] = best
    ? ok
        .filter((m) => m.id !== best.id)
        .map((m) => {
          const a = best.cvScores[primary]
          const b = m.cvScores[primary]
          const { t, p: pv } = correctedTTest(a, b, nTestFold, nTrainFold)
          return { id: m.id, diff: best.cvSummary[primary].mean - m.cvSummary[primary].mean, t, p: pv }
        })
    : []

  const classCounts = task === 'classification' ? p.classes.map((_, ci) => p.y.filter((v) => v === ci).length) : undefined
  const ys = p.y
  const targetSummary = task === 'regression' ? { ...meanStd(ys), min: Math.min(...ys), max: Math.max(...ys) } : undefined

  return {
    createdAt: Date.now(),
    durationSeconds: seconds,
    task,
    primary,
    data: {
      n: p.y.length,
      nFeatures: p.featureNames.length,
      featureNames: p.featureNames,
      sources: [...new Set(p.featureSource)],
      classes: p.classes,
      classCounts,
      targetSummary,
      notes: p.notes,
      sequenceShape: p.sequenceShape,
    },
    split: { description: s.description, nTrain: s.train.length, nTest: s.test.length, foldSizes: s.folds.map((f) => f.length) },
    models,
    ranking,
    comparisons,
    yTest,
    testSourceRows: s.test.map((i) => p.sourceRow[i]),
    engines,
    warnings: diagnostics(table, c, p, s, models, ranking, comparisons, primary),
  }
}

/** Data-quality and leakage checks that Q1 reviewers commonly raise. */
function diagnostics(t: Table, c: ExperimentConfig, p: Prepared, s: Splits, models: ModelResult[], ranking: string[], comparisons: Comparison[], primary: string): string[] {
  const w: string[] = []
  const n = p.y.length
  if (n < 100) w.push(`Small dataset (${n} samples): expect wide confidence intervals; prefer simple models and report CV variability.`)
  if (n / Math.max(1, p.featureNames.length) < 10) w.push(`Only ${(n / p.featureNames.length).toFixed(1)} samples per input column; risk of overfitting.`)
  if (s.test.length < 30) w.push(`The test set has ${s.test.length} samples; test metrics are uncertain (see the bootstrap intervals).`)
  if (c.task === 'classification') {
    const counts = p.classes.map((_, ci) => p.y.filter((v) => v === ci).length)
    const ratio = Math.max(...counts) / Math.max(1, Math.min(...counts))
    if (ratio > 3) w.push(`Class imbalance ${ratio.toFixed(1)}:1 (${p.classes.map((cl, i) => `${cl}: ${counts[i]}`).join(', ')}). Report macro-averaged metrics${c.classWeight ? '' : ' and consider class weighting'}.`)
    if (Math.min(...counts) < c.split.folds * 2) w.push('The rarest class has very few samples for the number of folds; some folds may lack it.')
  }
  // Exact duplicates across training and test inflate test scores.
  const key = (i: number) => JSON.stringify(p.X[i])
  const trainKeys = new Set(s.train.map(key))
  const dups = s.test.filter((i) => trainKeys.has(key(i))).length
  if (dups) w.push(`${dups} test sample(s) have feature vectors identical to training samples — possible leakage through duplicated records.`)
  // A single feature that almost determines the target is a classic sign of leakage.
  if (c.task === 'regression' && !c.sequence) {
    const numeric = c.features.filter((f) => t.columns.find((x) => x.name === f)?.kind === 'numeric')
    const r = correlation(t, [c.target, ...numeric])[0].slice(1)
    numeric.forEach((f, i) => Math.abs(r[i]) > 0.95 && w.push(`"${f}" correlates with the target at r = ${r[i].toFixed(3)}; check it is not derived from the target or measured after the outcome.`))
  }
  if (!c.groupColumn && !c.sequence && c.split.kind === 'random') {
    const suspect = t.columns.filter((col) => col.name !== c.target && /(^|_|\b)(site|mine|specimen|sample|borehole|well|panel|id|project|coalfield|tunnel)(_|\b|$)/i.test(col.name) && col.unique < t.rows.length * 0.8)
    if (suspect.length) w.push(`Columns ${suspect.map((x) => `"${x.name}"`).join(', ')} look like grouping variables. If samples from the same group are correlated, use a grouped split to avoid optimistic results.`)
  }
  const baseline = models.find((m) => m.id === 'dummy')
  const best = models.find((m) => m.id === ranking[0])
  if (best && baseline && best.id !== 'dummy') {
    const cmp = comparisons.find((x) => x.id === 'dummy')
    if (cmp && cmp.p > 0.05) w.push(`The best model (${best.name}) is not significantly better than the baseline in cross-validation (p = ${cmp.p.toFixed(3)}).`)
  }
  if (best && comparisons.length) {
    const close = comparisons.filter((x) => x.id !== 'dummy' && x.p > 0.05).map((x) => models.find((m) => m.id === x.id)?.name)
    if (close.length) w.push(`${best.name} is not significantly better than ${close.join(', ')} (corrected resampled t-test, p > 0.05); avoid claiming it is superior.`)
  }
  if (best) {
    const cv = best.cvSummary[primary]?.mean
    const te = best.testScores[primary]
    if (Number.isFinite(cv) && Number.isFinite(te) && Math.abs(cv - te) > 0.15) w.push(`The best model's test ${primary} (${te.toFixed(3)}) differs from its CV mean (${cv.toFixed(3)}) by more than 0.15: the test split may not be representative.`)
  }
  if (models.some((m) => m.error)) w.push(`Some models failed: ${models.filter((m) => m.error).map((m) => `${m.name} (${m.error})`).join('; ')}.`)
  if (c.tuning.enabled) w.push(`Hyperparameters were tuned inside each training fold (nested), so CV scores are not inflated by tuning.`)
  return w
}
