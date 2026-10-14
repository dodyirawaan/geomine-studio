// PRISMA 2020 flow counts and diagram, computed from the project's records.
import type { ReviewProject } from './types'

export interface PrismaCounts {
  identified: number
  /** Records retrieved per database. */
  byDatabase: [string, number][]
  queries: number
  duplicates: number
  otherSources: number
  /** Of the other sources: found by citation chasing. */
  citationSearching: number
  screened: number
  excludedTA: number
  awaitingTA: number
  soughtFT: number
  excludedFT: number
  ftReasons: [string, number][]
  awaitingFT: number
  included: number
}

export function prismaCounts(p: ReviewProject, needsFullText: boolean): PrismaCounts {
  const fromSearch = p.records.filter((r) => !r.manual)
  const runs = [...p.searches, ...(p.imports ?? [])]
  const identified = runs.reduce((n, s) => n + s.fetched, 0)
  const dbMap = new Map<string, number>()
  for (const s of runs) dbMap.set(s.database ?? 'OpenAlex', (dbMap.get(s.database ?? 'OpenAlex') ?? 0) + s.fetched)
  const records = p.records
  const ta = records.filter((r) => r.ta === 'include')
  const excludedTA = records.filter((r) => r.ta === 'exclude').length
  const awaitingTA = records.filter((r) => !r.ta || r.ta === 'maybe').length
  const excludedFT = needsFullText ? ta.filter((r) => r.ft === 'exclude').length : 0
  const reasons = new Map<string, number>()
  if (needsFullText) for (const r of ta.filter((x) => x.ft === 'exclude')) reasons.set(r.ftReason?.trim() || 'Other', (reasons.get(r.ftReason?.trim() || 'Other') ?? 0) + 1)
  const included = needsFullText ? ta.filter((r) => r.ft === 'include').length : ta.length
  return {
    identified,
    byDatabase: [...dbMap.entries()],
    queries: runs.length,
    duplicates: Math.max(0, identified - fromSearch.length),
    otherSources: records.filter((r) => r.manual).length,
    citationSearching: records.filter((r) => r.manual && (r.via === 'backward' || r.via === 'forward')).length,
    screened: records.length,
    excludedTA,
    awaitingTA,
    soughtFT: needsFullText ? ta.length : 0,
    excludedFT,
    ftReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]),
    awaitingFT: needsFullText ? ta.filter((r) => !r.ft).length : 0,
    included,
  }
}

export function includedRecords(p: ReviewProject, needsFullText: boolean) {
  return p.records.filter((r) => r.ta === 'include' && (!needsFullText || r.ft === 'include'))
}

function otherLines(c: PrismaCounts): string[] {
  const other = c.otherSources - c.citationSearching
  return [...(c.citationSearching ? [`Citation searching (n = ${c.citationSearching})`] : []), ...(other ? [`Other sources (n = ${other})`] : [])]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** PRISMA 2020 flow diagram as standalone SVG (black on white, ready for a manuscript figure). */
export function prismaSvg(c: PrismaCounts, needsFullText: boolean, label = 'PRISMA 2020'): string {
  const W = 760
  const box = (x: number, y: number, w: number, h: number, lines: string[], bold = false) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#fff" stroke="#1c1917" stroke-width="1.5"/>` +
    lines.map((l, i) => `<text x="${x + 12}" y="${y + 22 + i * 18}" font-size="13" ${bold && i === 0 ? 'font-weight="600"' : ''} fill="#1c1917">${esc(l)}</text>`).join('')
  const arrow = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1c1917" stroke-width="1.5" marker-end="url(#ah)"/>`
  const stage = (y: number, h: number, t: string) => `<rect x="8" y="${y}" width="26" height="${h}" rx="4" fill="#fde68a"/><text transform="translate(26 ${y + h / 2}) rotate(-90)" text-anchor="middle" font-size="12" font-weight="600" fill="#1c1917">${t}</text>`
  const parts: string[] = []
  const L = 50
  const R = 430
  const bw = 330
  let y = 16
  parts.push(stage(y, Math.max(92, 40 + (c.byDatabase.length + otherLines(c).length) * 18), 'Identification'))
  const dbLines = c.byDatabase.map(([d, n]) => `  ${d} (n = ${n})`)
  const idH = Math.max(92, 40 + (dbLines.length + otherLines(c).length) * 18)
  parts.push(box(L, y, bw, idH, [`Records identified (n = ${c.identified})`, ...dbLines, ...otherLines(c)], true))
  parts.push(box(R, y, bw, 70, ['Records removed before screening:', `  Duplicates (n = ${c.duplicates})`]))
  parts.push(arrow(L + bw, y + 35, R, y + 35))
  const idBottom = Math.max(92, 40 + (c.byDatabase.length + otherLines(c).length) * 18)
  parts.push(arrow(L + bw / 2, y + idBottom, L + bw / 2, y + idBottom + 30))
  y += idBottom + 30
  const screenH = needsFullText ? 236 : 130
  parts.push(stage(y, screenH, 'Screening'))
  parts.push(box(L, y, bw, 50, [`Records screened (n = ${c.screened})`], true))
  parts.push(box(R, y, bw, 50, [`Records excluded (n = ${c.excludedTA})`, ...(c.awaitingTA ? [`Not yet screened (n = ${c.awaitingTA})`] : [])]))
  parts.push(arrow(L + bw, y + 25, R, y + 25))
  parts.push(arrow(L + bw / 2, y + 50, L + bw / 2, y + 80))
  y += 80
  if (needsFullText) {
    parts.push(box(L, y, bw, 50, [`Reports assessed for eligibility (n = ${c.soughtFT})`], true))
    const reasonLines = c.ftReasons.slice(0, 5).map(([r, n]) => `  ${r.length > 34 ? r.slice(0, 33) + '…' : r} (n = ${n})`)
    const rh = 40 + reasonLines.length * 18 + (c.awaitingFT ? 18 : 0)
    parts.push(box(R, y, bw, Math.max(50, rh), [`Reports excluded (n = ${c.excludedFT})`, ...reasonLines, ...(c.awaitingFT ? [`Not yet assessed (n = ${c.awaitingFT})`] : [])]))
    parts.push(arrow(L + bw, y + 25, R, y + 25))
    parts.push(arrow(L + bw / 2, y + 50, L + bw / 2, y + 106))
    y += 106
  }
  parts.push(stage(y, 60, 'Included'))
  parts.push(box(L, y, bw, 60, [`Studies included in the review (n = ${c.included})`], true))
  const H = y + 76
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="${esc(label)} flow diagram"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" fill="#1c1917"/></marker></defs><rect width="${W}" height="${H}" fill="#fff"/>${parts.join('')}</svg>`
}
