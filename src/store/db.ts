import Dexie, { type EntityTable } from 'dexie'
import type { ProviderId, Usage } from '../ai/types'
import type { JournalId, ModeId } from '../ai/prompts'

export interface Conversation {
  id: string
  title: string
  mode: ModeId
  journal: JournalId | ''
  createdAt: number
  updatedAt: number
}

export interface StoredMessage {
  id?: number
  convId: string
  role: 'user' | 'assistant'
  content: string
  provider?: ProviderId
  model?: string
  usage?: Usage
  error?: boolean
  createdAt: number
}

export const db = new Dexie('geomine-studio') as Dexie & {
  conversations: EntityTable<Conversation, 'id'>
  messages: EntityTable<StoredMessage, 'id'>
  manuscripts: EntityTable<Manuscript, 'id'>
  papers: EntityTable<Paper, 'id'>
  chunks: EntityTable<Chunk, 'id'>
  runs: EntityTable<PipelineRun, 'manuscriptId'>
  snapshots: EntityTable<Snapshot, 'id'>
  usage: EntityTable<UsageRecord, 'id'>
  tombstones: EntityTable<Tombstone, 'key'>
}

db.version(1).stores({
  conversations: 'id, updatedAt',
  messages: '++id, convId, createdAt',
})

db.version(2).stores({
  manuscripts: 'id, updatedAt',
})

db.version(3).stores({
  papers: 'id, doi, addedAt',
  chunks: '++id, paperId',
})

db.version(4).stores({
  runs: 'manuscriptId',
  snapshots: '++id, manuscriptId, createdAt',
})

db.version(5).stores({
  usage: '++id, at',
  tombstones: 'key',
})

export type SectionRole = 'highlights' | 'abstract' | 'keywords' | 'body' | 'back'

export interface ManuscriptSection {
  id: string
  role: SectionRole
  title: string
  /** Markdown with `$…$` math and `[@key]` citations. */
  content: string
  /** Writing guidance shown in the editor and passed to the AI. */
  hint?: string
}

export interface Author {
  name: string
  affiliation: string
  email?: string
  corresponding?: boolean
}

export interface Manuscript {
  id: string
  title: string
  journal: JournalId | ''
  articleType: string
  authors: Author[]
  sections: ManuscriptSection[]
  /** Raw BibTeX; entries are parsed on demand. */
  bibtex: string
  /** Manual Q1 checklist items the author has ticked. */
  checklist?: Record<string, boolean>
  createdAt: number
  updatedAt: number
}

/** A work in the literature library, from OpenAlex, a DOI lookup, or entered by hand. */
export interface Paper {
  id: string
  /** Bare DOI (10.xxxx/…), lowercase. */
  doi?: string
  openalexId?: string
  title: string
  /** Display names in "Given Family" order. */
  authors: string[]
  year?: number
  venue?: string
  volume?: string
  issue?: string
  pages?: string
  abstract?: string
  citedBy?: number
  url?: string
  oaUrl?: string
  /** Citation key used in manuscripts. */
  bibKey: string
  tags: string[]
  notes: string
  /** Literature-matrix cells, keyed by column id. */
  matrix?: Record<string, string>
  matrixSource?: 'abstract' | 'fulltext'
  pdfName?: string
  pdfPages?: number
  addedAt: number
  updatedAt: number
}

/** A passage of a paper's PDF text, for retrieval. */
export interface Chunk {
  id?: number
  paperId: string
  page: number
  text: string
}

export interface ReviewComment {
  id: string
  severity: 'major' | 'minor'
  /** Section title the comment is about, or "General". */
  section: string
  quote?: string
  comment: string
  suggestion?: string
  /** Selected for the next revision round. */
  selected: boolean
  response?: string
}

/** AI proposals for one manuscript, kept until the author accepts or discards them. */
export interface PipelineRun {
  manuscriptId: string
  idea: string
  outline?: string
  /** Proposed section text by section id (drafts and revisions). */
  proposals: Record<string, { text: string; kind: 'draft' | 'revision'; createdAt: number }>
  review: ReviewComment[]
  responseLetter?: string
  updatedAt: number
}

/** A saved copy of a manuscript's text, taken before AI changes are applied or on request. */
export interface Snapshot {
  id?: number
  manuscriptId: string
  label: string
  title: string
  sections: ManuscriptSection[]
  bibtex: string
  createdAt: number
}

/** Token usage of one AI request, for cost tracking. */
export interface UsageRecord {
  id?: number
  at: number
  provider: ProviderId
  model: string
  feature: string
  inputTokens: number
  outputTokens: number
}

export type SyncKind = 'manuscript' | 'conversation' | 'paper'

/** Marks a deleted record so that sync removes it on other devices instead of bringing it back. */
export interface Tombstone {
  /** `${kind}:${id}` */
  key: string
  kind: SyncKind
  id: string
  deletedAt: number
}
