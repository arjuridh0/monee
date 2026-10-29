/**
 * Selectors - derived state gabungan semua finance modul
 * Input: data mentah dari IndexedDB -> Output: state siap pakai UI
 * ponytail: 1 entry point, re-export tipe turunan
 */
import type {
  Transaction, Bucket, MonthSweep, Goal, RecurringIncome,
  BalanceState, BucketProgress, SavingsState, PeriodBounds, Profile,
} from './types'
import { isInPeriod } from './period'
import { getConfiguredPeriod } from './period-config'
import { calcBalance } from './balance'
import { calcBucketBudgets, calcBucketProgress } from './allocation'
import { calcSavingsState } from './savings'
import { calcGoalProgress } from './goals'
import { isPeriodLocked } from './period-lock'
import { shouldOfferRecurring } from './recurring'

/** Tipe yang tampil di ledger utama (tabungan punya ledger sendiri) */
const MAIN_LEDGER_TYPES = new Set<Transaction['type']>([
  'income', 'expense', 'savings_deposit',
])

export interface FinanceSnapshot {
  period: PeriodBounds
  balance: BalanceState
  buckets: BucketProgress[]
  savings: SavingsState
  /** Allocation yang belum dialokasikan ke goal mana pun */
  unallocated: number
  /** Transaksi periode ini di ledger utama (urut terbaru dulu) */
  periodTxs: Transaction[]
  /** 5 transaksi terakhir di ledger utama */
  recentTxs: Transaction[]
  /** Periode berjalan sudah disweep? */
  locked: boolean
  /** Template gaji yang siap dicatat (D51) */
  recurringDue: RecurringIncome[]
}

export interface ComputeInput {
  transactions: Transaction[]
  buckets: Bucket[]
  sweeps: MonthSweep[]
  goals: Goal[]
  recurringIncomes?: RecurringIncome[]
  today: string         // YYYY-MM-DD
  periodStartDay: number
  periodChanges?: Profile['periodChanges']
}

function byNewest(a: Transaction, b: Transaction): number {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt
}

function isMainLedger(t: Transaction): boolean {
  return !t.deleted && MAIN_LEDGER_TYPES.has(t.type)
}

/** Keep only five candidates instead of sorting the entire history on every write. */
function newestFive(transactions: Transaction[]): Transaction[] {
  const newest: Transaction[] = []
  for (const transaction of transactions) {
    if (!isMainLedger(transaction)) continue
    if (newest.length === 5 && byNewest(transaction, newest[4]!) >= 0) continue
    newest.push(transaction)
    newest.sort(byNewest)
    if (newest.length > 5) newest.pop()
  }
  return newest
}

/** Hitung seluruh derived state dari data mentah. Pure function. */
export function computeSnapshot(input: ComputeInput): FinanceSnapshot {
  const {
    transactions, buckets, sweeps, goals,
    recurringIncomes = [], today, periodStartDay,
  } = input

  const period = getConfiguredPeriod(today, periodStartDay, input.periodChanges)

  const periodTxs = transactions
    .filter(t => isMainLedger(t) && isInPeriod(t.date, period))
    .sort(byNewest)

  const balance = calcBalance(periodTxs)
  const budgets = calcBucketBudgets(buckets, balance.totalIncome)
  const bucketProgress = calcBucketProgress(buckets, budgets, periodTxs)

  const balances = calcSavingsState(sweeps, transactions)
  const goalProjection = calcGoalProgress(goals, balances.allocationBalance)

  const recentTxs = newestFive(transactions)

  const recurringDue = recurringIncomes.filter(rec =>
    shouldOfferRecurring(rec, period, today, periodTxs)
  )

  return {
    period,
    balance,
    buckets: bucketProgress,
    savings: { ...balances, goals: goalProjection.goals },
    unallocated: goalProjection.unallocated,
    periodTxs,
    recentTxs,
    locked: isPeriodLocked(period.key, sweeps),
    recurringDue,
  }
}
