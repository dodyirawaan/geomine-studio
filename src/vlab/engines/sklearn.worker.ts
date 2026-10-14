// Runs scikit-learn (with XGBoost/LightGBM when selected) in Pyodide, off the main thread.
import { TRAIN_PY } from './train.py'

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'

interface PyodideApi {
  loadPackage(names: string[], opts?: { messageCallback?: (m: string) => void }): Promise<void>
  runPythonAsync(code: string): Promise<unknown>
  globals: { set(name: string, value: unknown): void }
}

let py: PyodideApi | null = null

self.onmessage = async (e: MessageEvent<{ payload: unknown; packages: string[] }>) => {
  const post = (msg: object) => self.postMessage(msg)
  try {
    if (!py) {
      post({ type: 'progress', message: 'Loading Python runtime (first run downloads ~30 MB, then cached)…' })
      const mod = (await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`)) as { loadPyodide: (o: { indexURL: string }) => Promise<PyodideApi> }
      py = await mod.loadPyodide({ indexURL: PYODIDE })
    }
    post({ type: 'progress', message: 'Loading scikit-learn…' })
    await py.loadPackage(['numpy', 'scipy', 'scikit-learn', ...e.data.packages], { messageCallback: () => {} })
    py.globals.set('payload', JSON.stringify(e.data.payload))
    py.globals.set('report_progress', (m: string) => post({ type: 'progress', message: m }))
    const out = (await py.runPythonAsync(TRAIN_PY)) as string
    post({ type: 'result', result: JSON.parse(out) })
  } catch (err) {
    post({ type: 'error', message: (err as Error).message.split('\n').slice(-3).join(' ') })
  }
}
