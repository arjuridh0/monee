import type { Category, Transaction } from './types'
import { calcBalance } from './balance'

export interface CategorySpending { id: string; name: string; color: string; amount: number; percent: number }

/** Pure projection of an already selected date range; never writes derived values. */
export function calcAnalytics(transactions: Transaction[], categories: Category[]) {
  const balance = calcBalance(transactions)
  const definitions = new Map(categories.map(category => [category.id, category]))
  const amounts = new Map<string, number>()
  for (const transaction of transactions) {
    if (transaction.deleted || transaction.type !== 'expense') continue
    const amount = Math.max(0, transaction.amount - Math.max(0, transaction.refundedAmount ?? 0))
    if (amount > 0) {
      const id = transaction.categoryId ?? 'uncategorized'
      amounts.set(id, (amounts.get(id) ?? 0) + amount)
    }
  }
  const spending: CategorySpending[] = [...amounts].map(([id, amount]) => ({
    id, name: definitions.get(id)?.name ?? 'Kategori tidak tersedia', color: definitions.get(id)?.color ?? '#BCAE9A',
    amount, percent: balance.totalExpense ? amount / balance.totalExpense * 100 : 0,
  })).sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
  return { income: balance.totalIncome, expense: balance.totalExpense, savingsDeposit: balance.totalSavingsDeposit, categories: spending }
}
