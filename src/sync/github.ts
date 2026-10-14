// Two-way sync with a private GitHub repository through the Git Data API: one commit per sync, records stored as
// JSON files under geomine/, optionally encrypted with a key derived from the vault passphrase.
import { decryptWithKey, encryptWithKey, randomSalt, sha256, type KeyedBlob } from '../lib/crypto'
import { readJson, writeJson } from '../lib/storage'
import { db, type Tombstone } from '../store/db'
import { takeSnapshot } from '../pipeline/snapshots'
import { applyRemote, collectLocal, mergeTombstones, parsePath, serialize, type SyncRecord } from './dataset'

const ROOT = 'geomine/'
const KEYINFO = `${ROOT}keyinfo.json`
const TOMBSTONES = `${ROOT}tombstones.json`
const CONFIG_KEY = 'gm.sync'

export interface SyncConfig {
  /** "owner/name" */
  repo: string
  branch: string
  encrypt: boolean
  includePdf: boolean
  autoSync: boolean
  /** For tests against a mock server; the UI does not expose it. */
  apiBase?: string
  lastSync?: number
  lastResult?: string
}

export const DEFAULT_SYNC: SyncConfig = { repo: '', branch: 'main', encrypt: true, includePdf: true, autoSync: false }

export function loadSyncConfig(): SyncConfig {
  return { ...DEFAULT_SYNC, ...readJson<Partial<SyncConfig>>(CONFIG_KEY, {}) }
}

export function saveSyncConfig(c: SyncConfig): void {
  writeJson(CONFIG_KEY, c)
}

interface SyncState {
  /** Remote blob sha of each path when last seen. */
  shas: Record<string, string>
  /** Plaintext hash of each path when last synced. */
  hashes: Record<string, string>
  encrypted?: boolean
}

const stateKey = (c: SyncConfig) => `gm.syncState.${c.repo}@${c.branch}`

export class SyncError extends Error {}

class GitHub {
  private base: string
  private repo: string
  private token: string
  constructor(c: SyncConfig, token: string) {
    this.base = (c.apiBase ?? 'https://api.github.com').replace(/\/$/, '')
    this.repo = c.repo
    this.token = token
  }

  async req<T>(method: string, path: string, body?: unknown, allow: number[] = []): Promise<{ status: number; data: T }> {
    const res = await fetch(`${this.base}/repos/${this.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok && !allow.includes(res.status)) {
      const msg = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? ''
      if (res.status === 401) throw new SyncError('GitHub rejected the token (401). Check that it has not expired.')
      if (res.status === 403) throw new SyncError(`GitHub refused access (403): ${msg}. The token needs "Contents: Read and write" on this repository.`)
      if (res.status === 404) throw new SyncError(`Not found (404) — check the repository name "${this.repo}" and that the token can access it.`)
      throw new SyncError(`GitHub ${method} ${path}: HTTP ${res.status} ${msg}`)
    }
    return { status: res.status, data: res.status === 204 ? (undefined as T) : ((await res.json().catch(() => undefined)) as T) }
  }
}

function utf8ToB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

interface TreeEntry {
  path: string
  type: string
  sha: string
}

export interface SyncResult {
  pulled: number
  deleted: number
  pushed: number
  removed: number
  commit?: string
}

/**
 * Pulls remote changes, applies them (newer wins), then pushes local changes as one commit.
 * `dataKey` derives the encryption key from the vault passphrase and a salt kept in the repository.
 */
export async function syncNow(c: SyncConfig, token: string, dataKey: (salt: string) => Promise<CryptoKey>, onProgress: (msg: string) => void = () => {}): Promise<SyncResult> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(c.repo)) throw new SyncError('Repository must be "owner/name".')
  try {
    return await syncOnce(c, token, dataKey, onProgress)
  } catch (e) {
    // Someone else pushed between our read and our ref update: start again from the new head.
    if (e instanceof SyncError && e.message.includes('HTTP 422') && e.message.includes('refs')) return syncOnce(c, token, dataKey, onProgress)
    throw e
  }
}

async function syncOnce(c: SyncConfig, token: string, dataKey: (salt: string) => Promise<CryptoKey>, onProgress: (msg: string) => void): Promise<SyncResult> {
  const gh = new GitHub(c, token)
  const state = readJson<SyncState>(stateKey(c), { shas: {}, hashes: {} })
  if (state.encrypted !== c.encrypt) state.hashes = {}

  onProgress('Reading repository…')
  let ref = await gh.req<{ object: { sha: string } }>('GET', `/git/ref/heads/${c.branch}`, undefined, [404, 409])
  if (ref.status !== 200) {
    await gh.req('GET', '') // throws a clear 404 if the repository itself is not reachable
    const empty = ref.status === 409
    if (!empty) {
      const branches = await gh.req<unknown[]>('GET', '/branches')
      if (branches.data.length) throw new SyncError(`Branch "${c.branch}" does not exist in ${c.repo}.`)
    }
    // An empty repository has no commits for the Git Data API to build on, so create one through the Contents API.
    onProgress('Initialising empty repository…')
    await gh.req('PUT', '/contents/README.md', {
      message: 'Initialise GeoMine Studio data repository',
      content: utf8ToB64('# GeoMine Studio data\n\nPrivate sync data written by GeoMine Studio. Do not edit by hand.\n'),
      branch: c.branch,
    })
    ref = await gh.req('GET', `/git/ref/heads/${c.branch}`)
  }
  const head = ref.data.object.sha
  const commit = await gh.req<{ tree: { sha: string } }>('GET', `/git/commits/${head}`)
  const tree = await gh.req<{ tree: TreeEntry[]; truncated: boolean }>('GET', `/git/trees/${commit.data.tree.sha}?recursive=1`)
  if (tree.data.truncated) throw new SyncError('The repository tree is too large to read in one request.')
  const remote = new Map(tree.data.tree.filter((e) => e.type === 'blob' && e.path.startsWith(ROOT)).map((e) => [e.path, e.sha]))

  const readBlob = async (sha: string) => b64ToUtf8((await gh.req<{ content: string }>('GET', `/git/blobs/${sha}`)).data.content)

  // Encryption key, shared by all devices through the salt in keyinfo.json.
  let key: CryptoKey | null = null
  const writes = new Map<string, string>()
  if (remote.has(KEYINFO)) {
    const info = JSON.parse(await readBlob(remote.get(KEYINFO)!)) as { salt: string; check: KeyedBlob }
    key = await dataKey(info.salt)
    try {
      if ((await decryptWithKey<string>(info.check, key)) !== 'geomine') throw new Error()
    } catch {
      throw new SyncError('This repository was encrypted with a different vault passphrase. Use the same passphrase on every device.')
    }
  } else if (c.encrypt) {
    const salt = randomSalt()
    key = await dataKey(salt)
    writes.set(KEYINFO, JSON.stringify({ salt, check: await encryptWithKey('geomine', key) }, null, 2))
  }

  const decode = async (text: string): Promise<unknown> => {
    const parsed = JSON.parse(text) as KeyedBlob | unknown
    if (parsed && typeof parsed === 'object' && (parsed as KeyedBlob).v === 2 && 'ct' in (parsed as object)) {
      if (!key) throw new SyncError('Encrypted data found but no key information in the repository.')
      return decryptWithKey(parsed as KeyedBlob, key)
    }
    return parsed
  }

  // ---- pull ----
  const changed = [...remote].filter(([path, sha]) => path !== KEYINFO && state.shas[path] !== sha && (path === TOMBSTONES || parsePath(path.slice(ROOT.length))))
  const records: SyncRecord[] = []
  let remoteTombs: Tombstone[] = []
  for (const [i, [path, sha]] of changed.entries()) {
    onProgress(`Downloading ${i + 1}/${changed.length}`)
    const value = await decode(await readBlob(sha))
    if (path === TOMBSTONES) remoteTombs = value as Tombstone[]
    else records.push({ ...(value as Omit<SyncRecord, 'path'>), path: path.slice(ROOT.length) })
  }
  const tombs = await mergeTombstones(remoteTombs)
  onProgress('Merging…')
  // Conflict safety: a manuscript edited here since the last sync but newer on the remote is kept as a snapshot.
  for (const r of records.filter((x) => x.kind === 'manuscript')) {
    const mine = await db.manuscripts.get(r.id)
    if (!mine || mine.updatedAt >= r.updatedAt) continue
    const mineHash = await sha256(serialize({ path: r.path, kind: 'manuscript', id: mine.id, updatedAt: mine.updatedAt, data: mine }))
    if (state.hashes[ROOT + r.path] && state.hashes[ROOT + r.path] !== mineHash) await takeSnapshot(mine, 'Local version replaced by a newer synced version')
  }
  const applied = await applyRemote(records, tombs)

  // ---- push ----
  const local = await collectLocal(c.includePdf)
  const newHashes: Record<string, string> = {}
  for (const r of local) {
    const full = ROOT + r.path
    const plain = serialize(r)
    const h = await sha256(plain)
    newHashes[full] = h
    // Records just taken from the remote are already there.
    if (applied.accepted.has(r.path)) continue
    if (state.hashes[full] === h && remote.has(full)) continue
    writes.set(full, key && c.encrypt ? JSON.stringify(await encryptWithKey(JSON.parse(plain), key)) : JSON.stringify(JSON.parse(plain), null, 1))
  }
  const tombText = JSON.stringify([...tombs].sort((a, b) => a.key.localeCompare(b.key)))
  const tombHash = await sha256(tombText)
  newHashes[TOMBSTONES] = tombHash
  const remoteTombText = JSON.stringify([...remoteTombs].sort((a, b) => a.key.localeCompare(b.key)))
  const remoteHasSame = changed.some(([p]) => p === TOMBSTONES) ? remoteTombText === tombText : state.hashes[TOMBSTONES] === tombHash && remote.has(TOMBSTONES)
  if (tombs.length && !remoteHasSame) writes.set(TOMBSTONES, key && c.encrypt ? JSON.stringify(await encryptWithKey(JSON.parse(tombText), key)) : tombText)
  const localPaths = new Set(local.map((r) => ROOT + r.path))
  const tombKeys = new Set(tombs.map((t) => t.key))
  const removals = [...remote.keys()].filter((p) => {
    const parsed = parsePath(p.slice(ROOT.length))
    if (!parsed || localPaths.has(p)) return false
    if (tombKeys.has(`${parsed.kind === 'pdftext' ? 'paper' : parsed.kind}:${parsed.id}`)) return true
    // PDF text whose PDF was removed here; left alone when this device does not sync PDF text.
    return parsed.kind === 'pdftext' && c.includePdf
  })

  let commitSha: string | undefined
  let treeSha = commit.data.tree.sha
  if (writes.size || removals.length) {
    onProgress(`Uploading ${writes.size} file(s)…`)
    const entries: { path: string; mode: string; type: string; sha?: string | null; content?: string }[] = []
    for (const [path, content] of writes) {
      if (content.length < 200_000) entries.push({ path, mode: '100644', type: 'blob', content })
      else {
        const blob = await gh.req<{ sha: string }>('POST', '/git/blobs', { content: utf8ToB64(content), encoding: 'base64' })
        entries.push({ path, mode: '100644', type: 'blob', sha: blob.data.sha })
      }
    }
    for (const path of removals) entries.push({ path, mode: '100644', type: 'blob', sha: null })
    const newTree = await gh.req<{ sha: string }>('POST', '/git/trees', { base_tree: commit.data.tree.sha, tree: entries })
    const newCommit = await gh.req<{ sha: string }>('POST', '/git/commits', {
      message: `Sync from GeoMine Studio: ${writes.size} updated, ${removals.length} removed`,
      tree: newTree.data.sha,
      parents: [head],
    })
    await gh.req('PATCH', `/git/refs/heads/${c.branch}`, { sha: newCommit.data.sha })
    commitSha = newCommit.data.sha
    treeSha = newTree.data.sha
  }

  // Remember what the remote now holds, so the next sync only transfers changes.
  const finalTree = commitSha ? await gh.req<{ tree: TreeEntry[] }>('GET', `/git/trees/${treeSha}?recursive=1`) : tree
  const shas: Record<string, string> = {}
  for (const e of finalTree.data.tree) if (e.type === 'blob' && e.path.startsWith(ROOT)) shas[e.path] = e.sha
  writeJson(stateKey(c), { shas, hashes: newHashes, encrypted: c.encrypt } satisfies SyncState)

  return { pulled: applied.added + applied.updated, deleted: applied.deleted, pushed: [...writes.keys()].filter((p) => p !== KEYINFO && p !== TOMBSTONES).length, removed: removals.length, commit: commitSha }
}

/** Number of records and tombstones that would be synced, for the settings card. */
export async function localCounts(): Promise<{ manuscripts: number; conversations: number; papers: number; tombstones: number }> {
  return {
    manuscripts: await db.manuscripts.count(),
    conversations: await db.conversations.count(),
    papers: await db.papers.count(),
    tombstones: await db.tombstones.count(),
  }
}

let inFlight: Promise<SyncResult> | null = null

export function describeResult(r: SyncResult): string {
  const parts = [r.pulled && `${r.pulled} received`, r.deleted && `${r.deleted} deleted here`, r.pushed && `${r.pushed} sent`, r.removed && `${r.removed} removed remotely`].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Already up to date'
}

/** Runs one sync at a time and records the outcome in the sync settings. */
export function runSync(token: string, dataKey: (salt: string) => Promise<CryptoKey>, onProgress?: (msg: string) => void): Promise<SyncResult> {
  if (inFlight) return inFlight
  const c = loadSyncConfig()
  inFlight = syncNow(c, token, dataKey, onProgress)
    .then((r) => {
      saveSyncConfig({ ...loadSyncConfig(), lastSync: Date.now(), lastResult: describeResult(r) })
      return r
    })
    .catch((e: Error) => {
      saveSyncConfig({ ...loadSyncConfig(), lastResult: `Failed: ${e.message}` })
      throw e
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}
