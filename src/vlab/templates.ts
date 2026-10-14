// Research templates for the virtual lab. Each suggests a set-up and can generate a SYNTHETIC demonstration dataset
// so the lab can be tried before real data is available. Synthetic data must never be reported as results.
import { rng } from './splits'
import type { ExperimentConfig } from './types'

export interface LabTemplate {
  id: string
  topic: string
  title: string
  description: string
  config: Partial<ExperimentConfig>
  /** What a reviewer will look for in this kind of study. */
  guidance: string[]
  demo: (seed: number) => string
}

function gauss(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand())
}

const r2 = (x: number) => Math.round(x * 100) / 100
const csv = (head: string[], rows: (string | number)[][]) => [head.join(','), ...rows.map((r) => r.join(','))].join('\n')

export const TEMPLATES: LabTemplate[] = [
  {
    id: 'rockburst',
    topic: 'Rockburst & ground control',
    title: 'Rockburst intensity classification',
    description: 'Predict rockburst intensity (none / light / moderate / strong) from stress, strength and energy indices of case histories.',
    config: { task: 'classification', target: 'intensity', classOrder: ['none', 'light', 'moderate', 'strong'], features: ['depth_m', 'sigma_theta_MPa', 'sigma_c_MPa', 'sigma_t_MPa', 'Wet', 'rock_type'], groupColumn: 'project', split: { kind: 'group', testFraction: 0.2, folds: 5 }, models: ['dummy', 'linear', 'svm', 'rf', 'hgb', 'xgb', 'lgbm', 'dnn'] },
    guidance: [
      'Case-history databases mix projects: split by project so the model is tested on unseen sites.',
      'Derived indices (σθ/σc, σc/σt) are functions of the inputs; do not add them alongside the raw values without saying so.',
      'Report macro-F1 and κ, not only accuracy — strong bursts are rare.',
      'Compare with empirical criteria (Russenes, Tao, Wet) as baselines.',
    ],
    demo: (seed) => {
      const rand = rng(seed)
      const types = ['granite', 'marble', 'sandstone', 'diorite']
      const rows: (string | number)[][] = []
      for (let i = 0; i < 360; i++) {
        const project = `P${1 + Math.floor(rand() * 18)}`
        const depth = 300 + rand() * 1700
        const sc = 60 + rand() * 200
        const st = sc / (8 + rand() * 30)
        const wet = 1 + rand() * 9
        const sth = (0.027 * depth * (1.2 + rand() * 1.8)) * (1 + 0.15 * gauss(rand))
        const z = 4.5 * (sth / sc) + 0.25 * wet - 0.04 * (sc / st) + 0.6 * gauss(rand)
        const cls = z < 1.6 ? 'none' : z < 2.3 ? 'light' : z < 3.0 ? 'moderate' : 'strong'
        rows.push([project, r2(depth), r2(sth), r2(sc), r2(st), r2(wet), types[Math.floor(rand() * 4)], cls])
      }
      return csv(['project', 'depth_m', 'sigma_theta_MPa', 'sigma_c_MPa', 'sigma_t_MPa', 'Wet', 'rock_type', 'intensity'], rows)
    },
  },
  {
    id: 'microseismic',
    topic: 'Microseismic monitoring',
    title: 'Microseismic event vs. blast discrimination',
    description: 'Separate rock-failure events from production blasts using waveform source parameters.',
    config: { task: 'classification', target: 'source', classOrder: ['event', 'blast'], features: ['duration_ms', 'dominant_freq_Hz', 'Es_Ep', 'rise_time_ms', 'corner_freq_Hz', 'moment_magnitude', 'hour'], groupColumn: 'month', split: { kind: 'group', testFraction: 0.2, folds: 5 }, models: ['dummy', 'linear', 'rf', 'xgb', 'lgbm', 'dnn'] },
    guidance: [
      'Blasts follow production schedules: hour of day can dominate — report results with and without it.',
      'Split by time period (e.g. month) so near-duplicate events from one blast round do not leak.',
      'State how labels were obtained (blast logs, manual picking) and their uncertainty.',
    ],
    demo: (seed) => {
      const rand = rng(seed)
      const rows: (string | number)[][] = []
      for (let i = 0; i < 600; i++) {
        const blast = rand() < 0.35
        const month = `2025-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}`
        const dur = blast ? 180 + 80 * gauss(rand) : 320 + 120 * gauss(rand)
        const f = blast ? 95 + 25 * gauss(rand) : 55 + 20 * gauss(rand)
        const es = blast ? 4 + 2 * gauss(rand) : 12 + 5 * gauss(rand)
        const rise = blast ? 8 + 3 * gauss(rand) : 18 + 6 * gauss(rand)
        const fc = f * (0.8 + 0.2 * rand())
        const mw = (blast ? -0.6 : -0.3) + 0.5 * gauss(rand)
        const hour = blast ? (rand() < 0.8 ? 14 + Math.floor(rand() * 2) : Math.floor(rand() * 24)) : Math.floor(rand() * 24)
        rows.push([month, r2(Math.max(30, dur)), r2(Math.max(5, f)), r2(Math.max(0.5, es)), r2(Math.max(1, rise)), r2(fc), r2(mw), hour, blast ? 'blast' : 'event'])
      }
      return csv(['month', 'duration_ms', 'dominant_freq_Hz', 'Es_Ep', 'rise_time_ms', 'corner_freq_Hz', 'moment_magnitude', 'hour', 'source'], rows)
    },
  },
  {
    id: 'wcfz',
    topic: 'Water-conservation mining',
    title: 'Height of the water-conducting fractured zone',
    description: 'Predict the water-conducting fractured zone height from mining height, depth, panel geometry and overburden lithology.',
    config: { task: 'regression', target: 'H_wcfz_m', features: ['mining_height_m', 'depth_m', 'panel_width_m', 'hard_rock_ratio', 'advance_rate_m_d', 'overburden_ucs_MPa'], groupColumn: 'coalfield', split: { kind: 'group', testFraction: 0.2, folds: 5 }, models: ['dummy', 'linear', 'svm', 'rf', 'hgb', 'xgb', 'lgbm', 'dnn'] },
    guidance: [
      'Measured heights come from different methods (borehole flushing fluid loss, TV logging, numerical back-analysis): record the method and test its effect.',
      'Group by coalfield or mine to test transfer to new geology.',
      'Compare with the empirical formulas of the national specifications as a baseline and report the ratio H/M (fracture-to-mining-height).',
    ],
    demo: (seed) => {
      const rand = rng(seed)
      const fields = ['Shendong', 'Yushen', 'Huainan', 'Ordos', 'Huanglong', 'Ningdong', 'Datong', 'Pingdingshan']
      const rows: (string | number)[][] = []
      for (let i = 0; i < 240; i++) {
        const field = fields[Math.floor(rand() * fields.length)]
        const m = 1.5 + rand() * 6.5
        const depth = 80 + rand() * 520
        const w = 150 + rand() * 250
        const hard = rand()
        const adv = 4 + rand() * 12
        const ucs = 20 + hard * 60 + 10 * gauss(rand)
        const ratio = 10 + 14 * hard + 0.01 * w - 0.08 * adv + 2 * gauss(rand)
        rows.push([field, r2(m), r2(depth), r2(w), r2(hard), r2(adv), r2(ucs), r2(Math.max(5, m * ratio))])
      }
      return csv(['coalfield', 'mining_height_m', 'depth_m', 'panel_width_m', 'hard_rock_ratio', 'advance_rate_m_d', 'overburden_ucs_MPa', 'H_wcfz_m'], rows)
    },
  },
  {
    id: 'backfill',
    topic: 'Green mining & CO2 mineralisation',
    title: 'UCS of CO2-carbonated fly-ash backfill',
    description: 'Predict the uniaxial compressive strength of coal-based solid-waste backfill from mix design and carbonation curing.',
    config: { task: 'regression', target: 'UCS_MPa', features: ['binder_pct', 'fly_ash_pct', 'gangue_pct', 'water_solid', 'co2_curing_h', 'co2_pressure_MPa', 'age_d'], groupColumn: 'batch', split: { kind: 'group', testFraction: 0.2, folds: 5 }, models: ['dummy', 'linear', 'rf', 'hgb', 'xgb', 'lgbm', 'mlp_sk', 'dnn'] },
    guidance: [
      'Specimens cast from one batch share errors: split by batch, not by specimen.',
      'Mix proportions that sum to 100% are collinear — drop one or use ratios.',
      'Use partial dependence to discuss the optimal carbonation time and report CO2 uptake alongside strength.',
    ],
    demo: (seed) => {
      const rand = rng(seed)
      const rows: (string | number)[][] = []
      for (let b = 0; b < 40; b++) {
        const binder = 4 + rand() * 12
        const fa = 20 + rand() * 40
        const ws = 0.25 + rand() * 0.2
        const curing = [0, 2, 6, 12, 24, 48][Math.floor(rand() * 6)]
        const press = curing ? 0.1 + rand() * 0.4 : 0
        for (const age of [3, 7, 14, 28]) {
          for (let rep = 0; rep < 2; rep++) {
            const ucs = (0.35 * binder + 0.02 * fa) * (1 - 1.2 * (ws - 0.3)) * Math.log(1 + age) * (1 + 0.35 * (1 - Math.exp(-curing / 10)) - 0.004 * Math.max(0, curing - 24)) * (1 + 0.3 * press) + 0.25 * gauss(rand)
            rows.push([`B${b + 1}`, r2(binder), r2(fa), r2(100 - binder - fa), r2(ws), curing, r2(press), age, r2(Math.max(0.2, ucs))])
          }
        }
      }
      return csv(['batch', 'binder_pct', 'fly_ash_pct', 'gangue_pct', 'water_solid', 'co2_curing_h', 'co2_pressure_MPa', 'age_d', 'UCS_MPa'], rows)
    },
  },
  {
    id: 'irae',
    topic: 'Infrared radiation & acoustic emission',
    title: 'Failure precursor recognition from IR and AE sequences',
    description: 'Classify whether a loading step is in the pre-failure stage from synchronous infrared-radiation and acoustic-emission sequences (sequence models).',
    config: {
      task: 'classification',
      target: 'stage',
      classOrder: ['stable', 'pre-failure'],
      features: ['airt_change_C', 'ir_variance', 'ae_counts', 'ae_energy', 'b_value'],
      sequence: { orderColumn: 'time_s', seriesColumn: 'specimen', window: 8 },
      split: { kind: 'group', testFraction: 0.25, folds: 4 },
      models: ['dummy', 'rf', 'xgb', 'dnn', 'cnn1d'],
      dl: { epochs: 40, batchSize: 64, learningRate: 0.002, patience: 8, hidden: [32], dropout: 0.2 },
    },
    guidance: [
      'Windows from one specimen are strongly correlated: always split by specimen.',
      'Correct IR data for background thermal noise and state the camera, emissivity and frame rate.',
      'Report how early before failure the precursor is detected (lead time), not only accuracy.',
      'Relate important features to physics: IR variance and b-value drop with crack coalescence.',
    ],
    demo: (seed) => {
      const rand = rng(seed)
      const rows: (string | number)[][] = []
      for (let s = 0; s < 14; s++) {
        const steps = 50 + Math.floor(rand() * 30)
        const lith = rand() < 0.5 ? 'sandstone' : 'coal'
        let airt = 0
        for (let t = 0; t < steps; t++) {
          const u = t / steps
          const pre = u > 0.82
          airt += 0.002 + (pre ? 0.02 : 0) + 0.004 * gauss(rand)
          const irVar = 0.02 + 0.3 * u ** 6 + 0.01 * Math.abs(gauss(rand))
          const counts = Math.round(Math.max(0, 20 + 900 * u ** 5 + 40 * gauss(rand)))
          const energy = r2(Math.max(0, counts * (0.5 + 2 * u ** 4) * (1 + 0.3 * gauss(rand))))
          const b = r2(1.4 - 0.6 * u ** 3 + 0.08 * gauss(rand))
          rows.push([`S${s + 1}`, lith, t, r2(airt), Math.round(irVar * 1e4) / 1e4, counts, energy, b, pre ? 'pre-failure' : 'stable'])
        }
      }
      return csv(['specimen', 'lithology', 'time_s', 'airt_change_C', 'ir_variance', 'ae_counts', 'ae_energy', 'b_value', 'stage'], rows)
    },
  },
]

export const DEFAULT_CONFIG: ExperimentConfig = {
  task: 'classification',
  target: '',
  features: [],
  split: { kind: 'random', testFraction: 0.2, folds: 5 },
  seed: 42,
  classWeight: true,
  tuning: { enabled: false, iterations: 15 },
  models: ['dummy', 'linear', 'rf', 'hgb'],
  dl: { epochs: 150, batchSize: 32, learningRate: 0.001, patience: 15, hidden: [64, 32], dropout: 0.2 },
}

/** A full configuration from a template's partial one. */
export function configFor(t?: LabTemplate): ExperimentConfig {
  return { ...DEFAULT_CONFIG, ...t?.config, split: { ...DEFAULT_CONFIG.split, ...t?.config.split }, dl: { ...DEFAULT_CONFIG.dl, ...t?.config.dl } } as ExperimentConfig
}
