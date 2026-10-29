import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { categoryRepo, seedDefaultData, transactionRepo } from '@/core/db/repositories'
import type { Category, RecurringIncome, Transaction } from '@/core/finance/types'
import { CategoryError, deleteCategory, saveCategory } from '@/features/settings/category-persistence'

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  resetDbSingleton()
  await seedDefaultData(await openDatabase())
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetDbSingleton()
})

const customCategory: Category = {
  id: 'cat-custom-coffee', name: 'Ngopi', icon: 'coffee', color: '#F3E3D3', type: 'expense', isDefault: false,
}

const list = async (): Promise<Category[]> => categoryRepo.getAll(await openDatabase())

describe('category persistence', () => {
  it('updates a default category name, icon, and color without changing its identity', async () => {
    const db = await openDatabase()
    const before = (await list()).find(category => category.id === 'cat-makan')!
    const changed = { ...before, name: 'Makanan', icon: 'coffee', color: '#F3E3D3' }

    await saveCategory(db, changed, before)

    expect((await categoryRepo.getAll(db)).find(category => category.id === 'cat-makan')).toEqual(changed)
  })

  it('creates a custom category while preserving the seeded categories', async () => {
    const db = await openDatabase()

    await saveCategory(db, customCategory)

    expect(await categoryRepo.getAll(db)).toHaveLength(15)
    expect((await categoryRepo.getAll(db)).find(category => category.id === customCategory.id)).toEqual(customCategory)
  })

  it('rejects duplicate names within one transaction type without changing data', async () => {
    const db = await openDatabase()
    const before = await list()

    await expect(saveCategory(db, { ...customCategory, name: ' makan ' })).rejects.toMatchObject({
      code: 'ERR_CATEGORY_DUPLICATE',
    })
    expect(await list()).toEqual(before)
  })

  it('keeps the Tabungan identity and category type fixed', async () => {
    const db = await openDatabase()
    const before = (await list()).find(category => category.id === 'cat-tabungan')!

    await expect(saveCategory(db, { ...before, name: 'Simpanan' }, before)).rejects.toMatchObject({
      code: 'ERR_CATEGORY_PROTECTED',
    })
    expect((await list()).find(category => category.id === before.id)).toEqual(before)
  })

  it('rejects saving from an outdated category snapshot', async () => {
    const db = await openDatabase()
    const before = (await list()).find(category => category.id === 'cat-makan')!
    await categoryRepo.save(db, { ...before, color: '#F3E3D3' })

    await expect(saveCategory(db, { ...before, name: 'Makanan' }, before)).rejects.toMatchObject({
      code: 'ERR_CATEGORY_STALE',
    })
  })

  it('deletes an unused custom category but preserves all seeded categories', async () => {
    const db = await openDatabase()
    await saveCategory(db, customCategory)

    await deleteCategory(db, customCategory.id)

    expect(await categoryRepo.getAll(db)).toHaveLength(14)
    expect((await list()).some(category => category.id === customCategory.id)).toBe(false)
  })

  it('refuses to delete a default category', async () => {
    await expect(deleteCategory(await openDatabase(), 'cat-makan')).rejects.toMatchObject({
      code: 'ERR_CATEGORY_PROTECTED',
    })
  })

  it('refuses to delete a custom category already used by a transaction', async () => {
    const db = await openDatabase()
    await saveCategory(db, customCategory)
    const now = Date.now()
    const transaction: Transaction = {
      id: 'tx-custom-category', type: 'expense', amount: 5_000, date: '2026-10-25',
      categoryId: customCategory.id, bucketId: 'bucket-needs', deleted: false,
      refundedAmount: 0, createdAt: now, updatedAt: now,
    }
    await transactionRepo.save(db, transaction)

    await expect(deleteCategory(db, customCategory.id)).rejects.toMatchObject({
      code: 'ERR_CATEGORY_IN_USE',
    })
    expect((await categoryRepo.getAll(db)).some(category => category.id === customCategory.id)).toBe(true)
  })

  it('refuses to delete a custom category used by a recurring income', async () => {
    const db = await openDatabase()
    await saveCategory(db, { ...customCategory, type: 'income' })
    const recurring: RecurringIncome = {
      id: 'recurring-custom-category', name: 'Gaji', amount: 1_000_000,
      dayOfMonth: 25, categoryId: customCategory.id, isActive: true,
    }
    await db.put('recurringIncomes', recurring)

    await expect(deleteCategory(db, customCategory.id)).rejects.toMatchObject({
      code: 'ERR_CATEGORY_IN_USE',
    })
    expect((await categoryRepo.getAll(db)).some(category => category.id === customCategory.id)).toBe(true)
  })

  it('rejects malformed category names, colors, and Lucide icon names', async () => {
    const db = await openDatabase()
    const malformed = [
      { ...customCategory, name: '   ' },
      { ...customCategory, color: 'red' },
      { ...customCategory, icon: 'unknown-icon' },
    ]

    for (const category of malformed) {
      await expect(saveCategory(db, category)).rejects.toBeInstanceOf(CategoryError)
    }
    expect((await list()).some(category => category.id === customCategory.id)).toBe(false)
  })
})
