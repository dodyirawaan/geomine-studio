// Development only: exposes the lab to the browser console for quick engine checks.
import { parseCsv } from './data'
import { runExperiment } from './run'
import { DEFAULT_CONFIG, TEMPLATES } from './templates'

;(globalThis as unknown as { __vlab: unknown }).__vlab = { parseCsv, runExperiment, TEMPLATES, DEFAULT_CONFIG }
