/**
 * Guards - dok 08 §3, §4, §6, §7
 * Validasi murni sebelum transaksi disimpan. Tidak menulis DB.
 */
import type {
  Bucket, Transaction, SavingsBalances,
} from './types'
import { calcBalance } from './balance'
import { calcBucketBudgets, calcBucketProgress } from './allocation'

export type ValidationCode =
  | 'ERR_AMOUNT_INVALID'
  | 'ERR_BUCKET_INVALID'
  | 'ERR_SAVINGS_SOURCE'
  | 'ERR_JATAH_HABIS'
  | 'ERR_SALDO_KURANG'
  | 'ERR_KOMPARTEMEN_KURANG'
  | 'ERR_PERIODE_TERKUNCI'
  | 'ERR_GOAL_BELUM_CUKUP'

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: ValidationCode; message: string }

export interface GuardContext {
  buckets: Bucket[]
  /** Transaksi periode tanggal tx, TANPA tx yang sedang divalidasi */
  periodTxs: Transaction[]
  /** Saldo kompartemen sebelum tx ini */
  savings: SavingsBalances
  /** true kalau periode tanggal tx sudah disweep */
  locked: boolean
}

const OK: ValidationResult = { ok: true }

function fail(code: ValidationCode, message: string): ValidationResult {
  return { ok: false, code, message }
}

function rupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`
}

/** Sisa jatah bucket berdasarkan income periode dan pemakaian yang ada */
function bucketRemaining(bucket: Bucket, ctx: GuardContext): number {
  const { totalIncome } = calcBalance(ctx.periodTxs)
  const budgets = calcBucketBudgets(ctx.buckets, totalIncome)
  const spent = calcBucketProgress(ctx.buckets, budgets, ctx.periodTxs)
    .find(p => p.bucket.id === bucket.id)?.spentAmount ?? 0
  return (budgets[bucket.id] ?? 0) - spent
}

function checkBucketCap(bucket: Bucket, amount: number, ctx: GuardContext): ValidationResult {
  if (bucket.allowOverbudget) return OK
  const remaining = bucketRemaining(bucket, ctx)
  if (amount > remaining) {
    return fail(
      'ERR_JATAH_HABIS',
      `Jatah ${bucket.name} tinggal ${rupiah(Math.max(0, remaining))}.`,
    )
  }
  return OK
}

/** Validasi satu transaksi baru/edit. Caller sudah mengeluarkan tx dari periodTxs. */
export function validateTransaction(tx: Transaction, ctx: GuardContext): ValidationResult {
  if (ctx.locked) {
    return fail('ERR_PERIODE_TERKUNCI', 'Periode ini sudah ditutup. Catat di periode berjalan.')
  }
  if (!Number.isInteger(tx.amount) || tx.amount <= 0) {
    return fail('ERR_AMOUNT_INVALID', 'Nominal harus lebih dari 0.')
  }

  if (tx.type === 'income') return OK

  if (tx.type === 'savings_expense') {
    if (tx.savingsSource !== 'sisa' && tx.savingsSource !== 'allocation') {
      return fail('ERR_SAVINGS_SOURCE', 'Sumber dana tabungan wajib diisi.')
    }
    const available = tx.savingsSource === 'sisa'
      ? ctx.savings.sisaBalance
      : ctx.savings.allocationBalance
    if (tx.amount > available) {
      const label = tx.savingsSource === 'sisa' ? 'Sisa' : 'Allocation'
      return fail(
        'ERR_KOMPARTEMEN_KURANG',
        `Saldo ${label} tinggal ${rupiah(Math.max(0, available))}.`,
      )
    }
    return OK
  }

  const balance = calcBalance(ctx.periodTxs).balance

  if (tx.type === 'expense') {
    const bucket = ctx.buckets.find(b => b.id === tx.bucketId)
    if (!bucket || bucket.isSavings) {
      return fail('ERR_BUCKET_INVALID', 'Bucket tidak valid untuk pengeluaran.')
    }
    const cap = checkBucketCap(bucket, tx.amount, ctx)
    if (!cap.ok) return cap
  }

  if (tx.type === 'savings_deposit') {
    const savingsBucket = ctx.buckets.find(b => b.isSavings)
    if (!savingsBucket) {
      return fail('ERR_BUCKET_INVALID', 'Bucket Tabungan tidak ditemukan.')
    }
    const cap = checkBucketCap(savingsBucket, tx.amount, ctx)
    if (!cap.ok) return cap
  }

  if (tx.amount > balance) {
    return fail(
      'ERR_SALDO_KURANG',
      `Saldo periode tinggal ${rupiah(Math.max(0, balance))}.`,
    )
  }

  return OK
}

/** Tombol "Gunakan" goal hanya boleh jika Allocation cukup. */
export function validateGoalUse(targetAmount: number, allocationBalance: number): ValidationResult {
  if (targetAmount > allocationBalance) {
    return fail(
      'ERR_GOAL_BELUM_CUKUP',
      'Dana Allocation sudah terpakai. Goal kembali aktif.',
    )
  }
  return OK
}
