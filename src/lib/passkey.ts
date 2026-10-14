// Biometric unlock with a passkey (WebAuthn): Face ID, Touch ID, Windows Hello or an Android fingerprint/face.
// The WebAuthn PRF extension gives a secret that only the authenticator can produce after the user is verified; it is
// turned into an AES key (HKDF) that encrypts the vault passphrase. No biometric data ever reaches the app.
import { readJson, removeKey, writeJson } from './storage'

const KEY = 'gm.passkey'

interface Enrolment {
  credentialId: string
  salt: string
  iv: string
  ct: string
  createdAt: number
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

export function passkeyEnrolled(): boolean {
  return readJson<Enrolment | null>(KEY, null) !== null
}

export function removePasskey(): void {
  removeKey(KEY)
}

/** WebAuthn with a built-in (platform) authenticator is available; PRF support is only known after trying. */
export async function passkeyAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential || !window.isSecureContext) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

async function aesFrom(prf: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('geomine-vault'), info: enc.encode('passphrase-wrap') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } }

/** Gets the PRF output for an existing credential (this is where the face or fingerprint check happens). */
async function evaluate(credentialId: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  const out = (assertion?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first
  if (!out) throw new Error('This device or browser does not support passkey encryption (WebAuthn PRF). Keep using your passphrase.')
  return out
}

/** Creates a passkey on this device and stores the passphrase encrypted with the key it unlocks. */
export async function enrollPasskey(passphrase: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'GeoMine Studio', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'geomine-vault', displayName: 'GeoMine Studio vault' },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Passkey creation was cancelled.')
  const id = new Uint8Array(cred.rawId)
  const ext = cred.getClientExtensionResults() as PrfResults
  if (ext.prf?.enabled === false) throw new Error('This device or browser does not support passkey encryption (WebAuthn PRF). Keep using your passphrase.')
  // Some authenticators return the PRF output only when the credential is used, so ask once more.
  const prf = ext.prf?.results?.first ?? (await evaluate(id, salt))
  const key = await aesFrom(prf)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(passphrase))
  writeJson(KEY, { credentialId: b64(id), salt: b64(salt), iv: b64(iv), ct: b64(ct), createdAt: Date.now() } satisfies Enrolment)
}

/** Asks for the face or fingerprint and returns the vault passphrase. */
export async function passphraseFromPasskey(): Promise<string> {
  const e = readJson<Enrolment | null>(KEY, null)
  if (!e) throw new Error('No passkey is set up on this device.')
  const prf = await evaluate(unb64(e.credentialId), unb64(e.salt))
  const key = await aesFrom(prf)
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, key, unb64(e.ct))
    return dec.decode(pt)
  } catch {
    throw new Error('The passkey did not match. Unlock with your passphrase and set up biometric unlock again.')
  }
}
