import { describe, it, expect } from 'vitest'
import { calcSavingsState } from '@/core/finance/savings'
import type { MonthSweep, Transaction, TxType } from '@/core/finance/types'

const sweep = (amount: number, periodKey = '2026-09'): MonthSweep => ({
  id: `sw-${periodKey}`, periodKey, amount, perBucketDetail: [], sweptAt: 0,
})

let seq = 0
const tx = (type: TxType, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${++seq}`, type, amount, date: '2026-10-15',
  refundedAmount: 0, deleted: false, createdAt: 0, updatedAt: 0, ...over,
})

describe('savings (v2)', () => {
  it('tanpa sweep dan transaksi -> semua 0', () => {
    expect(calcSavingsState([], [])).toEqual({
      sisaBalance: 0, allocationBalance: 0, totalSavings: 0,
    })
  })

  it('sweep menambah Sisa saja', () => {
    const s = calcSavingsState([sweep(300_000)], [])
    expect(s.sisaBalance).toBe(300_000)
    expect(s.allocationBalance).toBe(0)
    expect(s.totalSavings).toBe(300_000)
  })

  it('setoran menambah Allocation saja', () => {
    const s = calcSavingsState([], [tx('savings_deposit', 500_000)])
    expect(s.sisaBalance).toBe(0)
    expect(s.allocationBalance).toBe(500_000)
  })

  it('pengeluaran Sisa mengurangi Sisa saja', () => {
    const s = calcSavingsState(
      [sweep(500_000)],
      [tx('savings_expense', 200_000, { savingsSource: 'sisa', note: 'Darurat' })],
    )
    expect(s.sisaBalance).toBe(300_000)
    expect(s.allocationBalance).toBe(0)
  })

  it('pengeluaran Allocation mengurangi Allocation saja', () => {
    const s = calcSavingsState(
      [],
      [
        tx('savings_deposit', 500_000),
        tx('savings_expense', 200_000, { savingsSource: 'allocation', note: 'Goal' }),
      ],
    )
    expect(s.allocationBalance).toBe(300_000)
    expect(s.sisaBalance).toBe(0)
  })

  it('income dan expense utama tidak menyentuh tabungan', () => {
    const s = calcSavingsState(
      [sweep(100_000)],
      [tx('income', 1_000_000), tx('expense', 400_000, { bucketId: 'needs' })],
    )
    expect(s.totalSavings).toBe(100_000)
  })

  it('transaksi deleted diabaikan', () => {
    const s = calcSavingsState(
      [sweep(500_000)],
      [tx('savings_expense', 200_000, { savingsSource: 'sisa', deleted: true })],
    )
    expect(s.sisaBalance).toBe(500_000)
  })

  it('multiple sweep dan setoran diakumulasi', () => {
    const s = calcSavingsState(
      [sweep(100_000, '2026-08'), sweep(200_000, '2026-09')],
      [tx('savings_deposit', 50_000), tx('savings_deposit', 75_000)],
    )
    expect(s.sisaBalance).toBe(300_000)
    expect(s.allocationBalance).toBe(125_000)
    expect(s.totalSavings).toBe(425_000)
  })

  it('goal usedAt tidak mengurangi saldo (pengurangan lewat transaksi)', () => {
    const goals = [{ id: 'g1', name: 'HP', targetAmount: 500_000, sortOrder: 0, usedAt: 1, createdAt: 0 }]
    const s = calcSavingsState([], [tx('savings_deposit', 500_000)])
    expect(s.allocationBalance).toBe(500_000)
    expect(goals[0]?.usedAt).toBe(1)
  })
})
