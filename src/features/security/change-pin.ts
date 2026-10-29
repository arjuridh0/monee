import type { MoneeDB } from '@/core/db/migrations'
import type { Profile } from '@/core/finance/types'
import { LOCKOUT_KEY } from '@/core/security/lockout'
import { generateSalt, hashPin, verifyPin } from '@/core/security/pin'

export type ChangePinErrorCode =
  | 'ERR_PIN_FORMAT'
  | 'ERR_PIN_SAME'
  | 'ERR_CURRENT_PIN'
  | 'ERR_PROFILE_MISSING'
  | 'ERR_PROFILE_STALE'

export class ChangePinError extends Error {
  readonly code: ChangePinErrorCode

  constructor(code: ChangePinErrorCode, message: string) {
    super(message)
    this.name = 'ChangePinError'
    this.code = code
  }
}

export interface ChangePinInput {
  currentPin: string
  newPin: string
  /** Hash shown to the user; a mismatch means another tab changed the PIN. */
  expectedPinHash: string
}

export async function changePin(db: MoneeDB, input: ChangePinInput): Promise<Profile> {
  if (!/^\d{6}$/.test(input.newPin)) {
    throw new ChangePinError('ERR_PIN_FORMAT', 'PIN baru harus terdiri dari 6 angka.')
  }
  if (input.currentPin === input.newPin) {
    throw new ChangePinError('ERR_PIN_SAME', 'PIN baru harus berbeda dari PIN sekarang.')
  }

  const current = await db.get('profile', 'profile')
  if (!current) {
    throw new ChangePinError('ERR_PROFILE_MISSING', 'Profil belum tersedia. Muat ulang Monee.')
  }
  if (!current.pinHash || current.pinHash !== input.expectedPinHash) {
    throw new ChangePinError('ERR_PROFILE_STALE', 'PIN sudah berubah di tab lain. Muat ulang Monee.')
  }
  if (!(await verifyPin(input.currentPin, current.pinHash, current.pinSalt))) {
    throw new ChangePinError('ERR_CURRENT_PIN', 'PIN sekarang belum cocok.')
  }

  // Web Crypto must finish before opening IDB's short-lived transaction.
  const pinSalt = generateSalt()
  const pinHash = await hashPin(input.newPin, pinSalt)

  const tx = db.transaction(['profile', 'lockout'], 'readwrite')
  try {
    const stored = await tx.objectStore('profile').get('profile')
    if (!stored) {
      throw new ChangePinError('ERR_PROFILE_MISSING', 'Profil belum tersedia. Muat ulang Monee.')
    }
    if (stored.pinHash !== input.expectedPinHash) {
      throw new ChangePinError('ERR_PROFILE_STALE', 'PIN sudah berubah di tab lain. Muat ulang Monee.')
    }
    const latest = { ...stored, pinHash, pinSalt }
    await tx.objectStore('profile').put(latest)
    await tx.objectStore('lockout').delete(LOCKOUT_KEY)
    await tx.done
    return latest
  } catch (error) {
    try { tx.abort() } catch { /* Already aborted or completed. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
