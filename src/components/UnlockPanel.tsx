import { useState, type FormEvent } from 'react'
import { useVault } from '../store/vault'
import { KeyRound, ScanFace, ShieldCheck } from 'lucide-react'
import { LogoMark } from './Logo'
import { Button, Input } from './ui'

/** Shown wherever keys are needed but the vault is locked or not created yet. */
export function UnlockPanel() {
  const { status, unlock, reset, hasPasskey, unlockWithPasskey } = useVault()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const creating = status === 'empty'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (creating && pass.length < 8) return setError('Use at least 8 characters.')
    if (creating && pass !== confirm) return setError('Passphrases do not match.')
    setBusy(true)
    try {
      await unlock(pass)
      setPass('')
      setConfirm('')
    } catch {
      setError('Wrong passphrase.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto mt-4 max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-5 flex items-center gap-3">
        <LogoMark size={40} />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{creating ? 'Create your key vault' : 'Unlock your key vault'}</h2>
          <p className="text-xs text-stone-500">{creating ? 'One passphrase protects all your API keys' : 'Enter the passphrase you chose for this browser'}</p>
        </div>
      </div>
      <p className="mb-4 flex gap-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600 dark:bg-stone-800/60 dark:text-stone-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
        <span>
          {creating
            ? 'API keys are encrypted in this browser with a passphrase (AES-256-GCM). They are only sent to the AI provider you call — never to GitHub or any other server.'
            : 'Your keys stay encrypted until you unlock them for this session.'}
        </span>
      </p>
      {!creating && hasPasskey && (
        <div className="mb-4">
          <Button
            type="button"
            className="w-full min-h-11 text-base"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                await unlockWithPasskey()
              } catch (e) {
                setError((e as Error).name === 'NotAllowedError' ? 'Biometric check cancelled or timed out.' : (e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <ScanFace className="h-5 w-5" /> Unlock with Face ID / fingerprint
          </Button>
          <p className="mt-3 text-center text-xs text-stone-500">or use your passphrase</p>
        </div>
      )}
      <form onSubmit={submit} className="space-y-2">
        <Input type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus={creating || !hasPasskey} />
        {creating && (
          <Input type="password" placeholder="Confirm passphrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between pt-1">
          <Button type="submit" disabled={busy || !pass}>
            <KeyRound className="h-4 w-4" />
            {creating ? 'Create vault' : 'Unlock'}
          </Button>
          {!creating && (
            <button
              type="button"
              className="text-xs text-stone-500 underline"
              onClick={() => {
                if (confirm_('Forgot passphrase? This deletes all stored API keys (chats are kept).')) reset()
              }}
            >
              Forgot passphrase
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

function confirm_(msg: string) {
  return window.confirm(msg)
}
