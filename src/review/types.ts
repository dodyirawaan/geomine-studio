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
  /** Citation chasing (snowballing) runs. */
  snowballs?: SnowballRun[]
  /** Quality appraisal per included record id: criterion id → score 0/1/2. */
  quality: Record<string, Record<string, number>>
  /** Drafted sections by outline id (plus abstract, highlights, keywords). */
  drafts: Record<string, string>
  /** Citation style for the manuscript; defaults to the journal's. */
  citationStyle?: CitationStyle
  manuscriptId?: string
  createdAt: number
  updatedAt: number
}
