import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { bucketRepo, seedDefaultData } from '@/core/db/repositories'
import type { Bucket } from '@/core/finance/types'
import {
  AllocationError, saveAllocation, type AllocationChange,
} from '@/features/settings/allocation-persistence'

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  resetDbSingleton()
  await seedDefaultData(await openDatabase())
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetDbSingleton()
})

const byOrder = (buckets: Bucket[]): Bucket[] => [...buckets].sort((a, b) => a.sortOrder - b.sortOrder)

const changesFrom = (buckets: Bucket[]): AllocationChange[] => byOrder(buckets).map(bucket => ({
  id: bucket.id,
  allocPercent: bucket.allocPercent,
  allowOverbudget: bucket.allowOverbudget,
}))

async function storedBuckets(): Promise<Bucket[]> {
  return byOrder(await bucketRepo.getAll(await openDatabase()))
}

function edited(changes: AllocationChange[], id: string, patch: Partial<AllocationChange>): AllocationChange[] {
  return changes.map(change => change.id === id ? { ...change, ...patch } : change)
}

describe('saveAllocation', () => {
  it('persists every bucket percentage and overbudget permission in one save', async () => {
    const baseline = await storedBuckets()
    const changes = changesFrom(baseline)
      .map(change => change.id === 'bucket-needs' ? { ...change, allocPercent: 35, allowOverbudget: true } : change)
      .map(change => change.id === 'bucket-transport' ? { ...change, allocPercent: 15 } : change)
      .map(change => change.id === 'bucket-savings' ? { ...change, allocPercent: 30, allowOverbudget: false } : change)
      .map(change => change.id === 'bucket-fun' ? { ...change, allocPercent: 10 } : change)

    const saved = await saveAllocation(await openDatabase(), { changes, expected: changesFrom(baseline) })

    expect(saved.map(bucket => bucket.id)).toEqual(
      ['bucket-needs', 'bucket-transport', 'bucket-savings', 'bucket-charity', 'bucket-fun'],
    )
    const stored = await storedBuckets()
    expect(stored.map(({ id, allocPercent, allowOverbudget }) => ({ id, allocPercent, allowOverbudget })))
      .toEqual(changes)
    for (const original of baseline) {
      const current = stored.find(bucket => bucket.id === original.id)!
      expect(current).toMatchObject({
        name: original.name, icon: original.icon, color: original.color,
        sortOrder: original.sortOrder, isSavings: original.isSavings,
      })
    }
  })

  it('rejects a total other than 100% without touching any bucket', async () => {
    const baseline = await storedBuckets()
    const changes = edited(changesFrom(baseline), 'bucket-needs', { allocPercent: 35 })

    await expect(
      saveAllocation(await openDatabase(), { changes, expected: changesFrom(baseline) }),
    ).rejects.toMatchObject({ code: 'ERR_ALLOCATION_INVALID' })
    expect(await storedBuckets()).toEqual(baseline)
  })

  it.each([
    ['NaN', (changes: AllocationChange[]) => { changes[2]!.allocPercent = Number.NaN }],
    ['di bawah 0', (changes: AllocationChange[]) => {
      changes[0]!.allocPercent = -5
      changes[4]!.allocPercent = 50
    }],
    ['di atas 100', (changes: AllocationChange[]) => {
      changes[0]!.allocPercent = 110
      changes[2]!.allocPercent = -45
    }],
    ['id duplikat', (changes: AllocationChange[]) => { changes[1]!.id = changes[0]!.id }],
    ['bucket hilang', (changes: AllocationChange[]) => { changes.pop() }],
    ['flag bukan boolean', (changes: AllocationChange[]) => {
      (changes[0] as { allowOverbudget: unknown }).allowOverbudget = 'ya'
    }],
  ])('menolak perubahan %s tanpa menulis apa pun', async (_label, mutate) => {
    const baseline = await storedBuckets()
    const changes = changesFrom(baseline)
    mutate(changes)

    const attempt = saveAllocation(await openDatabase(), { changes, expected: changesFrom(baseline) })
    await expect(attempt).rejects.toBeInstanceOf(AllocationError)
    await expect(attempt).rejects.toMatchObject({ code: 'ERR_ALLOCATION_INVALID' })
    expect(await storedBuckets()).toEqual(baseline)
  })

  it('rejects a stale editor snapshot and leaves the newer allocation intact', async () => {
    const baseline = await storedBuckets()
    const newer = baseline.map(bucket => bucket.id === 'bucket-needs'
      ? { ...bucket, allocPercent: 30, allowOverbudget: true }
      : bucket.id === 'bucket-fun' ? { ...bucket, allocPercent: 15 } : bucket)
    await bucketRepo.saveAll(await openDatabase(), newer)

    const staleChanges = edited(edited(changesFrom(baseline), 'bucket-needs', { allocPercent: 35 }), 'bucket-fun', { allocPercent: 10 })
    await expect(
      saveAllocation(await openDatabase(), { changes: staleChanges, expected: changesFrom(baseline) }),
    ).rejects.toMatchObject({ code: 'ERR_ALLOCATION_STALE' })
    expect(await storedBuckets()).toEqual(byOrder(newer))
  })

  it('serializes concurrent saves so only the first writer commits', async () => {
    const baseline = await storedBuckets()
    const expected = changesFrom(baseline)
    const first = edited(edited(changesFrom(baseline), 'bucket-needs', { allocPercent: 35 }), 'bucket-fun', { allocPercent: 10 })
    const second = edited(edited(changesFrom(baseline), 'bucket-needs', { allocPercent: 30 }), 'bucket-fun', { allocPercent: 15 })

    const results = await Promise.allSettled([
      saveAllocation(await openDatabase(), { changes: first, expected }),
      saveAllocation(await openDatabase(), { changes: second, expected }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'ERR_ALLOCATION_STALE' } })
    const winner = results.findIndex(result => result.status === 'fulfilled')
    const stored = await storedBuckets()
    expect(stored.map(({ id, allocPercent, allowOverbudget }) => ({ id, allocPercent, allowOverbudget })))
      .toEqual(winner === 0 ? first : second)
  })
})
