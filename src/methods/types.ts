// A Method is a calculator that also writes its own Methods-section paragraph.

export type Values = Record<string, number | string>

export interface NumberInput {
  kind: 'number'
  id: string
  label: string
  unit?: string
  default: number
  min?: number
  max?: number
  step?: number
  help?: string
  /** Typical values offered next to the field. */
  presets?: { label: string; value: number }[]
}

export interface SelectInput {
  kind: 'select'
  id: string
  label: string
  default: string
  options: { value: string; label: string }[]
  help?: string
}

export type MethodInput = NumberInput | SelectInput

export interface Output {
  label: string
  value: number | string
  unit?: string
  /** Shown larger, as the headline result. */
  main?: boolean
  note?: string
}

export interface Result {
  outputs: Output[]
  warnings: string[]
  /** Extra Markdown (e.g. a ground reaction curve table) appended to the Methods text. */
  table?: string
}

export type Category = 'Rock mass classification' | 'Strength & deformability' | 'Stress & rockburst' | 'Support design'

export interface Method {
  id: string
  name: string
  category: Category
  summary: string
  inputs: MethodInput[]
  /** Optional input groups for layout: [title, input ids]. */
  groups?: [string, string[]][]
  compute: (v: Values) => Result
  /** Methods-section prose for these inputs and results, citing with [@key]. */
  methodsText: (v: Values, r: Result) => string
  /** Keys from METHOD_REFS that the text cites. */
  refs: string[]
}

export function num(v: Values, id: string): number {
  const x = Number(v[id])
  return Number.isFinite(x) ? x : NaN
}

/** Rounds to `n` significant figures without trailing exponent notation for normal magnitudes. */
export function sig(x: number, n = 3): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x))))
  return Number(x.toFixed(Math.min(d, 6))).toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function defaults(m: Method): Values {
  return Object.fromEntries(m.inputs.map((i) => [i.id, i.default]))
}

export function optionLabel(m: Method, id: string, value: string | number): string {
  const inp = m.inputs.find((i) => i.id === id)
  if (inp?.kind !== 'select') return String(value)
  return inp.options.find((o) => o.value === String(value))?.label ?? String(value)
}
