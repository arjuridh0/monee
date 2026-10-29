import { describe, it, expect } from 'vitest'
import { computeSnapshot } from '@/core/finance/selectors'
import { buildGoalExpense, markGoalUsed } from '@/core/finance/goals'
import type {
  Bucket, Transaction, TxType, MonthSweep, Goal, RecurringIncome,
} from '@/core/finance/types'

const buckets: Bucket[] = [
  { id: 'needs',  name: 'Kebutuhan Pokok', allocPercent: 40, icon: '', color: '', sortOrder: 0, allowOverbudget: false, isSavings: false },
  { id: 'saving', name: 'Tabungan',        allocPercent: 25, icon: '', color: '', sortOrder: 1, allowOverbudget: true,  isSavings: true },
]

let seq = 0
const tx = (type: TxType, amount: number, date: string, over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${++seq}`, type, amount, date,
  refundedAmount: 0, deleted: false, createdAt: seq, updatedAt: seq, ...over,
})

const sweepFor = (periodKey: string): MonthSweep => ({
  id: `sw-${periodKey}`, periodKey, amount: 0, perBucketDetail: [], sweptAt: 0,
})

const goal = (name: string, target: number, sortOrder: number): Goal => ({
  id: `g-${name}`, name, targetAmount: target, sortOrder, createdAt: 0,
})

const recurring = (over: Partial<RecurringIncome> = {}): RecurringIncome => ({
  id: 'rec-1', name: 'Gaji', amount: 5_000_000, dayOfMonth: 25,
  categoryId: 'cat-salary', isActive: true, createdAt: 0, ...over,
})

const baseInput = (transactions: Transaction[]) => ({
  transactions,
  buckets,
  sweeps: [] as MonthSweep[],
  goals: [] as Goal[],
  recurringIncomes: [] as RecurringIncome[],
  today: '2026-10-15',
  periodStartDay: 1,
})

describe('selectors (v2)', () => {
  it('keeps five newest across periods, stable ties and excludes deleted/savings expenses', () => {
    const history = Array.from({ length: 1000 }, (_, index) => tx('income', 1000, '2026-01-01', { createdAt: index }))
    const newest = [
      tx('income', 1000, '2026-12-31', { id: 'a', createdAt: 100 }),
      tx('expense', 1000, '2026-12-31', { id: 'b', createdAt: 100 }),
      tx('savings_deposit', 1000, '2026-11-30', { id: 'c' }),
      tx('income', 1000, '2026-10-26', { id: 'd', createdAt: 99 }),
      tx('income', 1000, '2026-10-26', { id: 'e', createdAt: 98 }),
    ]
    const rows = [...history, ...newest,
      tx('expense', 1000, '2027-01-01', { deleted: true }),
      tx('savings_expense', 1000, '2027-01-01', { savingsSource: 'allocation' }),
    ]
    const before = structuredClone(rows)
    expect(computeSnapshot(baseInput(rows)).recentTxs.map(row => row.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(rows).toEqual(before)
  })
  it('snapshot periode berjalan: saldo, bucket, tabungan, goals', () => {
    const transactions = [
      tx('income', 1_000_000, '2026-10-05'),
      tx('expense', 100_000, '2026-10-06', { bucketId: 'needs' }),
      tx('savings_deposit', 250_000, '2026-10-07', { bucketId: 'saving' }),
      tx('savings_expense', 100_000, '2026-10-08', { savingsSource: 'allocation', note: 'Goal' }),
    ]
    const snap = computeSnapshot({
      ...baseInput(transactions),
      goals: [goal('HP', 200_000, 0)],
    })

    expect(snap.period.key).toBe('2026-10')
    expect(snap.balance.balance).toBe(650_000)
    expect(snap.buckets.find(b => b.bucket.id === 'needs')?.spentAmount).toBe(100_000)
    expect(snap.buckets.find(b => b.bucket.id === 'saving')?.spentAmount).toBe(250_000)
    expect(snap.savings.allocationBalance).toBe(150_000)
    expect(snap.savings.goals[0]?.allocated).toBe(150_000)
    expect(snap.unallocated).toBe(0)
    expect(snap.locked).toBe(false)
  })

  it('periodTxs hanya ledger utama, savings_expense tidak masuk', () => {
    const transactions = [
      tx('income', 1_000_000, '2026-10-05'),
      tx('expense', 100_000, '2026-10-06', { bucketId: 'needs' }),
      tx('savings_deposit', 250_000, '2026-10-07', { bucketId: 'saving' }),
      tx('savings_expense', 100_000, '2026-10-08', { savingsSource: 'allocation', note: 'Goal' }),
    ]
    const snap = computeSnapshot(baseInput(transactions))
    expect(snap.periodTxs.map(t => t.type)).toEqual(['savings_deposit', 'expense', 'income'])
  })

  it('transaksi deleted dan di luar periode tidak masuk periodTxs', () => {
    const transactions = [
      tx('income', 1_000_000, '2026-10-05'),
      tx('expense', 50_000, '2026-10-06', { bucketId: 'needs', deleted: true }),
      tx('expense', 70_000, '2026-09-20', { bucketId: 'needs' }),
    ]
    const snap = computeSnapshot(baseInput(transactions))
    expect(snap.periodTxs).toHaveLength(1)
    expect(snap.balance.totalExpense).toBe(0)
  })

  it('recentTxs maksimal 5, terbaru dulu', () => {
    const transactions = Array.from({ length: 7 }, (_, i) =>
      tx('expense', 1_000, `2026-10-0${i + 1}`, { bucketId: 'needs' })
    )
    const snap = computeSnapshot(baseInput(transactions))
    expect(snap.recentTxs).toHaveLength(5)
    expect(snap.recentTxs[0]?.date).toBe('2026-10-07')
  })

  it('periode yang sudah disweep -> locked', () => {
    const snap = computeSnapshot({
      ...baseInput([]),
      sweeps: [sweepFor('2026-10')],
    })
    expect(snap.locked).toBe(true)
  })

  it('recurringDue hanya template yang jatuh tempo dan belum dicatat', () => {
    const due = recurring({ id: 'rec-due', dayOfMonth: 10 })
    const later = recurring({ id: 'rec-later', dayOfMonth: 25 })
    const recorded = recurring({ id: 'rec-done', dayOfMonth: 5 })
    const snap = computeSnapshot({
      ...baseInput([tx('income', 5_000_000, '2026-10-06', { recurringId: 'rec-done' })]),
      recurringIncomes: [due, later, recorded],
    })
    expect(snap.recurringDue.map(r => r.id)).toEqual(['rec-due'])
  })

  it('setoran di periode lain tetap menambah Allocation', () => {
    const snap = computeSnapshot(baseInput([
      tx('savings_deposit', 500_000, '2026-09-10', { bucketId: 'saving' }),
    ]))
    expect(snap.savings.allocationBalance).toBe(500_000)
  })

  it('periode custom start-25: boundary benar', () => {
    const snap = computeSnapshot({
      ...baseInput([
        tx('income', 1_000_000, '2026-10-24'),
        tx('income', 2_000_000, '2026-10-25'),
      ]),
      today: '2026-10-24',
      periodStartDay: 25,
    })
    expect(snap.period.start).toBe('2026-09-25')
    expect(snap.period.end).toBe('2026-10-24')
    expect(snap.balance.totalIncome).toBe(1_000_000)
  })

  it('setoran 500rb -> goal 400rb fulfilled, 100rb ke goal berikut', () => {
    const snap = computeSnapshot({
      ...baseInput([tx('savings_deposit', 500_000, '2026-10-07', { bucketId: 'saving' })]),
      goals: [goal('HP', 400_000, 0), goal('Laptop', 300_000, 1)],
    })
    expect(snap.savings.goals[0]?.status).toBe('fulfilled')
    expect(snap.savings.goals[0]?.allocated).toBe(400_000)
    expect(snap.savings.goals[1]?.allocated).toBe(100_000)
    expect(snap.unallocated).toBe(0)
  })

  it('Gunakan goal: Allocation turun sekali, saldo utama tidak berubah', () => {
    const target = goal('HP', 2_000_000, 0)
    const transactions = [
      tx('income', 10_000_000, '2026-10-01'),
      tx('savings_deposit', 2_500_000, '2026-10-02', { bucketId: 'saving' }),
    ]
    const before = computeSnapshot({ ...baseInput(transactions), goals: [target] })
    const spend = buildGoalExpense(target, { id: 'tx-goal', date: '2026-10-20', now: 1 })
    const after = computeSnapshot({
      ...baseInput([...transactions, spend]),
      goals: [markGoalUsed(target, 1)],
    })

    expect(before.savings.allocationBalance).toBe(2_500_000)
    expect(after.savings.allocationBalance).toBe(500_000)
    expect(after.balance.balance).toBe(before.balance.balance)
    expect(after.savings.goals[0]?.status).toBe('used')
  })
})
