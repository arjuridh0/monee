import type { MoneeDB } from '@/core/db/migrations'
import { STORES } from '@/core/db/schema'
import { verifyPin } from '@/core/security/pin'

const STORE_NAMES = Object.values(STORES)

export type DeleteAllDataErrorCode = 'ERR_DELETE_PIN_FORMAT' | 'ERR_DELETE_PIN' | 'ERR_DELETE_STALE' | 'ERR_DELETE_PROFILE'

export class DeleteAllDataError extends Error {
  constructor(readonly code: DeleteAllDataErrorCode, message: string) {
    super(message)
    this.name = 'DeleteAllDataError'
  }
}

export interface DeleteAllDataInput {
  pin?: string
  /** Hash shown by the settings screen when the destructive dialog opened. */
  expectedPinHash: string
}

export async function validateDeleteAllData(db: MoneeDB, input: DeleteAllDataInput): Promise<void> {
  const current = await db.get(STORES.profile, 'profile')
  if (!current) throw new DeleteAllDataError('ERR_DELETE_PROFILE', 'Profil tidak ditemukan. Muat ulang Monee.')
  if (current.pinHash !== input.expectedPinHash) {
    throw new DeleteAllDataError('ERR_DELETE_STALE', 'PIN berubah di tab lain. Muat ulang Monee lalu coba lagi.')
  }
  if (current.pinHash) {
    if (!/^\d{6}$/.test(input.pin ?? '')) {
      throw new DeleteAllDataError('ERR_DELETE_PIN_FORMAT', 'Masukkan PIN 6 digit untuk menghapus data.')
    }
    if (!(await verifyPin(input.pin!, current.pinHash, current.pinSalt))) {
      throw new DeleteAllDataError('ERR_DELETE_PIN', 'PIN belum cocok. Data kamu tetap aman.')
    }
  }
}

export async function deleteAllData(db: MoneeDB, input: DeleteAllDataInput): Promise<void> {
  await validateDeleteAllData(db, input)
  const current = await db.get(STORES.profile, 'profile')
  if (!current) throw new DeleteAllDataError('ERR_DELETE_PROFILE', 'Profil tidak ditemukan. Muat ulang Monee.')

  // Verify PIN outside IDB, then recheck the exact profile snapshot inside the clearing transaction.
  const tx = db.transaction(STORE_NAMES, 'readwrite')
  try {
    const stored = await tx.objectStore(STORES.profile).get('profile')
    if (!stored || stored.pinHash !== current.pinHash || stored.pinSalt !== current.pinSalt
      || stored.pinHash !== input.expectedPinHash) {
      throw new DeleteAllDataError('ERR_DELETE_STALE', 'PIN berubah di tab lain. Muat ulang Monee lalu coba lagi.')
    }
    for (const name of STORE_NAMES) await tx.objectStore(name).clear()
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* Transaction already aborted or completed. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
