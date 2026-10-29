import { describe, expect, it } from 'vitest'
import { calcAnalytics } from '@/core/finance/analytics'
import { DEFAULT_CATEGORIES } from '@/core/db/repositories'
import type { Transaction } from '@/core/finance/types'

const tx = (patch: Partial<Transaction>): Transaction => ({ id: 'tx', type: 'expense', amount: 100000,
  date: '2026-10-26', createdAt: 0, updatedAt: 0, categoryId: 'cat-makan', ...patch })
describe('chart projection', () => {
  it('uses net expenses after refunds and excludes savings from spending', () => {
    const result = calcAnalytics([
      tx({ type: 'income', amount: 1000000 }), tx({ refundedAmount: 25000 }),
      tx({ type: 'savings_deposit', amount: 300000 }), tx({ type: 'savings_expense', amount: 200000 }),
      tx({ deleted: true }), tx({ refundedAmount: 100000 }),
    ], DEFAULT_CATEGORIES)
    expect(result).toMatchObject({ income: 1000000, expense: 75000, savingsDeposit: 300000,
      categories: [{ id: 'cat-makan', name: 'Makan', amount: 75000, percent: 100 }] })
  })
  it('aggregates and orders categories by amount without mutating input', () => {
    const rows = [tx({ categoryId: 'cat-minum', amount: 20000 }), tx({ amount: 50000 }), tx({ amount: 50000 })]
    const original = structuredClone(rows)
    const result = calcAnalytics(rows, DEFAULT_CATEGORIES)
    expect(result.categories.map(row => row.amount)).toEqual([100000, 20000])
    expect(result.categories.reduce((sum, row) => sum + row.percent, 0)).toBeCloseTo(100)
    expect(rows).toEqual(original)
  })
  it('retains spending when a category no longer exists', () => {
    expect(calcAnalytics([tx({ categoryId: 'legacy' })], []).categories).toMatchObject([
      { id: 'legacy', name: 'Kategori tidak tersedia', amount: 100000 },
    ])
  })
  it('has deterministic empty output and no invalid SVG ratios', () => {
    expect(calcAnalytics([], DEFAULT_CATEGORIES)).toEqual({ income: 0, expense: 0, savingsDeposit: 0, categories: [] })
  })
})
