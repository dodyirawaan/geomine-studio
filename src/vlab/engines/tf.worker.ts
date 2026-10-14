// Deep learning with TensorFlow.js, off the main thread. Per fold: impute and scale with training statistics only,
// hold out 15% of the fold's training data for early stopping, restore the best epoch's weights, then predict.
import * as tf from '@tensorflow/tfjs'
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm'
import wasmPlain from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm?url'
import wasmSimd from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm?url'
import wasmThreaded from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm?url'
import { classificationScores, regressionScores } from '../metrics'
import { rng, shuffle } from '../splits'
import type { DlConfig, ModelOutput, Task } from '../types'

export interface TfJob {
  task: Task
  X: (number | null)[][]
  y: number[]
  nClasses: number
  train: number[]
  test: number[]
  folds: number[][]
  foldTrain: number[][]
  temporal: boolean
  sequenceShape?: [number, number]
  featureSource: string[]
  models: { id: string; name: string }[]
  seed: number
  classWeight: boolean
  dl: DlConfig
}

const post = (msg: object) => self.postMessage(msg)

function stats(X: (number | null)[][], idx: number[]) {
  const d = X[0].length
  const mean = Array(d).fill(0)
  const std = Array(d).fill(0)
  const cnt = Array(d).fill(0)
  for (const i of idx) X[i].forEach((v, j) => v != null && Number.isFinite(v) && ((mean[j] += v), cnt[j]++))
  mean.forEach((_, j) => (mean[j] = cnt[j] ? mean[j] / cnt[j] : 0))
  for (const i of idx) X[i].forEach((v, j) => v != null && Number.isFinite(v) && (std[j] += (v - mean[j]) ** 2))
  std.forEach((_, j) => (std[j] = cnt[j] > 1 ? Math.sqrt(std[j] / (cnt[j] - 1)) || 1 : 1))
  return { mean, std }
}

function matrix(X: (number | null)[][], idx: number[], s: { mean: number[]; std: number[] }): number[][] {
  return idx.map((i) => X[i].map((v, j) => ((v == null || !Number.isFinite(v) ? s.mean[j] : v) - s.mean[j]) / s.std[j]))
}

function toTensor(rows: number[][], shape?: [number, number]): tf.Tensor {
  return shape ? tf.tensor3d(rows.map((r) => Array.from({ length: shape[0] }, (_, t) => r.slice(t * shape[1], (t + 1) * shape[1])))) : tf.tensor2d(rows)
}

function build(id: string, job: TfJob, inputDim: number, seed: number): tf.LayersModel {
  const { hidden, dropout, learningRate } = job.dl
  const init = () => tf.initializers.glorotUniform({ seed: seed++ })
  const out = job.task === 'classification' ? job.nClasses : 1
  const m = tf.sequential()
  const seq = job.sequenceShape
  if (id === 'dnn') {
    hidden.forEach((u, i) => {
      m.add(tf.layers.dense({ units: u, activation: 'relu', kernelInitializer: init(), ...(i === 0 ? { inputShape: [inputDim] } : {}) }))
      if (dropout > 0) m.add(tf.layers.dropout({ rate: dropout, seed: seed++ }))
    })
  } else if (id === 'cnn1d') {
    m.add(tf.layers.conv1d({ filters: 32, kernelSize: Math.min(3, seq![0]), padding: 'same', activation: 'relu', kernelInitializer: init(), inputShape: seq }))
    m.add(tf.layers.conv1d({ filters: 64, kernelSize: Math.min(3, seq![0]), padding: 'same', activation: 'relu', kernelInitializer: init() }))
    m.add(tf.layers.globalAveragePooling1d())
    m.add(tf.layers.dense({ units: hidden[0] ?? 32, activation: 'relu', kernelInitializer: init() }))
    if (dropout > 0) m.add(tf.layers.dropout({ rate: dropout, seed: seed++ }))
  } else {
    const layer = id === 'lstm' ? tf.layers.lstm : tf.layers.gru
    const units = hidden.length ? hidden : [32]
    units.forEach((u, i) =>
      m.add(layer({ units: u, returnSequences: i < units.length - 1, kernelInitializer: init(), recurrentInitializer: tf.initializers.orthogonal({ seed: seed++ }), ...(i === 0 ? { inputShape: seq } : {}) })),
    )
    if (dropout > 0) m.add(tf.layers.dropout({ rate: dropout, seed: seed++ }))
  }
  m.add(tf.layers.dense({ units: out, activation: job.task === 'classification' ? 'softmax' : 'linear', kernelInitializer: init() }))
  m.compile({ optimizer: tf.train.adam(learningRate), loss: job.task === 'classification' ? 'sparseCategoricalCrossentropy' : 'meanSquaredError' })
  return m
}

/** Trains on `idx` with an inner validation split and early stopping; returns a predictor and the curves. */
async function trainModel(id: string, job: TfJob, idx: number[], seed: number, label: string) {
  const rand = rng(seed)
  // The DNN reads the flattened window; convolutional and recurrent models read [steps, channels].
  const shape = id === 'dnn' ? undefined : job.sequenceShape
  const order = job.temporal ? idx : shuffle(idx, rand)
  const nVal = Math.max(1, Math.round(order.length * 0.15))
  const fitIdx = order.slice(0, order.length - nVal)
  const valIdx = order.slice(order.length - nVal)
  const s = stats(job.X, fitIdx)
  const reg = job.task === 'regression'
  const ys = reg ? fitIdx.map((i) => job.y[i]) : []
  const yMean = reg ? ys.reduce((a, b) => a + b, 0) / ys.length : 0
  const yStd = reg ? Math.sqrt(ys.reduce((a, b) => a + (b - yMean) ** 2, 0) / Math.max(1, ys.length - 1)) || 1 : 1
  const yT = (ii: number[]) => (reg ? tf.tensor2d(ii.map((i) => [(job.y[i] - yMean) / yStd])) : tf.tensor1d(ii.map((i) => job.y[i]), 'float32'))

  const model = build(id, job, job.X[0].length, seed)
  const xv = toTensor(matrix(job.X, valIdx, s), shape)
  const yv = yT(valIdx)
  let classWeight: Record<number, number> | undefined
  if (!reg && job.classWeight) {
    const counts = Array(job.nClasses).fill(0)
    fitIdx.forEach((i) => counts[job.y[i]]++)
    classWeight = Object.fromEntries(counts.map((c, k) => [k, c ? fitIdx.length / (job.nClasses * c) : 1]))
  }
  const history = { loss: [] as number[], valLoss: [] as number[] }
  let best = Infinity
  let bestWeights: tf.Tensor[] | null = null
  let wait = 0
  // Tensors are built once; each epoch only reorders them with a seeded permutation.
  const xFit = toTensor(matrix(job.X, fitIdx, s), shape)
  const yFit = yT(fitIdx)
  const positions = fitIdx.map((_, i) => i)
  for (let ep = 0; ep < job.dl.epochs; ep++) {
    const order = tf.tensor1d(shuffle(positions, rand), 'int32')
    const xb = tf.gather(xFit, order)
    const yb = tf.gather(yFit, order)
    order.dispose()
    const h = await model.fit(xb, yb, { epochs: 1, batchSize: job.dl.batchSize, shuffle: false, validationData: [xv, yv], classWeight, verbose: 0 })
    xb.dispose()
    yb.dispose()
    const loss = h.history.loss[0] as number
    const val = h.history.val_loss[0] as number
    history.loss.push(loss)
    history.valLoss.push(val)
    if (val < best - 1e-6) {
      best = val
      bestWeights?.forEach((w) => w.dispose())
      bestWeights = model.getWeights().map((w) => w.clone())
      wait = 0
    } else if (++wait >= job.dl.patience) break
    if (ep % 5 === 0) post({ type: 'progress', message: `${label}: epoch ${ep + 1}, val loss ${val.toFixed(4)}` })
  }
  if (bestWeights) model.setWeights(bestWeights)
  xv.dispose()
  yv.dispose()
  xFit.dispose()
  yFit.dispose()

  const predict = (ii: number[]) => {
    const x = toTensor(matrix(job.X, ii, s), shape)
    const out = model.predict(x) as tf.Tensor
    const arr = out.arraySync() as number[][]
    x.dispose()
    out.dispose()
    if (reg) return { pred: arr.map((r) => r[0] * yStd + yMean) }
    return { pred: arr.map((r) => r.indexOf(Math.max(...r))), proba: arr }
  }
  return { model, predict, history, cleanup: () => (bestWeights?.forEach((w) => w.dispose()), model.dispose()) }
}

function primary(job: TfJob, y: number[], p: number[]): number {
  return job.task === 'classification' ? classificationScores(y, p, job.nClasses).f1_macro : regressionScores(y, p).r2
}

/** Grouped permutation importance on the test set, matching the scikit-learn engine. */
function importance(job: TfJob, predict: (ii: number[]) => { pred: number[] }, repeats = 5) {
  const groups = [...new Set(job.featureSource)]
  const yt = job.test.map((i) => job.y[i])
  const base = primary(job, yt, predict(job.test).pred)
  const rand = rng(job.seed + 99)
  const mean: number[] = []
  const std: number[] = []
  const original = job.X
  for (const g of groups) {
    const cols = job.featureSource.map((s, j) => (s === g ? j : -1)).filter((j) => j >= 0)
    const drops: number[] = []
    for (let r = 0; r < repeats; r++) {
      const perm = shuffle(job.test, rand)
      const permuted = original.slice()
      job.test.forEach((row, k) => {
        const copy = original[row].slice()
        cols.forEach((j) => (copy[j] = original[perm[k]][j]))
        permuted[row] = copy
      })
      job.X = permuted
      drops.push(base - primary(job, yt, predict(job.test).pred))
      job.X = original
    }
    const m = drops.reduce((a, b) => a + b, 0) / drops.length
    mean.push(m)
    std.push(Math.sqrt(drops.reduce((a, b) => a + (b - m) ** 2, 0) / drops.length))
  }
  return { groups, mean, std }
}

const ok = async (name: string) => (await tf.setBackend(name).catch(() => false)) === true

/**
 * WebAssembly (SIMD) is several times faster than the pure-JavaScript CPU backend for these networks and needs no
 * GPU, but it cannot train convolutions; the 1D-CNN uses WebGL or, failing that, the CPU.
 */
async function selectBackend(id: string): Promise<string> {
  const order = id === 'cnn1d' ? ['webgl', 'cpu'] : ['wasm', 'webgl', 'cpu']
  for (const b of order) if (tf.getBackend() === b || (await ok(b))) break
  await tf.ready()
  return tf.getBackend()
}

self.onmessage = async (e: MessageEvent<TfJob>) => {
  const job = e.data
  try {
    setWasmPaths({ 'tfjs-backend-wasm.wasm': wasmPlain, 'tfjs-backend-wasm-simd.wasm': wasmSimd, 'tfjs-backend-wasm-threaded-simd.wasm': wasmThreaded })
    const backends: Record<string, string> = {}
    const results: ModelOutput[] = []
    for (const { id, name } of job.models) {
      const t0 = performance.now()
      const backend = await selectBackend(id)
      backends[name] = backend
      try {
        const cv: ModelOutput['cv'] = []
        for (let f = 0; f < job.folds.length; f++) {
          const r = await trainModel(id, job, job.foldTrain[f], job.seed + f, `${name}: fold ${f + 1}/${job.folds.length}`)
          cv.push(r.predict(job.folds[f]))
          r.cleanup()
        }
        const fin = await trainModel(id, job, job.train, job.seed + 1000, `${name}: final model`)
        const t = fin.predict(job.test)
        post({ type: 'progress', message: `${name}: permutation importance` })
        const imp = importance(job, fin.predict)
        const params = { ...job.dl, architecture: id, parameters: fin.model.countParams(), epochsTrained: fin.history.loss.length, backend }
        fin.cleanup()
        results.push({
          id,
          name,
          engine: 'tfjs',
          cv,
          test: t.pred,
          testProba: t.proba,
          importanceFeatures: imp.groups,
          importance: { mean: imp.mean, std: imp.std },
          history: fin.history,
          params,
          fitSeconds: (performance.now() - t0) / 1000,
        })
      } catch (err) {
        results.push({ id, name, engine: 'tfjs', cv: [], test: [], params: {}, fitSeconds: (performance.now() - t0) / 1000, error: (err as Error).message })
      }
    }
    post({ type: 'result', result: { models: results, versions: { 'tensorflow.js': tf.version.tfjs, backend: [...new Set(Object.values(backends))].join('/') } } })
  } catch (err) {
    post({ type: 'error', message: (err as Error).message })
  }
}
