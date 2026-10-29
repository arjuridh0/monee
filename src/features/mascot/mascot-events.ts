import type { FinanceSnapshot } from '@/core/finance/selectors'
import type { Transaction } from '@/core/finance/types'
import type { MascotEvent } from './mascot-machine'

export const MASCOT_EVENT = 'monee:mascot'

export function dispatchMascotEvent(event: MascotEvent): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<MascotEvent>(MASCOT_EVENT, { detail: event }))
}

/** A saved transaction reacts to the bucket it now occupies; missing data stays happy. */
export function reactionForTransaction(t: Transaction, snapshot: FinanceSnapshot | null): MascotEvent {
  if (t.type === 'income') return 'incomeSaved'
  if (t.type === 'savings_deposit') return 'savingsDeposit'
  if (t.type === 'savings_expense') return 'suddenExpense'
  const progress = snapshot?.buckets.find(item => item.bucket.id === t.bucketId)?.progressPct
  if (progress === undefined) return 'transactionSaved'
  if (progress > 100) return 'budgetBlocked'
  if (progress >= 75) return 'budgetWarning'
  return 'transactionSaved'
}

export function reactionForError(error: unknown): MascotEvent | null {
  if (!(error instanceof Error)) return null
  const code = error.message.split(' — ')[0]
  if (code === 'ERR_JATAH_HABIS') return 'budgetBlocked'
  if (code === 'ERR_SALDO_KURANG' || code === 'ERR_KOMPARTEMEN_KURANG') return 'balanceShort'
  if (code === 'ERR_PERIODE_TERKUNCI') return 'periodLocked'
  return null
}

export function milestoneReached(before: FinanceSnapshot | null, after: FinanceSnapshot | null): boolean {
  if (!before || !after) return false
  const previous = new Map(before.savings.goals.map(item => [item.goal.id, item.status]))
  return after.savings.goals.some(item => item.status === 'fulfilled' && previous.get(item.goal.id) !== 'fulfilled')
}

export function announceMascotTransaction(t: Transaction, snapshot: FinanceSnapshot | null): void {
  if (t.deleted) return
  dispatchMascotEvent(reactionForTransaction(t, snapshot))
}

export function announceMascotError(error: unknown): void {
  const event = reactionForError(error)
  if (event) dispatchMascotEvent(event)
}

export function announceMilestone(before: FinanceSnapshot | null, after: FinanceSnapshot | null): void {
  if (milestoneReached(before, after)) dispatchMascotEvent('milestoneReached')
}
