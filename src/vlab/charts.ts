// SVG charts for lab reports. They use CSS custom properties (--viz-*) so the same markup works in the app and in
// the exported HTML report, in light and dark mode. Every mark carries data-tip text for the hover tooltip, and
// every chart in the report is paired with a table of the same numbers.

const W = 640
const F = 'font-family="system-ui,-apple-system,Segoe UI,sans-serif"'

export const SERIES = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)', 'var(--viz-8)']

export const VIZ_CSS = `
.viz{--viz-1:#2a78d6;--viz-2:#eb6834;--viz-3:#1baf7a;--viz-4:#eda100;--viz-5:#e87ba4;--viz-6:#008300;--viz-7:#6250d6;--viz-8:#e34948;
--viz-surface:#ffffff;--viz-ink:#0b0b0b;--viz-ink2:#52514e;--viz-muted:#898781;--viz-grid:#e1e0d9;--viz-axis:#c3c2b7;
--viz-seq0:#f3f8fe;--viz-seq1:#cde2fb;--viz-seq2:#9ec5f4;--viz-seq3:#5598e7;--viz-seq4:#256abf;--viz-seq5:#104281;
--viz-neg:#d03b3b;--viz-mid:#f0efec}
@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])) .viz{--viz-1:#3987e5;--viz-2:#d95926;--viz-3:#199e70;--viz-4:#c98500;--viz-5:#d55181;--viz-6:#008300;--viz-7:#9085e9;--viz-8:#e66767;
--viz-surface:#1c1917;--viz-ink:#f0efec;--viz-ink2:#c3c2b7;--viz-muted:#898781;--viz-grid:#2c2c2a;--viz-axis:#383835;
--viz-seq0:#1e2a3a;--viz-seq1:#1c3a5f;--viz-seq2:#184f95;--viz-seq3:#256abf;--viz-seq4:#5598e7;--viz-seq5:#b7d3f6;--viz-neg:#e66767;--viz-mid:#383835}}
.viz svg{max-width:100%;height:auto;display:block}
.viz [data-tip]{cursor:default}
.viz [data-tip]:hover{opacity:.8}
`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Clean tick values covering [lo, hi]. */
function ticks(lo: number, hi: number, n = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const raw = (hi - lo) / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  // Round outwards so the axis always covers every data value.
  const out: number[] = []
  const end = Math.ceil(hi / step - 1e-9) * step
  for (let v = Math.floor(lo / step + 1e-9) * step; v <= end + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (Number.isInteger(v)) return v.toLocaleString('en-US')
  if (a >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (a >= 100) return v.toFixed(1)
  if (a === 0) return '0'
  return Number(v.toPrecision(digits)).toString()
}

/** Rounded data-end bar path (4px radius at the far end, square at the baseline). */
function hbar(x0: number, x1: number, y: number, h: number): string {
  const r = Math.min(4, Math.abs(x1 - x0) / 2, h / 2)
  if (x1 >= x0) return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`
  return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`
}

export interface BarItem {
  label: string
  value: number
  error?: number
  /** Index into the categorical palette; default 0. */
  color?: number
  tip?: string
}

/** Horizontal bars with optional ± error whiskers, for model comparison and importance. */
export function barChart(items: BarItem[], opts: { title: string; xLabel: string; min?: number }): string {
  const rowH = 30
  const left = 190
  const right = 70
  const top = 34
  const h = top + items.length * rowH + 40
  const lo = Math.min(opts.min ?? 0, ...items.map((i) => i.value - (i.error ?? 0)))
  const hi = Math.max(0, ...items.map((i) => i.value + (i.error ?? 0)))
  const tk = ticks(lo, hi)
  const x0 = tk[0]
  const x1 = tk[tk.length - 1]
  const sx = (v: number) => left + ((v - x0) / (x1 - x0 || 1)) * (W - left - right)
  const base = sx(Math.max(x0, Math.min(0, x1)))
  const grid = tk.map((t) => `<line x1="${sx(t)}" x2="${sx(t)}" y1="${top - 6}" y2="${h - 34}" stroke="var(--viz-grid)" stroke-width="1"/><text x="${sx(t)}" y="${h - 18}" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${fmt(t)}</text>`).join('')
  const bars = items
    .map((it, i) => {
      const y = top + i * rowH + 4
      const bh = Math.min(20, rowH - 10)
      const color = SERIES[(it.color ?? 0) % SERIES.length]
      const tip = esc(it.tip ?? `${it.label}: ${fmt(it.value)}${it.error ? ` ± ${fmt(it.error)}` : ''}`)
      const err = it.error
        ? `<line x1="${sx(it.value - it.error)}" x2="${sx(it.value + it.error)}" y1="${y + bh / 2}" y2="${y + bh / 2}" stroke="var(--viz-ink2)" stroke-width="1.5"/><line x1="${sx(it.value - it.error)}" x2="${sx(it.value - it.error)}" y1="${y + 4}" y2="${y + bh - 4}" stroke="var(--viz-ink2)" stroke-width="1.5"/><line x1="${sx(it.value + it.error)}" x2="${sx(it.value + it.error)}" y1="${y + 4}" y2="${y + bh - 4}" stroke="var(--viz-ink2)" stroke-width="1.5"/>`
        : ''
      const labelX = it.value >= 0 ? Math.max(sx(it.value), sx(it.value + (it.error ?? 0))) + 6 : Math.min(sx(it.value), sx(it.value - (it.error ?? 0))) - 6
      return `<g data-tip="${tip}"><rect x="0" y="${y - 4}" width="${W}" height="${rowH}" fill="transparent"/><text x="${left - 8}" y="${y + bh / 2 + 4}" text-anchor="end" font-size="12" fill="var(--viz-ink)" ${F}>${esc(it.label.length > 28 ? it.label.slice(0, 27) + '…' : it.label)}</text><path d="${hbar(base, sx(it.value), y, bh)}" fill="${color}"/>${err}<text x="${labelX}" y="${y + bh / 2 + 4}" text-anchor="${it.value >= 0 ? 'start' : 'end'}" font-size="11" fill="var(--viz-ink2)" ${F}>${fmt(it.value)}</text></g>`
    })
    .join('')
  return `<svg viewBox="0 0 ${W} ${h}" width="${W}" role="img" aria-label="${esc(opts.title)}"><text x="0" y="16" font-size="13" font-weight="600" fill="var(--viz-ink)" ${F}>${esc(opts.title)}</text>${grid}<line x1="${base}" x2="${base}" y1="${top - 6}" y2="${h - 34}" stroke="var(--viz-axis)" stroke-width="1"/>${bars}<text x="${(left + W - right) / 2}" y="${h - 2}" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${esc(opts.xLabel)}</text></svg>`
}

export interface Series {
  name: string
  x: number[]
  y: number[]
  dashed?: boolean
}

/** Line chart with a legend for ≥ 2 series; optional diagonal reference (ROC). */
export function lineChart(series: Series[], opts: { title: string; xLabel: string; yLabel: string; diagonal?: boolean; yMin?: number; yMax?: number; xMin?: number; xMax?: number }): string {
  const left = 56
  const right = 16
  const top = 34
  const legendH = series.length > 1 ? 20 * Math.ceil(series.length / 3) : 0
  const plotH = 240
  const h = top + plotH + 56 + legendH
  const xs = series.flatMap((s) => s.x).filter(Number.isFinite)
  const ys = series.flatMap((s) => s.y).filter(Number.isFinite)
  const xt = ticks(opts.xMin ?? Math.min(...xs), opts.xMax ?? Math.max(...xs))
  const yt = ticks(opts.yMin ?? Math.min(...ys), opts.yMax ?? Math.max(...ys))
  const sx = (v: number) => left + ((v - xt[0]) / (xt[xt.length - 1] - xt[0] || 1)) * (W - left - right)
  const sy = (v: number) => top + plotH - ((v - yt[0]) / (yt[yt.length - 1] - yt[0] || 1)) * plotH
  const grid =
    yt.map((t) => `<line x1="${left}" x2="${W - right}" y1="${sy(t)}" y2="${sy(t)}" stroke="var(--viz-grid)" stroke-width="1"/><text x="${left - 6}" y="${sy(t) + 4}" text-anchor="end" font-size="11" fill="var(--viz-muted)" ${F}>${fmt(t)}</text>`).join('') +
    xt.map((t) => `<text x="${sx(t)}" y="${top + plotH + 16}" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${fmt(t)}</text>`).join('')
  const diag = opts.diagonal ? `<line x1="${sx(xt[0])}" y1="${sy(yt[0])}" x2="${sx(xt[xt.length - 1])}" y2="${sy(yt[yt.length - 1])}" stroke="var(--viz-axis)" stroke-width="1"/>` : ''
  const lines = series
    .map((s, i) => {
      const pts = s.x.map((x, k) => [x, s.y[k]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      const d = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('')
      const color = SERIES[i % SERIES.length]
      const hits = pts
        .filter((_, k) => pts.length <= 60 || k % Math.ceil(pts.length / 60) === 0)
        .map(([x, y]) => `<circle cx="${sx(x)}" cy="${sy(y)}" r="7" fill="transparent" data-tip="${esc(`${s.name} — ${opts.xLabel}: ${fmt(x)}, ${opts.yLabel}: ${fmt(y)}`)}"/>`)
        .join('')
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="6 4"' : ''}/>${hits}`
    })
    .join('')
  const legend =
    series.length > 1
      ? series
          .map((s, i) => {
            const col = i % 3
            const row = Math.floor(i / 3)
            const x = left + col * 190
            const y = top + plotH + 58 + row * 20
            return `<line x1="${x}" x2="${x + 18}" y1="${y - 4}" y2="${y - 4}" stroke="${SERIES[i % SERIES.length]}" stroke-width="3"${s.dashed ? ' stroke-dasharray="6 4"' : ''}/><text x="${x + 24}" y="${y}" font-size="11" fill="var(--viz-ink2)" ${F}>${esc(s.name.length > 26 ? s.name.slice(0, 25) + '…' : s.name)}</text>`
          })
          .join('')
      : ''
  return `<svg viewBox="0 0 ${W} ${h}" width="${W}" role="img" aria-label="${esc(opts.title)}"><text x="0" y="16" font-size="13" font-weight="600" fill="var(--viz-ink)" ${F}>${esc(opts.title)}</text>${grid}<line x1="${left}" x2="${W - right}" y1="${top + plotH}" y2="${top + plotH}" stroke="var(--viz-axis)" stroke-width="1"/>${diag}${lines}<text x="${(left + W - right) / 2}" y="${top + plotH + 32}" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${esc(opts.xLabel)}</text><text transform="translate(12 ${top + plotH / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${esc(opts.yLabel)}</text>${legend}</svg>`
}

/** Predicted vs. observed with the 1:1 line. */
export function parityChart(obs: number[], pred: number[], opts: { title: string; unit?: string }): string {
  const left = 56
  const top = 34
  const size = 300
  const all = [...obs, ...pred].filter(Number.isFinite)
  const t = ticks(Math.min(...all), Math.max(...all))
  const s = (v: number) => (v - t[0]) / (t[t.length - 1] - t[0] || 1)
  const sx = (v: number) => left + s(v) * size
  const sy = (v: number) => top + size - s(v) * size
  const grid = t.map((v) => `<line x1="${left}" x2="${left + size}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--viz-grid)"/><text x="${left - 6}" y="${sy(v) + 4}" text-anchor="end" font-size="11" fill="var(--viz-muted)" ${F}>${fmt(v)}</text><text x="${sx(v)}" y="${top + size + 16}" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${fmt(v)}</text>`).join('')
  const dots = obs.map((o, i) => `<circle cx="${sx(o)}" cy="${sy(pred[i])}" r="4" fill="var(--viz-1)" stroke="var(--viz-surface)" stroke-width="2" data-tip="${esc(`observed ${fmt(o)}, predicted ${fmt(pred[i])}${opts.unit ? ' ' + opts.unit : ''}`)}"/>`).join('')
  const unit = opts.unit ? ` (${opts.unit})` : ''
  return `<svg viewBox="0 0 ${left + size + 30} ${top + size + 44}" width="${left + size + 30}" role="img" aria-label="${esc(opts.title)}"><text x="0" y="16" font-size="13" font-weight="600" fill="var(--viz-ink)" ${F}>${esc(opts.title)}</text>${grid}<line x1="${sx(t[0])}" y1="${sy(t[0])}" x2="${sx(t[t.length - 1])}" y2="${sy(t[t.length - 1])}" stroke="var(--viz-axis)" stroke-width="1.5"/>${dots}<text x="${left + size / 2}" y="${top + size + 34}" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>Observed${esc(unit)}</text><text transform="translate(12 ${top + size / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>Predicted${esc(unit)}</text></svg>`
}

/** Histogram (residuals). */
export function histogram(values: number[], opts: { title: string; xLabel: string; bins?: number }): string {
  const v = values.filter(Number.isFinite)
  const nb = opts.bins ?? Math.min(20, Math.max(5, Math.round(Math.sqrt(v.length))))
  const lo = Math.min(...v)
  const hi = Math.max(...v)
  const width = (hi - lo) / nb || 1
  const counts = Array(nb).fill(0)
  v.forEach((x) => counts[Math.min(nb - 1, Math.floor((x - lo) / width))]++)
  const left = 44
  const top = 34
  const plotH = 180
  const plotW = W - left - 16
  const max = Math.max(...counts)
  const yt = ticks(0, max)
  const sy = (c: number) => top + plotH - (c / (yt[yt.length - 1] || 1)) * plotH
  const bw = plotW / nb
  const bars = counts
    .map((c, i) => {
      const x = left + i * bw + 1
      const y = sy(c)
      const r = Math.min(4, (bw - 2) / 2, (top + plotH - y) / 2)
      const w = bw - 2
      const d = c ? `M${x},${top + plotH}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${top + plotH}Z` : ''
      return `<g data-tip="${esc(`${fmt(lo + i * width)} to ${fmt(lo + (i + 1) * width)}: ${c}`)}"><rect x="${x}" y="${top}" width="${w}" height="${plotH}" fill="transparent"/><path d="${d}" fill="var(--viz-1)"/></g>`
    })
    .join('')
  const grid = yt.map((t) => `<line x1="${left}" x2="${W - 16}" y1="${sy(t)}" y2="${sy(t)}" stroke="var(--viz-grid)"/><text x="${left - 6}" y="${sy(t) + 4}" text-anchor="end" font-size="11" fill="var(--viz-muted)" ${F}>${fmt(t)}</text>`).join('')
  const xt = ticks(lo, hi).filter((t) => t >= lo && t <= hi)
  const xl = xt.map((t) => `<text x="${left + ((t - lo) / (hi - lo || 1)) * plotW}" y="${top + plotH + 16}" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${fmt(t)}</text>`).join('')
  return `<svg viewBox="0 0 ${W} ${top + plotH + 40}" width="${W}" role="img" aria-label="${esc(opts.title)}"><text x="0" y="16" font-size="13" font-weight="600" fill="var(--viz-ink)" ${F}>${esc(opts.title)}</text>${grid}${bars}<line x1="${left}" x2="${W - 16}" y1="${top + plotH}" y2="${top + plotH}" stroke="var(--viz-axis)"/>${xl}<text x="${left + plotW / 2}" y="${top + plotH + 34}" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${esc(opts.xLabel)}</text></svg>`
}

/**
 * Matrix heatmap. Sequential (counts, confusion matrix) uses one blue ramp; diverging (correlation, −1…1) uses
 * blue ↔ red around a neutral grey midpoint. Every cell is labelled, so colour never carries the value alone.
 */
export function heatmap(m: number[][], rows: string[], cols: string[], opts: { title: string; diverging?: boolean; rowTitle?: string; colTitle?: string }): string {
  const cell = Math.max(22, Math.min(54, Math.floor(420 / Math.max(rows.length, cols.length))))
  const left = 150
  const top = 70
  const flat = m.flat().filter(Number.isFinite)
  const max = Math.max(...flat.map(Math.abs), 1e-9)
  const seq = ['--viz-seq0', '--viz-seq1', '--viz-seq2', '--viz-seq3', '--viz-seq4', '--viz-seq5']
  const fill = (v: number) => {
    if (!Number.isFinite(v)) return 'var(--viz-mid)'
    if (opts.diverging) {
      const a = Math.min(1, Math.abs(v))
      if (a < 0.1) return 'var(--viz-mid)'
      return `color-mix(in oklab, ${v > 0 ? 'var(--viz-seq4)' : 'var(--viz-neg)'} ${Math.round(25 + a * 75)}%, var(--viz-mid))`
    }
    return `var(${seq[Math.min(5, Math.floor((v / max) * 5.999))]})`
  }
  const ink = (v: number) => (opts.diverging ? (Math.abs(v) > 0.6 ? '#fff' : 'var(--viz-ink)') : v / max > 0.55 ? '#fff' : 'var(--viz-ink)')
  const cells = m
    .map((row, i) =>
      row
        .map((v, j) => {
          const x = left + j * cell
          const y = top + i * cell
          const label = opts.diverging ? (Number.isFinite(v) ? v.toFixed(2) : '') : fmt(v)
          return `<g data-tip="${esc(`${rows[i]} × ${cols[j]}: ${label}`)}"><rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${fill(v)}"/>${cell >= 26 ? `<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" text-anchor="middle" font-size="${cell > 40 ? 12 : 10}" fill="${ink(v)}" ${F}>${label}</text>` : ''}</g>`
        })
        .join(''),
    )
    .join('')
  const rl = rows.map((r, i) => `<text x="${left - 8}" y="${top + i * cell + cell / 2 + 4}" text-anchor="end" font-size="11" fill="var(--viz-ink2)" ${F}>${esc(r.length > 22 ? r.slice(0, 21) + '…' : r)}</text>`).join('')
  const cl = cols.map((c, j) => `<text transform="translate(${left + j * cell + cell / 2} ${top - 8}) rotate(-35)" font-size="11" fill="var(--viz-ink2)" ${F}>${esc(c.length > 16 ? c.slice(0, 15) + '…' : c)}</text>`).join('')
  const w = left + cols.length * cell + 20
  const h = top + rows.length * cell + 30
  const axes = `${opts.colTitle ? `<text x="${left + (cols.length * cell) / 2}" y="${h - 6}" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${esc(opts.colTitle)}</text>` : ''}${opts.rowTitle ? `<text transform="translate(12 ${top + (rows.length * cell) / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="var(--viz-muted)" ${F}>${esc(opts.rowTitle)}</text>` : ''}`
  return `<svg viewBox="0 0 ${Math.max(w, 300)} ${h}" width="${Math.max(w, 300)}" role="img" aria-label="${esc(opts.title)}"><text x="0" y="16" font-size="13" font-weight="600" fill="var(--viz-ink)" ${F}>${esc(opts.title)}</text>${cl}${rl}${cells}${axes}</svg>`
}

/** Minimal tooltip for the exported HTML report: shows the data-tip text of the hovered mark. */
export const TOOLTIP_JS = `(() => { const t = document.createElement('div'); t.style.cssText = 'position:fixed;pointer-events:none;background:#1c1917;color:#f0efec;font:12px system-ui;padding:4px 8px;border-radius:4px;display:none;z-index:9;max-width:320px'; document.body.appendChild(t);
document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (!el) { t.style.display = 'none'; return } t.textContent = el.getAttribute('data-tip'); t.style.display = 'block' });
document.addEventListener('mousemove', (e) => { t.style.left = e.clientX + 12 + 'px'; t.style.top = e.clientY + 12 + 'px' }) })()`
