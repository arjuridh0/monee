import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, resetDbSingleton, setActiveAccountId, importLegacyData, inspectLegacyData } from '@/core/db/migrations'

const first = `acct_${'a'.repeat(64)}`
const second = `acct_${'b'.repeat(64)}`

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); resetDbSingleton() })
afterEach(() => { vi.unstubAllGlobals(); resetDbSingleton() })

describe('account-scoped local databases', () => {
  it('cancels an opening database when the active account changes', async () => {
    setActiveAccountId(first)
    const old = openDatabase().then(db => ({ name: db.name, error: '' }), error => ({ name: '', error: String(error) }))
    setActiveAccountId(second)
    const current = await openDatabase()
    expect((await old).error).toContain('Akun berubah')
    expect(current.name).toContain(second)
    expect((await openDatabase()).name).toBe(current.name)
  })
  it('replaces a ledger only with explicit confirmation and preserves sync metadata and the device lock', async () => {
    await (await openDatabase()).put('profile', { id: 'profile', name: 'Legacy', mascotId: 'mochi', periodStartDay: 1, defaultBucketId: 'x', pinHash: 'old-device', pinSalt: 'old-salt', createdAt: 1 })
    resetDbSingleton(); setActiveAccountId(first)
    const target = await openDatabase()
    await target.put('profile', { id: 'profile', name: 'Cloud', mascotId: 'luna', periodStartDay: 1, defaultBucketId: 'y', pinHash: '', pinSalt: '', createdAt: 2 })
    await target.put('settings', { key: 'account-sync-baseline', value: { cursor: 'cloud-cursor' } })
    await importLegacyData({ replaceConfirmed: true })
    expect(await target.get('profile', 'profile')).toMatchObject({ name: 'Legacy', pinHash: '', pinSalt: '' })
    expect(await target.get('settings', 'account-sync-baseline')).toMatchObject({ value: { cursor: 'cloud-cursor' } })
    setActiveAccountId(undefined)
    expect((await (await openDatabase()).get('profile', 'profile'))?.pinHash).toBe('old-device')
  })
  it('keeps two accounts on one browser in separate IndexedDB databases', async () => {
    setActiveAccountId(first)
    await (await openDatabase()).put('profile', { id: 'profile', name: 'Arju', mascotId: 'mochi', periodStartDay: 1, defaultBucketId: 'x', pinHash: '', pinSalt: '', createdAt: 1 })
    setActiveAccountId(second)
    expect(await (await openDatabase()).get('profile', 'profile')).toBeUndefined()
    await (await openDatabase()).put('profile', { id: 'profile', name: 'Pasangan', mascotId: 'bumi', periodStartDay: 1, defaultBucketId: 'y', pinHash: '', pinSalt: '', createdAt: 2 })
    setActiveAccountId(first)
    expect((await (await openDatabase()).get('profile', 'profile'))?.name).toBe('Arju')
  })

  it('previews and imports legacy data only after explicit confirmation, retaining the source', async () => {
    const legacy = await openDatabase()
    await legacy.put('profile', { id: 'profile', name: 'Arju', mascotId: 'mochi', periodStartDay: 1, defaultBucketId: 'x', pinHash: 'local-hash', pinSalt: 'local-salt', createdAt: 1 })
    await legacy.put('transactions', { id: 'legacy-income', type: 'income', amount: 9000, date: '2026-11-16', createdAt: 1, updatedAt: 1 })
    legacy.close()
    resetDbSingleton()

    const preview = await inspectLegacyData()
    expect(preview).toMatchObject({ profileName: 'Arju', transactions: 1 })
    setActiveAccountId(first)
    await importLegacyData()
    expect((await (await openDatabase()).get('profile', 'profile'))?.name).toBe('Arju')
    expect(await (await openDatabase()).get('transactions', 'legacy-income')).toBeDefined()
    setActiveAccountId(undefined)
    expect((await (await openDatabase()).get('profile', 'profile'))?.pinHash).toBe('local-hash')
  })

  it('refuses to overwrite an account database during legacy import', async () => {
    await openDatabase().then(db => db.put('profile', { id: 'profile', name: 'Legacy', mascotId: 'mochi', periodStartDay: 1, defaultBucketId: 'x', pinHash: '', pinSalt: '', createdAt: 1 }))
    resetDbSingleton()
    setActiveAccountId(first)
    await (await openDatabase()).put('profile', { id: 'profile', name: 'Cloud', mascotId: 'luna', periodStartDay: 1, defaultBucketId: 'y', pinHash: '', pinSalt: '', createdAt: 2 })
    await expect(importLegacyData()).rejects.toThrow('Data akun sudah tersedia di perangkat ini.')
    expect((await (await openDatabase()).get('profile', 'profile'))?.name).toBe('Cloud')
  })
})
