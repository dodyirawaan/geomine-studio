// Runs an experiment: prepare data, split once, train in both engines in parallel, evaluate.
import { prepare } from './data'
import { evaluate, type ExperimentResult } from './evaluate'
import { MODELS, modelName } from './models'
import { makeSplits } from './splits'
import type { EngineInfo, ExperimentConfig, ModelOutput, Table } from './types'
import type { TfJob } from './engines/tf.worker'

export interface RunHandle {
  promise: Promise<ExperimentResult>
  cancel: () => void
}

const rejecters = new WeakMap<Worker, (e: Error) => void>()

function runWorker<T>(worker: Worker, message: unknown, onProgress: (m: string) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    rejecters.set(worker, reject)
    worker.onmessage = (e: MessageEvent<{ type: string; message?: string; result?: T }>) => {
      if (e.data.type === 'progress') onProgress(e.data.message!)
      else if (e.data.type === 'result') resolve(e.data.result!)
      else reject(new Error(e.data.message))
    }
    worker.onerror = (e) => reject(new Error(e.message || 'Worker failed to start'))
    worker.postMessage(message)
  })
}

export function runExperiment(table: Table, c: ExperimentConfig, onProgress: (engine: string, msg: string) => void): RunHandle {
  const workers: Worker[] = []
  let cancelled = false
  const promise = (async () => {
    const t0 = performance.now()
    const p = prepare(table, c)
    const ti = c.timeColumn ? table.columns.findIndex((x) => x.name === c.timeColumn) : c.sequence ? table.columns.findIndex((x) => x.name === c.sequence!.orderColumn) : -1
    const timeValues = ti >= 0 ? p.sourceRow.map((r) => Number(table.rows[r][ti])) : undefined
    const s = makeSplits(p, c, timeValues)
    const chosen = c.models.map((id) => MODELS.find((m) => m.id === id)!).filter((m) => m && (!m.sequenceOnly || p.sequenceShape))
    const sk = chosen.filter((m) => m.engine === 'sklearn')
    const tfm = chosen.filter((m) => m.engine === 'tfjs')
    const jobs: Promise<{ models: ModelOutput[]; versions: Record<string, string> }>[] = []
    const engines: EngineInfo[] = []

    if (sk.length) {
      const w = new Worker(new URL('./engines/sklearn.worker.ts', import.meta.url), { type: 'module' })
      workers.push(w)
      jobs.push(
        runWorker(
          w,
          {
            payload: {
              task: c.task,
              X: p.X,
              y: p.y,
              n_classes: p.classes.length,
              train: s.train,
              test: s.test,
              folds: s.folds,
              fold_train: s.foldTrain,
              groups: p.groups ? p.groups.map(String) : null,
              split_kind: c.sequence ? (c.split.kind === 'time' ? 'time' : 'group') : c.split.kind,
              class_weight: c.classWeight,
              tuning: c.tuning,
              models: sk.map((m) => m.id),
              model_names: sk.map((m) => modelName(m.id, c.task)),
              feature_source: p.featureSource,
              feature_names: p.featureNames,
              seed: c.seed,
            },
            packages: [...new Set(sk.map((m) => m.pyPackage).filter(Boolean) as string[])],
          },
          (m) => onProgress('scikit-learn', m),
        ),
      )
    }
    if (tfm.length) {
      const w = new Worker(new URL('./engines/tf.worker.ts', import.meta.url), { type: 'module' })
      workers.push(w)
      const job: TfJob = {
        task: c.task,
        X: p.X,
        y: p.y,
        nClasses: p.classes.length,
        train: s.train,
        test: s.test,
        folds: s.folds,
        foldTrain: s.foldTrain,
        temporal: c.split.kind === 'time',
        sequenceShape: p.sequenceShape,
        featureSource: p.featureSource,
        models: tfm.map((m) => ({ id: m.id, name: modelName(m.id, c.task) })),
        seed: c.seed,
        classWeight: c.classWeight,
        dl: c.dl,
      }
      jobs.push(runWorker(w, job, (m) => onProgress('TensorFlow.js', m)))
    }
    if (!jobs.length) throw new Error('Choose at least one model.')
    const outs = await Promise.all(jobs)
    if (cancelled) throw new Error('Cancelled')
    outs.forEach((o, i) => engines.push({ name: i === 0 && sk.length ? 'scikit-learn (Pyodide)' : 'TensorFlow.js', versions: o.versions }))
    // Keep the user's model order.
    const all = outs.flatMap((o) => o.models)
    const ordered = c.models.map((id) => all.find((m) => m.id === id)).filter(Boolean) as ModelOutput[]
    onProgress('Evaluation', 'Computing metrics and bootstrap intervals…')
    return evaluate(table, c, p, s, ordered, engines, (performance.now() - t0) / 1000)
  })().finally(() => workers.forEach((w) => w.terminate()))
  return {
    promise,
    cancel: () => {
      cancelled = true
      workers.forEach((w) => {
        w.terminate()
        rejecters.get(w)?.(new Error('Cancelled'))
      })
    },
  }
}
