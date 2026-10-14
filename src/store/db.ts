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
