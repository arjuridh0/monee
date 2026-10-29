import { describe, it, expect } from 'vitest'
import { calcBalance } from '@/core/finance/balance'
import type { Transaction, TxType } from '@/core/finance/types'

let seq = 0
const tx = (
  type: TxType,
  amount: number,
  over: Partial<Transaction> = {},
): Transaction => ({
  id: `tx-${++seq}`,
  type,
  amount,
  date: '2026-10-15',
  refundedAmount: 0,
  deleted: false,
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

describe('balance (v2)', () => {
  it('tanpa transaksi -> semua nol', () => {
    expect(calcBalance([])).toEqual({
      totalIncome: 0,
      totalExpense: 0,
      totalSavingsDeposit: 0,
      balance: 0,
    })
  })

  it('income saja -> saldo = income', () => {
    const r = calcBalance([tx('income', 5_000_000)])
    expect(r.totalIncome).toBe(5_000_000)
    expect(r.balance).toBe(5_000_000)
  })

  it('expense dikurangi refund parsial', () => {
    const r = calcBalance([
      tx('income', 1_000_000),
      tx('expense', 100_000, { refundedAmount: 25_000 }),
    ])
    expect(r.totalExpense).toBe(75_000)
    expect(r.balance).toBe(925_000)
  })

  it('setoran tabungan mengurangi saldo', () => {
    const r = calcBalance([
      tx('income', 1_000_000),
      tx('savings_deposit', 250_000),
    ])
    expect(r.totalSavingsDeposit).toBe(250_000)
    expect(r.balance).toBe(750_000)
  })

  it('pengeluaran tabungan tidak menyentuh saldo utama', () => {
    const r = calcBalance([
      tx('income', 1_000_000),
      tx('savings_expense', 300_000, { savingsSource: 'sisa', note: 'Darurat' }),
    ])
    expect(r.totalExpense).toBe(0)
    expect(r.balance).toBe(1_000_000)
  })

  it('transaksi deleted diabaikan', () => {
    const r = calcBalance([
      tx('income', 1_000_000),
      tx('expense', 400_000, { deleted: true }),
    ])
    expect(r.totalExpense).toBe(0)
    expect(r.balance).toBe(1_000_000)
  })

  it('saldo boleh negatif hasil edit', () => {
    const r = calcBalance([tx('income', 100_000), tx('expense', 500_000)])
    expect(r.balance).toBe(-400_000)
  })

  it('multiple income dijumlahkan', () => {
    const r = calcBalance([tx('income', 5_000_000), tx('income', 500_000)])
    expect(r.totalIncome).toBe(5_500_000)
  })
})
