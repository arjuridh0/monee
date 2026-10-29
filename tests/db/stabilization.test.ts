import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { webcrypto } from 'node:crypto'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { seedDefaultData, profileRepo } from '@/core/db/repositories'
import { useMoneeStore } from '@/store'
import { generateSalt, hashPin, verifyPin } from '@/core/security/pin'
import { runLazyEffects } from '@/store/lazy-effects'

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('crypto', webcrypto)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-25T03:00:00Z'))
  resetDbSingleton(); useMoneeStore.setState(useMoneeStore.getInitialState(), true)
  const db = await openDatabase(); await seedDefaultData(db)
  const pinSalt = generateSalt()
  await profileRepo.save(db, { id: 'profile', name: 'Nara', mascotId: 'mochi', periodStartDay: 1,
    defaultBucketId: 'bucket-needs', pinHash: await hashPin('123456', pinSalt), pinSalt, createdAt: 1 })
})
afterEach(async () => { (await openDatabase()).close(); resetDbSingleton(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('saving a name from a stale profile cannot restore credentials changed by another tab', async () => {
  const db = await openDatabase(); await useMoneeStore.getState().load()
  const stale = useMoneeStore.getState().profile!
  const pinSalt = generateSalt()
  await profileRepo.save(db, { ...stale, pinHash: await hashPin('654321', pinSalt), pinSalt })
  await useMoneeStore.getState().saveProfile({ ...stale, name: 'Nama baru' })
  const actual = (await profileRepo.get(db))!
  expect(actual.name).toBe('Nama baru')
  expect(await verifyPin('654321', actual.pinHash, actual.pinSalt)).toBe(true)
})

it('reload locks an open session when credentials are replaced externally', async () => {
  const db = await openDatabase(); await useMoneeStore.getState().load()
  useMoneeStore.getState().setLocked(false)
  const current = (await profileRepo.get(db))!
  await profileRepo.save(db, { ...current, pinHash: 'changed' })
  await useMoneeStore.getState().load()
  expect(useMoneeStore.getState().isLocked).toBe(true)
})

it('independent sweep callers both succeed and close the latest database balance once', async () => {
  const db = await openDatabase()
  await db.put('transactions', { id: 'salary', type: 'income', categoryId: 'cat-gaji', amount: 100000,
    date: '2026-09-02', createdAt: 1, updatedAt: 1 })
  // Current API below intentionally uses the proposed atomic interface.
  const outcomes = await Promise.allSettled([runLazyEffects(db), runLazyEffects(db)])
  expect(outcomes.every(item => item.status === 'fulfilled')).toBe(true)
  const sweeps = await db.getAll('monthSweeps')
  expect(sweeps).toHaveLength(1)
  expect(sweeps[0]?.amount).toBe(100000)
})

it('a refresh after midnight WIB closes the old period and publishes the new snapshot', async () => {
  const db = await openDatabase()
  await db.put('transactions', { id: 'salary', type: 'income', categoryId: 'cat-gaji', amount: 100000,
    date: '2026-10-25', createdAt: 1, updatedAt: 1 })
  await useMoneeStore.getState().load()
  expect(useMoneeStore.getState().snapshot?.balance.balance).toBe(100000)
  vi.setSystemTime(new Date('2026-10-31T17:00:01Z'))
  await useMoneeStore.getState().load()
  expect(useMoneeStore.getState().snapshot?.period.key).toBe('2026-11')
  expect(useMoneeStore.getState().snapshot?.balance.balance).toBe(0)
  expect(useMoneeStore.getState().snapshot?.savings.sisaBalance).toBe(100000)
})

it('requires a PIN when a fresh profile appears in a tab that did not create it', async () => {
  useMoneeStore.setState({ ...useMoneeStore.getInitialState(), isLoaded: true, isLocked: false }, true)
  await useMoneeStore.getState().load()
  expect(useMoneeStore.getState().profile).not.toBeNull()
  expect(useMoneeStore.getState().isLocked).toBe(true)
})

it('can close and export a large valid income without counting its sweep twice', async () => {
  const db = await openDatabase()
  const amount = Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1
  await useMoneeStore.getState().addTransaction({ id: 'large', type: 'income', amount, categoryId: 'cat-gaji', date: '2026-10-25', createdAt: 1, updatedAt: 1 })
  vi.setSystemTime(new Date('2026-11-01T03:00:00Z'))
  await useMoneeStore.getState().load()
  const { exportBackup } = await import('@/features/settings/backup')
  const backup = JSON.parse(await exportBackup(db))
  expect(backup.stores.monthSweeps[0].amount).toBe(amount)
})
