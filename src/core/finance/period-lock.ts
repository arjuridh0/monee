/**
 * Period lock - dok 08 §6, D53
 * Periode yang sudah punya MonthSweep bersifat immutable.
 */
import type { MonthSweep } from './types'

export function isPeriodLocked(periodKey: string, sweeps: MonthSweep[]): boolean {
  return sweeps.some(s => s.periodKey === periodKey)
}

export function assertPeriodOpen(periodKey: string, sweeps: MonthSweep[]): void {
  if (isPeriodLocked(periodKey, sweeps)) {
    throw new Error('ERR_PERIODE_TERKUNCI')
  }
}
