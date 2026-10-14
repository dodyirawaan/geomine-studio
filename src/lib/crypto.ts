// Passphrase-based encryption for API keys stored in localStorage.
// AES-GCM 256 with a PBKDF2-SHA256 derived key; nothing secret is ever stored in plaintext.

const ITERATIONS = 310_000

export interface EncryptedBlob {
  v: 1
  salt: string
  iv: string
  ct: string
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptJson(data: unknown, passphrase: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)))
  return { v: 1, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) }
}

/** Throws if the passphrase is wrong (AES-GCM authentication fails). */
export async function decryptJson<T>(blob: EncryptedBlob, passphrase: string): Promise<T> {
  const key = await deriveKey(passphrase, fromB64(blob.salt))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct))
  return JSON.parse(dec.decode(pt)) as T
}

// ---------- Many records under one key (sync, backups) ----------

export interface KeyedBlob {
  v: 2
  iv: string
  ct: string
}

export function randomSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)))
}

/** Derives a data key once, so many records can be encrypted without repeating PBKDF2. */
export function deriveDataKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  return deriveKey(passphrase, fromB64(saltB64))
}

export async function encryptWithKey(data: unknown, key: CryptoKey): Promise<KeyedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)))
  return { v: 2, iv: toB64(iv), ct: toB64(ct) }
}

/** Throws if the key is wrong or the data was tampered with. */
export async function decryptWithKey<T>(blob: KeyedBlob, key: CryptoKey): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct))
  return JSON.parse(dec.decode(pt)) as T
}

/** Hex SHA-256 of a string, to detect which records changed since the last sync. */
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
