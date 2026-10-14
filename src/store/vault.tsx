import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { decryptJson, deriveDataKey, encryptJson, type EncryptedBlob } from '../lib/crypto'
import { enrollPasskey, passkeyEnrolled, passphraseFromPasskey, removePasskey } from '../lib/passkey'
import { readJson, removeKey, writeJson } from '../lib/storage'
import type { ProviderId } from '../ai/types'

const VAULT_KEY = 'gm.vault'

export type Secrets = Partial<Record<ProviderId, string>> & { githubToken?: string; openalexKey?: string }

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
  /** AES key derived from the vault passphrase and `salt`, for encrypting synced data. The passphrase itself never leaves the vault. */
  dataKey: (saltB64: string) => Promise<CryptoKey>
  /** A passkey (face or fingerprint) can unlock the vault on this device. */
  hasPasskey: boolean
  /** Sets up biometric unlock for the current passphrase (vault must be unlocked). */
  addPasskey: () => Promise<void>
  removePasskey: () => void
  unlockWithPasskey: () => Promise<void>
}

const Ctx = createContext<VaultCtx | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [hasVault, setHasVault] = useState(() => readJson<EncryptedBlob | null>(VAULT_KEY, null) !== null)
  const [passphrase, setPassphrase] = useState<string | null>(null)
  const [secrets, setSecrets] = useState<Secrets>({})
  const [hasPasskey, setHasPasskey] = useState(passkeyEnrolled)

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
    removePasskey()
    setHasPasskey(false)
    setHasVault(false)
    lock()
  }, [lock])

  const dataKey = useCallback(
    (saltB64: string) => {
      if (!passphrase) return Promise.reject(new Error('Vault is locked'))
      return deriveDataKey(passphrase, saltB64)
    },
    [passphrase],
  )

  const addPasskey = useCallback(async () => {
    if (!passphrase) throw new Error('Unlock the vault first.')
    await enrollPasskey(passphrase)
    setHasPasskey(true)
  }, [passphrase])

  const dropPasskey = useCallback(() => {
    removePasskey()
    setHasPasskey(false)
  }, [])

  const unlockWithPasskey = useCallback(async () => {
    const pass = await passphraseFromPasskey()
    try {
      await unlock(pass)
    } catch {
      throw new Error('The stored passphrase no longer opens this vault. Unlock with your passphrase and set up biometric unlock again.')
    }
  }, [unlock])

  const status: VaultStatus = passphrase ? 'unlocked' : hasVault ? 'locked' : 'empty'
  const value = useMemo(
    () => ({ status, secrets, unlock, lock, save, reset, dataKey, hasPasskey, addPasskey, removePasskey: dropPasskey, unlockWithPasskey }),
    [status, secrets, unlock, lock, save, reset, dataKey, hasPasskey, addPasskey, dropPasskey, unlockWithPasskey],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVault(): VaultCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useVault must be used inside VaultProvider')
  return v
}
