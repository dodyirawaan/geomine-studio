// The syncable data set: manuscripts, conversations with their messages, library papers and (optionally) PDF text.
// Merge rule: per record, the newer `updatedAt` wins; a tombstone newer than a record deletes it everywhere.
import { db, type Chunk, type Conversation, type Paper, type StoredMessage, type SyncKind, type Tombstone } from '../store/db'

export type RecordKind = SyncKind | 'pdftext'

export interface SyncRecord {
  path: string
  kind: RecordKind
  id: string
  updatedAt: number
  data: unknown
}

interface ConversationData {
  conversation: Conversation
  messages: Omit<StoredMessage, 'id'>[]
}

interface PdfTextData {
  chunks: Omit<Chunk, 'id' | 'paperId'>[]
}

/** Repository folder of each kind of record. */
const FOLDERS: Record<RecordKind, string> = {
  manuscript: 'manuscripts',
  conversation: 'conversations',
  paper: 'papers',
  pdftext: 'pdftext',
  review: 'reviews',
  experiment: 'experiments',
}

export const pathFor = (kind: RecordKind, id: string) => `${FOLDERS[kind]}/${id}.json`

export function parsePath(path: string): { kind: RecordKind; id: string } | null {
  const m = /^([a-z]+)\/(.+)\.json$/.exec(path)
  const kind = m && (Object.keys(FOLDERS) as RecordKind[]).find((k) => FOLDERS[k] === m[1])
  return kind ? { kind, id: m![2] } : null
}

/** Tables holding one record per synced file (conversations also carry their messages). */
const tableOf = (kind: SyncKind) =>
  ({ manuscript: db.manuscripts, conversation: db.conversations, paper: db.papers, review: db.reviews, experiment: db.experiments })[kind] as unknown as {
    get: (id: string) => Promise<{ updatedAt: number } | undefined>
    put: (v: unknown) => Promise<unknown>
    delete: (id: string) => Promise<void>
  }

/** Canonical text of a record; equal text means nothing changed. */
export function serialize(r: SyncRecord): string {
  return JSON.stringify({ kind: r.kind, id: r.id, updatedAt: r.updatedAt, data: r.data })
}

export async function collectLocal(includePdf: boolean): Promise<SyncRecord[]> {
  const out: SyncRecord[] = []
  for (const m of await db.manuscripts.toArray()) out.push({ path: pathFor('manuscript', m.id), kind: 'manuscript', id: m.id, updatedAt: m.updatedAt, data: m })
  const messages = await db.messages.toArray()
  for (const c of await db.conversations.toArray()) {
    const data: ConversationData = {
      conversation: c,
      messages: messages
        .filter((x) => x.convId === c.id)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((x) => {
          const copy = { ...x }
          delete copy.id
          return copy
        }),
    }
    out.push({ path: pathFor('conversation', c.id), kind: 'conversation', id: c.id, updatedAt: c.updatedAt, data })
  }
  const papers = await db.papers.toArray()
  for (const p of papers) out.push({ path: pathFor('paper', p.id), kind: 'paper', id: p.id, updatedAt: p.updatedAt, data: p })
  for (const r of await db.reviews.toArray()) out.push({ path: pathFor('review', r.id), kind: 'review', id: r.id, updatedAt: r.updatedAt, data: r })
  for (const e of await db.experiments.toArray()) out.push({ path: pathFor('experiment', e.id), kind: 'experiment', id: e.id, updatedAt: e.updatedAt, data: e })
  if (includePdf) {
    const chunks = await db.chunks.toArray()
    for (const p of papers.filter((x) => x.pdfPages)) {
      const own = chunks.filter((c) => c.paperId === p.id).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      if (!own.length) continue
      const data: PdfTextData = { chunks: own.map((c) => ({ page: c.page, text: c.text })) }
      out.push({ path: pathFor('pdftext', p.id), kind: 'pdftext', id: p.id, updatedAt: p.updatedAt, data })
    }
  }
  return out
}

// ---------- tombstones ----------

let suppress = false
const pending: Tombstone[] = []

function queue(kind: SyncKind, id: string) {
  if (suppress) return
  pending.push({ key: `${kind}:${id}`, kind, id, deletedAt: Date.now() })
  setTimeout(() => {
    const batch = pending.splice(0)
    if (batch.length) void db.tombstones.bulkPut(batch)
  })
}

/** Records every deletion of a synced record, wherever in the app it happens. */
export function installTombstoneHooks(): void {
  db.manuscripts.hook('deleting', (key) => queue('manuscript', String(key)))
  db.conversations.hook('deleting', (key) => queue('conversation', String(key)))
  db.papers.hook('deleting', (key) => queue('paper', String(key)))
  db.reviews.hook('deleting', (key) => queue('review', String(key)))
  db.experiments.hook('deleting', (key) => queue('experiment', String(key)))
}

export async function mergeTombstones(remote: Tombstone[]): Promise<Tombstone[]> {
  const local = await db.tombstones.toArray()
  const map = new Map(local.map((t) => [t.key, t]))
  for (const t of remote) {
    const cur = map.get(t.key)
    if (!cur || cur.deletedAt < t.deletedAt) map.set(t.key, t)
  }
  const all = [...map.values()]
  await db.tombstones.bulkPut(all)
  return all
}

// ---------- applying remote data ----------

export interface ApplyStats {
  added: number
  updated: number
  deleted: number
  /** Paths whose remote version is now the local version. */
  accepted: Set<string>
}

/** Applies remote records and tombstones to the local database (newer wins). */
export async function applyRemote(records: SyncRecord[], tombstones: Tombstone[]): Promise<ApplyStats> {
  const stats: ApplyStats = { added: 0, updated: 0, deleted: 0, accepted: new Set() }
  const tomb = new Map(tombstones.map((t) => [t.key, t]))
  const dead = (kind: SyncKind, id: string, updatedAt: number) => (tomb.get(`${kind}:${id}`)?.deletedAt ?? -1) >= updatedAt
  const acceptedPapers = new Set<string>()

  suppress = true
  try {
    await db.transaction('rw', [db.manuscripts, db.conversations, db.messages, db.papers, db.chunks, db.reviews, db.experiments], async () => {
      for (const r of records.filter((x) => x.kind !== 'pdftext')) {
        const kind = r.kind as SyncKind
        if (dead(kind, r.id, r.updatedAt)) continue
        const table = tableOf(kind)
        const local = await table.get(r.id)
        if (local && local.updatedAt >= r.updatedAt) continue
        if (kind === 'paper') {
          await db.papers.put(r.data as Paper)
          acceptedPapers.add(r.id)
        } else if (kind !== 'conversation') {
          await table.put(r.data)
        } else {
          const d = r.data as ConversationData
          await db.conversations.put(d.conversation)
          await db.messages.where('convId').equals(r.id).delete()
          await db.messages.bulkAdd(d.messages as StoredMessage[])
        }
        if (local) stats.updated++
        else stats.added++
        stats.accepted.add(r.path)
      }
      for (const r of records.filter((x) => x.kind === 'pdftext')) {
        const hasLocal = (await db.chunks.where('paperId').equals(r.id).count()) > 0
        if (!acceptedPapers.has(r.id) && hasLocal) continue
        if (!(await db.papers.get(r.id))) continue
        await db.chunks.where('paperId').equals(r.id).delete()
        await db.chunks.bulkAdd((r.data as PdfTextData).chunks.map((c) => ({ ...c, paperId: r.id })))
        stats.accepted.add(r.path)
      }
      // A paper accepted without its PDF text (the other device did not sync PDFs) must not claim to have one.
      for (const id of acceptedPapers) {
        const p = await db.papers.get(id)
        if (p?.pdfPages && !(await db.chunks.where('paperId').equals(id).count())) await db.papers.update(id, { pdfPages: undefined, pdfName: undefined })
      }
      for (const t of tombstones) {
        const table = tableOf(t.kind)
        const local = await table.get(t.id)
        if (!local || local.updatedAt > t.deletedAt) continue
        if (t.kind === 'conversation') await db.messages.where('convId').equals(t.id).delete()
        if (t.kind === 'paper') await db.chunks.where('paperId').equals(t.id).delete()
        await table.delete(t.id)
        stats.deleted++
      }
    })
  } finally {
    suppress = false
  }
  return stats
}
