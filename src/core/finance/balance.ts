/**
 * Balance - dok 08 §2
 * saldo = income - expense(net refund) - setoran tabungan
 * savings_expense tidak menyentuh saldo utama.
 * ponytail: 1 fungsi pure, satu loop
 */
import type { Transaction, BalanceState } from './types'

function netExpense(t: Transaction): number {
  const refunded = Math.max(0, t.refundedAmount ?? 0)
  return Math.max(0, t.amount - refunded)
}

export function calcBalance(txs: Transaction[]): BalanceState {
  let totalIncome = 0
  let totalExpense = 0
  let totalSavingsDeposit = 0

  for (const t of txs) {
    if (t.deleted) continue
    switch (t.type) {
      case 'income':
        totalIncome += t.amount
        break
      case 'expense':
        totalExpense += netExpense(t)
        break
      case 'savings_deposit':
        totalSavingsDeposit += t.amount
        break
      case 'savings_expense':
        // uang sudah keluar dari saldo saat sweep/setoran
        break
    }
  }

  return {
    totalIncome,
    totalExpense,
    totalSavingsDeposit,
    balance: totalIncome - totalExpense - totalSavingsDeposit,
  }
}
