/**
 * Savings - dok 08 §4
 * Sisa = total sweep - pengeluaran source sisa
 * Allocation = total setoran - pengeluaran source allocation
 * ponytail: 1 fungsi pure
 */
import type { MonthSweep, Transaction, SavingsBalances } from './types'

export function calcSavingsState(
  sweeps: MonthSweep[],
  txs: Transaction[],
): SavingsBalances {
  let sisaBalance = sweeps.reduce((sum, sweep) => sum + sweep.amount, 0)
  let allocationBalance = 0

  for (const t of txs) {
    if (t.deleted) continue
    if (t.type === 'savings_deposit') {
      allocationBalance += t.amount
    } else if (t.type === 'savings_expense') {
      if (t.savingsSource === 'sisa') sisaBalance -= t.amount
      else if (t.savingsSource === 'allocation') allocationBalance -= t.amount
    }
  }

  return {
    sisaBalance,
    allocationBalance,
    totalSavings: sisaBalance + allocationBalance,
  }
}
