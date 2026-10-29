import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { profileRepo, seedDefaultData } from '@/core/db/repositories'
import { STORES } from '@/core/db/schema'
import { exportBackup, importBackup, BackupError } from '@/features/settings/backup'
import type { MoneeDB } from '@/core/db/migrations'
import type { Transaction } from '@/core/finance/types'

type Stores = Record<string, Record<string, unknown>[]>

async function readStores(db: MoneeDB) {
  return Object.fromEntries(await Promise.all(Object.values(STORES).map(async name => [name, await db.getAll(name)])))
}

async function ledgerFixture(db: MoneeDB) {
  const transactions: Transaction[] = [
    { id: 'salary', type: 'income', amount: 1_000_000, categoryId: 'cat-gaji', recurringId: 'deleted-template', date: '2026-09-25', createdAt: 20, updatedAt: 20 },
    { id: 'lunch', type: 'expense', amount: 200_000, refundedAmount: 25_000, categoryId: 'cat-makan', bucketId: 'bucket-needs', date: '2026-09-26', createdAt: 30, updatedAt: 40 },
    { id: 'deposit', type: 'savings_deposit', amount: 300_000, refundedAmount: 0, categoryId: 'cat-tabungan', bucketId: 'bucket-savings', date: '2026-09-27', createdAt: 50, updatedAt: 50 },
    { id: 'goal-use:phone', type: 'savings_expense', amount: 100_000, savingsSource: 'allocation', note: 'Gunakan goal: Phone', date: '2026-10-25', createdAt: 70, updatedAt: 70 },
    { id: 'emergency', type: 'savings_expense', amount: 50_000, savingsSource: 'sisa', note: 'Darurat: bengkel', date: '2026-10-26', createdAt: 80, updatedAt: 80 },
    { id: 'deleted', type: 'savings_expense', amount: 999_999, savingsSource: 'allocation', note: 'Dibatalkan', deleted: true, date: '2026-10-26', createdAt: 90, updatedAt: 90 },
  ]
  const profile = (await db.get(STORES.profile, 'profile'))!
  await db.put(STORES.profile, { ...profile, periodStartDay: 25 })
  for (const transaction of transactions) await db.put(STORES.transactions, transaction)
  await db.put(STORES.goals, { id: 'phone', name: 'Phone', targetAmount: 100_000, sortOrder: 0, createdAt: 60, usedAt: 70 })
  await db.put(STORES.monthSweeps, { id: 'sweep-september', periodKey: '2026-09-25', amount: 525_000, sweptAt: 65,
    perBucketDetail: [{ bucketId: 'bucket-needs', jatah: 400_000, terpakai: 175_000, sisa: 225_000 }] })
  await db.put(STORES.recurringIncomes, { id: 'salary-next', name: 'Gaji', amount: 1_000_000, dayOfMonth: 25, categoryId: 'cat-gaji', isActive: true, createdAt: 10 })
  await db.put(STORES.settings, { key: 'custom', value: { private: true } })
  await db.put(STORES.lockout, { key: 'lockout', attempts: 3, lockedUntil: 100 })
  return { format: 'monee-backup', version: 1, encrypted: false, exportedAt: '2026-10-25T00:00:00.000Z', stores: await readStores(db) as Stores }
}

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('crypto', webcrypto)
  resetDbSingleton()
  const db = await openDatabase()
  await seedDefaultData(db)
  await profileRepo.save(db, {
    id: 'profile', name: 'Arju', mascotId: 'mochi', periodStartDay: 1,
    defaultBucketId: 'bucket-needs', pinHash: 'ab'.repeat(32), pinSalt: 'cd'.repeat(16), createdAt: 10,
  })
})

afterEach(() => { vi.unstubAllGlobals(); resetDbSingleton() })

describe('backup import/export', () => {
  it('omits voice credentials from exported backups and ignores injected credentials on import', async () => {
    const db = await openDatabase()
    await db.put(STORES.settings, { key: 'groq-voice-credential', value: { apiKey: 'gsk_secret_local', consent: true } })
    const contents = await exportBackup(db)
    expect(contents).not.toContain('gsk_secret_local')
    const envelope = JSON.parse(contents)
    envelope.stores.settings.push({ key: 'groq-voice-credential', value: { apiKey: 'gsk_injected', consent: true } })
    await importBackup(db, JSON.stringify(envelope))
    expect(await db.get(STORES.settings, 'groq-voice-credential')).toBeUndefined()
  })
  it.each([undefined, 'correct horse battery staple'])('round trips a complete custom-period ledger (passphrase %s)', async passphrase => {
    const db = await openDatabase()
    const fixture = await ledgerFixture(db)
    const contents = await exportBackup(db, passphrase)
    await db.clear(STORES.transactions)
    await db.clear(STORES.monthSweeps)
    await importBackup(db, contents, passphrase)
    expect(await readStores(db)).toEqual(fixture.stores)
  })

  const malformed: [string, (stores: Stores) => void][] = [
    ['noncanonical profile', s => { s.profile![0]!.id = 'other' }],
    ['noncanonical lockout', s => { s.lockout![0]!.key = 'other' }],
    ['multiple lockouts', s => { s.lockout!.push({ key: 'other', attempts: 0, lockedUntil: 0 }) }],
    ['missing savings category', s => { s.categories = s.categories!.filter(c => c.id !== 'cat-tabungan') }],
    ['renamed savings category identity', s => { s.categories!.find(c => c.id === 'cat-tabungan')!.name = 'Other' }],
    ['savings category income', s => { s.categories!.find(c => c.id === 'cat-tabungan')!.type = 'income' }],
    ['savings default bucket', s => { s.profile![0]!.defaultBucketId = 'bucket-savings' }],
    ['impossible calendar date', s => { s.transactions!.find(t => t.id === 'salary')!.date = '2026-02-29' }],
    ['invalid month', s => { s.transactions!.find(t => t.id === 'salary')!.date = '2026-13-01' }],
    ['refund on income', s => { s.transactions!.find(t => t.id === 'salary')!.refundedAmount = 1 }],
    ['expense savings bucket', s => { s.transactions!.find(t => t.id === 'lunch')!.bucketId = 'bucket-savings' }],
    ['expense savings category', s => { s.transactions!.find(t => t.id === 'lunch')!.categoryId = 'cat-tabungan' }],
    ['deposit ordinary category', s => { s.transactions!.find(t => t.id === 'deposit')!.categoryId = 'cat-makan' }],
    ['deposit missing category', s => { delete s.transactions!.find(t => t.id === 'deposit')!.categoryId }],
    ['deposit ordinary bucket', s => { s.transactions!.find(t => t.id === 'deposit')!.bucketId = 'bucket-needs' }],
    ['savings expense category', s => { s.transactions!.find(t => t.id === 'goal-use:phone')!.categoryId = 'cat-makan' }],
    ['savings expense bucket', s => { s.transactions!.find(t => t.id === 'goal-use:phone')!.bucketId = 'bucket-needs' }],
    ['missing savings note', s => { delete s.transactions!.find(t => t.id === 'goal-use:phone')!.note }],
    ['blank savings note', s => { s.transactions!.find(t => t.id === 'goal-use:phone')!.note = '  ' }],
    ['nonstring note', s => { s.transactions!.find(t => t.id === 'salary')!.note = { text: 'bad' } }],
    ['nonstring recurring reference', s => { s.transactions!.find(t => t.id === 'salary')!.recurringId = 15 }],
    ['ordinary expense savings source', s => { s.transactions!.find(t => t.id === 'lunch')!.savingsSource = 'sisa' }],
    ['income bucket reference', s => { s.transactions!.find(t => t.id === 'salary')!.bucketId = 'missing' }],
    ['rounded negative allocation after overflow', s => {
      s.goals = []; s.monthSweeps = [];
      const base = { date: '2026-10-01', createdAt: 1, updatedAt: 1 };
      s.transactions = [
        { ...base, id: 'a', type: 'savings_deposit', amount: Number.MAX_SAFE_INTEGER, categoryId: 'cat-tabungan', bucketId: 'bucket-savings' },
        { ...base, id: 'b', type: 'savings_deposit', amount: 4, categoryId: 'cat-tabungan', bucketId: 'bucket-savings' },
        { ...base, id: 'c', type: 'savings_expense', amount: Number.MAX_SAFE_INTEGER, savingsSource: 'allocation', note: 'Used' },
        { ...base, id: 'd', type: 'savings_expense', amount: 5, savingsSource: 'allocation', note: 'Used' },
      ];
    }],
    ['prospective sweep overflow', s => { s.goals = []; s.monthSweeps![0]!.amount = Number.MAX_SAFE_INTEGER; s.transactions = [{ id: 'pending', type: 'income', amount: 1, categoryId: 'cat-gaji', date: '2026-10-25', createdAt: 1, updatedAt: 1 }]; }],
    ['allocation overdraw', s => { s.transactions!.find(t => t.id === 'deposit')!.amount = 1 }],
    ['sisa overdraw', s => { s.monthSweeps![0]!.amount = 1 }],
    ['invalid calendar sweep month', s => { s.monthSweeps![0]!.periodKey = '2026-13' }],
    ['invalid custom start day', s => { s.monthSweeps![0]!.periodKey = '2026-09-29' }],
    ['fractional sweep audit', s => { (s.monthSweeps![0]!.perBucketDetail as Record<string, unknown>[])[0]!.terpakai = 0.5 }],
    ['unsafe sweep audit', s => { (s.monthSweeps![0]!.perBucketDetail as Record<string, unknown>[])[0]!.sisa = Number.MAX_SAFE_INTEGER + 1 }],
    ['duplicate sweep audit bucket', s => { const details = s.monthSweeps![0]!.perBucketDetail as Record<string, unknown>[]; details.push({ ...details[0] }) }],
    ['malformed sweep detail', s => { s.monthSweeps![0]!.perBucketDetail = [null] }],
    ['wrong goal amount', s => { s.goals![0]!.targetAmount = 200_000 }],
    ['unmarked used goal', s => { delete s.goals![0]!.usedAt }],
    ['deleted goal expense marked used', s => { s.transactions!.find(t => t.id === 'goal-use:phone')!.deleted = true }],
    ['nonstring goal icon', s => { s.goals![0]!.icon = 3 }],
    ['blank profile name', s => { s.profile![0]!.name = ' ' }],
    ['nonstring category color', s => { s.categories![0]!.color = ['#ffffff'] }],
    ['nonstring bucket color', s => { s.buckets![0]!.color = ['#ffffff'] }],
    ['nonstring currency format', s => { s.profile![0]!.currency = { code: 'IDR', format: ['Rp#.###'] } }],
    ['malformed period changes', s => { s.profile![0]!.periodChanges = {} }],
    ['impossible period change date', s => { s.profile![0]!.periodChanges = [{ effectiveFrom: '2026-02-30', startDay: 1 }] }],
    ['invalid period change start day', s => { s.profile![0]!.periodChanges = [{ effectiveFrom: '2026-10-01', startDay: 29 }] }],
    ['duplicate period changes', s => { s.profile![0]!.periodChanges = [{ effectiveFrom: '2026-10-01', startDay: 1 }, { effectiveFrom: '2026-10-01', startDay: 25 }] }],
    ['unordered period changes', s => { s.profile![0]!.periodChanges = [{ effectiveFrom: '2026-11-01', startDay: 1 }, { effectiveFrom: '2026-10-01', startDay: 25 }] }],
  ]

  it.each(malformed)('rejects %s and preserves all nine stores', async (_label, mutate) => {
    const db = await openDatabase()
    const backup = await ledgerFixture(db)
    const before = await readStores(db)
    // A valid calendar key keeps unrelated failures from masking each regression.
    backup.stores.monthSweeps![0]!.periodKey = '2026-09'
    mutate(backup.stores)
    await expect(importBackup(db, JSON.stringify(backup))).rejects.toMatchObject({ code: 'ERR_BACKUP_INVALID' })
    expect(await readStores(db)).toEqual(before)
  })

  it('preserves legacy used goals without a canonical transaction link and legitimate negative period corrections', async () => {
    const db = await openDatabase()
    const backup = await ledgerFixture(db)
    backup.stores.monthSweeps![0]!.periodKey = '2026-09'
    backup.stores.transactions!.find(t => t.id === 'salary')!.amount = 1
    backup.stores.transactions!.find(t => t.id === 'goal-use:phone')!.id = 'legacy-goal-expense'
    const detail = (backup.stores.monthSweeps![0]!.perBucketDetail as Record<string, unknown>[])[0]!
    detail.sisa = -100
    await importBackup(db, JSON.stringify(backup))
    expect(await readStores(db)).toEqual(backup.stores)
  })

  it('accepts actual leap day and old custom keys independent of current period setting', async () => {
    const db = await openDatabase()
    const backup = await ledgerFixture(db)
    backup.stores.profile![0]!.periodStartDay = 1
    backup.stores.transactions!.find(t => t.id === 'salary')!.date = '2024-02-29'
    await importBackup(db, JSON.stringify(backup))
    expect(await db.get(STORES.transactions, 'salary')).toMatchObject({ date: '2024-02-29' })
  })

  it('preserves prospective period metadata and a shortened transition key', async () => {
    const db = await openDatabase()
    const backup = await ledgerFixture(db)
    backup.stores.profile![0]!.periodChanges = [{ effectiveFrom: '2026-10-25', startDay: 1 }, { effectiveFrom: '2026-12-01', startDay: 5 }]
    backup.stores.monthSweeps![0]!.periodKey = '2026-09-01'
    await importBackup(db, JSON.stringify(backup))
    const exported = JSON.parse(await exportBackup(db)) as { stores: Stores }
    expect(exported.stores).toEqual(backup.stores)
  })

  it('accepts a corrected goal use after soft deletion restores it to active', async () => {
    const db = await openDatabase()
    const backup = await ledgerFixture(db)
    delete backup.stores.goals![0]!.usedAt
    backup.stores.transactions!.find(t => t.id === 'goal-use:phone')!.deleted = true
    await importBackup(db, JSON.stringify(backup))
    expect(await db.get(STORES.goals, 'phone')).not.toHaveProperty('usedAt')
  })

  it.each(['missing passphrase', 'invalid salt', 'invalid base64', 'damaged ciphertext'])(
    'preserves every store when an encrypted backup has %s', async failure => {
      const db = await openDatabase()
      await ledgerFixture(db)
      const envelope = JSON.parse(await exportBackup(db, 'private backup passphrase')) as Record<string, unknown>
      const before = await readStores(db)
      if (failure === 'invalid salt') envelope.salt = btoa('short')
      if (failure === 'invalid base64') envelope.iv = '%%%'
      if (failure === 'damaged ciphertext') {
        const bytes = atob(envelope.ciphertext as string)
        envelope.ciphertext = btoa(String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1))
      }
      await expect(importBackup(db, JSON.stringify(envelope), failure === 'missing passphrase' ? undefined : 'private backup passphrase')).rejects.toBeInstanceOf(BackupError)
      expect(await readStores(db)).toEqual(before)
    },
  )

  it.each([undefined, 7, '2026-02-30T00:00:00.000Z'])('rejects invalid exportedAt metadata %s before writing', async exportedAt => {
    const db = await openDatabase()
    const envelope: Record<string, unknown> = await ledgerFixture(db)
    const before = await readStores(db)
    envelope.exportedAt = exportedAt
    await expect(importBackup(db, JSON.stringify(envelope))).rejects.toMatchObject({ code: 'ERR_BACKUP_INVALID' })
    expect(await readStores(db)).toEqual(before)
  })

  it('round trips every store through a plain versioned JSON envelope', async () => {
    const db = await openDatabase()
    await db.put(STORES.settings, { key: 'custom', value: { hello: 'world' } })
    const contents = await exportBackup(db)
    await db.put(STORES.settings, { key: 'custom', value: 'changed' })

    await importBackup(db, contents)

    expect(await db.get(STORES.settings, 'custom')).toEqual({ key: 'custom', value: { hello: 'world' } })
    expect(JSON.parse(contents)).toMatchObject({ format: 'monee-backup', version: 1, encrypted: false })
  })

  it('encrypts with a passphrase and rejects a wrong one without changing data', async () => {
    const db = await openDatabase()
    const contents = await exportBackup(db, 'correct horse battery staple')
    const before = await db.getAll(STORES.profile)
    await expect(importBackup(db, contents, 'wrong passphrase')).rejects.toMatchObject({ code: 'ERR_BACKUP_DECRYPT' })
    expect(await db.getAll(STORES.profile)).toEqual(before)
    await importBackup(db, contents, 'correct horse battery staple')
    expect(JSON.parse(contents)).toMatchObject({ encrypted: true, cipher: 'AES-GCM' })
  })

  it.each([
    '{"format":"other","version":1}',
    JSON.stringify({ format: 'monee-backup', version: 999, encrypted: false, stores: {} }),
    JSON.stringify({ format: 'monee-backup', version: 1, encrypted: false, stores: { profile: [{ id: 'x' }] } }),
  ])('rejects malformed backup without modifying any store', async contents => {
    const db = await openDatabase()
    const before = await db.getAll(STORES.categories)
    await expect(importBackup(db, contents)).rejects.toBeInstanceOf(BackupError)
    expect(await db.getAll(STORES.categories)).toEqual(before)
  })

  it('rejects a transaction with a missing category reference before any write', async () => {
    const db = await openDatabase()
    const backup = JSON.parse(await exportBackup(db)) as { stores: Record<string, unknown[]> }
    backup.stores.transactions = [{ id: 'tx', type: 'income', amount: 10, date: '2026-10-25', categoryId: 'missing', createdAt: 1, updatedAt: 1 }]
    const before = await db.getAll(STORES.categories)

    await expect(importBackup(db, JSON.stringify(backup))).rejects.toMatchObject({ code: 'ERR_BACKUP_INVALID' })
    expect(await db.getAll(STORES.categories)).toEqual(before)
    expect(await db.getAll(STORES.transactions)).toEqual([])
  })

  it('rejects allocations that violate the 100% model invariant', async () => {
    const db = await openDatabase()
    const backup = JSON.parse(await exportBackup(db)) as { stores: Record<string, { allocPercent: number }[]> }
    backup.stores.buckets[0]!.allocPercent -= 1
    await expect(importBackup(db, JSON.stringify(backup))).rejects.toMatchObject({ code: 'ERR_BACKUP_INVALID' })
  })
})
