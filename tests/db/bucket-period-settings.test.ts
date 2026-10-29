import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { seedDefaultData, profileRepo } from '@/core/db/repositories'
import { saveBucketConfiguration } from '@/features/settings/bucket-persistence'
import { savePeriodStartDay } from '@/features/settings/period-persistence'
import { getConfiguredPeriod } from '@/core/finance/period-config'

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); resetDbSingleton()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-25T03:00:00Z'))
  const db = await openDatabase(); await seedDefaultData(db)
  await profileRepo.save(db, { id: 'profile', name: 'Nara', mascotId: 'mochi', periodStartDay: 1,
    defaultBucketId: 'bucket-needs', pinHash: 'hash', pinSalt: 'salt', createdAt: 1 })
})
afterEach(async () => { (await openDatabase()).close(); resetDbSingleton(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('creates, renames, styles and removes unused buckets atomically while preserving 100%', async () => {
  const db = await openDatabase(); const baseline = await db.getAll('buckets')
  const changes = baseline.map(bucket => bucket.id === 'bucket-needs' ? { ...bucket, name: 'Rumah', allocPercent: 30, icon: 'shield', color: '#DDE9F7' } : bucket)
  changes.push({ ...baseline.find(bucket => bucket.id === 'bucket-fun')!, id: 'bucket-hobby', name: 'Hobi', allocPercent: 10, sortOrder: 5 })
  await saveBucketConfiguration(db, changes, baseline)
  expect(await db.get('buckets', 'bucket-needs')).toMatchObject({ name: 'Rumah', allocPercent: 30, icon: 'shield' })
  expect(await db.count('buckets')).toBe(6)
  const current = await db.getAll('buckets')
  await saveBucketConfiguration(db, current.filter(item => item.id !== 'bucket-hobby').map(item => item.id === 'bucket-needs' ? { ...item, allocPercent: 40 } : item), current)
  expect(await db.count('buckets')).toBe(5)
})

it('rejects removing a historical/default savings bucket and stale or invalid allocations', async () => {
  const db = await openDatabase(); const baseline = await db.getAll('buckets')
  await db.put('transactions', { id: 'old', type: 'expense', amount: 100, date: '2026-10-01', bucketId: 'bucket-fun', categoryId: 'cat-hiburan', createdAt: 1, updatedAt: 1, deleted: true })
  const without = baseline.filter(item => item.id !== 'bucket-fun').map(item => item.isSavings ? { ...item, allocPercent: 30 } : item)
  await expect(saveBucketConfiguration(db, without, baseline)).rejects.toThrow('ERR_BUCKET_IN_USE')
  await expect(saveBucketConfiguration(db, baseline.filter(item => !item.isSavings), baseline)).rejects.toThrow()
  await expect(saveBucketConfiguration(db, baseline.map(item => ({ ...item, allocPercent: 0 })), baseline)).rejects.toThrow()
  await saveBucketConfiguration(db, baseline.map(item => item.id === 'bucket-fun' ? { ...item, name: 'Rekreasi' } : item), baseline)
  await expect(saveBucketConfiguration(db, baseline, baseline)).rejects.toThrow('ERR_BUCKET_STALE')
})

it('changes a fresh profile immediately, then schedules later changes without reinterpreting closed history', async () => {
  const db = await openDatabase(); const original = (await profileRepo.get(db))!
  const fresh = await savePeriodStartDay(db, 25, original)
  expect(getConfiguredPeriod('2026-10-26', fresh.periodStartDay, fresh.periodChanges).key).toBe('2026-10-25')
  await db.put('transactions', { id: 'salary', type: 'income', amount: 100000, categoryId: 'cat-gaji', date: '2026-10-25', createdAt: 1, updatedAt: 1 })
  await db.put('monthSweeps', { id: 'old', periodKey: '2026-09-25', amount: 0, perBucketDetail: [], sweptAt: 1 })
  const updated = await savePeriodStartDay(db, 1, fresh)
  expect(getConfiguredPeriod('2026-10-26', updated.periodStartDay, updated.periodChanges)).toEqual({ start: '2026-10-25', end: '2026-11-24', key: '2026-10-25' })
  expect(getConfiguredPeriod('2026-11-25', updated.periodStartDay, updated.periodChanges)).toEqual({ start: '2026-11-25', end: '2026-11-30', key: '2026-11-25' })
  expect(getConfiguredPeriod('2026-12-01', updated.periodStartDay, updated.periodChanges).key).toBe('2026-12')
  expect((await db.get('monthSweeps', 'old'))?.periodKey).toBe('2026-09-25')
})
