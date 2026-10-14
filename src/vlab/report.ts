// The lab report as a list of blocks, rendered by the app and exported to HTML and Markdown. Methods and Results
// text is written from the numbers by fixed templates (no AI), so every value in it is exactly what was computed.
import { barChart, fmt, heatmap, histogram, lineChart, parityChart, TOOLTIP_JS, VIZ_CSS } from './charts'
import type { ExperimentResult, ModelResult } from './evaluate'
import { METRICS } from './metrics'
import type { ExperimentConfig } from './types'

export type Block =
  | { kind: 'h2' | 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'warn'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][]; caption?: string }
  | { kind: 'chart'; svg: string; caption: string }

export interface ReportInput {
  title: string
  datasetName: string
  synthetic: boolean
  config: ExperimentConfig
  result: ExperimentResult
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const metricLabel = (id: string) => METRICS.find((m) => m.id === id)?.label ?? id
const pFmt = (p: number) => (p < 0.001 ? '< 0.001' : p.toFixed(3))

export function modelById(r: ExperimentResult, id: string): ModelResult | undefined {
  return r.models.find((m) => m.id === id)
}

function splitSentence(r: ExperimentResult): string {
  return `The data were divided by a ${r.split.description}, giving ${r.split.nTrain} training and ${r.split.nTest} test samples (fold sizes ${r.split.foldSizes.join(', ')}).`
}

export function methodsText(inp: ReportInput): string {
  const { config: c, result: r } = inp
  const sk = r.models.filter((m) => m.engine === 'sklearn' && !m.error)
  const tf = r.models.filter((m) => m.engine === 'tfjs' && !m.error)
  const versions = r.engines.map((e) => Object.entries(e.versions).filter(([k]) => k !== 'backend').map(([k, v]) => `${k} ${v}`).join(', ')).join('; ')
  const data = `The dataset (${inp.datasetName}) comprised ${r.data.n} ${c.sequence ? `windows of ${c.sequence.window} consecutive time steps` : 'samples'} with ${r.data.sources.length} input variable${r.data.sources.length === 1 ? '' : 's'} (${r.data.sources.join(', ')}) and the ${c.task === 'classification' ? `class label "${c.target}" (${r.data.classes.join(', ')})` : `continuous target "${c.target}"`}.`
  const seq = c.sequence ? ` Each sample was the sequence of the last ${c.sequence.window} records of one ${c.sequence.seriesColumn}, ordered by ${c.sequence.orderColumn} and labelled by the target at the final step.` : ''
  const prep = 'Categorical inputs were one-hot encoded. Missing values were imputed with the training-fold median (classical models) or mean (neural networks) and all inputs were standardised with training-fold statistics only, so no information from validation or test data entered preprocessing.'
  const split = splitSentence(r)
  const models = `${sk.length ? `The classical models — ${sk.map((m) => m.name).join(', ')} — were implemented in scikit-learn${sk.some((m) => m.id === 'xgb') ? ', XGBoost' : ''}${sk.some((m) => m.id === 'lgbm') ? ', LightGBM' : ''} [VERIFY: cite scikit-learn (Pedregosa et al. 2011)${sk.some((m) => m.id === 'xgb') ? ', XGBoost (Chen and Guestrin 2016)' : ''}${sk.some((m) => m.id === 'lgbm') ? ', LightGBM (Ke et al. 2017)' : ''}].` : ''}${tf.length ? ` The deep-learning models — ${tf.map((m) => m.name).join(', ')} — were implemented in TensorFlow.js and trained with the Adam optimiser (learning rate ${c.dl.learningRate}, batch size ${c.dl.batchSize}, up to ${c.dl.epochs} epochs) with early stopping on 15% of the training data (patience ${c.dl.patience}), restoring the weights of the best epoch; hidden layers ${c.dl.hidden.join('–')} units with dropout ${c.dl.dropout}.` : ''}`
  const tuning = c.tuning.enabled
    ? `Hyperparameters were selected by randomised search (${c.tuning.iterations} candidates) with an inner three-fold cross-validation inside each training fold (nested cross-validation), so the reported validation scores are not biased by tuning.`
    : 'Models were trained with default hyperparameters (listed in Table [X]).'
  const imb = c.task === 'classification' && c.classWeight ? ' Classes were weighted inversely to their frequency to counter imbalance.' : ''
  const evalText = `Performance was summarised by ${c.task === 'classification' ? 'accuracy, balanced accuracy, macro-averaged precision, recall and F1, Cohen’s κ, the Matthews correlation coefficient and macro one-vs-rest ROC-AUC' : 'the coefficient of determination (R²), root-mean-square error (RMSE), mean absolute error (MAE) and mean absolute percentage error (MAPE)'}; cross-validation results are reported as mean ± standard deviation over folds, and test-set results with 95% percentile bootstrap confidence intervals (1,000 resamples). Models were ranked by the cross-validated ${metricLabel(r.primary)}, and the best model was compared with each alternative by the corrected resampled t-test of Nadeau and Bengio [VERIFY: Nadeau and Bengio 2003]. Input importance was quantified by grouped permutation importance on the test set${r.models.some((m) => m.shap) ? ' and, for gradient-boosted trees, by TreeSHAP values [VERIFY: Lundberg et al. 2020]' : ''}. All random processes used seed ${c.seed} (${versions}).`
  return [data + seq, prep, split, models + imb, tuning, evalText].join(' ')
}

export function resultsText(inp: ReportInput): string {
  const r = inp.result
  const best = modelById(r, r.ranking[0])
  if (!best) return 'No model produced results.'
  const pm = r.primary
  const cv = best.cvSummary[pm]
  const te = best.testScores[pm]
  const ci = best.testCI[pm]
  const base = modelById(r, 'dummy')
  const others = r.comparisons.filter((x) => x.id !== 'dummy')
  const sig = others.filter((x) => x.p < 0.05).map((x) => modelById(r, x.id)!.name)
  const ns = others.filter((x) => x.p >= 0.05).map((x) => modelById(r, x.id)!.name)
  const imp = best.importanceFeatures && best.importance ? best.importanceFeatures.map((f, i) => ({ f, v: best.importance!.mean[i] })).sort((a, b) => b.v - a.v).filter((x) => x.v > 0).slice(0, 3) : []
  const extra = r.task === 'classification' ? ['balanced_accuracy', 'kappa', 'roc_auc'] : ['rmse', 'mae']
  const extraTxt = extra
    .filter((m) => Number.isFinite(best.testScores[m]))
    .map((m) => `${metricLabel(m)} ${fmt(best.testScores[m])} (95% CI ${fmt(best.testCI[m]?.[0] ?? NaN)}–${fmt(best.testCI[m]?.[1] ?? NaN)})`)
    .join(', ')
  const parts = [
    `${best.name} achieved the highest cross-validated ${metricLabel(pm)} (${fmt(cv.mean)} ± ${fmt(cv.std)}), and on the held-out test set reached ${metricLabel(pm)} = ${fmt(te)} (95% CI ${fmt(ci[0])}–${fmt(ci[1])})${extraTxt ? `, ${extraTxt}` : ''}.`,
    base && base.id !== best.id ? `The baseline (${base.name}) scored ${fmt(base.cvSummary[pm]?.mean ?? NaN)} in cross-validation.` : '',
    sig.length ? `It performed significantly better than ${sig.join(', ')} (corrected resampled t-test, p < 0.05).` : '',
    ns.length ? `Its advantage over ${ns.join(', ')} was not statistically significant (p ≥ 0.05), so these models should be regarded as comparable.` : '',
    imp.length ? `Permutation importance ranked ${imp.map((x) => `${x.f} (Δ${metricLabel(pm)} = ${fmt(x.v)})`).join(', ')} as the most influential inputs.` : '',
  ]
  return parts.filter(Boolean).join(' ')
}

export function buildReport(inp: ReportInput): Block[] {
  const { config: c, result: r } = inp
  const pm = r.primary
  const higher = METRICS.find((m) => m.id === pm)!.higher
  const metricIds = METRICS.filter((m) => m.task === r.task).map((m) => m.id)
  const best = modelById(r, r.ranking[0])
  const blocks: Block[] = []

  if (inp.synthetic) blocks.push({ kind: 'warn', items: ['SYNTHETIC DEMONSTRATION DATA — these results illustrate the tool only and must not be reported as findings.'] })

  // 1. Summary
  blocks.push({ kind: 'h2', text: '1. Summary' })
  if (best) {
    blocks.push({
      kind: 'p',
      text: `**Best model: ${best.name}.** Cross-validated ${metricLabel(pm)} ${fmt(best.cvSummary[pm].mean)} ± ${fmt(best.cvSummary[pm].std)}; test ${metricLabel(pm)} ${fmt(best.testScores[pm])} (95% CI ${fmt(best.testCI[pm][0])}–${fmt(best.testCI[pm][1])}). ${r.models.length} models, ${r.data.n} samples, ${r.data.sources.length} inputs, run time ${fmt(r.durationSeconds, 2)} s.`,
    })
  }
  if (r.warnings.length) blocks.push({ kind: 'warn', items: r.warnings })

  // 2. Data
  blocks.push({ kind: 'h2', text: '2. Data' })
  blocks.push({
    kind: 'table',
    head: ['Item', 'Value'],
    rows: [
      ['Dataset', inp.datasetName + (inp.synthetic ? ' (synthetic)' : '')],
      ['Task', c.task === 'classification' ? `Classification (${r.data.classes.length} classes)` : 'Regression'],
      ['Target', c.target],
      ['Samples', String(r.data.n)],
      ['Inputs', r.data.sources.join(', ')],
      ['Model input columns', `${r.data.nFeatures}${r.data.sequenceShape ? ` (${r.data.sequenceShape[0]} steps × ${r.data.sequenceShape[1]} channels)` : ''}`],
      ...(c.groupColumn ? [['Group column', c.groupColumn]] : []),
      ...(c.sequence ? [['Sequence', `${c.sequence.window}-step windows within "${c.sequence.seriesColumn}", ordered by "${c.sequence.orderColumn}"`]] : []),
    ],
    caption: 'Dataset and task.',
  })
  if (r.data.classCounts) {
    blocks.push({
      kind: 'chart',
      svg: barChart(r.data.classes.map((cl, i) => ({ label: cl, value: r.data.classCounts![i], tip: `${cl}: ${r.data.classCounts![i]} samples (${pct(r.data.classCounts![i] / r.data.n)})` })), { title: 'Class distribution', xLabel: 'Samples' }),
      caption: `Class distribution of "${c.target}".`,
    })
    blocks.push({ kind: 'table', head: ['Class', 'Samples', 'Share'], rows: r.data.classes.map((cl, i) => [cl, String(r.data.classCounts![i]), pct(r.data.classCounts![i] / r.data.n)]) })
  }
  if (r.data.targetSummary) {
    const t = r.data.targetSummary
    blocks.push({ kind: 'p', text: `Target "${c.target}": mean ${fmt(t.mean)}, SD ${fmt(t.std)}, range ${fmt(t.min)}–${fmt(t.max)}.` })
  }
  if (r.data.notes.length) blocks.push({ kind: 'list', items: r.data.notes })

  // 3. Validation design
  blocks.push({ kind: 'h2', text: '3. Validation design' })
  blocks.push({
    kind: 'list',
    items: [
      `Split: ${r.split.description}.`,
      `Training ${r.split.nTrain} samples, test ${r.split.nTest} samples; fold sizes ${r.split.foldSizes.join(', ')}.`,
      'Preprocessing (imputation, scaling) fitted on each training fold only.',
      c.tuning.enabled ? `Nested hyperparameter tuning: randomised search, ${c.tuning.iterations} candidates, inner 3-fold CV.` : 'No hyperparameter tuning (defaults).',
      c.task === 'classification' ? `Class weighting: ${c.classWeight ? 'balanced' : 'none'}.` : '',
      `Random seed ${c.seed}; every engine used the same split.`,
    ].filter(Boolean),
  })

  // 4. Model comparison
  blocks.push({ kind: 'h2', text: '4. Cross-validation results' })
  const ranked = r.ranking.map((id) => modelById(r, id)!).filter(Boolean)
  blocks.push({
    kind: 'chart',
    svg: barChart(
      ranked.map((m) => ({ label: m.name, value: m.cvSummary[pm].mean, error: m.cvSummary[pm].std, color: 0 })),
      { title: `Cross-validated ${metricLabel(pm)} (mean ± SD)`, xLabel: metricLabel(pm), min: higher ? undefined : 0 },
    ),
    caption: `Cross-validated ${metricLabel(pm)} of each model (mean ± SD over ${r.split.foldSizes.length} folds), best first.`,
  })
  blocks.push({
    kind: 'table',
    head: ['Model', ...metricIds.map(metricLabel)],
    rows: ranked.map((m) => [m.name, ...metricIds.map((id) => (m.cvSummary[id] && Number.isFinite(m.cvSummary[id].mean) ? `${fmt(m.cvSummary[id].mean)} ± ${fmt(m.cvSummary[id].std)}` : '—'))]),
    caption: 'Cross-validation performance (mean ± SD over folds).',
  })
  if (best && r.comparisons.length) {
    blocks.push({
      kind: 'table',
      head: [`${best.name} vs.`, `Δ ${metricLabel(pm)}`, 't', 'p', 'Significant (α = 0.05)'],
      rows: r.comparisons.map((x) => [modelById(r, x.id)!.name, fmt(x.diff), x.t.toFixed(2), pFmt(x.p), x.p < 0.05 ? 'yes' : 'no']),
      caption: 'Corrected resampled t-test (Nadeau and Bengio 2003) on per-fold scores.',
    })
  }

  // 5. Test set
  blocks.push({ kind: 'h2', text: '5. Test-set performance' })
  blocks.push({
    kind: 'table',
    head: ['Model', ...metricIds.map(metricLabel)],
    rows: ranked.map((m) => [m.name, ...metricIds.map((id) => (Number.isFinite(m.testScores[id]) ? `${fmt(m.testScores[id])} [${fmt(m.testCI[id]?.[0] ?? NaN)}, ${fmt(m.testCI[id]?.[1] ?? NaN)}]` : '—'))]),
    caption: 'Held-out test performance with 95% bootstrap confidence intervals.',
  })

  // 6. Diagnostics
  if (best) {
    blocks.push({ kind: 'h2', text: `6. Diagnostics of the best model (${best.name})` })
    if (r.task === 'classification' && best.confusion) {
      blocks.push({ kind: 'chart', svg: heatmap(best.confusion, r.data.classes, r.data.classes, { title: 'Confusion matrix (test set)', rowTitle: 'Observed', colTitle: 'Predicted' }), caption: `Confusion matrix of ${best.name} on the test set (rows observed, columns predicted).` })
      blocks.push({
        kind: 'table',
        head: ['Observed \\ Predicted', ...r.data.classes],
        rows: best.confusion.map((row, i) => [r.data.classes[i], ...row.map(String)]),
      })
      if (best.roc) {
        blocks.push({
          kind: 'chart',
          svg: lineChart(best.roc.map((x) => ({ name: `${x.cls} (AUC ${fmt(x.auc)})`, x: x.fpr, y: x.tpr })), { title: 'ROC curves (one vs. rest, test set)', xLabel: 'False positive rate', yLabel: 'True positive rate', diagonal: true, xMin: 0, xMax: 1, yMin: 0, yMax: 1 }),
          caption: `ROC curves of ${best.name} for each class against the rest.`,
        })
      }
    } else {
      const obs = r.yTest
      blocks.push({ kind: 'chart', svg: parityChart(obs, best.test, { title: 'Predicted vs. observed (test set)' }), caption: `Predicted against observed "${c.target}" for ${best.name}; the line is 1:1.` })
      blocks.push({ kind: 'chart', svg: histogram(obs.map((o, i) => best.test[i] - o), { title: 'Residuals (test set)', xLabel: 'Predicted − observed' }), caption: 'Distribution of test-set residuals.' })
    }
  }

  // 7. Interpretation
  blocks.push({ kind: 'h2', text: '7. Interpretation' })
  for (const m of ranked.filter((x) => x.importance && x.id !== 'dummy').slice(0, 3)) {
    const items = m.importanceFeatures!.map((f, i) => ({ f, v: m.importance!.mean[i], s: m.importance!.std[i] })).sort((a, b) => b.v - a.v)
    blocks.push({
      kind: 'chart',
      svg: barChart(items.map((x) => ({ label: x.f, value: x.v, error: x.s, color: 0 })), { title: `Permutation importance — ${m.name}`, xLabel: `Drop in ${metricLabel(pm)}` }),
      caption: `Grouped permutation importance of ${m.name} on the test set (mean ± SD of the drop in ${metricLabel(pm)} when the input is shuffled).`,
    })
  }
  for (const m of ranked.filter((x) => x.shap)) {
    const items = m.importanceFeatures!.map((f, i) => ({ f, v: m.shap![i] })).sort((a, b) => b.v - a.v)
    blocks.push({ kind: 'chart', svg: barChart(items.map((x) => ({ label: x.f, value: x.v, color: 1 })), { title: `Mean |SHAP| — ${m.name}`, xLabel: 'Mean |SHAP value| (model output units)' }), caption: `Mean absolute TreeSHAP value of each input for ${m.name} (test set).` })
  }
  const pdpModel = ranked.find((m) => m.pdp && m.pdp.length)
  if (pdpModel) {
    for (const p of pdpModel.pdp!) {
      blocks.push({
        kind: 'chart',
        svg: lineChart([{ name: p.feature, x: p.x, y: p.y }], { title: `Partial dependence on ${p.feature} — ${pdpModel.name}`, xLabel: p.feature, yLabel: r.task === 'classification' ? `P(${r.data.classes[r.data.classes.length - 1]})` : `Predicted ${c.target}` }),
        caption: `Partial dependence of the ${r.task === 'classification' ? `probability of "${r.data.classes[r.data.classes.length - 1]}"` : `predicted ${c.target}`} on ${p.feature} (${pdpModel.name}).`,
      })
    }
  }
  for (const m of ranked.filter((x) => x.history)) {
    const h = m.history!
    blocks.push({
      kind: 'chart',
      svg: lineChart(
        [
          { name: 'Training loss', x: h.loss.map((_, i) => i + 1), y: h.loss },
          { name: 'Validation loss', x: h.valLoss.map((_, i) => i + 1), y: h.valLoss, dashed: true },
        ],
        { title: `Learning curves — ${m.name}`, xLabel: 'Epoch', yLabel: 'Loss' },
      ),
      caption: `Training and early-stopping validation loss of ${m.name} (final model).`,
    })
  }

  // 8. Parameters and environment
  blocks.push({ kind: 'h2', text: '8. Hyperparameters and environment' })
  blocks.push({
    kind: 'table',
    head: ['Model', 'Engine', 'Key parameters', 'Fit time (s)'],
    rows: r.models.map((m) => [m.name, m.engine === 'tfjs' ? 'TensorFlow.js' : 'scikit-learn', keyParams(m), m.error ? `failed: ${m.error}` : fmt(m.fitSeconds, 3)]),
    caption: 'Final hyperparameters (tuned values where tuning was enabled).',
  })
  blocks.push({ kind: 'list', items: r.engines.map((e) => `${e.name}: ${Object.entries(e.versions).map(([k, v]) => `${k} ${v}`).join(', ')}`) })

  // 9. Draft text
  blocks.push({ kind: 'h2', text: '9. Draft Methods text' })
  blocks.push({ kind: 'p', text: methodsText(inp) })
  blocks.push({ kind: 'h2', text: '10. Draft Results text' })
  blocks.push({ kind: 'p', text: resultsText(inp) })
  return blocks
}

const KEY_PARAMS = ['n_estimators', 'max_depth', 'min_samples_leaf', 'max_features', 'learning_rate', 'max_leaf_nodes', 'num_leaves', 'min_child_samples', 'subsample', 'colsample_bytree', 'reg_lambda', 'l2_regularization', 'C', 'gamma', 'epsilon', 'alpha', 'n_neighbors', 'weights', 'hidden_layer_sizes', 'learning_rate_init', 'class_weight', 'architecture', 'hidden', 'dropout', 'epochsTrained', 'parameters']

function keyParams(m: ModelResult): string {
  return Object.entries(m.params)
    .filter(([k, v]) => KEY_PARAMS.includes(k) && v != null && v !== '')
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('-') : typeof v === 'number' ? fmt(v) : String(v)}`)
    .join(', ') || '—'
}

// ---------- rendering ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[VERIFY:[^\]]*\]/g, (m) => `<mark>${m}</mark>`)

export function reportHtml(inp: ReportInput, blocks: Block[]): string {
  let fig = 0
  let tab = 0
  const body = blocks
    .map((b) => {
      switch (b.kind) {
        case 'h2':
        case 'h3':
          return `<${b.kind}>${esc(b.text)}</${b.kind}>`
        case 'p':
          return `<p>${inline(b.text)}</p>`
        case 'list':
          return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`
        case 'warn':
          return `<div class="warn"><ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul></div>`
        case 'table':
          return `<table><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>${b.caption ? `<caption>Table ${++tab}. ${esc(b.caption)}</caption>` : ''}</table>`
        case 'chart':
          return `<figure class="viz">${b.svg}<figcaption>Figure ${++fig}. ${esc(b.caption)}</figcaption></figure>`
      }
    })
    .join('\n')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(inp.title)} — VLab report</title>
<style>
:root{color-scheme:light dark;--bg:#fafaf9;--fg:#1c1917;--muted:#57534e;--line:#e7e5e4;--card:#ffffff}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--line:#292524;--card:#1c1917}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:920px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.meta{color:var(--muted);font-size:13px}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px;display:block;overflow-x:auto}
caption{caption-side:bottom;text-align:left;color:var(--muted);font-size:12px;padding-top:4px}
th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top;font-variant-numeric:tabular-nums}
th{font-weight:600}
figure{margin:16px 0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px}
figcaption{color:var(--muted);font-size:12px;margin-top:6px}
.warn{border:1px solid #f59e0b;background:color-mix(in oklab,#f59e0b 12%,transparent);border-radius:8px;padding:4px 12px;margin:12px 0;font-size:14px}
mark{background:color-mix(in oklab,#f59e0b 35%,transparent);color:inherit}
${VIZ_CSS}
@media (prefers-color-scheme:dark){.viz{--viz-surface:#1c1917}}
</style></head><body><main>
<h1>${esc(inp.title)}</h1>
<p class="meta">GeoMine Studio virtual lab · ${new Date(inp.result.createdAt).toLocaleString()} · dataset ${esc(inp.datasetName)}${inp.synthetic ? ' (synthetic)' : ''}</p>
${body}
</main><script>${TOOLTIP_JS}</script></body></html>`
}

export function reportMarkdown(inp: ReportInput, blocks: Block[]): string {
  let tab = 0
  let fig = 0
  const md = blocks
    .map((b) => {
      switch (b.kind) {
        case 'h2':
          return `## ${b.text}`
        case 'h3':
          return `### ${b.text}`
        case 'p':
          return b.text
        case 'list':
          return b.items.map((i) => `- ${i}`).join('\n')
        case 'warn':
          return b.items.map((i) => `> ⚠ ${i}`).join('\n')
        case 'table':
          return `| ${b.head.join(' | ')} |\n|${b.head.map(() => '---').join('|')}|\n${b.rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '/')).join(' | ')} |`).join('\n')}${b.caption ? `\n\nTable ${++tab}. ${b.caption}` : ''}`
        case 'chart':
          return `*Figure ${++fig}. ${b.caption}* (see the HTML report for the chart)`
      }
    })
    .join('\n\n')
  return `# ${inp.title}\n\n${md}\n`
}

/** Methods + Results text and the main tables, for insertion into a manuscript section. */
export function manuscriptInsert(inp: ReportInput, blocks: Block[]): string {
  const tables = blocks.filter((b): b is Extract<Block, { kind: 'table' }> => b.kind === 'table' && !!b.caption && /Cross-validation performance|Held-out test/.test(b.caption))
  const md = tables.map((t) => `| ${t.head.join(' | ')} |\n|${t.head.map(() => '---').join('|')}|\n${t.rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n\nTable [X]. ${t.caption}`).join('\n\n')
  return `${methodsText(inp)}\n\n${resultsText(inp)}\n\n${md}`
}

export function predictionsCsv(inp: ReportInput): string {
  const r = inp.result
  const ok = r.models.filter((m) => !m.error)
  const label = (v: number) => (r.task === 'classification' ? r.data.classes[v] : String(v))
  const head = ['source_row', 'observed', ...ok.map((m) => `pred_${m.id}`)]
  // Row numbers as in the CSV file (header is line 1).
  const rows = r.yTest.map((y, i) => [String(r.testSourceRows[i] + 2), label(y), ...ok.map((m) => label(m.test[i]))])
  return [head.join(','), ...rows.map((x) => x.join(','))].join('\n')
}

