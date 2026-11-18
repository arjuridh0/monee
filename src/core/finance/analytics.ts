import type { Bucket, Category, Transaction } from './types'
import { calcBalance } from './balance'

export interface CategorySpending { id: string; name: string; color: string; amount: number; percent: number }

/** Pure projection of an already selected date range; never writes derived values. */
export function calcAnalytics(transactions: Transaction[], categories: Category[]) {
  return spendingProjection(transactions, categories, 'categoryId', 'Kategori tidak tersedia')
}

export function calcBucketAnalytics(transactions: Transaction[], buckets: Bucket[]) {
  return spendingProjection(transactions, buckets, 'bucketId', 'Bucket tidak tersedia')
}

function spendingProjection(transactions: Transaction[], groups: { id: string; name: string; color: string }[], groupKey: 'categoryId' | 'bucketId', fallback: string) {
  const balance = calcBalance(transactions)
  const definitions = new Map(groups.map(group => [group.id, group]))
  const amounts = new Map<string, number>()
  for (const transaction of transactions) {
    if (transaction.deleted || transaction.type !== 'expense') continue
    const amount = Math.max(0, transaction.amount - Math.max(0, transaction.refundedAmount ?? 0))
    if (amount > 0) {
      const id = transaction[groupKey] ?? 'unassigned'
      amounts.set(id, (amounts.get(id) ?? 0) + amount)
    }
  }
  const spending: CategorySpending[] = [...amounts].map(([id, amount]) => ({
    id, name: definitions.get(id)?.name ?? fallback, color: definitions.get(id)?.color ?? '#BCAE9A',
    amount, percent: balance.totalExpense ? amount / balance.totalExpense * 100 : 0,
  })).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
  return { income: balance.totalIncome, expense: balance.totalExpense, savingsDeposit: balance.totalSavingsDeposit, categories: spending }
}
