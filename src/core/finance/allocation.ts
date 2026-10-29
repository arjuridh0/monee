/**
 * Allocation - dok 08 §3
 * Jatah bucket = percent x total income, floor ke ratusan.
 * Terpakai: expense net refund; bucket Tabungan = setoran.
 * ponytail: 3 fungsi pure
 */
import type { Bucket, Transaction, BucketProgress } from './types'
import { roundAllocation } from './rounding'

export type BucketBudgets = Record<string, number>

/** Hitung jatah nominal tiap bucket dari total income */
export function calcBucketBudgets(buckets: Bucket[], totalIncome: number): BucketBudgets {
  return Object.fromEntries(
    buckets.map(b => [b.id, roundAllocation(totalIncome, b.allocPercent)])
  )
}

function spentForBucket(bucket: Bucket, txs: Transaction[]): number {
  if (bucket.isSavings) {
    return txs
      .filter(t => !t.deleted && t.type === 'savings_deposit' && t.bucketId === bucket.id)
      .reduce((sum, t) => sum + t.amount, 0)
  }
  return txs
    .filter(t => !t.deleted && t.type === 'expense' && t.bucketId === bucket.id)
    .reduce((sum, t) => sum + Math.max(0, t.amount - Math.max(0, t.refundedAmount ?? 0)), 0)
}

/** Hitung progress tiap bucket dari transaksi periode ini */
export function calcBucketProgress(
  buckets: Bucket[],
  budgets: BucketBudgets,
  txs: Transaction[],
): BucketProgress[] {
  return buckets.map(bucket => {
    const budgetAmount = budgets[bucket.id] ?? 0
    const spentAmount = spentForBucket(bucket, txs)
    const remaining = budgetAmount - spentAmount
    const progressPct = budgetAmount === 0
      ? 0
      : (spentAmount / budgetAmount) * 100
    return { bucket, budgetAmount, spentAmount, remaining, progressPct }
  })
}

export function isOverspent(progressPct: number): boolean {
  return progressPct >= 100
}
