// Whole-library backup to a JSON file and merge-restore from it. API keys are never included.
import { db, type PipelineRun, type Snapshot, type Tombstone } from '../store/db'
import { applyRemote, collectLocal, mergeTombstones, type ApplyStats, type SyncRecord } from './dataset'

interface Backup {
  app: 'geomine-studio'
  version: 1
  exportedAt: number
  records: SyncRecord[]
  tombstones: Tombstone[]
  snapshots: Omit<Snapshot, 'id'>[]
  runs: PipelineRun[]
}

export async function exportBackup(): Promise<Blob> {
  const backup: Backup = {
    app: 'geomine-studio',
    version: 1,
    exportedAt: Date.now(),
    records: await collectLocal(true),
    tombstones: await db.tombstones.toArray(),
    snapshots: (await db.snapshots.toArray()).map((s) => {
      const copy = { ...s }
      delete copy.id
      return copy
    }),
    runs: await db.runs.toArray(),
  }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

/** Merges a backup into this browser: newer records win, nothing newer here is overwritten. */
export async function importBackup(file: File): Promise<ApplyStats & { snapshots: number }> {
  let b: Backup
  try {
    b = JSON.parse(await file.text()) as Backup
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  if (b.app !== 'geomine-studio' || !Array.isArray(b.records)) throw new Error('This is not a GeoMine Studio backup.')
  const tombs = await mergeTombstones(b.tombstones ?? [])
  const stats = await applyRemote(b.records, tombs)
  // Snapshots are history: add the ones not already present.
  const have = new Set((await db.snapshots.toArray()).map((s) => `${s.manuscriptId}:${s.createdAt}`))
  const fresh = (b.snapshots ?? []).filter((s) => !have.has(`${s.manuscriptId}:${s.createdAt}`))
  await db.snapshots.bulkAdd(fresh)
  for (const r of b.runs ?? []) {
    const cur = await db.runs.get(r.manuscriptId)
    if (!cur || cur.updatedAt < r.updatedAt) await db.runs.put(r)
  }
  return { ...stats, snapshots: fresh.length }
}
