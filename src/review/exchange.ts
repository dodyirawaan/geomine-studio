// Exchange with established screening tools: export records for ASReview LAB (CSV), Rayyan or Covidence (RIS), and
// import their screening decisions back, matched by record id, DOI or normalised title.
import { parseCsv, parseDecision } from './dual'
import { normTitle } from './search'
import type { Decision, ReviewProject, ReviewRecord } from './types'

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV for ASReview LAB. Decisions already made are passed as labels (1 relevant, 0 irrelevant) so ASReview starts from
 * them as prior knowledge; undecided records have an empty label.
 */
export function asreviewCsv(p: ReviewProject, decision: (r: ReviewRecord) => Decision | undefined): string {
  const head = ['record_id', 'title', 'abstract', 'authors', 'year', 'journal', 'doi', 'label_included']
  const rows = p.records
    .filter((r) => !r.auto)
    .map((r) => {
      const d = decision(r)
      return [r.id, r.meta.title, r.meta.abstract, r.meta.authors.join('; '), r.meta.year, r.meta.venue, r.meta.doi, d === 'include' ? 1 : d === 'exclude' ? 0 : ''].map(cell).join(',')
    })
  return [head.join(','), ...rows].join('\n')
}

/** RIS for Rayyan, Covidence or EPPI-Reviewer; the record id is kept in the notes so decisions can be matched back. */
export function screeningRis(p: ReviewProject): string {
  return p.records
    .filter((r) => !r.auto)
    .map((r) =>
      [
        'TY  - JOUR',
        `TI  - ${r.meta.title}`,
        ...r.meta.authors.map((a) => `AU  - ${a}`),
        r.meta.year ? `PY  - ${r.meta.year}` : '',
        r.meta.venue ? `JO  - ${r.meta.venue}` : '',
        r.meta.doi ? `DO  - ${r.meta.doi}` : '',
        r.meta.abstract ? `AB  - ${r.meta.abstract.replace(/\s+/g, ' ')}` : '',
        `N1  - geomine-id: ${r.id}`,
        'ER  - ',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')
}

/** Rayyan writes every reviewer's decision into the notes: RAYYAN-INCLUSION: {"Ana"=>"Included", "Ben"=>"Excluded"}. */
function rayyanDecision(notes: string): Decision | undefined {
  const m = /RAYYAN-INCLUSION:\s*\{([^}]*)\}/i.exec(notes)
  if (!m) return undefined
  const votes = [...m[1].matchAll(/=>\s*"([^"]+)"/g)].map((x) => x[1].toLowerCase())
  if (!votes.length) return undefined
  if (votes.every((v) => v.startsWith('incl'))) return 'include'
  if (votes.every((v) => v.startsWith('excl'))) return 'exclude'
  return 'maybe'
}

export interface ImportedDecisions {
  tool: string
  votes: Map<string, { d: Decision; reason: string }>
  unmatched: number
  undecided: number
}

/** Reads an export of ASReview LAB, Rayyan or a generic CSV with id/DOI/title and a decision or label column. */
export function readToolExport(text: string, records: ReviewRecord[]): ImportedDecisions {
  const [head, ...rows] = parseCsv(text)
  if (!head) throw new Error('The file is empty.')
  const h = head.map((x) => x.trim().toLowerCase())
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x))
  const idCol = col('record_id', 'id', 'geomine_id')
  const doiCol = col('doi')
  const titleCol = col('title', 'primary_title')
  const notesCol = col('notes', 'n1')
  const labelCol = col('included', 'label_included', 'asreview_label', 'label', 'decision', 'final_decision')
  const reasonCol = col('exclusion_reasons', 'reason', 'notes_reason')
  const tool = notesCol >= 0 && rows.some((r) => /RAYYAN-INCLUSION/i.test(r[notesCol] ?? '')) ? 'Rayyan' : h.some((x) => x.startsWith('asreview')) || h.includes('label_included') || h.includes('included') ? 'ASReview LAB' : 'external tool'
  if (labelCol < 0 && tool !== 'Rayyan') throw new Error('No decision column found (expected "included", "label_included", "asreview_label" or "decision", or Rayyan notes).')

  const byId = new Map(records.map((r) => [r.id, r]))
  const byDoi = new Map(records.filter((r) => r.meta.doi).map((r) => [r.meta.doi!.toLowerCase(), r]))
  const byTitle = new Map(records.map((r) => [normTitle(r.meta.title), r]))
  const votes = new Map<string, { d: Decision; reason: string }>()
  let unmatched = 0
  let undecided = 0
  for (const row of rows) {
    const notes = notesCol >= 0 ? (row[notesCol] ?? '') : ''
    const idFromNotes = /geomine-id:\s*(\S+)/.exec(notes)?.[1]
    const rec =
      (idCol >= 0 && byId.get((row[idCol] ?? '').trim())) ||
      (idFromNotes && byId.get(idFromNotes)) ||
      (doiCol >= 0 && byDoi.get((row[doiCol] ?? '').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, ''))) ||
      (titleCol >= 0 && byTitle.get(normTitle(row[titleCol] ?? '')))
    if (!rec) {
      unmatched++
      continue
    }
    const d = tool === 'Rayyan' && labelCol < 0 ? rayyanDecision(notes) : parseDecision(row[labelCol] ?? '')
    if (!d) {
      undecided++
      continue
    }
    votes.set(rec.id, { d, reason: (reasonCol >= 0 ? row[reasonCol]?.trim() : '') || `Decided in ${tool}` })
  }
  return { tool, votes, unmatched, undecided }
}
