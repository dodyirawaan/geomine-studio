// Shared types of the virtual lab: data, experiment configuration, engine outputs and evaluated results.

export type Cell = number | string | null

export interface ColumnInfo {
  name: string
  kind: 'numeric' | 'categorical'
  missing: number
  unique: number
}

export interface Table {
  name: string
  columns: ColumnInfo[]
  rows: Cell[][]
}

export type Task = 'classification' | 'regression'
export type SplitKind = 'random' | 'group' | 'time'

export interface SequenceConfig {
  /** Column that orders samples in time within a group (e.g. time, load step). */
  orderColumn: string
  /** Column identifying independent series (e.g. specimen, sensor, borehole). */
  seriesColumn: string
  window: number
}

export interface DlConfig {
  epochs: number
  batchSize: number
  learningRate: number
  patience: number
  hidden: number[]
  dropout: number
}

export interface ExperimentConfig {
  task: Task
  target: string
  /** Natural order of classes (e.g. none < light < moderate < strong); others follow alphabetically. */
  classOrder?: string[]
  features: string[]
  /** Group column: samples sharing a value never fall in both training and test (site, mine, specimen). */
  groupColumn?: string
  /** Column that orders samples for a temporal split. */
  timeColumn?: string
  split: { kind: SplitKind; testFraction: number; folds: number }
  seed: number
  classWeight: boolean
  tuning: { enabled: boolean; iterations: number }
  models: string[]
  sequence?: SequenceConfig
  dl: DlConfig
}

/** Numeric design matrix built from a table and a config; identical for every engine. */
export interface Prepared {
  X: (number | null)[][]
  y: number[]
  featureNames: string[]
  /** Original feature (before one-hot / windowing) each column comes from. */
  featureSource: string[]
  classes: string[]
  /** For sequence experiments: [window, channels]; X rows are window-major flattened. */
  sequenceShape?: [number, number]
  /** Row index in the source table of each sample (window end for sequences). */
  sourceRow: number[]
  groups?: (string | number)[]
  notes: string[]
}

export interface Splits {
  train: number[]
  test: number[]
  /** Validation indices of each CV fold, drawn from `train`. */
  folds: number[][]
  /** Training indices of each CV fold (for temporal splits, only samples before the fold). */
  foldTrain: number[][]
  description: string
}

/** What an engine returns for one model. */
export interface ModelOutput {
  id: string
  name: string
  engine: 'sklearn' | 'tfjs'
  /** Predictions on each CV fold's validation samples, in the order of `Splits.folds[f]`. */
  cv: { pred: number[]; proba?: number[][] }[]
  test: number[]
  testProba?: number[][]
  /** Original features the importance values refer to (one-hot columns and time steps grouped). */
  importanceFeatures?: string[]
  /** Grouped permutation importance on the test set: mean and std of the primary-score drop. */
  importance?: { mean: number[]; std: number[] }
  /** Mean |SHAP| per original feature (TreeSHAP for XGBoost/LightGBM). */
  shap?: number[]
  /** Partial dependence for the most important features. */
  pdp?: { feature: string; x: number[]; y: number[] }[]
  /** Training curves of deep models (final fit). */
  history?: { loss: number[]; valLoss: number[] }
  params: Record<string, unknown>
  foldParams?: Record<string, unknown>[]
  fitSeconds: number
  error?: string
}

export interface EngineInfo {
  name: string
  versions: Record<string, string>
}
