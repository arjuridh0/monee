/**
 * Migrasi v1 -> v2 -- dok 08 §2, D46-D49
 * Data lama: isSweep, emergency_expense, savedAmount/status, amountSisa/amountAllocation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDB, type DBSchema } from 'idb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { DB_NAME, STORES } from '@/core/db/schema'
import type { Transaction, Goal, MonthSweep, Bucket } from '@/core/finance/types'

type Legacy = Record<string, unknown>

interface LegacySchema extends DBSchema {
  profile:          { key: string; value: Legacy }
  categories:       { key: string; value: Legacy }
  buckets:          { key: string; value: Legacy; indexes: { 'by-order': number } }
  transactions:     { key: string; value: Legacy; indexes: { 'by-date': string; 'by-bucket': string; 'by-category': string } }
  recurringIncomes: { key: string; value: Legacy }
  goals:            { key: string; value: Legacy; indexes: { 'by-order': number; 'by-status': string } }
  monthSweeps:      { key: string; value: Legacy; indexes: { 'by-period': string } }
  settings:         { key: string; value: Legacy }
}

async function seedV1(): Promise<void> {
  const db = await openDB<LegacySchema>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('profile', { keyPath: 'id' })
      d.createObjectStore('categories', { keyPath: 'id' }).createIndex('by-type', 'type')
      d.createObjectStore('buckets', { keyPath: 'id' }).createIndex('by-order', 'sortOrder')
      const tx = d.createObjectStore('transactions', { keyPath: 'id' })
      tx.createIndex('by-date', 'date')
      tx.createIndex('by-bucket', 'bucketId')
      tx.createIndex('by-category', 'categoryId')
      d.createObjectStore('recurringIncomes', { keyPath: 'id' })
      const goals = d.createObjectStore('goals', { keyPath: 'id' })
      goals.createIndex('by-order', 'sortOrder')
      goals.createIndex('by-status', 'status')
      d.createObjectStore('monthSweeps', { keyPath: 'id' }).createIndex('by-period', 'periodKey', { unique: true })
      d.createObjectStore('settings', { keyPath: 'key' })
    },
  })

  await db.put('transactions', {
    id: 'tx-income', type: 'income', amount: 1_000, date: '2026-09-05',
    categoryId: 'cat-gaji', isSweep: false, createdAt: 1, updatedAt: 1,
  })
  await db.put('transactions', {
    id: 'tx-sweep-income', type: 'income', amount: 500, date: '2026-08-31',
    categoryId: 'cat-lain', isSweep: true, createdAt: 2, updatedAt: 2,
  })
  await db.put('transactions', {
    id: 'tx-emergency', type: 'emergency_expense', amount: 300, date: '2026-09-06',
    categoryId: 'cat-darurat', bucketId: 'bucket-needs', createdAt: 3, updatedAt: 3,
  })
  await db.put('goals', {
    id: 'goal-fulfilled', name: 'Laptop', targetAmount: 10_000_000,
    savedAmount: 2_500_000, status: 'fulfilled', sortOrder: 0, createdAt: 4,
  })
  await db.put('goals', {
    id: 'goal-used', name: 'HP', targetAmount: 3_000_000,
    savedAmount: 3_000_000, status: 'used', sortOrder: 1, createdAt: 5,
  })
  await db.put('monthSweeps', {
    id: 'sweep-2026-08', periodKey: '2026-08',
    amountSisa: 12_000, amountAllocation: 3_000, sweptAt: 6,
  })
  await db.put('buckets', {
    id: 'bucket-needs', name: 'Kebutuhan', allocPercent: 60, icon: 'home',
    color: '#111111', sortOrder: 0,
  })
  await db.put('buckets', {
    id: 'bucket-savings', name: 'Tabungan', allocPercent: 40, icon: 'piggy-bank',
    color: '#222222', sortOrder: 1,
  })

  db.close()
}

describe('migrasi v1 -> v2', () => {
  beforeEach(() => {
    // @ts-expect-error -- override global indexedDB dengan instance baru
    globalThis.indexedDB = new IDBFactory()
    resetDbSingleton()
  })

  it('membuat store lockout dan index baru tanpa menghapus transaksi', async () => {
    await seedV1()
    const db = await openDatabase()

    expect(db.version).toBe(2)
    expect(db.objectStoreNames.contains(STORES.lockout)).toBe(true)
    expect(db.transaction(STORES.transactions).store.indexNames.contains('by-savings-source')).toBe(true)
    expect(db.transaction(STORES.goals).store.indexNames.contains('by-status')).toBe(false)

    const txs = await db.getAll(STORES.transactions)
    expect(txs).toHaveLength(3)
  })

  it('mengubah isSweep menjadi savings_deposit dan emergency_expense menjadi savings_expense', async () => {
    await seedV1()
    const db = await openDatabase()
    const txs = await db.getAll(STORES.transactions) as unknown as Array<Transaction & Legacy>
    const plain = txs.find(t => t.id === 'tx-income')
    const sweep = txs.find(t => t.id === 'tx-sweep-income')
    const emergency = txs.find(t => t.id === 'tx-emergency')

    expect(plain?.type).toBe('income')
    expect(plain?.refundedAmount).toBe(0)
    expect(plain?.deleted).toBe(false)
    expect(sweep?.type).toBe('savings_deposit')
    expect(sweep?.isSweep).toBeUndefined()
    expect(emergency?.type).toBe('savings_expense')
    expect(emergency?.savingsSource).toBe('sisa')
    expect(emergency?.bucketId).toBeUndefined()
    expect(emergency?.categoryId).toBeUndefined()
  })

  it('membuang savedAmount/status goal dan mengisi usedAt untuk goal used', async () => {
    await seedV1()
    const db = await openDatabase()
    const goals = await db.getAll(STORES.goals) as unknown as Array<Goal & Legacy>
    const fulfilled = goals.find(g => g.id === 'goal-fulfilled')
    const used = goals.find(g => g.id === 'goal-used')

    expect(fulfilled?.savedAmount).toBeUndefined()
    expect(fulfilled?.status).toBeUndefined()
    expect(fulfilled?.usedAt).toBeUndefined()
    expect(used?.status).toBeUndefined()
    expect(used?.usedAt).toBe(5)
  })

  it('memetakan amountSisa ke amount sweep', async () => {
    await seedV1()
    const db = await openDatabase()
    const sweeps = await db.getAll(STORES.monthSweeps) as unknown as Array<MonthSweep & Legacy>
    expect(sweeps[0]?.amount).toBe(12_000)
    expect(sweeps[0]?.perBucketDetail).toEqual([])
    expect(sweeps[0]?.amountSisa).toBeUndefined()
    expect(sweeps[0]?.amountAllocation).toBeUndefined()
  })

  it('melengkapi flag bucket lama: Tabungan allowOverbudget + isSavings', async () => {
    await seedV1()
    const db = await openDatabase()
    const buckets = await db.getAll(STORES.buckets) as unknown as Bucket[]
    const needs = buckets.find(b => b.id === 'bucket-needs')
    const savings = buckets.find(b => b.id === 'bucket-savings')

    expect(needs?.isSavings).toBe(false)
    expect(needs?.allowOverbudget).toBe(false)
    expect(savings?.isSavings).toBe(true)
    expect(savings?.allowOverbudget).toBe(true)
  })
})

describe('legacy voice credential removal', () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory(); resetDbSingleton() })
  it('removes stored provider credentials before concurrent callers receive an existing database', async () => {
    const old = await openDatabase()
    await old.put(STORES.settings, { key: 'groq-voice-credential', value: { apiKey: 'gsk_legacy', consent: true } })
    await old.put(STORES.settings, { key: 'preferences', value: { keep: true } })
    old.close(); resetDbSingleton()
    const connections = await Promise.all([openDatabase(), openDatabase(), openDatabase()])
    expect(connections[1]).toBe(connections[0])
    for (const db of connections) {
      expect(await db.get(STORES.settings, 'groq-voice-credential')).toBeUndefined()
      expect(await db.get(STORES.settings, 'preferences')).toEqual({ key: 'preferences', value: { keep: true } })
    }
  })
})
