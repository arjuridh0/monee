/**
 * F2-4 -- guard periode terkunci di layer repository (dok 08 §6, D53)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { profileRepo, sweepRepo, transactionRepo } from '@/core/db/repositories'
import type { Profile, Transaction, MonthSweep } from '@/core/finance/types'

beforeEach(() => {
  // @ts-expect-error -- override global indexedDB dengan instance baru
  globalThis.indexedDB = new IDBFactory()
  resetDbSingleton()
})

const mkProfile = (): Profile => ({
  id: 'profile', name: 'Test', mascotId: 'mochi',
  periodStartDay: 1, defaultBucketId: 'bucket-needs',
  pinHash: 'abc', pinSalt: 'def', createdAt: 1,
})

const mkTx = (id: string, date: string): Transaction => ({
  id, type: 'income', amount: 100_000, date,
  categoryId: 'cat-gaji', refundedAmount: 0, deleted: false,
  createdAt: 1, updatedAt: 1,
})

const mkSweep = (periodKey: string): MonthSweep => ({
  id: `sweep-${periodKey}`, periodKey, amount: 0,
  perBucketDetail: [], sweptAt: 1,
})

async function setupLocked(): Promise<void> {
  const db = await openDatabase()
  await profileRepo.save(db, mkProfile())
  await sweepRepo.save(db, mkSweep('2026-09'))
}

describe('transactionRepo period lock', () => {
  it('menolak transaksi baru di periode yang sudah disweep', async () => {
    await setupLocked()
    const db = await openDatabase()
    await expect(
      transactionRepo.save(db, mkTx('tx-locked', '2026-09-10')),
    ).rejects.toThrow('ERR_PERIODE_TERKUNCI')
    expect(await transactionRepo.getById(db, 'tx-locked')).toBeUndefined()
  })

  it('mengizinkan transaksi di periode berjalan', async () => {
    await setupLocked()
    const db = await openDatabase()
    await transactionRepo.save(db, mkTx('tx-open', '2026-10-01'))
    expect(await transactionRepo.getById(db, 'tx-open')).toBeDefined()
  })

  it('menolak delete transaksi di periode terkunci', async () => {
    await setupLocked()
    const db = await openDatabase()
    await db.put('transactions', mkTx('tx-old', '2026-09-05'))

    await expect(transactionRepo.delete(db, 'tx-old')).rejects.toThrow('ERR_PERIODE_TERKUNCI')
    expect(await transactionRepo.getById(db, 'tx-old')).toBeDefined()
  })

  it('menolak edit transaksi terkunci walau tanggal baru pindah ke periode terbuka', async () => {
    await setupLocked()
    const db = await openDatabase()
    await db.put('transactions', mkTx('tx-old', '2026-09-05'))

    await expect(
      transactionRepo.save(db, { ...mkTx('tx-old', '2026-10-01'), updatedAt: 2 }),
    ).rejects.toThrow('ERR_PERIODE_TERKUNCI')
  })

  it('tetap mengizinkan CRUD saat belum ada sweep', async () => {
    const db = await openDatabase()
    await profileRepo.save(db, mkProfile())
    await transactionRepo.save(db, mkTx('tx-1', '2026-09-05'))
    await transactionRepo.delete(db, 'tx-1')
    expect(await transactionRepo.getById(db, 'tx-1')).toBeUndefined()
  })
})
