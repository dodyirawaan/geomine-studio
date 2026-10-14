// Counts across the included studies, computed from the extraction table (and title/abstract as a fallback), so that
// statements such as "only 7 of 89 studies validated on an independent site" are calculated, not generated.
import type { Paper } from '../store/db'

interface Pattern {
  label: string
  re: RegExp
}

export const METHOD_PATTERNS: Pattern[] = [
  { label: 'Random forest', re: /random forest|\bRF\b/i },
  { label: 'Gradient boosting (XGBoost, LightGBM, GBDT, CatBoost)', re: /xgboost|lightgbm|catboost|gradient boost|\bGBDT\b|\bGBM\b|adaboost/i },
  { label: 'Support vector machine', re: /support vector|\bSVM\b|\bSVR\b/i },
  { label: 'Artificial neural network / MLP', re: /neural network|\bANN\b|\bMLP\b|back.?propagation|\bBPNN\b/i },
  { label: 'Deep learning (CNN, LSTM, GRU, Transformer)', re: /\bCNN\b|convolutional|\bLSTM\b|\bGRU\b|recurrent|transformer|deep learning/i },
  { label: 'Decision tree', re: /decision tree|\bC4\.5\b|\bCART\b/i },
  { label: 'k-nearest neighbours', re: /nearest neighbo|\bKNN\b/i },
  { label: 'Bayesian / probabilistic', re: /bayes|naive bayes|gaussian process/i },
  { label: 'Fuzzy, grey or cloud models', re: /fuzzy|grey|gray relational|cloud model|matter.?element|TOPSIS|AHP|entropy weight/i },
  { label: 'Hybrid / metaheuristic optimisation', re: /particle swarm|\bPSO\b|genetic algorithm|\bGA\b|whale|grey wolf|\bGWO\b|sparrow|harris hawk|optimi[sz]ed/i },
  { label: 'Numerical modelling', re: /FLAC|UDEC|3DEC|\bPFC\b|finite element|finite difference|discrete element|numerical/i },
  { label: 'Empirical / energy criteria', re: /Russenes|Turchaninov|\bTao\b|brittleness|strain energy|\bWet\b|energy index/i },
]

export const VALIDATION_PATTERNS: Pattern[] = [
  { label: 'Cross-validation reported', re: /cross.?validation|k.?fold|\bCV\b|leave.?one.?out/i },
  { label: 'Hold-out test set reported', re: /test set|testing set|hold.?out|train.{0,10}test|validation set/i },
  { label: 'Independent site / external validation', re: /independent|external validation|unseen|another mine|different mine|new site|field validation|engineering application|case stud/i },
  { label: 'Uncertainty or confidence intervals', re: /confidence interval|uncertainty|bootstrap|standard deviation|±/i },
  { label: 'Interpretability (SHAP, importance)', re: /\bSHAP\b|shapley|feature importance|sensitivity analysis|partial dependence|\bLIME\b/i },
  { label: 'Class imbalance handled', re: /imbalance|SMOTE|oversampl|undersampl|class weight/i },
]

export const DATA_PATTERNS: Pattern[] = [
  { label: 'Case-history database', re: /case histor|database|literature data|collected cases|rockburst cases/i },
  { label: 'Microseismic / AE monitoring', re: /microseismic|acoustic emission|\bAE\b|seismic monitoring/i },
  { label: 'Laboratory tests', re: /laboratory|uniaxial|triaxial|specimen|true triaxial/i },
  { label: 'Field measurements', re: /field|in.?situ|site monitoring|borehole|convergence measurement/i },
  { label: 'Numerical simulation data', re: /simulat|numerical model|synthetic data/i },
]

export interface CountRow {
  label: string
  n: number
  keys: string[]
}

export interface EvidenceStats {
  n: number
  extracted: number
  methods: CountRow[]
  validation: CountRow[]
  data: CountRow[]
  sizes: number[]
  sizeSummary?: { median: number; min: number; max: number; under100: number }
  reviews: string[]
}

function textOf(p: Paper, fields: string[]): string {
  const m = p.matrix ?? {}
  const own = fields.map((f) => m[f] ?? '').join(' ')
  return `${own} ${p.title} ${p.abstract ?? ''}`
}

function count(papers: Paper[], patterns: Pattern[], fields: string[]): CountRow[] {
  return patterns
    .map((pt) => {
      const hits = papers.filter((p) => pt.re.test(textOf(p, fields)))
      return { label: pt.label, n: hits.length, keys: hits.map((h) => h.bibKey) }
    })
    .sort((a, b) => b.n - a.n)
}

/** Largest number followed by cases/samples/events/records/specimens in the data field. */
function datasetSize(p: Paper): number | undefined {
  const t = `${p.matrix?.data ?? ''} ${p.abstract ?? ''}`
  const nums = [...t.matchAll(/(\d[\d,]{0,7})\s*(?:rockburst\s+)?(?:cases|samples|events|records|specimens|data\s*sets|datasets|instances|groups)/gi)].map((m) => Number(m[1].replace(/,/g, '')))
  const ok = nums.filter((v) => v >= 5 && v <= 1e6)
  return ok.length ? Math.max(...ok) : undefined
}

export function evidenceStats(papers: Paper[]): EvidenceStats {
  const sizes = papers.map(datasetSize).filter((v): v is number => v != null).sort((a, b) => a - b)
  return {
    n: papers.length,
    extracted: papers.filter((p) => p.matrix).length,
    methods: count(papers, METHOD_PATTERNS, ['method']).filter((r) => r.n > 0),
    validation: count(papers, VALIDATION_PATTERNS, ['method', 'data', 'findings', 'limitations']),
    data: count(papers, DATA_PATTERNS, ['data', 'method', 'site']).filter((r) => r.n > 0),
    sizes,
    sizeSummary: sizes.length ? { median: sizes[Math.floor(sizes.length / 2)], min: sizes[0], max: sizes[sizes.length - 1], under100: sizes.filter((v) => v < 100).length } : undefined,
    reviews: papers.filter((p) => /\breview\b|state.of.the.art|overview|survey/i.test(p.title)).map((p) => p.bibKey),
  }
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—')

/** Markdown table of method and validation practice, citing the studies in each row (up to six keys). */
export function evidenceStatsTable(s: EvidenceStats): string {
  const cite = (keys: string[]) => (keys.length ? `[${keys.slice(0, 6).map((k) => `@${k}`).join('; ')}]${keys.length > 6 ? ` +${keys.length - 6}` : ''}` : '')
  const rows = (title: string, list: CountRow[]) => [`| **${title}** | | | |`, ...list.map((r) => `| ${r.label} | ${r.n} | ${pct(r.n, s.n)} | ${cite(r.keys)} |`)]
  return [
    '| Category | Studies | Share | Examples |',
    '|---|---:|---:|---|',
    ...rows('Methods', s.methods),
    ...rows('Data sources', s.data),
    ...rows('Validation and reporting practice', s.validation),
  ].join('\n') + `\n\nTable [X]. Methods, data and validation practice across the ${s.n} included studies (a study can appear in several rows; counted from the extraction table, titles and abstracts).`
}

/** Plain-text facts handed to the writer, so its quantitative statements match the counts. */
export function evidenceFacts(s: EvidenceStats): string {
  const line = (r: CountRow) => `${r.label}: ${r.n} of ${s.n} studies (${pct(r.n, s.n)})`
  return [
    `Included studies: ${s.n} (data extracted for ${s.extracted}).`,
    `Methods — ${s.methods.slice(0, 8).map(line).join('; ')}.`,
    `Data sources — ${s.data.map(line).join('; ')}.`,
    `Validation and reporting — ${s.validation.map(line).join('; ')}.`,
    s.sizeSummary ? `Dataset size (where reported, ${s.sizes.length} studies): median ${s.sizeSummary.median}, range ${s.sizeSummary.min}–${s.sizeSummary.max}; ${s.sizeSummary.under100} studies used fewer than 100 samples.` : 'Dataset sizes were rarely reported in a parsable form.',
    s.reviews.length ? `Earlier reviews among the included studies: ${s.reviews.map((k) => `[@${k}]`).join(', ')}.` : 'No earlier review is among the included studies.',
  ].join('\n')
}
