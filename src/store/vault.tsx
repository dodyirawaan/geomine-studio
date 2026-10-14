import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { decryptJson, encryptJson, type EncryptedBlob } from '../lib/crypto'
import { readJson, removeKey, writeJson } from '../lib/storage'
import type { ProviderId } from '../ai/types'

const VAULT_KEY = 'gm.vault'

export type Secrets = Partial<Record<ProviderId, string>> & { githubToken?: string }

type VaultStatus = 'empty' | 'locked' | 'unlocked'

interface VaultCtx {
  status: VaultStatus
  secrets: Secrets
  /** Create a new vault, or unlock the existing one. Throws on a wrong passphrase. */
  unlock: (passphrase: string) => Promise<void>
  lock: () => void
  save: (next: Secrets) => Promise<void>
  /** Delete the stored vault entirely (used when the passphrase is forgotten). */
  reset: () => void
}

const Ctx = createContext<VaultCtx | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [hasVault, setHasVault] = useState(() => readJson<EncryptedBlob | null>(VAULT_KEY, null) !== null)
  const [passphrase, setPassphrase] = useState<string | null>(null)
  const [secrets, setSecrets] = useState<Secrets>({})

  const unlock = useCallback(async (pass: string) => {
    const blob = readJson<EncryptedBlob | null>(VAULT_KEY, null)
    if (blob) {
      const data = await decryptJson<Secrets>(blob, pass)
      setSecrets(data)
    } else {
      writeJson(VAULT_KEY, await encryptJson({}, pass))
      setHasVault(true)
      setSecrets({})
    }
    setPassphrase(pass)
  }, [])

  const lock = useCallback(() => {
    setPassphrase(null)
    setSecrets({})
  }, [])

  const save = useCallback(
    async (next: Secrets) => {
      if (!passphrase) throw new Error('Vault is locked')
      const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v && v.trim())) as Secrets
      writeJson(VAULT_KEY, await encryptJson(clean, passphrase))
      setSecrets(clean)
    },
    [passphrase],
  )

  const reset = useCallback(() => {
    removeKey(VAULT_KEY)
    setHasVault(false)
    lock()
  }, [lock])

  const status: VaultStatus = passphrase ? 'unlocked' : hasVault ? 'locked' : 'empty'
  const value = useMemo(() => ({ status, secrets, unlock, lock, save, reset }), [status, secrets, unlock, lock, save, reset])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVault(): VaultCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useVault must be used inside VaultProvider')
  return v
}
