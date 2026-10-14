import { db } from '../store/db'
import { REVIEW_METHODS } from './methods'
import type { ReviewMethodId, ReviewProject } from './types'

export function newReview(title: string, method: ReviewMethodId, journal: string): ReviewProject {
  const m = REVIEW_METHODS.find((x) => x.id === method)!
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title,
    method,
    journal,
    protocol: {
      topic: '',
      questions: [],
      framework: Object.fromEntries(m.framework.fields.map((f) => [f, ''])),
      inclusion: [],
      exclusion: [],
      queries: [''],
      yearFrom: new Date().getFullYear() - 15,
      articlesOnly: true,
      language: 'English',
      perQueryLimit: 600,
    },
    searches: [],
    records: [],
    quality: {},
    drafts: {},
    createdAt: now,
    updatedAt: now,
  }
}


/** Reads the latest stored project inside a transaction, so quick successive edits never overwrite each other. */
export function updateReview(id: string, patch: Partial<ReviewProject> | ((p: ReviewProject) => Partial<ReviewProject>)): Promise<void> {
  return db.transaction('rw', db.reviews, async () => {
    const cur = await db.reviews.get(id)
    if (!cur) return
    const pt = typeof patch === 'function' ? patch(cur) : patch
    await db.reviews.put({ ...cur, ...pt, updatedAt: Date.now() })
  })
}

export type Save = (patch: Partial<ReviewProject> | ((p: ReviewProject) => Partial<ReviewProject>)) => Promise<void>
