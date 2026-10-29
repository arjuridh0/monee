import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { goalRepo, profileRepo, seedDefaultData, sweepRepo, transactionRepo } from '@/core/db/repositories'
import { recordSavingsDeposit, recordSavingsExpense } from '@/features/savings/persistence'
import { commitGoalUse } from '@/features/savings/goal-persistence'
import { useMoneeStore } from '@/store'

beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('indexedDB', new IDBFactory())
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-24T03:00:00Z'))
  resetDbSingleton()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
  const db = await openDatabase(); await seedDefaultData(db)
  await profileRepo.save(db, { id: 'profile', name: 'Nara', mascotId: 'mochi', pinHash: 'hash', pinSalt: 'salt',
    periodStartDay: 1, defaultBucketId: 'bucket-needs', createdAt: 0 })
  await transactionRepo.save(db, { id: 'income', type: 'income', amount: 1000000, date: '2026-10-24', categoryId: 'cat-gaji', createdAt: 0, updatedAt: 0 })
  await recordSavingsDeposit(db, { amount: 300000, note: '' })
  await goalRepo.save(db, { id: 'camera', name: 'Kamera', targetAmount: 200000, sortOrder: 0, createdAt: 0 })
})
afterEach(async () => { (await openDatabase()).close(); resetDbSingleton(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('atomic savings mutations', () => {
  it('serializes concurrent outflows so only one can consume the available Allocation', async () => {
    const db = await openDatabase()
    const results = await Promise.allSettled([1, 2].map(() => recordSavingsExpense(db, { amount: 200000, note: 'Pakai dana', savingsSource: 'allocation' })))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: expect.stringContaining('ERR_KOMPARTEMEN_KURANG') }) })
    expect((await transactionRepo.getAll(db)).filter(tx => tx.type === 'savings_expense')).toHaveLength(1)
  })
  it('uses one goal only once across concurrent callers and persists both records atomically', async () => {
    const db = await openDatabase()
    const results = await Promise.allSettled([commitGoalUse(db, 'camera', 200000), commitGoalUse(db, 'camera', 200000)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((await transactionRepo.getAll(db)).filter(tx => tx.type === 'savings_expense')).toHaveLength(1)
    expect((await goalRepo.getAll(db)).find(goal => goal.id === 'camera')).toHaveProperty('usedAt', Date.now())
  })
  it('rejects a goal after funds regress and leaves the goal and ledger unchanged', async () => {
    const db = await openDatabase()
    await recordSavingsExpense(db, { amount: 150000, note: 'Kebutuhan lain', savingsSource: 'allocation' })
    await expect(commitGoalUse(db, 'camera', 200000)).rejects.toThrow('ERR_GOAL_BELUM_CUKUP')
    expect((await goalRepo.getAll(db))[0]).not.toHaveProperty('usedAt')
    expect(await transactionRepo.getById(db, 'goal-use:camera')).toBeUndefined()
  })
  it('respects priority even when the raw Allocation balance meets a later goal target', async () => {
    const db = await openDatabase()
    await goalRepo.save(db, { id: 'second', name: 'Liburan', targetAmount: 200000, sortOrder: 1, createdAt: 1 })
    await expect(commitGoalUse(db, 'second', 200000)).rejects.toThrow('ERR_GOAL_BELUM_CUKUP')
  })
  it('rejects goal use and free outflow in a closed period without partial writes', async () => {
    const db = await openDatabase()
    await sweepRepo.save(db, { id: 'closed', periodKey: '2026-10', amount: 0, perBucketDetail: [], sweptAt: 0 })
    await expect(commitGoalUse(db, 'camera', 200000)).rejects.toThrow('ERR_PERIODE_TERKUNCI')
    await expect(recordSavingsExpense(db, { amount: 1000, note: 'Tertutup', savingsSource: 'allocation' })).rejects.toThrow('ERR_PERIODE_TERKUNCI')
    expect(await transactionRepo.getById(db, 'goal-use:camera')).toBeUndefined()
    expect((await goalRepo.getAll(db))[0]).not.toHaveProperty('usedAt')
  })
  it('rejects a changed target and missing expense notes', async () => {
    const db = await openDatabase()
    await expect(commitGoalUse(db, 'camera', 100000)).rejects.toThrow('Target tujuan berubah')
    await expect(recordSavingsExpense(db, { amount: 1000, note: ' ', savingsSource: 'allocation' })).rejects.toThrow('ERR_NOTE_REQUIRED')
  })
  it('prevents a stale editor from overwriting or deleting a goal after another tab used it', async () => {
    const db = await openDatabase()
    const stale = (await goalRepo.getAll(db))[0]!
    await commitGoalUse(db, stale.id, stale.targetAmount)
    await expect(useMoneeStore.getState().saveGoal({ ...stale, name: 'Diubah dari tab lama' })).rejects.toThrow('sudah digunakan')
    await expect(useMoneeStore.getState().deleteGoal(stale.id)).rejects.toThrow('sudah digunakan')
    expect((await goalRepo.getAll(db))[0]).toHaveProperty('usedAt')
  })
})
