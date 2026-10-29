import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, expect, it } from 'vitest'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { seedDefaultData } from '@/core/db/repositories'
import { persistTransaction } from '@/features/transactions/persistence'
import { getToday } from '@/core/finance/period'
import type { Transaction } from '@/core/finance/types'

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); resetDbSingleton() })
const income = (): Transaction => ({ id: 'income', type: 'income', categoryId: 'cat-gaji', amount: 100000, date: getToday(), createdAt: 1, updatedAt: 1 })
it('rejects stale updates and preserves the current transaction', async () => {
  const db = await openDatabase(); await seedDefaultData(db)
  const original = income(); await persistTransaction(db, original)
  await persistTransaction(db, { ...original, amount: 110000, updatedAt: 2 }, original)
  await expect(persistTransaction(db, { ...original, amount: 120000 }, original)).rejects.toThrow('ERR_TRANSACTION_STALE')
  expect((await db.get('transactions', original.id))?.amount).toBe(110000)
})
it('allows income correction below existing spending and partial recovery', async () => {
  const db = await openDatabase(); await seedDefaultData(db)
  const original = income(); await persistTransaction(db, original)
  await persistTransaction(db, { id: 'spend', type: 'expense', amount: 10000, bucketId: 'bucket-needs', categoryId: 'cat-makan', date: getToday(), createdAt: 2, updatedAt: 2 })
  const corrected = { ...original, amount: 1000, updatedAt: 2 }
  await persistTransaction(db, corrected, original)
  await persistTransaction(db, { ...income(), id: 'partial-recovery', amount: 1000 })
  const expense = (await db.get('transactions', 'spend'))!
  await persistTransaction(db, { ...expense, refundedAmount: 1000 }, expense)
  expect((await db.get('transactions', original.id))?.amount).toBe(1000)
  await expect(persistTransaction(db, { ...expense, id: 'new-expense', amount: 1 })).rejects.toThrow()
  await expect(persistTransaction(db, { ...expense, id: 'new-deposit', type: 'savings_deposit', bucketId: 'bucket-savings', amount: 1 })).rejects.toThrow()
  await persistTransaction(db, { ...corrected, deleted: true }, corrected)
  expect((await db.get('transactions', original.id))?.deleted).toBe(true)
})
it('serializes concurrent expenses against the same remaining bucket funds', async () => {
  const db = await openDatabase(); await seedDefaultData(db)
  await persistTransaction(db, income())
  const expense = (id: string): Transaction => ({ id, type: 'expense', amount: 40000, bucketId: 'bucket-needs', categoryId: 'cat-makan', date: getToday(), createdAt: 2, updatedAt: 2 })
  const results = await Promise.allSettled([persistTransaction(db, expense('one')), persistTransaction(db, expense('two'))])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect((await db.getAll('transactions')).filter(item => item.type === 'expense')).toHaveLength(1)
})
it('does not undo a savings deposit already spent from Allocation', async () => {
  const db = await openDatabase(); await seedDefaultData(db)
  await persistTransaction(db, income())
  const deposit: Transaction = { id: 'deposit', type: 'savings_deposit', amount: 10000, bucketId: 'bucket-savings', categoryId: 'cat-tabungan', date: getToday(), createdAt: 2, updatedAt: 2 }
  await persistTransaction(db, deposit)
  await persistTransaction(db, { id: 'use', type: 'savings_expense', savingsSource: 'allocation', note: 'Belanja', amount: 10000, date: getToday(), createdAt: 3, updatedAt: 3 })
  await expect(persistTransaction(db, { ...deposit, deleted: true }, deposit)).rejects.toThrow('ERR_KOMPARTEMEN_KURANG')
})

it('rejects malformed transaction shapes before touching the ledger', async () => {
  const db = await openDatabase(); await seedDefaultData(db)
  await persistTransaction(db, income())
  for (const patch of [
    { date: '2026-02-30' }, { type: 'unknown' }, { categoryId: undefined },
    { bucketId: 'bucket-needs' }, { savingsSource: 'allocation' }, { deleted: 'yes' },
    { note: {} }, { createdAt: -1 }, { amount: Number.MAX_SAFE_INTEGER },
  ]) {
    await expect(persistTransaction(db, { ...income(), id: 'bad', ...patch } as Transaction)).rejects.toThrow()
    expect(await db.get('transactions', 'bad')).toBeUndefined()
  }
})

it('corrects and reverses canonical goal spending together with the linked goal', async () => {
  const db = await openDatabase(); await seedDefaultData(db)
  await persistTransaction(db, income())
  await persistTransaction(db, { ...income(), id: 'deposit', type: 'savings_deposit', amount: 20000, categoryId: 'cat-tabungan', bucketId: 'bucket-savings' })
  const expense: Transaction = { id: 'goal-use:phone', type: 'savings_expense', amount: 10000, date: getToday(), savingsSource: 'allocation', note: 'Phone', createdAt: 2, updatedAt: 2 }
  await db.put('goals', { id: 'phone', name: 'Phone', targetAmount: 10000, usedAt: 2, sortOrder: 0, createdAt: 1 })
  await db.put('transactions', expense)
  const corrected = { ...expense, amount: 12000, note: 'Phone + case', updatedAt: 3 }
  await persistTransaction(db, corrected, expense)
  expect((await db.get('goals', 'phone'))?.targetAmount).toBe(12000)
  await persistTransaction(db, { ...corrected, deleted: true }, corrected)
  expect((await db.get('goals', 'phone'))?.usedAt).toBeUndefined()
  expect((await db.get('transactions', expense.id))?.deleted).toBe(true)
})

it('rejects income whose eventual closure would overflow existing savings', async () => {
  const db = await openDatabase(); await seedDefaultData(db)
  await db.put('monthSweeps', { id: 'huge', periodKey: '0001-01', amount: Number.MAX_SAFE_INTEGER, perBucketDetail: [], sweptAt: 1 })
  await expect(persistTransaction(db, { ...income(), amount: 1 })).rejects.toThrow('ERR_AMOUNT_INVALID')
  expect(await db.count('transactions')).toBe(0)
})
