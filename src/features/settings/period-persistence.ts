import type { MoneeDB } from '@/core/db/migrations'
import { getToday } from '@/core/finance/period'
import { adjacentDate, getConfiguredPeriod } from '@/core/finance/period-config'
import type { Profile } from '@/core/finance/types'

export async function savePeriodStartDay(db: MoneeDB, day: number, expected: Profile): Promise<Profile> {
  if (!Number.isInteger(day) || day < 1 || day > 28) throw new Error('ERR_PERIOD_INVALID — Pilih tanggal 1 sampai 28.')
  const tx = db.transaction(['profile', 'transactions', 'monthSweeps'], 'readwrite')
  try {
    const current = await tx.objectStore('profile').get('profile')
    if (!current || current.periodStartDay !== expected.periodStartDay
      || JSON.stringify(current.periodChanges) !== JSON.stringify(expected.periodChanges)) {
      throw new Error('ERR_PERIOD_STALE — Pengaturan periode berubah. Buka ulang pengaturan.')
    }
    const hasHistory = await tx.objectStore('transactions').count() || await tx.objectStore('monthSweeps').count()
    let updated: Profile
    if (!hasHistory) {
      updated = { ...current, periodStartDay: day, periodChanges: [] }
    } else {
      const today = getToday()
      const applied = (current.periodChanges ?? []).filter(change => change.effectiveFrom <= today)
      const period = getConfiguredPeriod(today, current.periodStartDay, applied)
      const activeDay = applied.slice(-1)[0]?.startDay ?? current.periodStartDay
      updated = { ...current, periodChanges: [...applied,
        ...(day === activeDay ? [] : [{ effectiveFrom: adjacentDate(period.end, 1), startDay: day }])] }
    }
    await tx.objectStore('profile').put(updated)
    await tx.done
    return updated
  } catch (error) {
    try { tx.abort() } catch { /* Already ended. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
