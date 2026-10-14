// CSV import, column typing, descriptive statistics, and the numeric design matrix shared by all engines.
import type { Cell, ColumnInfo, ExperimentConfig, Prepared, Table } from './types'

export function parseCsv(text: string, name = 'data'): Table {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === delim) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      records.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    records.push(row)
  }
  const nonEmpty = records.filter((r) => r.some((v) => v.trim() !== ''))
  if (nonEmpty.length < 2) throw new Error('The file needs a header row and at least one data row.')
  const header = nonEmpty[0].map((h, i) => h.trim() || `column_${i + 1}`)
  const body = nonEmpty.slice(1)
  // A decimal comma is common in European/Indonesian exports when the delimiter is ";".
  const decimalComma = delim === ';'
  const columns: ColumnInfo[] = header.map((name, j) => {
    const values = body.map((r) => (r[j] ?? '').trim())
    const present = values.filter((v) => v !== '' && !/^(na|nan|null|-)$/i.test(v))
    const numeric = present.length > 0 && present.every((v) => isNumber(v, decimalComma))
    return { name, kind: numeric ? 'numeric' : 'categorical', missing: values.length - present.length, unique: new Set(present).size }
  })
  const rows: Cell[][] = body.map((r) =>
    columns.map((col, j) => {
      const v = (r[j] ?? '').trim()
      if (v === '' || /^(na|nan|null|-)$/i.test(v)) return null
      return col.kind === 'numeric' ? toNumber(v, decimalComma) : v
    }),
  )
  return { name, columns, rows }
}

function isNumber(v: string, decimalComma: boolean): boolean {
  return Number.isFinite(toNumber(v, decimalComma))
}

function toNumber(v: string, decimalComma: boolean): number {
  return Number(decimalComma ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,(?=\d{3}\b)/g, ''))
}

export function tableToCsv(t: Table): string {
  const esc = (v: Cell) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  return [t.columns.map((c) => esc(c.name)).join(','), ...t.rows.map((r) => r.map(esc).join(','))].join('\n')
}

export interface NumericSummary {
  name: string
  n: number
  missing: number
  mean: number
  std: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  skew: number
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function summarize(t: Table, columns: string[]): NumericSummary[] {
  return columns
    .map((name) => t.columns.findIndex((c) => c.name === name))
    .filter((j) => j >= 0 && t.columns[j].kind === 'numeric')
    .map((j) => {
      const v = t.rows.map((r) => r[j]).filter((x): x is number => typeof x === 'number')
      const n = v.length
      const mean = v.reduce((s, x) => s + x, 0) / n
      const std = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1))
      const sorted = [...v].sort((a, b) => a - b)
      const skew = std > 0 ? v.reduce((s, x) => s + ((x - mean) / std) ** 3, 0) / n : 0
      return { name: t.columns[j].name, n, missing: t.rows.length - n, mean, std, min: sorted[0], q1: quantile(sorted, 0.25), median: quantile(sorted, 0.5), q3: quantile(sorted, 0.75), max: sorted[n - 1], skew }
    })
}

/** Pearson correlation matrix over rows where both values are present. */
export function correlation(t: Table, columns: string[]): number[][] {
  const idx = columns.map((c) => t.columns.findIndex((x) => x.name === c))
  return idx.map((a) =>
    idx.map((b) => {
      const pairs = t.rows.map((r) => [r[a], r[b]]).filter((p): p is [number, number] => typeof p[0] === 'number' && typeof p[1] === 'number')
      const n = pairs.length
      if (n < 3) return NaN
      const ma = pairs.reduce((s, p) => s + p[0], 0) / n
      const mb = pairs.reduce((s, p) => s + p[1], 0) / n
      let sab = 0
      let saa = 0
      let sbb = 0
      for (const [x, y] of pairs) {
        sab += (x - ma) * (y - mb)
        saa += (x - ma) ** 2
        sbb += (y - mb) ** 2
      }
      return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN
    }),
  )
}

/**
 * Builds the numeric matrix: categorical features one-hot encoded (category set from the whole table), missing values
 * kept as null for per-fold imputation, rows without a target dropped. Sequence experiments become sliding windows
 * within each series.
 */
export function prepare(t: Table, c: ExperimentConfig): Prepared {
  const col = (name: string) => t.columns.findIndex((x) => x.name === name)
  const ti = col(c.target)
  if (ti < 0) throw new Error(`Target column "${c.target}" not found.`)
  const notes: string[] = []

  const featureNames: string[] = []
  const featureSource: string[] = []
  const encoders: ((r: Cell[]) => (number | null)[])[] = []
  for (const f of c.features) {
    const j = col(f)
    if (j < 0 || j === ti) continue
    if (t.columns[j].kind === 'numeric') {
      featureNames.push(f)
      featureSource.push(f)
      encoders.push((r) => [typeof r[j] === 'number' ? (r[j] as number) : null])
    } else {
      const cats = [...new Set(t.rows.map((r) => r[j]).filter((v) => v != null).map(String))].sort()
      if (cats.length > 30) notes.push(`"${f}" has ${cats.length} categories; consider grouping rare ones.`)
      for (const cat of cats) {
        featureNames.push(`${f}=${cat}`)
        featureSource.push(f)
      }
      encoders.push((r) => (r[j] == null ? cats.map(() => null) : cats.map((cat) => (String(r[j]) === cat ? 1 : 0))))
    }
  }
  if (!featureNames.length) throw new Error('Choose at least one feature.')

  let rowIdx = t.rows.map((_, i) => i).filter((i) => t.rows[i][ti] != null)
  const dropped = t.rows.length - rowIdx.length
  if (dropped) notes.push(`${dropped} row(s) without a target value were excluded.`)

  let classes: string[] = []
  let yOf: (i: number) => number
  if (c.task === 'classification') {
    const order = c.classOrder ?? []
    const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length)
    classes = [...new Set(rowIdx.map((i) => String(t.rows[i][ti])))].sort(
      (a, b) => rank(a) - rank(b) || (isNaN(Number(a)) || isNaN(Number(b)) ? a.localeCompare(b) : Number(a) - Number(b)),
    )
    if (classes.length < 2) throw new Error('The target needs at least two classes.')
    if (classes.length > 20) notes.push(`The target has ${classes.length} classes; is this really a classification task?`)
    yOf = (i) => classes.indexOf(String(t.rows[i][ti]))
  } else {
    if (t.columns[ti].kind !== 'numeric') throw new Error('Regression needs a numeric target.')
    yOf = (i) => t.rows[i][ti] as number
  }
  const encode = (i: number) => encoders.flatMap((e) => e(t.rows[i]))
  const gi = c.groupColumn ? col(c.groupColumn) : -1

  if (!c.sequence) {
    return {
      X: rowIdx.map(encode),
      y: rowIdx.map(yOf),
      featureNames,
      featureSource,
      classes,
      sourceRow: rowIdx,
      groups: gi >= 0 ? rowIdx.map((i) => (t.rows[i][gi] ?? 'NA') as string | number) : undefined,
      notes,
    }
  }

  // Sequences: windows of `w` consecutive rows within one series, labelled by the target at the window end.
  const { orderColumn, seriesColumn, window: w } = c.sequence
  const oi = col(orderColumn)
  const si = col(seriesColumn)
  if (oi < 0 || si < 0) throw new Error('Choose the order and series columns for sequence models.')
  const bySeries = new Map<string, number[]>()
  for (const i of t.rows.map((_, k) => k)) {
    const key = String(t.rows[i][si] ?? 'NA')
    bySeries.set(key, [...(bySeries.get(key) ?? []), i])
  }
  const X: (number | null)[][] = []
  const y: number[] = []
  const sourceRow: number[] = []
  const groups: string[] = []
  const valid = new Set(rowIdx)
  for (const [key, idx] of bySeries) {
    idx.sort((a, b) => Number(t.rows[a][oi]) - Number(t.rows[b][oi]))
    for (let k = w - 1; k < idx.length; k++) {
      const end = idx[k]
      if (!valid.has(end)) continue
      X.push(idx.slice(k - w + 1, k + 1).flatMap(encode))
      y.push(yOf(end))
      sourceRow.push(end)
      groups.push(key)
    }
  }
  if (!X.length) throw new Error(`No series is at least ${w} rows long.`)
  notes.push(`${X.length} windows of ${w} steps from ${bySeries.size} series ("${seriesColumn}", ordered by "${orderColumn}").`)
  rowIdx = sourceRow
  return {
    X,
    y,
    featureNames: Array.from({ length: w }, (_, s) => featureNames.map((f) => `${f}@t-${w - 1 - s}`)).flat(),
    featureSource: Array.from({ length: w }, () => featureSource).flat(),
    classes,
    sequenceShape: [w, featureNames.length],
    sourceRow,
    groups,
    notes,
  }
}
