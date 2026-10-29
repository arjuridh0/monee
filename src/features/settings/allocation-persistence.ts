import type { MoneeDB } from '@/core/db/migrations'
import { STORES } from '@/core/db/schema'
import type { Bucket } from '@/core/finance/types'

export type AllocationErrorCode = 'ERR_ALLOCATION_INVALID' | 'ERR_ALLOCATION_STALE'

export class AllocationError extends Error {
  readonly code: AllocationErrorCode

  constructor(code: AllocationErrorCode, message: string) {
    super(message)
    this.name = 'AllocationError'
    this.code = code
  }
}

export interface AllocationChange {
  id: string
  allocPercent: number
  allowOverbudget: boolean
}

export interface SaveAllocationInput {
  changes: AllocationChange[]
  expected: AllocationChange[]
}

const REQUIRED_TOTAL = 100
const TOTAL_TOLERANCE = 1e-9

function invalid(message = 'Total alokasi harus 100%, dengan setiap jatah antara 0–100%.'): AllocationError {
  return new AllocationError('ERR_ALLOCATION_INVALID', message)
}

function assertCurrentBuckets(current: Bucket[]): void {
  if (current.length < 2
    || new Set(current.map(bucket => bucket.id)).size !== current.length
    || current.filter(bucket => bucket.isSavings).length !== 1) {
    throw invalid('Susunan bucket tidak valid. Muat ulang Monee.')
  }
}

function assertValidChanges(changes: AllocationChange[], current: Bucket[]): void {
  if (changes.length !== current.length) throw invalid()
  const currentIds = new Set(current.map(bucket => bucket.id))
  const seen = new Set<string>()
  let total = 0
  for (const change of changes) {
    if (!change || typeof change.id !== 'string' || !currentIds.has(change.id) || seen.has(change.id)) {
      throw invalid()
    }
    if (!Number.isFinite(change.allocPercent)
      || change.allocPercent < 0 || change.allocPercent > 100
      || typeof change.allowOverbudget !== 'boolean') {
      throw invalid()
    }
    seen.add(change.id)
    total += change.allocPercent
  }
  if (Math.abs(total - REQUIRED_TOTAL) >= TOTAL_TOLERANCE) throw invalid()
}

function isSameAllocation(current: Bucket[], expected: AllocationChange[]): boolean {
  if (expected.length !== current.length) return false
  const byId = new Map(expected.map(change => [change.id, change]))
  if (byId.size !== expected.length) return false
  return current.every(bucket => {
    const snapshot = byId.get(bucket.id)
    return snapshot?.allocPercent === bucket.allocPercent
      && snapshot.allowOverbudget === bucket.allowOverbudget
  })
}

export async function saveAllocation(
  db: MoneeDB,
  input: SaveAllocationInput,
): Promise<Bucket[]> {
  const tx = db.transaction(STORES.buckets, 'readwrite')
  try {
    const current = await tx.store.getAll()
    assertCurrentBuckets(current)
    assertValidChanges(input.changes, current)
    if (!isSameAllocation(current, input.expected)) {
      throw new AllocationError('ERR_ALLOCATION_STALE', 'Alokasi berubah di tab lain. Muat ulang Monee.')
    }

    const changesById = new Map(input.changes.map(change => [change.id, change]))
    const updated = [...current]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(bucket => {
        const change = changesById.get(bucket.id)!
        return { ...bucket, allocPercent: change.allocPercent, allowOverbudget: change.allowOverbudget }
      })
    for (const bucket of updated) await tx.store.put(bucket)
    await tx.done
    return updated
  } catch (error) {
    try { tx.abort() } catch { /* Already aborted or completed. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
