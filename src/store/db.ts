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
}

db.version(1).stores({
  conversations: 'id, updatedAt',
  messages: '++id, convId, createdAt',
})
