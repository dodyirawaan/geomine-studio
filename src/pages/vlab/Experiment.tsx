import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { explainError } from '../../ai/errors'
import { buildSystemPrompt } from '../../ai/prompts'
import { useLLM } from '../../ai/useLLM'
import { Chart } from '../../components/Chart'
import { Markdown } from '../../components/Markdown'
import { TaskModel } from '../../components/TaskModel'
import { Button, Card, Input, Label, Select } from '../../components/ui'
import { downloadText, slug } from '../../lib/download'
import { insertIntoManuscript } from '../../methods'
import { db, type Experiment } from '../../store/db'
import { heatmap } from '../../vlab/charts'
import { correlation, parseCsv, summarize } from '../../vlab/data'
import { MODELS } from '../../vlab/models'
import { designMatrixCsv, pythonScript } from '../../vlab/pyexport'
import { buildReport, manuscriptInsert, predictionsCsv, reportHtml, reportMarkdown, type Block } from '../../vlab/report'
import { runExperiment, type RunHandle } from '../../vlab/run'
import { TEMPLATES } from '../../vlab/templates'
import type { ExperimentConfig, Table } from '../../vlab/types'

const TABS = [
  { id: 'data', label: '1 Data' },
  { id: 'setup', label: '2 Set-up' },
  { id: 'models', label: '3 Models' },
  { id: 'run', label: '4 Run' },
  { id: 'report', label: '5 Report' },
  { id: 'guide', label: 'Guide' },
] as const

const HEAVY = new Set(['lstm', 'gru', 'cnn1d'])

type SetConfig = (patch: Partial<ExperimentConfig> | ((c: ExperimentConfig) => Partial<ExperimentConfig>)) => Promise<void>

export default function ExperimentPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const exp = useLiveQuery(async () => (id ? ((await db.experiments.get(id)) ?? null) : null), [id])
  const table = useMemo(() => {
    if (!exp?.csv) return null
    try {
      return parseCsv(exp.csv, exp.datasetName)
    } catch {
      return null
    }
  }, [exp?.csv, exp?.datasetName])

  if (exp === undefined) return <p className="text-sm text-stone-500">Loading…</p>
  if (exp === null)
    return (
      <p className="text-sm">
        Experiment not found.{' '}
        <Link to="/vlab" className="underline">
          Back to the lab
        </Link>
      </p>
    )

  const tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? (exp.result ? 'report' : 'data')
  const update = (patch: Partial<Experiment>) => db.experiments.update(exp.id, { ...patch, updatedAt: Date.now() })
  // Reads the latest stored config inside a transaction, so quick successive edits never overwrite each other.
  const setConfig: SetConfig = (patch) =>
    db.transaction('rw', db.experiments, async () => {
      const cur = await db.experiments.get(exp.id)
      if (!cur) return
      const p = typeof patch === 'function' ? patch(cur.config) : patch
      await db.experiments.update(exp.id, { config: { ...cur.config, ...p }, result: cur.result, updatedAt: Date.now() })
    })
  const template = TEMPLATES.find((t) => t.id === exp.templateId)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stone-500">
            <Link to="/vlab" className="hover:underline">
              Virtual Lab
            </Link>
            {template ? ` / ${template.topic}` : ''}
          </p>
          <input
            defaultValue={exp.name}
            onBlur={(e) => e.target.value.trim() && update({ name: e.target.value.trim() })}
            className="w-full bg-transparent text-xl font-semibold outline-none"
            title="Experiment name"
          />
        </div>
        {exp.synthetic && <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">Synthetic demo data — not for publication</span>}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 text-sm dark:border-stone-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams({ tab: t.id })}
            className={`shrink-0 border-b-2 px-3 py-2 ${tab === t.id ? 'border-amber-600 font-medium' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'data' && <DataTab exp={exp} table={table} update={update} />}
      {tab === 'setup' && (table ? <SetupTab exp={exp} table={table} setConfig={setConfig} /> : <NeedData />)}
      {tab === 'models' && <ModelsTab exp={exp} setConfig={setConfig} />}
      {tab === 'run' && (table ? <RunTab exp={exp} table={table} update={update} onDone={() => setParams({ tab: 'report' })} /> : <NeedData />)}
      {tab === 'report' && (exp.result && table ? <ReportTab exp={exp} table={table} update={update} /> : <p className="text-sm text-stone-500">Run the experiment to see the report.</p>)}
      {tab === 'guide' && <GuideTab exp={exp} />}
    </div>
  )
}

function NeedData() {
  return <p className="text-sm text-stone-500">Load a dataset in the Data step first.</p>
}

// ---------------------------------------------------------------- Data

function DataTab({ exp, table, update }: { exp: Experiment; table: Table | null; update: (p: Partial<Experiment>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const numeric = table?.columns.filter((c) => c.kind === 'numeric').map((c) => c.name) ?? []
  const stats = useMemo(() => (table ? summarize(table, numeric) : []), [table]) // eslint-disable-line react-hooks/exhaustive-deps
  const corrCols = numeric.slice(0, 16)
  const corr = useMemo(() => (table && corrCols.length > 1 ? correlation(table, corrCols) : null), [table]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load(f: File) {
    setError('')
    try {
      const csv = await f.text()
      parseCsv(csv, f.name)
      update({ csv, datasetName: f.name, synthetic: false, result: undefined })
    } catch (e) {
      setError(explainError(e))
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()}>{exp.csv ? 'Replace dataset…' : 'Upload CSV…'}</Button>
          {table && (
            <span className="text-sm text-stone-600 dark:text-stone-400">
              {exp.datasetName}: {table.rows.length} rows × {table.columns.length} columns
            </span>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        {exp.synthetic && (
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-400">
            This dataset was generated by the template to demonstrate the lab. It mimics plausible relationships but is not real data: use it to
            learn the workflow, then replace it with your own measurements.
          </p>
        )}
      </Card>
      {table && (
        <>
          <Card title="Columns">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr>
                    <th className="py-1">Column</th>
                    <th>Type</th>
                    <th className="text-right">Missing</th>
                    <th className="text-right">Distinct</th>
                    <th className="pl-3">First values</th>
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map((c, j) => (
                    <tr key={c.name} className="border-t border-stone-200 dark:border-stone-800">
                      <td className="py-1 font-medium">{c.name}</td>
                      <td className={c.kind === 'numeric' ? '' : 'text-amber-700 dark:text-amber-500'}>{c.kind}</td>
                      <td className="text-right tabular-nums">{c.missing}</td>
                      <td className="text-right tabular-nums">{c.unique}</td>
                      <td className="truncate pl-3 text-xs text-stone-500">{table.rows.slice(0, 4).map((r) => r[j] ?? '∅').join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {stats.length > 0 && (
            <Card title="Descriptive statistics">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs tabular-nums">
                  <thead className="text-left text-stone-500">
                    <tr>
                      {['Column', 'n', 'Mean', 'SD', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Skew'].map((h) => (
                        <th key={h} className="py-1 pr-2">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr key={s.name} className="border-t border-stone-200 dark:border-stone-800">
                        <td className="py-1 pr-2 font-medium">{s.name}</td>
                        {[s.n, s.mean, s.std, s.min, s.q1, s.median, s.q3, s.max, s.skew].map((v, i) => (
                          <td key={i} className="pr-2">
                            {Number.isInteger(v) ? v : Number(v.toPrecision(4))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {corr && <Chart svg={heatmap(corr, corrCols, corrCols, { title: 'Pearson correlation between numeric columns', diverging: true })} caption="Blue: positive, red: negative. Very high correlation with the target can indicate leakage." />}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Set-up

function SetupTab({ exp, table, setConfig }: { exp: Experiment; table: Table; setConfig: SetConfig }) {
  const c = exp.config
  const cols = table.columns.map((x) => x.name)
  const reserved = new Set([c.target, c.groupColumn, c.timeColumn, c.sequence?.orderColumn, c.sequence?.seriesColumn].filter(Boolean))
  const toggleFeature = (f: string) => setConfig((c) => ({ features: c.features.includes(f) ? c.features.filter((x) => x !== f) : [...c.features, f] }))

  return (
    <div className="space-y-4">
      <Card title="Task and target">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <Label>Task</Label>
            <Select value={c.task} onChange={(e) => setConfig({ task: e.target.value as ExperimentConfig['task'] })}>
              <option value="classification">Classification (predict a class)</option>
              <option value="regression">Regression (predict a number)</option>
            </Select>
          </label>
          <label>
            <Label>Target column</Label>
            <Select value={c.target} onChange={(e) => setConfig((c) => ({ target: e.target.value, features: c.features.filter((f) => f !== e.target.value) }))}>
              <option value="">Choose…</option>
              {cols.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </Select>
          </label>
        </div>
      </Card>

      <Card title="Inputs (features)">
        <p className="mb-2 text-xs text-stone-500">Exclude anything measured after the outcome or computed from the target. Group, time and series columns are not used as inputs.</p>
        <div className="grid gap-1 text-sm sm:grid-cols-3">
          {table.columns
            .filter((x) => !reserved.has(x.name))
            .map((x) => (
              <label key={x.name} className="flex items-center gap-2">
                <input type="checkbox" checked={c.features.includes(x.name)} onChange={() => toggleFeature(x.name)} />
                <span className="truncate">{x.name}</span>
                <span className="text-xs text-stone-400">{x.kind === 'categorical' ? 'cat.' : ''}</span>
              </label>
            ))}
        </div>
      </Card>

      <Card title="Validation">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <Label>Split</Label>
            <Select value={c.split.kind} onChange={(e) => setConfig((c) => ({ split: { ...c.split, kind: e.target.value as ExperimentConfig['split']['kind'] } }))}>
              <option value="group">Grouped (site / project / specimen)</option>
              <option value="time">Temporal (forecasting)</option>
              <option value="random">Random (stratified)</option>
            </Select>
          </label>
          {c.split.kind === 'group' && !c.sequence && (
            <label>
              <Label>Group column</Label>
              <Select value={c.groupColumn ?? ''} onChange={(e) => setConfig((c) => ({ groupColumn: e.target.value || undefined, features: c.features.filter((f) => f !== e.target.value) }))}>
                <option value="">Choose…</option>
                {cols.filter((n) => n !== c.target).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            </label>
          )}
          {c.split.kind === 'time' && !c.sequence && (
            <label>
              <Label>Time column</Label>
              <Select value={c.timeColumn ?? ''} onChange={(e) => setConfig((c) => ({ timeColumn: e.target.value || undefined, features: c.features.filter((f) => f !== e.target.value) }))}>
                <option value="">Choose…</option>
                {table.columns.filter((x) => x.kind === 'numeric' && x.name !== c.target).map((x) => (
                  <option key={x.name}>{x.name}</option>
                ))}
              </Select>
            </label>
          )}
          <label>
            <Label hint="share held out">Test set</Label>
            <Select value={String(c.split.testFraction)} onChange={(e) => setConfig((c) => ({ split: { ...c.split, testFraction: Number(e.target.value) } }))}>
              {[0.15, 0.2, 0.25, 0.3].map((v) => (
                <option key={v} value={v}>
                  {Math.round(v * 100)}%
                </option>
              ))}
            </Select>
          </label>
          <label>
            <Label>CV folds</Label>
            <Select value={String(c.split.folds)} onChange={(e) => setConfig((c) => ({ split: { ...c.split, folds: Number(e.target.value) } }))}>
              {[3, 4, 5, 10].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </label>
          <label>
            <Label>Random seed</Label>
            <Input type="number" value={c.seed} onChange={(e) => setConfig({ seed: Number(e.target.value) || 0 })} />
          </label>
        </div>
        <div className="mt-3 flex flex-col gap-1.5 text-sm">
          {c.task === 'classification' && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={c.classWeight} onChange={(e) => setConfig({ classWeight: e.target.checked })} />
              Weight classes inversely to their frequency (imbalanced data)
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={c.tuning.enabled} onChange={(e) => setConfig((c) => ({ tuning: { ...c.tuning, enabled: e.target.checked } }))} />
            Tune hyperparameters (nested randomised search,
            <input
              type="number"
              min={3}
              max={60}
              value={c.tuning.iterations}
              onChange={(e) => setConfig((c) => ({ tuning: { ...c.tuning, iterations: Math.max(3, Number(e.target.value) || 10) } }))}
              className="w-14 rounded border border-stone-300 bg-white px-1 dark:border-stone-700 dark:bg-stone-900"
            />
            candidates; slower)
          </label>
        </div>
      </Card>

      <Card title="Sequences (time-series windows)">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!c.sequence}
            onChange={(e) => setConfig({ sequence: e.target.checked ? { orderColumn: '', seriesColumn: '', window: 10 } : undefined })}
          />
          Build sliding windows within each series (needed for 1D-CNN, LSTM and GRU)
        </label>
        {c.sequence && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label>
              <Label>Order (time) column</Label>
              <Select value={c.sequence.orderColumn} onChange={(e) => setConfig((c) => ({ sequence: { ...c.sequence!, orderColumn: e.target.value }, features: c.features.filter((f) => f !== e.target.value) }))}>
                <option value="">Choose…</option>
                {table.columns.filter((x) => x.kind === 'numeric').map((x) => (
                  <option key={x.name}>{x.name}</option>
                ))}
              </Select>
            </label>
            <label>
              <Label>Series column</Label>
              <Select value={c.sequence.seriesColumn} onChange={(e) => setConfig((c) => ({ sequence: { ...c.sequence!, seriesColumn: e.target.value }, features: c.features.filter((f) => f !== e.target.value) }))}>
                <option value="">Choose…</option>
                {cols.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            </label>
            <label>
              <Label hint="time steps">Window</Label>
              <Input type="number" min={2} max={100} value={c.sequence.window} onChange={(e) => setConfig((c) => ({ sequence: { ...c.sequence!, window: Math.max(2, Number(e.target.value) || 2) } }))} />
            </label>
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- Models

function ModelsTab({ exp, setConfig }: { exp: Experiment; setConfig: SetConfig }) {
  const c = exp.config
  const families = [...new Set(MODELS.map((m) => m.family))]
  const toggle = (id: string) => setConfig((c) => ({ models: c.models.includes(id) ? c.models.filter((x) => x !== id) : [...c.models, id] }))
  const dl = c.dl
  const usesDl = c.models.some((id) => MODELS.find((m) => m.id === id)?.engine === 'tfjs')
  return (
    <div className="space-y-4">
      <Card title="Models to compare">
        <div className="space-y-3">
          {families.map((f) => (
            <div key={f}>
              <p className="mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{f}</p>
              {MODELS.filter((m) => m.family === f).map((m) => {
                const disabled = !!m.sequenceOnly && !c.sequence
                return (
                  <label key={m.id} className={`flex items-start gap-2 py-0.5 text-sm ${disabled ? 'opacity-50' : ''}`}>
                    <input type="checkbox" className="mt-1" disabled={disabled} checked={c.models.includes(m.id) && !disabled} onChange={() => toggle(m.id)} />
                    <span>
                      <span className="font-medium">{m.name}</span>
                      {HEAVY.has(m.id) && <span className="ml-1.5 rounded bg-stone-100 px-1 text-[10px] text-stone-600 uppercase dark:bg-stone-800 dark:text-stone-300">heavy</span>}
                      <span className="text-stone-500"> — {m.description}</span>
                      {disabled && <span className="text-xs text-stone-500"> (turn on sequences in Set-up)</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Keep the baseline: a model is only useful if it clearly beats it. Models marked heavy train in the browser on the CPU and can take many minutes
          on long sequences; for large datasets use the exported Python/Keras script.
        </p>
      </Card>
      {usesDl && (
        <Card title="Deep-learning settings">
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <Label hint="comma-separated">Hidden units per layer</Label>
              <Input
                defaultValue={dl.hidden.join(', ')}
                onBlur={(e) => {
                  const hidden = e.target.value.split(',').map((v) => parseInt(v.trim(), 10)).filter((v) => v > 0)
                  setConfig((c) => ({ dl: { ...c.dl, hidden: hidden.length ? hidden : [32] } }))
                }}
              />
            </label>
            <NumberField label="Dropout" value={dl.dropout} step={0.05} min={0} max={0.8} onChange={(v) => setConfig((c) => ({ dl: { ...c.dl, dropout: v } }))} />
            <NumberField label="Learning rate" value={dl.learningRate} step={0.0005} min={0.00001} max={0.1} onChange={(v) => setConfig((c) => ({ dl: { ...c.dl, learningRate: v } }))} />
            <NumberField label="Batch size" value={dl.batchSize} step={8} min={4} max={1024} onChange={(v) => setConfig((c) => ({ dl: { ...c.dl, batchSize: Math.round(v) } }))} />
            <NumberField label="Max epochs" value={dl.epochs} step={10} min={5} max={2000} onChange={(v) => setConfig((c) => ({ dl: { ...c.dl, epochs: Math.round(v) } }))} />
            <NumberField label="Early-stopping patience" value={dl.patience} step={1} min={2} max={200} onChange={(v) => setConfig((c) => ({ dl: { ...c.dl, patience: Math.round(v) } }))} />
          </div>
        </Card>
      )}
    </div>
  )
}

function NumberField({ label, value, onChange, step, min, max }: { label: string; value: number; onChange: (v: number) => void; step: number; min: number; max: number }) {
  return (
    <label>
      <Label>{label}</Label>
      <Input type="number" value={value} step={step} min={min} max={max} onChange={(e) => Number.isFinite(Number(e.target.value)) && e.target.value !== '' && onChange(Math.min(max, Math.max(min, Number(e.target.value))))} />
    </label>
  )
}

// ---------------------------------------------------------------- Run

function RunTab({ exp, table, update, onDone }: { exp: Experiment; table: Table; update: (p: Partial<Experiment>) => void; onDone: () => void }) {
  const [log, setLog] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(0)
  const handle = useRef<RunHandle | null>(null)
  const c = exp.config
  const problems = [
    !c.target && 'Choose a target column (Set-up).',
    !c.features.length && 'Choose at least one input (Set-up).',
    c.split.kind === 'group' && !c.groupColumn && !c.sequence && 'Choose the group column, or use a random split (Set-up).',
    c.split.kind === 'time' && !c.timeColumn && !c.sequence && 'Choose the time column (Set-up).',
    c.sequence && (!c.sequence.orderColumn || !c.sequence.seriesColumn) && 'Choose the order and series columns for sequences (Set-up).',
    !c.models.length && 'Choose at least one model (Models).',
  ].filter(Boolean) as string[]

  function start() {
    setError('')
    setLog({})
    setRunning(true)
    setStarted(Date.now())
    const h = runExperiment(table, c, (engine, msg) => setLog((l) => ({ ...l, [engine]: msg })))
    handle.current = h
    h.promise
      .then(async (result) => {
        await update({ result, interpretation: undefined })
        onDone()
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setRunning(false))
  }

  return (
    <Card title="Run the experiment">
      {problems.length > 0 && (
        <ul className="mb-3 list-disc pl-5 text-sm text-amber-800 dark:text-amber-400">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
        {c.models.length} model(s), {c.split.folds}-fold cross-validation{c.tuning.enabled ? ` with nested tuning (${c.tuning.iterations} candidates)` : ''}. The first run downloads the Python
        runtime (≈30 MB, cached afterwards). Classical and deep models train in parallel in background workers.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button variant="danger" onClick={() => handle.current?.cancel()}>
            Cancel
          </Button>
        ) : (
          <Button disabled={problems.length > 0} onClick={start}>
            {exp.result ? 'Run again' : 'Run experiment'}
          </Button>
        )}
        {running && <Elapsed since={started} />}
      </div>
      {Object.keys(log).length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {Object.entries(log).map(([engine, msg]) => (
            <li key={engine}>
              <span className="font-medium">{engine}:</span> <span className="text-stone-600 dark:text-stone-400">{msg}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </Card>
  )
}

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.round((Date.now() - since) / 1000)
  return <span className="text-xs text-stone-500 tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
}

// ---------------------------------------------------------------- Report

function ReportTab({ exp, table, update }: { exp: Experiment; table: Table; update: (p: Partial<Experiment>) => void }) {
  const input = { title: exp.name, datasetName: exp.datasetName, synthetic: exp.synthetic, config: exp.config, result: exp.result! }
  const blocks = useMemo(() => buildReport(input), [exp.result]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = slug(exp.name)
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="text-xs" onClick={() => downloadText(reportHtml(input, blocks), `${name}-report.html`, 'text/html')}>
            HTML report
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => downloadText(reportMarkdown(input, blocks), `${name}-report.md`, 'text/markdown')}>
            Markdown
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => downloadText(predictionsCsv(input), `${name}-test-predictions.csv`, 'text/csv')}>
            Test predictions (CSV)
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => downloadText(designMatrixCsv(table, exp.config), `${name}-design-matrix.csv`, 'text/csv')}>
            Design matrix + split (CSV)
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => downloadText(pythonScript(exp.name, exp.config, exp.result!, `${name}-design-matrix.csv`), `${name.replace(/-/g, '_')}.py`, 'text/x-python')}>
            Python script
          </Button>
        </div>
        <p className="mt-2 text-xs text-stone-500">The Python script reads the design-matrix CSV, so download both for a reproducibility package.</p>
      </Card>
      <InsertCard exp={exp} blocks={blocks} />
      <Interpretation exp={exp} update={update} />
      <div className="space-y-3">{blocks.map((b, i) => <BlockView key={i} b={b} />)}</div>
    </div>
  )
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case 'h2':
      return <h2 className="border-b border-stone-200 pt-4 pb-1 text-lg font-semibold dark:border-stone-800">{b.text}</h2>
    case 'h3':
      return <h3 className="font-semibold">{b.text}</h3>
    case 'p':
      return <Markdown text={b.text} />
    case 'list':
      return (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {b.items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )
    case 'warn':
      return (
        <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {b.items.map((x) => (
            <li key={x}>⚠ {x}</li>
          ))}
        </ul>
      )
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="text-stone-500">
              <tr>
                {b.head.map((h) => (
                  <th key={h} className="border-b border-stone-200 py-1 pr-3 dark:border-stone-800">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-b border-stone-100 dark:border-stone-800/60">
                  {r.map((cell, j) => (
                    <td key={j} className="py-1 pr-3 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {b.caption && <p className="mt-1 text-xs text-stone-500">{b.caption}</p>}
        </div>
      )
    case 'chart':
      return <Chart svg={b.svg} caption={b.caption} />
  }
}

function InsertCard({ exp, blocks }: { exp: Experiment; blocks: Block[] }) {
  const manuscripts = useLiveQuery(() => db.manuscripts.orderBy('updatedAt').reverse().toArray(), [])
  const [ms, setMs] = useState('')
  const [sec, setSec] = useState('')
  const [status, setStatus] = useState('')
  if (!manuscripts?.length) return null
  const m = manuscripts.find((x) => x.id === ms) ?? manuscripts[0]
  const sections = m.sections.filter((s) => s.role === 'body')
  const section = sections.find((s) => s.id === sec) ?? sections.find((s) => /result|method/i.test(s.title)) ?? sections[0]
  return (
    <Card title="Insert into a manuscript">
      {exp.synthetic ? (
        <p className="text-sm text-amber-800 dark:text-amber-400">Disabled for synthetic demo data.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={m.id} onChange={(e) => setMs(e.target.value)} className="w-auto max-w-64">
            {manuscripts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title || 'Untitled'}
              </option>
            ))}
          </Select>
          <Select value={section?.id ?? ''} onChange={(e) => setSec(e.target.value)} className="w-auto max-w-56">
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
          <Button
            className="text-xs"
            disabled={!section}
            onClick={async () => {
              await insertIntoManuscript(m.id, section!.id, manuscriptInsert({ title: exp.name, datasetName: exp.datasetName, synthetic: exp.synthetic, config: exp.config, result: exp.result! }, blocks), [])
              setStatus(`Inserted into "${section!.title}". Citations are marked [VERIFY] for you to add from the library.`)
            }}
          >
            Insert Methods + Results text and tables
          </Button>
          {status && <span className="text-xs text-green-700 dark:text-green-500">{status}</span>}
        </div>
      )}
    </Card>
  )
}

function Interpretation({ exp, update }: { exp: Experiment; update: (p: Partial<Experiment>) => void }) {
  const llm = useLLM('vlabReport')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const r = exp.result!
  const shown = busy ? text : exp.interpretation

  async function run() {
    setBusy(true)
    setError('')
    setText('')
    const best = r.models.find((m) => m.id === r.ranking[0])
    const summary = {
      task: r.task,
      target: exp.config.target,
      inputs: r.data.sources,
      samples: r.data.n,
      split: r.split.description,
      primaryMetric: r.primary,
      models: r.ranking.map((id) => {
        const m = r.models.find((x) => x.id === id)!
        return { name: m.name, cv: m.cvSummary[r.primary], test: m.testScores[r.primary], testCI: m.testCI[r.primary] }
      }),
      comparisons: r.comparisons.map((c) => ({ vs: r.models.find((m) => m.id === c.id)?.name, diff: c.diff, p: c.p })),
      bestModelImportance: best?.importanceFeatures?.map((f, i) => ({ input: f, drop: best.importance!.mean[i] })),
      bestModelShap: best?.shap ? best.importanceFeatures!.map((f, i) => ({ input: f, meanAbsShap: best.shap![i] })) : undefined,
      partialDependence: r.models.find((m) => m.pdp?.length)?.pdp?.map((p) => ({ input: p.feature, x: [p.x[0], p.x[p.x.length - 1]], y: [Math.min(...p.y), Math.max(...p.y)] })),
      warnings: r.warnings,
      syntheticData: exp.synthetic,
    }
    try {
      const { text: out } = await llm.run(
        buildSystemPrompt('ml', ''),
        `Write a Discussion-style interpretation (3–5 paragraphs) of this machine-learning experiment for a Q1 journal in mining geotechnics. Explain the most important inputs in rock-mechanics / mining terms, whether the differences between models are meaningful given the statistical tests and confidence intervals, the limitations (from the warnings), and what further validation is needed. Use only the numbers below; do not invent data or citations — mark any literature claim [VERIFY].\n\n${JSON.stringify(summary, null, 1)}`,
        { onText: setText, feature: 'VLab interpretation' },
      )
      await update({ interpretation: out })
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="AI interpretation (optional)">
      <p className="mb-2 text-xs text-stone-500">Sends only the summary numbers above (no raw data) to your chosen AI model. {llm.missing || llm.label}</p>
      <Button variant="ghost" className="text-xs" disabled={!llm.ready || busy} onClick={run}>
        {busy ? 'Writing…' : exp.interpretation ? 'Write again' : 'Interpret the results'}
      </Button>
      <TaskModel llm={llm} className="mt-2" />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {shown && (
        <div className="mt-3 rounded-md border border-stone-200 p-3 dark:border-stone-800">
          <Markdown text={shown} />
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- Guide

function GuideTab({ exp }: { exp: Experiment }) {
  const t = TEMPLATES.find((x) => x.id === exp.templateId)
  const steps: [string, ReactNode][] = [
    ['Data', 'Upload a CSV (one row per sample, header row). Keep site / project / specimen / batch columns: they decide how the data are split. Check column types and missing values.'],
    ['Set-up', 'Choose the task, the target and the inputs. Prefer a grouped split whenever samples share a site, specimen or batch; use a temporal split for forecasting. Turn on sequences for IR/AE or microseismic time series.'],
    ['Models', 'Keep the baseline, add a linear model and tree ensembles / boosting, and deep models when the data are large enough or sequential.'],
    ['Run', 'Every model is trained on the same folds. Preprocessing (and tuning, if enabled) happens inside each training fold, so validation scores are not inflated.'],
    ['Report', 'Read the warnings first. Compare models with the CV table and the corrected t-test; quote test results with their 95% confidence intervals; explain important inputs physically.'],
    ['Use', 'Insert the Methods and Results text into your manuscript, add the citations marked [VERIFY], and attach the HTML report, design matrix and Python script as supplementary material.'],
  ]
  return (
    <div className="space-y-4">
      <Card title="Step by step">
        <ol className="space-y-2 text-sm">
          {steps.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-stone-200 text-center text-xs leading-6 dark:bg-stone-800">{i + 1}</span>
              <span>
                <span className="font-medium">{title}.</span> {body}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-stone-500">
          Full documentation — including exactly how splits, training, metrics and tests are computed — is in{' '}
          <a href="https://github.com/dodyirawaan/geomine-studio/blob/main/docs/VLAB.md" target="_blank" rel="noreferrer" className="underline">
            docs/VLAB.md
          </a>
          .
        </p>
      </Card>
      {t && (
        <Card title={`What reviewers look for — ${t.title}`}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {t.guidance.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
