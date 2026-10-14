// Publication-readiness checks for a review project, computed from the project and its drafts.
import { citedKeys } from '../manuscript/bibtex'
import { countWords } from '../manuscript/templates'
import type { Paper } from '../store/db'
import { evidenceStats } from './evidence'
import type { ReviewMethod } from './methods'
import type { PrismaCounts } from './prisma'
import type { ReviewProject } from './types'

export interface Check {
  ok: boolean
  /** A warning is a should; a failed must blocks submission. */
  level: 'must' | 'should'
  label: string
  detail?: string
}

const MIN_STUDIES: Record<string, number> = { systematic: 15, scoping: 20, bibliometric: 100, narrative: 30 }

export function readiness(p: ReviewProject, m: ReviewMethod, c: PrismaCounts, papers: Paper[], extraKeys: string[]): Check[] {
  const d = p.drafts
  const body = m.outline.map((o) => d[o.id] ?? '')
  const bodyWords = body.reduce((n, t) => n + countWords(t), 0)
  const synthWords = countWords(d.synthesis ?? '')
  const allText = [...body, d.abstract ?? ''].join('\n')
  const placeholders = (allText.match(/\[(VERIFY|DATA NEEDED)[^\]]*\]|\[X\]/g) ?? []).length
  const cited = citedKeys(body)
  const keys = new Set([...papers.map((x) => x.bibKey), ...extraKeys])
  const unknown = [...cited].filter((k) => !keys.has(k))
  const coverage = papers.length ? papers.filter((x) => cited.has(x.bibKey)).length / papers.length : 0
  const dbs = new Set([...p.searches, ...(p.imports ?? [])].map((s) => s.database ?? 'OpenAlex'))
  const abstractWords = countWords(d.abstract ?? '')
  const highlights = (d.highlights ?? '').split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
  const stats = evidenceStats(papers)
  const introCitesReviews = stats.reviews.length === 0 || stats.reviews.some((k) => (d.introduction ?? '').includes(`@${k}`))
  const minStudies = MIN_STUDIES[m.id] ?? 15
  const qualityDone = !m.quality || papers.every((x) => Object.keys(p.quality[x.id] ?? {}).length >= 5)

  return [
    { level: 'must', ok: c.awaitingTA === 0 && c.awaitingFT === 0, label: 'Screening finished', detail: c.awaitingTA || c.awaitingFT ? `${c.awaitingTA} records and ${c.awaitingFT} full texts still undecided` : undefined },
    { level: 'should', ok: c.included >= minStudies, label: `Enough included studies for a ${m.name.toLowerCase()} (≥ ${minStudies})`, detail: `${c.included} included` },
    { level: 'should', ok: dbs.size >= 2, label: 'Two or more databases searched (e.g. OpenAlex + Scopus or Web of Science)', detail: [...dbs].join(', ') },
    { level: 'must', ok: papers.length > 0 && papers.every((x) => x.matrix), label: 'Data extracted for every included study', detail: `${papers.filter((x) => x.matrix).length}/${papers.length}` },
    { level: 'should', ok: papers.length > 0 && papers.filter((x) => x.matrixSource === 'fulltext').length >= papers.length / 2, label: 'Most extractions from full texts rather than abstracts', detail: `${papers.filter((x) => x.matrixSource === 'fulltext').length} from full text` },
    ...(m.quality ? [{ level: 'must' as const, ok: qualityDone, label: 'Quality appraisal completed for every study' }] : []),
    { level: 'must', ok: m.outline.every((o) => (d[o.id] ?? '').trim()), label: 'Every section written' },
    { level: 'should', ok: synthWords >= 2500, label: 'Synthesis has review-level depth (≥ 2,500 words)', detail: `${synthWords.toLocaleString()} words` },
    { level: 'should', ok: bodyWords >= 6000, label: 'Main text of a typical Q1 review (≈ 6,000–12,000 words)', detail: `${bodyWords.toLocaleString()} words` },
    { level: 'must', ok: abstractWords > 0 && abstractWords <= 250, label: 'Abstract written, at most 250 words', detail: `${abstractWords} words` },
    { level: 'should', ok: highlights.length >= 3 && highlights.length <= 5 && highlights.every((h) => h.length <= 85), label: 'Highlights: 3–5 lines of at most 85 characters', detail: `${highlights.length} lines` },
    { level: 'must', ok: placeholders === 0, label: 'No [VERIFY], [DATA NEEDED] or [X] placeholders left', detail: placeholders ? `${placeholders} left` : undefined },
    { level: 'must', ok: unknown.length === 0, label: 'Every citation resolves to an included study or method reference', detail: unknown.length ? unknown.slice(0, 5).join(', ') : undefined },
    { level: 'should', ok: coverage >= 0.8, label: 'At least 80% of included studies are cited in the text', detail: `${Math.round(coverage * 100)}%` },
    { level: 'should', ok: introCitesReviews, label: 'Earlier reviews are discussed in the Introduction', detail: stats.reviews.length ? `${stats.reviews.length} earlier review(s) among the included studies` : undefined },
  ]
}
