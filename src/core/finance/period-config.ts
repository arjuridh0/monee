import { getPeriodBounds } from './period'
import type { DateStr, PeriodBounds, Profile } from './types'

export function adjacentDate(date: DateStr, days: number): DateStr {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** Changes cut a period at their effective boundary, never reinterpret older dates. */
export function getConfiguredPeriod(date: DateStr, initialDay: number, changes: Profile['periodChanges'] = []): PeriodBounds {
  const active = changes.filter(change => change.effectiveFrom <= date).slice(-1)[0]
  const next = changes.find(change => change.effectiveFrom > date)
  const period = getPeriodBounds(date, active?.startDay ?? initialDay)
  if (active && period.start < active.effectiveFrom) {
    period.start = active.effectiveFrom
    period.key = active.effectiveFrom
  }
  if (next && next.effectiveFrom <= period.end) period.end = adjacentDate(next.effectiveFrom, -1)
  return period
}

export function offsetPeriod(date: DateStr, offset: number, initialDay: number, changes: Profile['periodChanges'] = []): PeriodBounds {
  let period = getConfiguredPeriod(date, initialDay, changes)
  for (let i = 0; i < Math.abs(offset); i++) {
    period = getConfiguredPeriod(adjacentDate(offset < 0 ? period.start : period.end, offset < 0 ? -1 : 1), initialDay, changes)
  }
  return period
}
