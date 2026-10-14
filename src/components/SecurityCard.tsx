import { Lock, ScanFace, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { passkeyAvailable } from '../lib/passkey'
import { loadAppLock, saveAppLock, type AppLock } from '../store/appLock'
import { useVault } from '../store/vault'
import { Badge, Button, Card, Select } from './ui'

export function SecurityCard() {
  const { hasPasskey, addPasskey, removePasskey } = useVault()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [lock, setLock] = useState<AppLock>(loadAppLock)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    passkeyAvailable().then(setAvailable)
  }, [])

  const update = (patch: Partial<AppLock>) => {
    const next = { ...lock, ...patch }
    setLock(next)
    saveAppLock(next)
  }

  async function enroll() {
    setBusy(true)
    setMsg(null)
    try {
      await addPasskey()
      setMsg({ ok: true, text: 'Biometric unlock is ready on this device.' })
    } catch (e) {
      const err = e as Error
      setMsg({ ok: false, text: err.name === 'NotAllowedError' ? 'Cancelled or timed out.' : err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Security">
      <div className="space-y-5 text-sm">
        <section className="flex gap-3">
          <ScanFace className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Unlock with Face ID / fingerprint {hasPasskey && <Badge tone="green">on</Badge>}
            </p>
            <p className="mt-0.5 text-stone-600 dark:text-stone-400">
              Uses a passkey on this device — Face ID or Touch ID on Apple devices, Windows Hello face or fingerprint, or Android biometrics. Your face never leaves the
              device: the passkey releases a key that decrypts your vault passphrase only after the device verifies you.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {hasPasskey ? (
                <Button variant="ghost" onClick={() => (removePasskey(), setMsg({ ok: true, text: 'Biometric unlock removed from this browser.' }))}>
                  Remove biometric unlock
                </Button>
              ) : (
                <Button disabled={busy || available === false} onClick={enroll}>
                  <ScanFace className="h-4 w-4" /> Set up biometric unlock
                </Button>
              )}
              {available === false && <span className="text-xs text-amber-800 dark:text-amber-400">No built-in face or fingerprint authenticator is available in this browser.</span>}
            </div>
            {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700'}`}>{msg.text}</p>}
            <p className="mt-2 text-xs text-stone-500">Set it up on each device separately. Your passphrase keeps working and is still needed if the passkey is lost.</p>
          </div>
        </section>

        <section className="flex gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={lock.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
              Lock the whole app until I unlock
            </label>
            <p className="mt-0.5 text-stone-600 dark:text-stone-400">
              Hides manuscripts, reviews and everything else behind the unlock screen (face, fingerprint or passphrase) whenever the vault is locked.
            </p>
          </div>
        </section>

        <section className="flex gap-3">
          <Timer className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Lock automatically when idle</p>
            <Select value={String(lock.idleMinutes)} onChange={(e) => update({ idleMinutes: Number(e.target.value) })} className="mt-1 w-auto">
              <option value="0">Never</option>
              {[5, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  After {m} minutes without activity
                </option>
              ))}
            </Select>
          </div>
        </section>

        <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600 dark:bg-stone-800/60 dark:text-stone-400">
          What this protects: your API keys are always encrypted. The app lock keeps people who pick up your unlocked computer or phone out of your work. It does
          not encrypt manuscripts stored in the browser against someone with full access to your user account and developer tools — use your device's own
          login and disk encryption for that, and keep sync encryption on.
        </p>
      </div>
    </Card>
  )
}
