// Screening by two independent reviewers: each records a decision blind to the other; agreements become the final
// decision, disagreements are resolved by discussion (or a third reviewer), and agreement is reported as Cohen's kappa.
import type { Decision, DualScreening, ReviewProject, ReviewRecord } from './types'

export type Reviewer = 1 | 2

export const vote = (r: ReviewRecord, who: Reviewer) => (who === 1 ? r.ta1 : r.ta2)

/** The decision that counts for whoever screens in this browser: their own vote with two reviewers, else the final one. */
export function myDecision(p: ReviewProject): (r: ReviewRecord) => Decision | undefined {
  return p.dual?.enabled ? (r) => vote(r, p.dual!.active) : (r) => r.ta
}

/** A decision both reviewers made differently that has not been resolved yet. */
export const isConflict = (r: ReviewRecord) => !!r.ta1 && !!r.ta2 && r.ta1 !== r.ta2 && !r.taResolved

/** Final decision from the two votes: set when they agree, open otherwise (until resolved). */
function settle(r: ReviewRecord): ReviewRecord {
  if (r.taResolved || r.auto) return r
  const agreed = r.ta1 && r.ta1 === r.ta2 ? r.ta1 : undefined
  const reason = agreed ? (r.ta1Reason || r.ta2Reason || '') : undefined
  const out: ReviewRecord = { ...r, ta: agreed, taReason: reason }
  // Full-text decisions are kept while the title/abstract decision is open, so turning on dual screening loses nothing.
  if (agreed && agreed !== 'include') {
    out.ft = undefined
    out.ftReason = undefined
  }
  return out
}

/** Records one reviewer's decision; changing a vote reopens a resolved disagreement. */
export function castVote(r: ReviewRecord, who: Reviewer, d: Decision, reason = '', fromAi = false, stamp = !fromAi): ReviewRecord {
  // Only decisions made one by one in the app are time-stamped (they drive the stopping rule); bulk imports are not.
  const base = { ...r, auto: undefined, ...(stamp ? { decidedAt: Date.now() } : {}) }
  const next: ReviewRecord = who === 1 ? { ...base, ta1: d, ta1Reason: reason } : { ...base, ta2: d, ta2Reason: reason, ta2Ai: fromAi || undefined }
  if (vote(r, who) !== d) next.taResolved = undefined
  return settle(next)
}

/** Settles a disagreement with the decision reached by discussion or a third reviewer. */
export function resolveConflict(r: ReviewRecord, d: Decision, reason: string): ReviewRecord {
  const out: ReviewRecord = { ...r, ta: d, taReason: reason, taResolved: true }
  if (d !== 'include') {
    out.ft = undefined
    out.ftReason = undefined
  }
  return out
}

/** Turns dual screening on: decisions made so far count as reviewer 1's. */
export function enableDual(p: ReviewProject, names: [string, string]): Pick<ReviewProject, 'records' | 'dual'> {
  return {
    dual: { enabled: true, names, active: p.dual?.active ?? 1 },
    records: p.records.map((r) => settle(r.ta1 || !r.ta ? r : { ...r, ta1: r.ta, ta1Reason: r.taReason })),
  }
}

/** Back to single screening: the final decision is kept, or reviewer 1's where there is none. */
export function disableDual(p: ReviewProject): Pick<ReviewProject, 'records' | 'dual'> {
  return {
    dual: { ...(p.dual as DualScreening), enabled: false },
    records: p.records.map((r) => (r.ta || !r.ta1 ? r : { ...r, ta: r.ta1, taReason: r.ta1Reason })),
  }
}

export interface Agreement {
  /** Records decided by both reviewers. */
  n: number
  agreed: number
  /** Observed proportion of agreement. */
  po: number
  kappa: number
  /** 95% confidence interval (large-sample standard error). */
  ci: [number, number]
  /** Reviewer 1 decision → reviewer 2 decision → count. */
  table: Record<Decision, Record<Decision, number>>
  conflicts: number
  resolved: number
}

export const DECISIONS: Decision[] = ['include', 'exclude', 'maybe']

/** Cohen's kappa for the title/abstract decisions of the two reviewers. */
export function agreement(records: ReviewRecord[]): Agreement {
  const both = records.filter((r) => r.ta1 && r.ta2)
  const table = Object.fromEntries(DECISIONS.map((a) => [a, Object.fromEntries(DECISIONS.map((b) => [b, 0]))])) as Agreement['table']
  for (const r of both) table[r.ta1!][r.ta2!]++
  const n = both.length
  const agreed = DECISIONS.reduce((s, d) => s + table[d][d], 0)
  const po = n ? agreed / n : 0
  const pe = n ? DECISIONS.reduce((s, d) => s + (DECISIONS.reduce((a, x) => a + table[d][x], 0) / n) * (DECISIONS.reduce((a, x) => a + table[x][d], 0) / n), 0) : 0
  const kappa = pe < 1 ? (po - pe) / (1 - pe) : po === 1 ? 1 : 0
  const se = n && pe < 1 ? Math.sqrt((po * (1 - po)) / (n * (1 - pe) ** 2)) : 0
  return {
    n,
    agreed,
    po,
    kappa,
    ci: [Math.max(-1, kappa - 1.96 * se), Math.min(1, kappa + 1.96 * se)],
    table,
    conflicts: records.filter(isConflict).length,
    resolved: records.filter((r) => r.taResolved).length,
  }
}

/** Landis and Koch (1977) benchmarks. */
export function kappaLabel(k: number): string {
  if (k < 0) return 'poor'
  if (k <= 0.2) return 'slight'
  if (k <= 0.4) return 'fair'
  if (k <= 0.6) return 'moderate'
  if (k <= 0.8) return 'substantial'
  return 'almost perfect'
}

// ---------- blind sheet for a reviewer working outside the app ----------

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV for the other reviewer (opens in Excel): records without that reviewer's decision, with no other decisions shown. */
export function blindSheet(p: ReviewProject, who: Reviewer): string {
  const codes = p.protocol.exclusion.map((_, i) => `E${i + 1}`).join('/')
  const head = ['id', 'title', 'authors', 'year', 'venue', 'doi', 'abstract', 'decision (include/exclude/maybe)', `reason (e.g. ${codes || 'criterion'})`]
  const rows = p.records.filter((r) => !vote(r, who)).map((r) => [r.id, r.meta.title, r.meta.authors.slice(0, 6).join('; '), r.meta.year, r.meta.venue, r.meta.doi, r.meta.abstract, '', ''].map(cell).join(','))
  // The byte-order mark makes Excel read the file as UTF-8.
  return '\uFEFF' + [head.join(','), ...rows].join('\r\n')
}

/** Minimal CSV parser (quotes, doubled quotes, newlines in cells); the delimiter is guessed from the header. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '')
  const first = t.slice(0, t.search(/\r?\n|$/))
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === delim) {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += c
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows.filter((r) => r.some((x) => x.trim()))
}

export function parseDecision(s: string): Decision | undefined {
  const v = s.trim().toLowerCase()
  if (/^(include|included|incl|i|yes|y|1|ya)$/.test(v)) return 'include'
  if (/^(exclude|excluded|excl|e|no|n|0|tidak)$/.test(v)) return 'exclude'
  if (/^(maybe|m|unsure|unclear|\?|ragu)$/.test(v)) return 'maybe'
  return undefined
}

/** Reads a filled-in blind sheet; returns the decisions by record id and what could not be used. */
export function readSheet(text: string, known: Set<string>): { votes: Map<string, { d: Decision; reason: string }>; blank: number; invalid: number; unknown: number } {
  const [head, ...rows] = parseCsv(text)
  if (!head) throw new Error('The file is empty.')
  const col = (re: RegExp) => head.findIndex((h) => re.test(h.trim().toLowerCase()))
  const id = col(/^id$/)
  const dec = col(/^decision/)
  const rea = col(/^reason/)
  if (id < 0 || dec < 0) throw new Error('The file needs the columns "id" and "decision" from the downloaded sheet.')
  const votes = new Map<string, { d: Decision; reason: string }>()
  let blank = 0
  let invalid = 0
  let unknown = 0
  for (const r of rows) {
    const rid = (r[id] ?? '').trim()
    const raw = r[dec] ?? ''
    if (!raw.trim()) blank++
    else if (!known.has(rid)) unknown++
    else {
      const d = parseDecision(raw)
      if (d) votes.set(rid, { d, reason: (r[rea] ?? '').trim() })
      else invalid++
    }
  }
  return { votes, blank, invalid, unknown }
}
