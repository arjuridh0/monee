/**
 * Repository tests -- gunakan fake-indexeddb (in-memory) dengan reset per test
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'  // polyfill IDBRequest, IDBFactory, dll di jsdom
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import {
  profileRepo, bucketRepo, categoryRepo, transactionRepo,
  goalRepo, settingsRepo,
  seedDefaultData, DEFAULT_BUCKETS,
} from '@/core/db/repositories'
import type { Profile, Transaction, Goal } from '@/core/finance/types'

// Fresh fake-indexeddb + reset DB singleton sebelum setiap test
beforeEach(() => {
  // @ts-expect-error -- override global indexedDB dengan instance baru
  globalThis.indexedDB = new IDBFactory()
  resetDbSingleton()
})

const mkProfile = (): Profile => ({
  id: 'profile', name: 'Test User', mascotId: 'mochi',
  periodStartDay: 1, defaultBucketId: 'bucket-needs',
  pinHash: 'abc', pinSalt: 'def', createdAt: Date.now(),
})

const mkTx = (id: string, date: string): Transaction => ({
  id, type: 'expense', amount: 50_000, categoryId: 'cat-makan',
  bucketId: 'bucket-needs', date, createdAt: Date.now(), updatedAt: Date.now(),
})

describe('openDatabase', () => {
  it('bisa membuka database', async () => {
    const db = await openDatabase()
    expect(db).toBeTruthy()
  })
})

describe('profileRepo', () => {
  it('save + get profile', async () => {
    const db = await openDatabase()
    await profileRepo.save(db, mkProfile())
    const got = await profileRepo.get(db)
    expect(got?.name).toBe('Test User')
  })

  it('get saat kosong -> undefined', async () => {
    const db  = await openDatabase()
    const got = await profileRepo.get(db)
    expect(got).toBeUndefined()
  })
})

describe('bucketRepo', () => {
  it('saveAll + getAll', async () => {
    const db = await openDatabase()
    await bucketRepo.saveAll(db, DEFAULT_BUCKETS)
    const all = await bucketRepo.getAll(db)
    expect(all).toHaveLength(DEFAULT_BUCKETS.length)
  })

  it('save + delete', async () => {
    const db = await openDatabase()
    await bucketRepo.saveAll(db, DEFAULT_BUCKETS)
    await bucketRepo.delete(db, 'bucket-needs')
    const all = await bucketRepo.getAll(db)
    expect(all.find(b => b.id === 'bucket-needs')).toBeUndefined()
  })
})

describe('transactionRepo', () => {
  it('save + getAll', async () => {
    const db = await openDatabase()
    await transactionRepo.save(db, mkTx('tx1', '2024-07-15'))
    const all = await transactionRepo.getAll(db)
    expect(all).toHaveLength(1)
  })

  it('save + delete', async () => {
    const db = await openDatabase()
    await transactionRepo.save(db, mkTx('tx2', '2024-07-15'))
    await transactionRepo.delete(db, 'tx2')
    const all = await transactionRepo.getAll(db)
    expect(all).toHaveLength(0)
  })

  it('getByDateRange -- hanya periode Juli', async () => {
    const db = await openDatabase()
    await transactionRepo.save(db, mkTx('tx-jul', '2024-07-15'))
    await transactionRepo.save(db, mkTx('tx-aug', '2024-08-01'))
    const jul = await transactionRepo.getByDateRange(db, '2024-07-01', '2024-07-31')
    expect(jul).toHaveLength(1)
    expect(jul[0]?.id).toBe('tx-jul')
  })
})

describe('goalRepo', () => {
  const mkGoal = (id: string): Goal => ({
    id, name: 'Goal Test', targetAmount: 1_000_000,
    sortOrder: 0, createdAt: Date.now(),
  })

  it('save + getAll', async () => {
    const db = await openDatabase()
    await goalRepo.save(db, mkGoal('g1'))
    const all = await goalRepo.getAll(db)
    expect(all).toHaveLength(1)
  })
})

describe('settingsRepo', () => {
  it('set + get', async () => {
    const db = await openDatabase()
    await settingsRepo.set(db, 'theme', 'mochi')
    const val = await settingsRepo.get<string>(db, 'theme')
    expect(val).toBe('mochi')
  })
})

describe('seedDefaultData', () => {
  it('seed mengisi bucket dan kategori', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    const buckets = await bucketRepo.getAll(db)
    const cats    = await categoryRepo.getAll(db)
    expect(buckets.length).toBeGreaterThan(0)
    expect(cats.length).toBeGreaterThan(0)
  })

  it('5 bucket default, total 100%, tepat satu isSavings', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    const buckets = await bucketRepo.getAll(db)
    expect(buckets).toHaveLength(5)
    expect(buckets.reduce((sum, b) => sum + b.allocPercent, 0)).toBe(100)
    expect(buckets.filter(b => b.isSavings)).toHaveLength(1)
    expect(buckets.find(b => b.isSavings)?.name).toBe('Tabungan')
    expect(buckets.find(b => b.isSavings)?.allowOverbudget).toBe(true)
  })

  it('14 kategori final: 10 expense + 4 income, ikon Lucide', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    const cats = await categoryRepo.getAll(db)
    expect(cats).toHaveLength(14)
    expect(cats.filter(c => c.type === 'expense')).toHaveLength(10)
    expect(cats.filter(c => c.type === 'income')).toHaveLength(4)
    expect(cats.some(c => c.name === 'Tabungan')).toBe(true)
    expect(cats.some(c => c.name === 'Hadiah')).toBe(true)
    expect(cats.every(c => c.icon.length > 0 && c.color.startsWith('#'))).toBe(true)
  })

  it('seed idempotent (tidak duplikat jika dipanggil 2x)', async () => {
    const db = await openDatabase()
    await seedDefaultData(db)
    await seedDefaultData(db)
    const buckets = await bucketRepo.getAll(db)
    expect(buckets).toHaveLength(DEFAULT_BUCKETS.length)
  })
})
