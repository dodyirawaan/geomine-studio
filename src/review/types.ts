// Review projects: protocol, searches, screened records, and the drafted review.
import type { PaperMeta } from '../literature/openalex'
import type { CitationStyle } from '../manuscript/citations'

export type ReviewMethodId = 'systematic' | 'scoping' | 'bibliometric' | 'narrative'

export interface Protocol {
  topic: string
  questions: string[]
  /** PICO / PCC / SPIDER elements as label → text. */
  framework: Record<string, string>
  inclusion: string[]
  exclusion: string[]
  queries: string[]
  yearFrom?: number
  yearTo?: number
  articlesOnly: boolean
  language: string
  /** Max records fetched per query. */
  perQueryLimit: number
}

export type Decision = 'include' | 'exclude' | 'maybe'

export interface ReviewRecord {
  /** OpenAlex id, or DOI when OpenAlex has none. */
  id: string
  meta: PaperMeta
  /** Indices of the searches (database runs or imports) that found it. */
  queries: number[]
  /** Title/abstract screening. */
  ta?: Decision
  taReason?: string
  /** Full-text eligibility (only for records included at title/abstract). */
  ft?: 'include' | 'exclude'
  ftReason?: string
  /** AI assessment of full-text eligibility; its decision is applied but shown as a note until a reviewer checks it. */
  ftAi?: { decision: 'include' | 'exclude' | 'unclear'; reason: string; note: string; source: 'abstract' | 'fulltext'; at: number; checked?: boolean }
  /** AI suggestion for title/abstract screening, never applied without the user. */
  ai?: { decision: Decision; reason: string }
  /** Library paper created when the record is finally included. */
  paperId?: string
  /** Added by hand (citation chasing, expert suggestion) rather than by a database search. */
  manual?: boolean
  /** How a record outside the database searches was found: backward or forward citation chasing, or by hand. */
  via?: 'backward' | 'forward' | 'manual'
  /** Included studies this record cites or is cited by (citation chasing). */
  links?: string[]
  /** Dual screening: independent decisions of reviewer 1 and 2; `ta` then holds the agreed or resolved decision. */
  ta1?: Decision
  ta1Reason?: string
  ta2?: Decision
  ta2Reason?: string
  /** Reviewer 2's decision was copied from the AI suggestion rather than made by a person. */
  ta2Ai?: boolean
  /** When the (active reviewer's) title/abstract decision was made, for the stopping rule of prioritised screening. */
  decidedAt?: number
  /** Not screened: marked ineligible by the stopping rule of prioritised screening. */
  auto?: boolean
  /** Drawn into the random quality-check sample before stopping. */
  check?: boolean
  /** The final decision settled a disagreement between the reviewers (discussion or a third reviewer). */
  taResolved?: boolean
}

export interface DualScreening {
  enabled: boolean
  names: [string, string]
  /** Which reviewer is screening in this browser. */
  active: 1 | 2
}

export interface SnowballRun {
  direction: 'backward' | 'forward'
  at: number
  /** Included records whose references or citations were chased. */
  seeds: string[]
  /** Candidates found that were not yet among the records. */
  found: number
  /** Records added for screening. */
  added: number
  /** Only candidates linked to at least this many included studies were added. */
  minLinks: number
  /** OpenAlex returned more than the retrieval limit. */
  truncated?: boolean
}

export interface SearchRun {
  /** Database searched: "OpenAlex", or the name of an imported export (e.g. "Scopus"). */
  database?: string
  query: string
  at: number
  found: number
  fetched: number
}

export interface ReviewProject {
  id: string
  title: string
  method: ReviewMethodId
  journal: string
  protocol: Protocol
  searches: SearchRun[]
  /** Records after de-duplication. */
  records: ReviewRecord[]
  /** Exports imported from other databases (Scopus, Web of Science), kept across OpenAlex re-runs. */
  imports?: SearchRun[]
  /** Screening by two independent reviewers. */
  dual?: DualScreening
  /** Screening aids: active-learning order, stopping, and screening done in external tools. */
  aids?: ScreeningAids
  /** Citation chasing (snowballing) runs. */
  snowballs?: SnowballRun[]
  /** Quality appraisal per included record id: criterion id → score 0/1/2. */
  quality: Record<string, Record<string, number>>
  /** Studies whose quality scores were proposed by AI, by record id. */
  qualityAi?: Record<string, QualityAi>
  /** Drafted sections by outline id (plus abstract, highlights, keywords). */
  drafts: Record<string, string>
  /** Citation style for the manuscript; defaults to the journal's. */
  citationStyle?: CitationStyle
  manuscriptId?: string
  createdAt: number
  updatedAt: number
}

export interface QualityAi {
  /** Criterion id → one-sentence justification from the model. */
  reasons: Record<string, string>
  source: 'abstract' | 'fulltext'
  at: number
  /** A reviewer has checked (or changed) the AI scores. */
  checked?: boolean
}

export interface ScreeningAids {
  /** Records are shown most-likely-relevant first (active learning). */
  prioritised?: boolean
  /** Irrelevant decisions in a row that end screening. */
  stopAfter?: number
  /** Size of the random quality-check sample drawn before stopping. */
  sampleSize?: number
  /** Screening was stopped and the rest marked ineligible. */
  stopped?: { at: number; screened: number; total: number; run: number; k?: number; marked: number; sample: number; sampleRelevant: number }
  /** Decisions imported from external screening tools (ASReview, Rayyan, …). */
  external?: { tool: string; at: number; decisions: number }[]
}
