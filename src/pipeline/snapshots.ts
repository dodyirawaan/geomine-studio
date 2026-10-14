import { db, type Manuscript, type Snapshot } from '../store/db'

const KEEP = 50

export async function takeSnapshot(m: Manuscript, label: string): Promise<void> {
  await db.snapshots.add({ manuscriptId: m.id, label, title: m.title, sections: m.sections, bibtex: m.bibtex, createdAt: Date.now() })
  // Keep the newest snapshots only, so history does not grow without bound.
  const all = await db.snapshots.where('manuscriptId').equals(m.id).sortBy('createdAt')
  if (all.length > KEEP) await db.snapshots.bulkDelete(all.slice(0, all.length - KEEP).map((s) => s.id!))
}

/** Replaces section texts (and optionally the title) after saving a snapshot of the current state. */
export async function applyTexts(manuscriptId: string, texts: Record<string, string>, label: string, title?: string): Promise<void> {
  const m = await db.manuscripts.get(manuscriptId)
  if (!m) throw new Error('Manuscript not found')
  await takeSnapshot(m, label)
  await db.manuscripts.update(manuscriptId, {
    title: title ?? m.title,
    sections: m.sections.map((s) => (s.id in texts ? { ...s, content: texts[s.id] } : s)),
    updatedAt: Date.now(),
  })
}

export async function restoreSnapshot(snap: Snapshot): Promise<void> {
  const m = await db.manuscripts.get(snap.manuscriptId)
  if (!m) throw new Error('Manuscript not found')
  await takeSnapshot(m, `Before restoring "${snap.label}"`)
  await db.manuscripts.update(m.id, { title: snap.title, sections: snap.sections, bibtex: snap.bibtex, updatedAt: Date.now() })
}
