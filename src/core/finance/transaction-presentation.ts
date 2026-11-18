import type { Bucket, Category, Transaction } from './types'

/** Legacy category IDs remain in backups while the user works with buckets only. */
export function defaultCategoryId(categories: Category[], type: Transaction['type'], previous?: string): string {
  if (type === 'savings_deposit') return 'cat-tabungan'
  const available = categories.filter(item => item.type === (type === 'income' ? 'income' : 'expense') && item.id !== 'cat-tabungan')
  return available.find(item => item.id === previous)?.id
    ?? available.find(item => item.id === (type === 'income' ? 'cat-gaji' : 'cat-lain-exp'))?.id
    ?? available[0]?.id ?? ''
}

export function transactionPresentation(transaction: Transaction, buckets: Bucket[]) {
  const bucket = buckets.find(item => item.id === transaction.bucketId)
  const income = transaction.type === 'income'
  const deposit = transaction.type === 'savings_deposit'
  return {
    name: income ? 'Pemasukan' : deposit ? 'Setoran tabungan' : bucket?.name ?? 'Pengeluaran',
    icon: bucket?.icon ?? (income ? 'briefcase' : 'shapes'),
    color: bucket?.color ?? 'var(--surface-3)',
  }
}
