import type { MoneeDB } from './migrations'
import { createMissingSweeps, type ClosedPeriod } from '@/core/finance/sweep'
import { getToday, isInPeriod } from '@/core/finance/period'
import { getConfiguredPeriod } from '@/core/finance/period-config'
import { hasSafeFinanceTotals } from '@/core/finance/safe-totals'
import type { DateStr } from '@/core/finance/types'

/** Close periods from the latest ledger under the same lock used by money writes. */
export async function closePeriods(db: MoneeDB, today: DateStr = getToday()) {
  const tx = db.transaction(['profile', 'transactions', 'buckets', 'monthSweeps'], 'readwrite')
  try {
    const [profile, transactions, buckets, existingSweeps] = await Promise.all([
      tx.objectStore('profile').get('profile'), tx.objectStore('transactions').getAll(),
      tx.objectStore('buckets').getAll(), tx.objectStore('monthSweeps').getAll(),
    ])
    const periods: ClosedPeriod[] = []
    if (profile && transactions.length) {
      const startDay = profile.periodStartDay
      const earliest = transactions.reduce((min, item) => item.date < min ? item.date : min, transactions[0]!.date)
      const current = getConfiguredPeriod(today, startDay, profile.periodChanges)
      let cursor = getConfiguredPeriod(earliest, startDay, profile.periodChanges)
      while (cursor.start < current.start) {
        periods.push({ periodKey: cursor.key, txs: transactions.filter(item => isInPeriod(item.date, cursor)) })
        const nextDate = new Date(`${cursor.end}T00:00:00Z`)
        nextDate.setUTCDate(nextDate.getUTCDate() + 1)
        const next = getConfiguredPeriod(nextDate.toISOString().slice(0, 10), startDay, profile.periodChanges)
        if (next.start <= cursor.start) throw new Error('ERR_PERIOD_INVALID — Batas periode tidak valid.')
        cursor = next
      }
    }
    const newSweeps = createMissingSweeps(periods, buckets, existingSweeps)
    if (!hasSafeFinanceTotals(transactions, [...existingSweeps, ...newSweeps], profile)) {
      throw new Error('ERR_AMOUNT_INVALID — Total nominal melewati batas hitungan aman.')
    }
    for (const sweep of newSweeps) await tx.objectStore('monthSweeps').add(sweep)
    await tx.done
    return { newSweeps, sweeps: [...existingSweeps, ...newSweeps] }
  } catch (error) {
    try { tx.abort() } catch { /* Already ended. */ }
    await tx.done.catch(() => undefined); throw error
  }
}
