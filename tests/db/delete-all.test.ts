import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { profileRepo, seedDefaultData } from '@/core/db/repositories'
import { STORES, type StoreName } from '@/core/db/schema'
import { hashPin } from '@/core/security/pin'
import { deleteAllData } from '@/features/settings/delete-all'
import type { Profile } from '@/core/finance/types'

let profile: Profile
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('crypto', webcrypto)
  resetDbSingleton()
  const db = await openDatabase()
  await seedDefaultData(db)
  const pinSalt = 'ab'.repeat(16)
  profile = { id: 'profile', name: 'Arju', mascotId: 'mochi', periodStartDay: 1,
    defaultBucketId: 'bucket-needs', pinSalt, pinHash: await hashPin('123456', pinSalt), createdAt: 10 }
  await profileRepo.save(db, profile)
  await db.put(STORES.settings, { key: 'custom', value: 'keep until reset' })
  await db.put(STORES.lockout, { key: 'lockout', attempts: 2, lockedUntil: 0 })
})
afterEach(() => { vi.unstubAllGlobals(); resetDbSingleton() })

describe('delete all data', () => {
  it('lets an authenticated account without a device PIN delete its ledger', async () => {
    const db = await openDatabase()
    await profileRepo.save(db, { ...profile, pinHash: '', pinSalt: '' })
    await deleteAllData(db, { expectedPinHash: '' })
    expect(await Promise.all(Object.values(STORES).map(name => db.getAll(name as StoreName))))
      .toEqual(Object.values(STORES).map(() => []))
  })

  it('rejects a wrong PIN without clearing any store', async () => {
    const db = await openDatabase()
    const before = await Promise.all(Object.values(STORES).map(name => db.getAll(name as StoreName)))
    await expect(deleteAllData(db, { pin: '000000', expectedPinHash: profile.pinHash })).rejects.toMatchObject({ code: 'ERR_DELETE_PIN' })
    expect(await Promise.all(Object.values(STORES).map(name => db.getAll(name as StoreName)))).toEqual(before)
  })

  it('rejects a profile snapshot changed in another tab without deleting data', async () => {
    const db = await openDatabase()
    const currentSalt = 'cd'.repeat(16)
    await profileRepo.save(db, { ...profile, pinSalt: currentSalt, pinHash: await hashPin('654321', currentSalt) })
    const before = await db.getAll(STORES.categories)
    await expect(deleteAllData(db, { pin: '123456', expectedPinHash: profile.pinHash })).rejects.toMatchObject({ code: 'ERR_DELETE_STALE' })
    expect(await db.getAll(STORES.categories)).toEqual(before)
  })

  it('clears every IndexedDB store in one reset after the current PIN is verified', async () => {
    const db = await openDatabase()
    await deleteAllData(db, { pin: '123456', expectedPinHash: profile.pinHash })
    expect(await Promise.all(Object.values(STORES).map(name => db.getAll(name as StoreName))))
      .toEqual(Object.values(STORES).map(() => []))
  })
})
