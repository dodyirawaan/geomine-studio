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
