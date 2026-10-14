import { readJson, writeJson } from '../lib/storage'

const KEY = 'gm.appLock'

export interface AppLock {
  /** Hide the whole app until the vault is unlocked. */
  enabled: boolean
  /** Lock the vault after this many minutes without activity; 0 disables auto-lock. */
  idleMinutes: number
}

export function loadAppLock(): AppLock {
  return { enabled: false, idleMinutes: 0, ...readJson<Partial<AppLock>>(KEY, {}) }
}

export function saveAppLock(a: AppLock): void {
  writeJson(KEY, a)
  window.dispatchEvent(new Event('gm-applock'))
}
