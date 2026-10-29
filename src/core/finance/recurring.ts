/**
 * Recurring Income - dok 08 §8
 * Template + aksi manual "Catat gaji". Tidak pernah auto-create (D51).
 * ponytail: fungsi pure, tanpa scheduler
 */
import type {
  RecurringIncome, Transaction, PeriodBounds, DateStr, Timestamp, Id,
} from './types'

/** Tanggal-tanggal jatuh tempo template di dalam periode. */
export function getRecurringDatesInPeriod(
  rec: RecurringIncome,
  period: PeriodBounds,
): string[] {
  const dates: string[] = []
  const startYear  = parseInt(period.start.slice(0, 4))
  const startMonth = parseInt(period.start.slice(5, 7))
  const endYear    = parseInt(period.end.slice(0, 4))
  const endMonth   = parseInt(period.end.slice(5, 7))

  let y = startYear, m = startMonth
  while (y < endYear || (y === endYear && m <= endMonth)) {
    const daysInM = new Date(y, m, 0).getDate()
    if (rec.dayOfMonth <= daysInM) {
      const candidate = `${y}-${String(m).padStart(2, '0')}-${String(rec.dayOfMonth).padStart(2, '0')}`
      if (candidate >= period.start && candidate <= period.end) {
        dates.push(candidate)
      }
    }
    m++
    if (m > 12) { m = 1; y++ }
  }

  return dates
}

/** Sudah ada transaksi (non-deleted) dari template ini di periode tersebut? */
export function hasRecurringInPeriod(recurringId: Id, txs: Transaction[]): boolean {
  return txs.some(t => !t.deleted && t.recurringId === recurringId)
}

/** Tampilkan kartu "Gaji bulan ini belum dicatat"? */
export function shouldOfferRecurring(
  rec: RecurringIncome,
  period: PeriodBounds,
  today: DateStr,
  existingTxs: Transaction[],
): boolean {
  if (!rec.isActive) return false
  const dueDate = getRecurringDatesInPeriod(rec, period)[0]
  if (!dueDate || today < dueDate) return false
  return !hasRecurringInPeriod(rec.id, existingTxs)
}

export interface BuildRecurringOptions {
  id: Id
  date: DateStr
  now?: Timestamp | undefined
}

/** Bangun satu income normal dari template. Tidak menulis DB. */
export function buildRecurringIncome(
  rec: RecurringIncome,
  opts: BuildRecurringOptions,
): Transaction {
  const now = opts.now ?? Date.now()
  return {
    id: opts.id,
    type: 'income',
    amount: rec.amount,
    categoryId: rec.categoryId,
    date: opts.date,
    note: rec.name,
    recurringId: rec.id,
    refundedAmount: 0,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  }
}

export interface RecordRecurringInput {
  period: PeriodBounds
  today: DateStr
  existingTxs: Transaction[]
  id: Id
  now?: Timestamp
}

/**
 * Aksi tombol "Catat gaji".
 * Return null kalau belum jatuh tempo atau sudah tercatat di periode ini.
 */
export function recordRecurring(
  rec: RecurringIncome,
  input: RecordRecurringInput,
): Transaction | null {
  if (!shouldOfferRecurring(rec, input.period, input.today, input.existingTxs)) {
    return null
  }
  return buildRecurringIncome(rec, {
    id: input.id,
    date: input.today,
    now: input.now,
  })
}
