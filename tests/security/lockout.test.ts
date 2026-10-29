/**
 * F2-5 -- lockout persist di IndexedDB (dok 09 §5, D52)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import {
  nextLockoutState, isLockedAt, lockoutRemainingSecondsAt,
  getLockoutState, recordFailedAttempt, resetLockout,
} from '@/core/security/lockout'

const NOW = 1_000_000

beforeEach(() => {
  // @ts-expect-error -- override global indexedDB dengan instance baru
  globalThis.indexedDB = new IDBFactory()
  resetDbSingleton()
})

describe('nextLockoutState', () => {
  it('dua percobaan pertama belum lock, percobaan ketiga mulai 5 detik', () => {
    let state = { attempts: 0, lockedUntil: 0 }
    for (let i = 1; i <= 2; i += 1) {
      state = nextLockoutState(state, NOW)
      expect(state.attempts).toBe(i)
      expect(state.lockedUntil).toBe(0)
    }
    state = nextLockoutState(state, NOW)
    expect(state.attempts).toBe(3)
    expect(state.lockedUntil).toBe(NOW + 5_000)
  })

  it('eskalasi delay 5s, 15s, 60s lalu tetap 60s', () => {
    let state = { attempts: 0, lockedUntil: 0 }
    const delays: number[] = []
    for (let i = 0; i < 7; i += 1) {
      state = nextLockoutState(state, NOW)
      delays.push(state.lockedUntil === 0 ? 0 : state.lockedUntil - NOW)
    }
    expect(delays).toEqual([0, 0, 5_000, 15_000, 60_000, 60_000, 60_000])
  })

  it('isLockedAt dan sisa detik mengikuti lockedUntil', () => {
    const state = { attempts: 3, lockedUntil: NOW + 5_000 }
    expect(isLockedAt(state, NOW)).toBe(true)
    expect(isLockedAt(state, NOW + 5_000)).toBe(false)
    expect(lockoutRemainingSecondsAt(state, NOW)).toBe(5)
    expect(lockoutRemainingSecondsAt(state, NOW + 4_000)).toBe(1)
    expect(lockoutRemainingSecondsAt(state, NOW + 9_000)).toBe(0)
  })
})

describe('persistensi lockout', () => {
  it('menghitung percobaan bersamaan dari dua koneksi tanpa kehilangan increment', async () => {
    const firstTab = await openDatabase()
    resetDbSingleton()
    const secondTab = await openDatabase()
    const results = await Promise.all([
      recordFailedAttempt(firstTab, NOW),
      recordFailedAttempt(secondTab, NOW),
      recordFailedAttempt(firstTab, NOW),
    ])
    expect(results.map(state => state.attempts).sort()).toEqual([1, 2, 3])
    expect(await getLockoutState(secondTab)).toEqual({ attempts: 3, lockedUntil: NOW + 5_000 })
  })

  it('menolak increment selama terkunci dan mengeskalasi sekali saat deadline berakhir', async () => {
    const firstTab = await openDatabase()
    resetDbSingleton()
    const secondTab = await openDatabase()
    await recordFailedAttempt(firstTab, NOW)
    await recordFailedAttempt(firstTab, NOW)
    await recordFailedAttempt(firstTab, NOW)

    expect(await recordFailedAttempt(secondTab, NOW + 4_999)).toEqual({ attempts: 3, lockedUntil: NOW + 5_000 })
    const concurrent = await Promise.all([
      recordFailedAttempt(firstTab, NOW + 5_000),
      recordFailedAttempt(secondTab, NOW + 5_000),
    ])
    expect(concurrent).toEqual([
      { attempts: 4, lockedUntil: NOW + 20_000 },
      { attempts: 4, lockedUntil: NOW + 20_000 },
    ])
    expect(await recordFailedAttempt(firstTab, NOW + 20_000)).toEqual({ attempts: 5, lockedUntil: NOW + 80_000 })
    expect(await recordFailedAttempt(firstTab, NOW + 80_000)).toEqual({ attempts: 6, lockedUntil: NOW + 140_000 })
  })

  it('state bertahan setelah koneksi DB di-reset (simulasi reload)', async () => {
    const db = await openDatabase()
    await recordFailedAttempt(db, NOW)
    await recordFailedAttempt(db, NOW)
    const locked = await recordFailedAttempt(db, NOW)
    expect(locked.attempts).toBe(3)
    expect(locked.lockedUntil).toBe(NOW + 5_000)

    resetDbSingleton()
    const reopened = await openDatabase()
    expect(await getLockoutState(reopened)).toEqual({ attempts: 3, lockedUntil: NOW + 5_000 })
  })

  it('default nol saat store kosong', async () => {
    const db = await openDatabase()
    expect(await getLockoutState(db)).toEqual({ attempts: 0, lockedUntil: 0 })
  })

  it('reset menghapus lockout tersimpan', async () => {
    const db = await openDatabase()
    await recordFailedAttempt(db, NOW)
    await recordFailedAttempt(db, NOW)
    await recordFailedAttempt(db, NOW)
    await resetLockout(db)

    resetDbSingleton()
    const reopened = await openDatabase()
    expect(await getLockoutState(reopened)).toEqual({ attempts: 0, lockedUntil: 0 })
  })
})
