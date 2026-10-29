import { describe, it, expect } from 'vitest'
import { validateTransaction, validateGoalUse } from '@/core/finance/guards'
import { isPeriodLocked } from '@/core/finance/period-lock'
import type { Bucket, Transaction, TxType, MonthSweep, SavingsBalances } from '@/core/finance/types'

const buckets: Bucket[] = [
  { id: 'needs',  name: 'Kebutuhan Pokok', allocPercent: 40, icon: '', color: '', sortOrder: 0, allowOverbudget: false, isSavings: false },
  { id: 'saving', name: 'Tabungan',        allocPercent: 25, icon: '', color: '', sortOrder: 1, allowOverbudget: true,  isSavings: true },
]

let seq = 0
const tx = (type: TxType, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${++seq}`, type, amount, date: '2026-10-15',
  refundedAmount: 0, deleted: false, createdAt: 0, updatedAt: 0, ...over,
})

const balances = (sisa = 0, allocation = 0): SavingsBalances => ({
  sisaBalance: sisa,
  allocationBalance: allocation,
  totalSavings: sisa + allocation,
})

const ctx = (periodTxs: Transaction[], over: Partial<Parameters<typeof validateTransaction>[1]> = {}) => ({
  buckets,
  periodTxs,
  savings: balances(),
  locked: false,
  ...over,
})

describe('guards (v2)', () => {
  it('expense dalam jatah dan saldo -> ok', () => {
    const periodTxs = [tx('income', 1_000_000)]
    const result = validateTransaction(tx('expense', 100_000, { bucketId: 'needs' }), ctx(periodTxs))
    expect(result).toEqual({ ok: true })
  })

  it('expense lewat jatah bucket non-overbudget -> ERR_JATAH_HABIS', () => {
    const periodTxs = [tx('income', 1_000_000)]
    const result = validateTransaction(tx('expense', 500_000, { bucketId: 'needs' }), ctx(periodTxs))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_JATAH_HABIS')
  })

  it('expense boleh lewat jatah kalau bucket allowOverbudget', () => {
    const custom: Bucket[] = [{ ...buckets[0], allowOverbudget: true }]
    const periodTxs = [tx('income', 1_000_000)]
    const result = validateTransaction(
      tx('expense', 500_000, { bucketId: 'needs' }),
      ctx(periodTxs, { buckets: custom }),
    )
    expect(result.ok).toBe(true)
  })

  it('expense jatah cukup tapi saldo kurang -> ERR_SALDO_KURANG', () => {
    // income 100rb, jatah 40rb; expense 50rb -> jatah gagal dulu.
    // Pakai bucket 100% supaya jatah lolos.
    const allIn: Bucket[] = [{ ...buckets[0], allocPercent: 100, allowOverbudget: true }]
    const periodTxs = [tx('income', 100_000)]
    const result = validateTransaction(
      tx('expense', 150_000, { bucketId: 'needs' }),
      ctx(periodTxs, { buckets: allIn }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_SALDO_KURANG')
  })

  it('setoran Tabungan boleh lewat jatah', () => {
    const periodTxs = [tx('income', 1_000_000)]
    const result = validateTransaction(tx('savings_deposit', 900_000), ctx(periodTxs))
    expect(result.ok).toBe(true)
  })

  it('setoran melebihi saldo -> ERR_SALDO_KURANG', () => {
    const periodTxs = [tx('income', 100_000)]
    const result = validateTransaction(tx('savings_deposit', 200_000), ctx(periodTxs))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_SALDO_KURANG')
  })

  it('pengeluaran tabungan melebihi kompartemen -> ERR_KOMPARTEMEN_KURANG', () => {
    const result = validateTransaction(
      tx('savings_expense', 300_000, { savingsSource: 'sisa', note: 'Darurat' }),
      ctx([], { savings: balances(100_000, 500_000) }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_KOMPARTEMEN_KURANG')
  })

  it('pengeluaran tabungan dalam saldo kompartemen -> ok', () => {
    const result = validateTransaction(
      tx('savings_expense', 300_000, { savingsSource: 'allocation', note: 'Goal' }),
      ctx([], { savings: balances(0, 500_000) }),
    )
    expect(result.ok).toBe(true)
  })

  it('savings_expense tanpa sumber -> ERR_SAVINGS_SOURCE', () => {
    const result = validateTransaction(
      tx('savings_expense', 100_000, { note: 'Tanpa sumber' }),
      ctx([], { savings: balances(500_000, 500_000) }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_SAVINGS_SOURCE')
  })

  it('periode terkunci -> ERR_PERIODE_TERKUNCI', () => {
    const result = validateTransaction(
      tx('expense', 10_000, { bucketId: 'needs' }),
      ctx([tx('income', 1_000_000)], { locked: true }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_PERIODE_TERKUNCI')
  })

  it('nominal 0 -> ERR_AMOUNT_INVALID', () => {
    const result = validateTransaction(tx('expense', 0, { bucketId: 'needs' }), ctx([tx('income', 1_000_000)]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_AMOUNT_INVALID')
  })

  it('goal use cukup -> ok, kurang -> ERR_GOAL_BELUM_CUKUP', () => {
    expect(validateGoalUse(500_000, 500_000)).toEqual({ ok: true })
    const fail = validateGoalUse(500_000, 499_999)
    expect(fail.ok).toBe(false)
    if (!fail.ok) expect(fail.code).toBe('ERR_GOAL_BELUM_CUKUP')
  })

  it('regression: edit income turun -> jatah negatif, expense baru ditolak', () => {
    // income 500rb -> jatah needs 200rb, sudah terpakai 400rb (defisit 200rb)
    const periodTxs = [
      tx('income', 500_000),
      tx('expense', 400_000, { bucketId: 'needs' }),
    ]
    const result = validateTransaction(
      tx('expense', 10_000, { bucketId: 'needs' }),
      ctx(periodTxs),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_JATAH_HABIS')
  })

  it('regression: saldo negatif -> outflow baru ditolak', () => {
    const allIn: Bucket[] = [{ ...buckets[0]!, allocPercent: 100, allowOverbudget: true }]
    const periodTxs = [
      tx('income', 300_000),
      tx('expense', 400_000, { bucketId: 'needs' }),
    ]
    const result = validateTransaction(
      tx('expense', 10_000, { bucketId: 'needs' }),
      ctx(periodTxs, { buckets: allIn }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('ERR_SALDO_KURANG')
  })
})

describe('isPeriodLocked', () => {
  const sweep = (periodKey: string): MonthSweep => ({
    id: 'sw1', periodKey, amount: 0, perBucketDetail: [], sweptAt: 0,
  })

  it('ada sweep untuk periode itu -> locked', () => {
    expect(isPeriodLocked('2026-09', [sweep('2026-09')])).toBe(true)
  })

  it('tidak ada sweep -> open', () => {
    expect(isPeriodLocked('2026-10', [sweep('2026-09')])).toBe(false)
  })
})
