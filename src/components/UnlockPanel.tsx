import { useState, type FormEvent } from 'react'
import { useVault } from '../store/vault'
import { Button, Card, Input } from './ui'

/** Shown wherever keys are needed but the vault is locked or not created yet. */
export function UnlockPanel() {
  const { status, unlock, reset } = useVault()
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
    <Card title={creating ? 'Create your key vault' : 'Unlock your key vault'} className="mx-auto max-w-md">
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
        {creating
          ? 'API keys are encrypted in this browser with a passphrase (AES-256-GCM). They are only sent to the AI provider you call — never to GitHub or any other server.'
          : 'Enter your passphrase to decrypt your API keys for this session.'}
      </p>
      <form onSubmit={submit} className="space-y-2">
        <Input type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        {creating && (
          <Input type="password" placeholder="Confirm passphrase" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between pt-1">
          <Button type="submit" disabled={busy || !pass}>
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
    </Card>
  )
}

function confirm_(msg: string) {
  return window.confirm(msg)
}
