import { useEffect, useRef, useState } from 'react'
import { downloadBlob } from '../lib/download'
import { exportBackup, importBackup } from '../sync/backup'
import { loadSyncConfig, localCounts, runSync, saveSyncConfig, type SyncConfig } from '../sync/github'
import { useVault } from '../store/vault'
import { Button, Card, Input, Label } from './ui'

const AUTO_SYNC_MS = 15 * 60 * 1000

/** Periodic sync while the vault is unlocked, when enabled in settings. Renders nothing. */
export function SyncAgent() {
  const { status, secrets, dataKey } = useVault()
  useEffect(() => {
    const c = loadSyncConfig()
    if (status !== 'unlocked' || !c.autoSync || !c.repo || !secrets.githubToken) return
    const go = () => runSync(secrets.githubToken!, dataKey).catch(() => {})
    go()
    const t = setInterval(go, AUTO_SYNC_MS)
    return () => clearInterval(t)
  }, [status, secrets.githubToken, dataKey])
  return null
}

export function SyncCard() {
  const { secrets, dataKey } = useVault()
  const [cfg, setCfg] = useState<SyncConfig>(loadSyncConfig)
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof localCounts>> | null>(null)

  useEffect(() => {
    localCounts().then(setCounts)
  }, [busy])

  function update(patch: Partial<SyncConfig>) {
    const next = { ...loadSyncConfig(), ...patch }
    setCfg(next)
    saveSyncConfig(next)
  }

  async function sync() {
    setBusy(true)
    try {
      await runSync(secrets.githubToken!, dataKey, setProgress)
    } catch {
      // The message is stored in lastResult.
    } finally {
      setProgress('')
      setBusy(false)
      setCfg(loadSyncConfig())
    }
  }

  const ready = !!cfg.repo && !!secrets.githubToken
  const failed = cfg.lastResult?.startsWith('Failed')

  return (
    <Card title="Sync to a private GitHub repository">
      <div className="space-y-3 text-sm">
        <p className="text-stone-600 dark:text-stone-400">
          Keeps manuscripts, chats, the literature library, review projects and VLab experiments the same on every browser you use. Each sync is one commit to your own private
          repository; with encryption on, GitHub only stores ciphertext.
        </p>
        <details className="rounded-md bg-stone-50 p-2.5 text-xs dark:bg-stone-950">
          <summary className="cursor-pointer font-medium">One-time setup</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              <a className="underline" href="https://github.com/new?name=geomine-data&visibility=private" target="_blank" rel="noreferrer">
                Create a private repository
              </a>{' '}
              (e.g. <code>geomine-data</code>). It can be empty.
            </li>
            <li>
              <a className="underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                Create a fine-grained token
              </a>{' '}
              with access to <b>only that repository</b> and the permission <b>Contents: Read and write</b>. Set an expiry date.
            </li>
            <li>Paste the token in the GitHub field of the API keys card above and save it.</li>
            <li>Enter the repository below and press Sync now. Use the same vault passphrase on your other devices.</li>
          </ol>
        </details>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <label>
            <Label>Repository</Label>
            <Input value={cfg.repo} onChange={(e) => update({ repo: e.target.value.trim() })} placeholder="your-username/geomine-data" />
          </label>
          <label>
            <Label>Branch</Label>
            <Input value={cfg.branch} onChange={(e) => update({ branch: e.target.value.trim() || 'main' })} />
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.encrypt} onChange={(e) => update({ encrypt: e.target.checked })} />
            Encrypt with my vault passphrase (recommended)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.includePdf} onChange={(e) => update({ includePdf: e.target.checked })} />
            Include extracted PDF text (larger; PDF files themselves are not stored)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.autoSync} onChange={(e) => update({ autoSync: e.target.checked })} />
            Sync automatically every 15 minutes while the vault is unlocked
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!ready || busy} onClick={sync}>
            {busy ? 'Syncing…' : 'Sync now'}
          </Button>
          {!secrets.githubToken && <span className="text-xs text-amber-700">Add a GitHub token above first.</span>}
          {progress && <span className="text-xs text-stone-500">{progress}</span>}
        </div>
        {cfg.lastResult && (
          <p className={`text-xs ${failed ? 'text-red-700' : 'text-stone-500'}`}>
            {cfg.lastSync && !failed ? `Last sync ${new Date(cfg.lastSync).toLocaleString()}: ` : ''}
            {cfg.lastResult}
          </p>
        )}
        {counts && (
          <p className="text-xs text-stone-500">
            In this browser: {counts.manuscripts} manuscripts · {counts.conversations} chats · {counts.papers} papers · {counts.reviews} reviews · {counts.experiments} experiments
            {counts.tombstones ? ` · ${counts.tombstones} deletions to propagate` : ''}. Snapshots, usage logs and settings stay local.
          </p>
        )}
        <p className="text-xs text-stone-500">
          If the same item was changed on two devices, the newer change wins; a manuscript replaced this way is kept in its History.
        </p>
      </div>
    </Card>
  )
}

export function BackupCard() {
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <Card title="Backup">
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
        Download everything in this browser — manuscripts with their history, chats, library and PDF text, reviews and experiments — as one JSON file, or merge a backup
        back in (newer items win). API keys are not included.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          onClick={async () => downloadBlob(await exportBackup(), `geomine-backup-${new Date().toISOString().slice(0, 10)}.json`)}
        >
          Download backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              const r = await importBackup(f)
              setStatus(`Restored: ${r.added} added, ${r.updated} updated, ${r.deleted} deleted, ${r.snapshots} snapshots.`)
            } catch (err) {
              setStatus((err as Error).message)
            }
            e.target.value = ''
          }}
        />
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          Restore from backup…
        </Button>
        {status && <span className="text-xs text-stone-500">{status}</span>}
      </div>
    </Card>
  )
}
