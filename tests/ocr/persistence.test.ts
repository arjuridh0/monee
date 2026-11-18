import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, expect, it } from 'vitest'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { seedDefaultData } from '@/core/db/repositories'
import { persistReceiptExpenses } from '@/features/ocr/persistence'
import { getToday } from '@/core/finance/period'
import type { Transaction } from '@/core/finance/types'
import { useMoneeStore } from '@/store'

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); resetDbSingleton() })
const item = (id: string, amount = 10000): Transaction => ({ id, type: 'expense', amount, categoryId: 'cat-makan', bucketId: 'bucket-needs', date: getToday(), note: 'Warung · Nasi', createdAt: 2, updatedAt: 2, refundedAmount: 0, deleted: false })
async function prepare() {
  const db = await openDatabase(); await seedDefaultData(db)
  await db.put('profile', { id: 'profile', name: 'Arju', mascotId: 'mochi', periodStartDay: 1, defaultBucketId: 'bucket-needs', pinHash: '', pinSalt: '', createdAt: 0 })
  await db.put('transactions', { id: 'income', type: 'income', categoryId: 'cat-gaji', amount: 100000, date: getToday(), createdAt: 1, updatedAt: 1 })
  return db
}
it('saves a receipt atomically and retries the same IDs without duplicates', async () => {
  const db = await prepare(), batch = [item('one'), item('two')]
  await expect(persistReceiptExpenses(db, batch)).resolves.toBe(true)
  await expect(persistReceiptExpenses(db, batch)).resolves.toBe(false)
  expect((await db.getAll('transactions')).filter(tx => tx.type === 'expense')).toHaveLength(2)
})
it('validates the combined bucket spending and writes nothing when one item fails', async () => {
  const db = await prepare()
  await expect(persistReceiptExpenses(db, [item('one', 25000), item('two', 25000)])).rejects.toThrow('ERR_JATAH_HABIS')
  expect(await db.count('transactions')).toBe(1)
  expect(await db.get('settings', 'receipt-batch:one')).toBeUndefined()
})
it('serializes concurrent batches against the same funds', async () => {
  const db = await prepare()
  const results = await Promise.allSettled([persistReceiptExpenses(db, [item('one', 30000)]), persistReceiptExpenses(db, [item('two', 30000)])])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(await db.count('transactions')).toBe(2)
})
it('rejects partial/mutated retries and non-expense or malformed items', async () => {
  const db = await prepare()
  await persistReceiptExpenses(db, [item('one')])
  for (const batch of [[item('one'), item('two')], [item('one', 20000)], [item('same'), item('same')],
    [{ ...item('bad'), categoryId: 'cat-tabungan' }], [{ ...item('bad'), bucketId: 'bucket-savings' }],
    [{ ...item('bad'), date: '2026-02-30' }], [{ ...item('bad'), type: 'income' as const }]]) {
    await expect(persistReceiptExpenses(db, batch)).rejects.toThrow()
  }
  expect(await db.count('transactions')).toBe(2)
})
it('rejects a subset retry of an already committed batch', async () => {
  const db = await prepare(), batch = [item('one'), item('two')]
  await persistReceiptExpenses(db, batch)
  await expect(persistReceiptExpenses(db, [batch[0]!])).rejects.toThrow('ERR_TRANSACTION_STALE')
  expect(await db.count('transactions')).toBe(3)
})
it('rejects writing a receipt when its profile was removed', async () => {
  const db = await prepare(); await db.delete('profile', 'profile')
  await expect(persistReceiptExpenses(db, [item('one')])).rejects.toThrow('ERR_PROFILE_MISSING')
  expect(await db.count('transactions')).toBe(1)
})
it('refreshes store and notifies other tabs only after committing a whole batch', async () => {
  const db = await prepare()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
  await useMoneeStore.getState().load()
  await useMoneeStore.getState().unlockProfile(useMoneeStore.getState().profile!)
  localStorage.removeItem('monee:data-revision')
  await expect(useMoneeStore.getState().saveReceiptExpenses([item('fail-one', 25000), item('fail-two', 25000)])).rejects.toThrow('ERR_JATAH_HABIS')
  expect(localStorage.getItem('monee:data-revision')).toBeNull()
  expect(await db.count('transactions')).toBe(1)
  await useMoneeStore.getState().saveReceiptExpenses([item('one'), item('two')])
  expect(useMoneeStore.getState().transactions.filter(tx => tx.type === 'expense')).toHaveLength(2)
  expect(localStorage.getItem('monee:data-revision')).toBeTruthy()
  await useMoneeStore.getState().saveReceiptExpenses([item('one'), item('two')])
  expect(await db.count('transactions')).toBe(3)
})
