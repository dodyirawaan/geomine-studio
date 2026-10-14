// Evaluation from predictions, identical for every engine: per-fold CV scores, test scores with bootstrap
// confidence intervals, and corrected resampled t-tests between models (Nadeau & Bengio 2003).
import { rng } from './splits'
import type { Task } from './types'

export interface MetricDef {
  id: string
  label: string
  /** Higher is better. */
  higher: boolean
  task: Task
  needsProba?: boolean
}

export const METRICS: MetricDef[] = [
  { id: 'accuracy', label: 'Accuracy', higher: true, task: 'classification' },
  { id: 'balanced_accuracy', label: 'Balanced accuracy', higher: true, task: 'classification' },
  { id: 'f1_macro', label: 'F1 (macro)', higher: true, task: 'classification' },
  { id: 'precision_macro', label: 'Precision (macro)', higher: true, task: 'classification' },
  { id: 'recall_macro', label: 'Recall (macro)', higher: true, task: 'classification' },
  { id: 'kappa', label: "Cohen's κ", higher: true, task: 'classification' },
  { id: 'mcc', label: 'MCC', higher: true, task: 'classification' },
  { id: 'roc_auc', label: 'ROC-AUC (macro OvR)', higher: true, task: 'classification', needsProba: true },
  { id: 'r2', label: 'R²', higher: true, task: 'regression' },
  { id: 'rmse', label: 'RMSE', higher: false, task: 'regression' },
  { id: 'mae', label: 'MAE', higher: false, task: 'regression' },
  { id: 'mape', label: 'MAPE (%)', higher: false, task: 'regression' },
]

export const PRIMARY: Record<Task, string> = { classification: 'f1_macro', regression: 'r2' }

export function confusion(y: number[], p: number[], k: number): number[][] {
  const m = Array.from({ length: k }, () => Array(k).fill(0))
  y.forEach((t, i) => m[t][p[i]]++)
  return m
}

/** Area under the ROC curve for one class against the rest (Mann–Whitney formulation, ties averaged). */
export function aucBinary(pos: boolean[], score: number[]): number {
  const idx = score.map((s, i) => [s, i] as const).sort((a, b) => a[0] - b[0])
  const ranks = Array(score.length).fill(0)
  for (let i = 0; i < idx.length; ) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const r = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = r
    i = j + 1
  }
  const nPos = pos.filter(Boolean).length
  const nNeg = pos.length - nPos
  if (!nPos || !nNeg) return NaN
  const sumPos = ranks.reduce((s, r, i) => s + (pos[i] ? r : 0), 0)
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg)
}

export function rocCurve(pos: boolean[], score: number[]): { fpr: number[]; tpr: number[] } {
  const order = score.map((s, i) => [s, pos[i]] as const).sort((a, b) => b[0] - a[0])
  const P = pos.filter(Boolean).length
  const N = pos.length - P
  const fpr = [0]
  const tpr = [0]
  let tp = 0
  let fp = 0
  for (let i = 0; i < order.length; i++) {
    if (order[i][1]) tp++
    else fp++
    if (i === order.length - 1 || order[i + 1][0] !== order[i][0]) {
      fpr.push(N ? fp / N : 0)
      tpr.push(P ? tp / P : 0)
    }
  }
  return { fpr, tpr }
}

export function classificationScores(y: number[], p: number[], k: number, proba?: number[][]): Record<string, number> {
  const n = y.length
  const cm = confusion(y, p, k)
  const correct = cm.reduce((s, r, i) => s + r[i], 0)
  const prec: number[] = []
  const rec: number[] = []
  const f1: number[] = []
  const present: number[] = []
  for (let c = 0; c < k; c++) {
    const tp = cm[c][c]
    const predicted = cm.reduce((s, r) => s + r[c], 0)
    const actual = cm[c].reduce((s, v) => s + v, 0)
    if (!actual && !predicted) continue
    present.push(c)
    const pc = predicted ? tp / predicted : 0
    const rc = actual ? tp / actual : 0
    prec.push(pc)
    rec.push(rc)
    f1.push(pc + rc ? (2 * pc * rc) / (pc + rc) : 0)
  }
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  const actualRecalls = present.filter((c) => cm[c].reduce((s, v) => s + v, 0) > 0).map((c) => cm[c][c] / cm[c].reduce((s, v) => s + v, 0))
  const po = correct / n
  const rowSums = cm.map((r) => r.reduce((s, v) => s + v, 0))
  const colSums = cm[0].map((_, j) => cm.reduce((s, r) => s + r[j], 0))
  const pe = rowSums.reduce((s, r, i) => s + r * colSums[i], 0) / (n * n)
  // Multiclass MCC (Gorodkin 2004).
  const num = correct * n - rowSums.reduce((s, r, i) => s + r * colSums[i], 0)
  const den = Math.sqrt((n * n - colSums.reduce((s, c) => s + c * c, 0)) * (n * n - rowSums.reduce((s, r) => s + r * r, 0)))
  const out: Record<string, number> = {
    accuracy: po,
    balanced_accuracy: mean(actualRecalls),
    f1_macro: mean(f1),
    precision_macro: mean(prec),
    recall_macro: mean(rec),
    kappa: pe < 1 ? (po - pe) / (1 - pe) : NaN,
    mcc: den ? num / den : 0,
  }
  if (proba) {
    const aucs = Array.from({ length: k }, (_, c) => aucBinary(y.map((t) => t === c), proba.map((r) => r[c]))).filter((a) => Number.isFinite(a))
    out.roc_auc = aucs.length ? mean(aucs) : NaN
  }
  return out
}

export function regressionScores(y: number[], p: number[]): Record<string, number> {
  const n = y.length
  const my = y.reduce((s, v) => s + v, 0) / n
  const ssRes = y.reduce((s, v, i) => s + (v - p[i]) ** 2, 0)
  const ssTot = y.reduce((s, v) => s + (v - my) ** 2, 0)
  const nonzero = y.every((v) => Math.abs(v) > 1e-12)
  return {
    r2: ssTot ? 1 - ssRes / ssTot : NaN,
    rmse: Math.sqrt(ssRes / n),
    mae: y.reduce((s, v, i) => s + Math.abs(v - p[i]), 0) / n,
    mape: nonzero ? (100 * y.reduce((s, v, i) => s + Math.abs((v - p[i]) / v), 0)) / n : NaN,
  }
}

export function scores(task: Task, y: number[], p: number[], k: number, proba?: number[][]): Record<string, number> {
  return task === 'classification' ? classificationScores(y, p, k, proba) : regressionScores(y, p)
}

/** Percentile bootstrap 95% CI for every metric on a fixed prediction set. */
export function bootstrap(task: Task, y: number[], p: number[], k: number, proba: number[][] | undefined, seed: number, B = 1000): Record<string, [number, number]> {
  const rand = rng(seed + 7)
  const n = y.length
  const samples: Record<string, number[]> = {}
  for (let b = 0; b < B; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(rand() * n))
    const s = scores(task, idx.map((i) => y[i]), idx.map((i) => p[i]), k, proba && idx.map((i) => proba[i]))
    for (const [m, v] of Object.entries(s)) if (Number.isFinite(v)) (samples[m] ??= []).push(v)
  }
  const ci: Record<string, [number, number]> = {}
  for (const [m, vals] of Object.entries(samples)) {
    vals.sort((a, b) => a - b)
    ci[m] = [vals[Math.floor(0.025 * (vals.length - 1))], vals[Math.ceil(0.975 * (vals.length - 1))]]
  }
  return ci
}

// ---------- statistics ----------

function logGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941678, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let ser = 1.00000000019015
  for (const ci of c) ser += ci / ++y
  return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / x)
}

/** Regularised incomplete beta function I_x(a, b) by continued fractions. */
function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  const cf = (x: number, a: number, b: number) => {
    let c = 1
    let d = 1 - ((a + b) * x) / (a + 1)
    d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d)
    let h = d
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m
      let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
      d = 1 + aa * d
      d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d)
      c = 1 + aa / c
      h *= d * c
      aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
      d = 1 + aa * d
      d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d)
      c = 1 + aa / c
      const del = d * c
      h *= del
      if (Math.abs(del - 1) < 3e-12) break
    }
    return h
  }
  return x < (a + 1) / (a + b + 2) ? (bt * cf(x, a, b)) / a : 1 - (bt * cf(1 - x, b, a)) / b
}

/** Two-sided p-value of Student's t with `df` degrees of freedom. */
export function tTestP(t: number, df: number): number {
  return betaInc(df / (df + t * t), df / 2, 0.5)
}

/**
 * Corrected resampled t-test (Nadeau & Bengio 2003) on per-fold score differences, accounting for the overlap of
 * training sets across folds. Returns the t statistic and two-sided p-value.
 */
export function correctedTTest(a: number[], b: number[], nTest: number, nTrain: number): { t: number; p: number } {
  const d = a.map((v, i) => v - b[i])
  const k = d.length
  const mean = d.reduce((s, v) => s + v, 0) / k
  const variance = d.reduce((s, v) => s + (v - mean) ** 2, 0) / (k - 1)
  const corrected = (1 / k + nTest / nTrain) * variance
  if (corrected <= 0) return { t: 0, p: 1 }
  const t = mean / Math.sqrt(corrected)
  return { t, p: tTestP(t, k - 1) }
}

export function meanStd(v: number[]): { mean: number; std: number } {
  const f = v.filter(Number.isFinite)
  const mean = f.reduce((s, x) => s + x, 0) / f.length
  const std = Math.sqrt(f.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, f.length - 1))
  return { mean, std }
}
