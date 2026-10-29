import type { MonthSweep, Profile, Transaction } from './types'
import { getConfiguredPeriod } from './period-config'
import { calcBalance } from './balance'

/** Bound each independent accumulator, including cancellation; transfers are not income twice. */
export function hasSafeFinanceTotals(transactions: Transaction[], sweeps: MonthSweep[], profile?: Pick<Profile, 'periodStartDay' | 'periodChanges'>): boolean {
  let income = 0, spending = 0, savingsIn = 0, savingsOut = 0
  for (const sweep of sweeps) {
    savingsIn += sweep.amount
    if (!Number.isSafeInteger(savingsIn)) return false
  }
  for (const item of transactions) {
    if (item.deleted) continue
    if (!Number.isSafeInteger(item.amount) || item.amount <= 0) return false
    if (item.type === 'income') income += item.amount
    if (item.type === 'expense') spending += item.amount - (item.refundedAmount ?? 0)
    if (item.type === 'savings_deposit') { spending += item.amount; savingsIn += item.amount }
    if (item.type === 'savings_expense') savingsOut += item.amount
    if (![income, spending, savingsIn, savingsOut].every(Number.isSafeInteger)) return false
  }
  // Every accepted ledger must also be closable later, without importing a latent overflow.
  const closed = new Set(sweeps.map(sweep => sweep.periodKey))
  const open = new Map<string, Transaction[]>()
  for (const item of transactions) {
    if (item.deleted) continue
    const key = getConfiguredPeriod(item.date, profile?.periodStartDay ?? 1, profile?.periodChanges).key
    if (closed.has(key)) continue
    const entries = open.get(key) ?? []
    entries.push(item); open.set(key, entries)
  }
  for (const entries of open.values()) {
    savingsIn += Math.max(0, calcBalance(entries).balance)
    if (!Number.isSafeInteger(savingsIn)) return false
  }
  return true
}
