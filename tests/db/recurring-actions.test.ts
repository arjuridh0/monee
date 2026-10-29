import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { recurringRepo, seedDefaultData, transactionRepo } from '@/core/db/repositories'
import type { RecurringIncome, Transaction } from '@/core/finance/types'
import { deleteRecurringIncome, saveRecurringIncome } from '@/features/settings/recurring-persistence'

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  resetDbSingleton()
  await seedDefaultData(await openDatabase())
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetDbSingleton()
})

const recurring: RecurringIncome = {
  id: 'salary-primary', name: 'Gaji Utama', amount: 5_000_000,
  dayOfMonth: 25, categoryId: 'cat-gaji', isActive: true, createdAt: 1_000,
}

describe('recurring income persistence', () => {
  it('creates a recurring income after trimming its name', async () => {
    const db = await openDatabase()

    await saveRecurringIncome(db, { ...recurring, name: '  Gaji Utama  ' })

    expect(await recurringRepo.getAll(db)).toEqual([recurring])
  })

  it('updates a template from its current snapshot and preserves creation time', async () => {
    const db = await openDatabase()
    await recurringRepo.save(db, recurring)
    const updated = { ...recurring, name: 'Gaji Kantor', amount: 6_000_000, isActive: false }

    await saveRecurringIncome(db, updated, recurring)

    expect(await recurringRepo.getAll(db)).toEqual([updated])
  })

  it('rejects a stale editor without replacing the newer template', async () => {
    const db = await openDatabase()
    await recurringRepo.save(db, recurring)
    const newer = { ...recurring, amount: 6_000_000 }
    await recurringRepo.save(db, newer)

    await expect(saveRecurringIncome(db, { ...recurring, name: 'Gaji baru' }, recurring))
      .rejects.toMatchObject({ code: 'ERR_RECURRING_STALE' })
    expect(await recurringRepo.getAll(db)).toEqual([newer])
  })

  it('requires a valid positive integer amount, due day, and name', async () => {
    const db = await openDatabase()
    for (const invalid of [
      { ...recurring, name: '  ' },
      { ...recurring, name: 'x'.repeat(41) },
      { ...recurring, amount: 0 },
      { ...recurring, amount: 1.5 },
      { ...recurring, dayOfMonth: 0 },
      { ...recurring, dayOfMonth: 29 },
    ]) {
      await expect(saveRecurringIncome(db, invalid)).rejects.toMatchObject({ code: 'ERR_RECURRING_INVALID' })
    }
    expect(await recurringRepo.getAll(db)).toEqual([])
  })

  it('only allows an income category', async () => {
    const db = await openDatabase()

    await expect(saveRecurringIncome(db, { ...recurring, categoryId: 'cat-makan' }))
      .rejects.toMatchObject({ code: 'ERR_RECURRING_CATEGORY' })
    expect(await recurringRepo.getAll(db)).toEqual([])
  })

  it('deletes a template while retaining income transactions already recorded from it', async () => {
    const db = await openDatabase()
    await recurringRepo.save(db, recurring)
    const transaction: Transaction = {
      id: 'recurring:salary-primary:2026-10', type: 'income', amount: recurring.amount,
      date: '2026-10-25', categoryId: recurring.categoryId, recurringId: recurring.id,
      refundedAmount: 0, deleted: false, createdAt: 2_000, updatedAt: 2_000,
    }
    await transactionRepo.save(db, transaction)

    await deleteRecurringIncome(db, recurring.id)

    expect(await recurringRepo.getAll(db)).toEqual([])
    expect(await transactionRepo.getAll(db)).toEqual([transaction])
  })

  it('rejects deleting a template that is no longer in the current list', async () => {
    const db = await openDatabase()

    await expect(deleteRecurringIncome(db, recurring.id)).rejects.toMatchObject({ code: 'ERR_RECURRING_STALE' })
  })
})
