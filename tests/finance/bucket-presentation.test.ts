import { describe, expect, it } from 'vitest'
import { DEFAULT_BUCKETS, DEFAULT_CATEGORIES } from '@/core/db/repositories'
import { calcBucketAnalytics } from '@/core/finance/analytics'
import { defaultCategoryId, transactionPresentation } from '@/core/finance/transaction-presentation'
import type { Transaction } from '@/core/finance/types'

const base = { date: '2026-11-05', createdAt: 1, updatedAt: 1 }
describe('bucket-only presentation with legacy data', () => {
  it('preserves valid legacy IDs and chooses compatible defaults without user category input', () => {
    expect(defaultCategoryId(DEFAULT_CATEGORIES, 'expense', 'cat-makan')).toBe('cat-makan')
    expect(defaultCategoryId(DEFAULT_CATEGORIES, 'expense', 'cat-gaji')).toBe('cat-lain-exp')
    expect(defaultCategoryId(DEFAULT_CATEGORIES, 'income')).toBe('cat-gaji')
    expect(defaultCategoryId(DEFAULT_CATEGORIES, 'savings_deposit')).toBe('cat-tabungan')
  })
  it('combines legacy categories in the same renamed bucket, net of refunds and excluding deleted entries', () => {
    const transactions: Transaction[] = [
      { ...base, id: '1', type: 'expense', amount: 10000, refundedAmount: 2000, bucketId: 'bucket-needs', categoryId: 'cat-makan' },
      { ...base, id: '2', type: 'expense', amount: 5000, bucketId: 'bucket-needs', categoryId: 'cat-minum' },
      { ...base, id: '3', type: 'expense', amount: 5000, bucketId: 'bucket-needs', deleted: true },
    ]
    const buckets = DEFAULT_BUCKETS.map(item => item.id === 'bucket-needs' ? { ...item, name: 'Rumah' } : item)
    expect(calcBucketAnalytics(transactions, buckets).categories).toEqual([
      expect.objectContaining({ id: 'bucket-needs', name: 'Rumah', amount: 13000, percent: 100 }),
    ])
    expect(transactionPresentation(transactions[0]!, buckets).name).toBe('Rumah')
    expect(transactions[0]!.categoryId).toBe('cat-makan')
  })
})
