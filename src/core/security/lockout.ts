/**
 * Lockout persist -- dok 09 §5, D52
 * State disimpan di IndexedDB agar bertahan lintas reload/restart.
 */
import type { MoneeDB } from '@/core/db/migrations'
import { STORES } from '@/core/db/schema'
import type { LockoutState, Timestamp } from '@/core/finance/types'

export const LOCKOUT_KEY = 'lockout'

/** index = jumlah percobaan; 0-2 belum lock, lalu 5s, 15s, 60s */
export const LOCKOUT_DELAYS_MS = [0, 0, 0, 5_000, 15_000, 60_000]

const EMPTY: LockoutState = { attempts: 0, lockedUntil: 0 }

/** Hitung state berikutnya setelah satu PIN salah. */
export function nextLockoutState(state: LockoutState, now: Timestamp): LockoutState {
  const attempts = state.attempts + 1
  const index = Math.min(attempts, LOCKOUT_DELAYS_MS.length - 1)
  const delayMs = LOCKOUT_DELAYS_MS[index] ?? 60_000
  return {
    attempts,
    lockedUntil: delayMs > 0 ? now + delayMs : 0,
  }
}

export function isLockedAt(state: LockoutState, now: Timestamp): boolean {
  return now < state.lockedUntil
}

export function lockoutRemainingSecondsAt(state: LockoutState, now: Timestamp): number {
  return Math.max(0, Math.ceil((state.lockedUntil - now) / 1000))
}

export async function getLockoutState(db: MoneeDB): Promise<LockoutState> {
  const row = await db.get(STORES.lockout, LOCKOUT_KEY)
  if (!row) return { ...EMPTY }
  return { attempts: row.attempts, lockedUntil: row.lockedUntil }
}

export async function saveLockoutState(db: MoneeDB, state: LockoutState): Promise<void> {
  await db.put(STORES.lockout, {
    key: LOCKOUT_KEY,
    attempts: state.attempts,
    lockedUntil: state.lockedUntil,
  })
}

/** Catat PIN salah secara atomik lintas tab; percobaan saat terkunci diabaikan. */
export async function recordFailedAttempt(
  db: MoneeDB,
  now: Timestamp = Date.now(),
): Promise<LockoutState> {
  const tx = db.transaction(STORES.lockout, 'readwrite')
  try {
    const row = await tx.store.get(LOCKOUT_KEY)
    const current = row
      ? { attempts: row.attempts, lockedUntil: row.lockedUntil }
      : { ...EMPTY }
    // Read and write must share the transaction so concurrent tabs serialize.
    if (isLockedAt(current, now)) {
      await tx.done
      return current
    }
    const next = nextLockoutState(current, now)
    await tx.store.put({ key: LOCKOUT_KEY, ...next })
    await tx.done
    return next
  } catch (error) {
    try { tx.abort() } catch { /* Already aborted or completed. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}

/** Reset setelah PIN benar. */
export async function resetLockout(db: MoneeDB, expected?: { pinHash: string; pinSalt: string }): Promise<void> {
  const tx = db.transaction(['profile', 'lockout'], 'readwrite')
  try {
    if (expected) {
      const profile = await tx.objectStore('profile').get('profile')
      if (!profile || profile.pinHash !== expected.pinHash || profile.pinSalt !== expected.pinSalt) {
        throw new Error('ERR_PROFILE_STALE — PIN berubah. Coba masuk dengan PIN terbaru.')
      }
    }
    await tx.objectStore('lockout').delete(LOCKOUT_KEY); await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* Already ended. */ }
    await tx.done.catch(() => undefined); throw error
  }
}
