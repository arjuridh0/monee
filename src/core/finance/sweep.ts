/**
 * Sweep - dok 08 §6
 * Nominal sweep = saldo akhir periode, bukan jumlah sisa bucket.
 * Record selalu dibuat (amount 0 pun) agar periode terkunci seragam.
 * ponytail: 3 fungsi pure
 */
import type {
  MonthSweep, Transaction, Bucket, Timestamp, Id,
} from './types'
import { calcBalance } from './balance'
import { calcBucketBudgets, calcBucketProgress } from './allocation'

export interface ClosedPeriod {
  periodKey: string
  txs: Transaction[]
}

export interface CreateSweepOptions {
  id?: Id
  now?: Timestamp
}

/** Cek apakah periode ini belum punya sweep */
export function shouldSweep(periodKey: string, existingSweeps: MonthSweep[]): boolean {
  return !existingSweeps.some(s => s.periodKey === periodKey)
}

/** Buat satu record sweep. Idempotensi dijaga pemanggil lewat shouldSweep. */
export function createSweep(
  periodKey: string,
  periodTxs: Transaction[],
  buckets: Bucket[],
  opts: CreateSweepOptions = {},
): MonthSweep {
  const { balance, totalIncome } = calcBalance(periodTxs)
  const budgets = calcBucketBudgets(buckets, totalIncome)
  const progress = calcBucketProgress(buckets, budgets, periodTxs)

  return {
    id: opts.id ?? crypto.randomUUID(),
    periodKey,
    amount: Math.max(0, balance),
    perBucketDetail: progress.map(p => ({
      bucketId: p.bucket.id,
      jatah: p.budgetAmount,
      terpakai: p.spentAmount,
      sisa: p.remaining,
    })),
    sweptAt: opts.now ?? Date.now(),
  }
}

/**
 * Buat sweep untuk semua periode tertutup yang belum disweep.
 * Urut kronologis; satu periodKey maksimal satu record.
 */
export function createMissingSweeps(
  periods: ClosedPeriod[],
  buckets: Bucket[],
  existingSweeps: MonthSweep[],
  opts: CreateSweepOptions = {},
): MonthSweep[] {
  const now = opts.now ?? Date.now()
  const existingKeys = new Set(existingSweeps.map(s => s.periodKey))

  return [...periods]
    .filter(p => !existingKeys.has(p.periodKey))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
    .map(p => createSweep(p.periodKey, p.txs, buckets, { now }))
}
