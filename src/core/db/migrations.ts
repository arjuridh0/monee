/**
 * DB Migrations -- openDB + DBSchema typed (dok 08 SS2)
 * Context7: pakai DBSchema generic untuk full type safety di semua repo.
 * ponytail: 1 fungsi openDatabase, no class
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION, STORE_DEFS, STORES } from './schema'
import type {
  Profile, Category, Bucket, Transaction,
  RecurringIncome, Goal, MonthSweep, LockoutState,
} from '@/core/finance/types'

interface MoneeSchema extends DBSchema {
  profile:          { key: string; value: Profile }
  categories:       { key: string; value: Category; indexes: { 'by-type': string } }
  buckets:          { key: string; value: Bucket;   indexes: { 'by-order': number } }
  transactions:     { key: string; value: Transaction; indexes: { 'by-date': string; 'by-bucket': string; 'by-category': string; 'by-savings-source': string } }
  recurringIncomes: { key: string; value: RecurringIncome }
  goals:            { key: string; value: Goal;     indexes: { 'by-order': number } }
  monthSweeps:      { key: string; value: MonthSweep; indexes: { 'by-period': string } }
  settings:         { key: string; value: { key: string; value: unknown } }
  lockout:          { key: string; value: LockoutState & { key: string } }
}

export type MoneeDB = IDBPDatabase<MoneeSchema>

type LegacyRecord = Record<string, unknown>

/** v1 -> v2: isSweep jadi tipe transaksi, field lifecycle baru. */
function migrateTransaction(old: LegacyRecord): Transaction {
  const next: LegacyRecord = { ...old }

  if (next.isSweep === true) {
    next.type = 'savings_deposit'
  }
  if (next.type === 'emergency_expense') {
    next.type = 'savings_expense'
    next.savingsSource = 'sisa'
    delete next.bucketId
    delete next.categoryId
  }
  delete next.isSweep
  if (typeof next.refundedAmount !== 'number') next.refundedAmount = 0
  if (typeof next.deleted !== 'boolean') next.deleted = false

  return next as unknown as Transaction
}

/** v1 -> v2: buang savedAmount/status, pertahankan usedAt. */
function migrateGoal(old: LegacyRecord): Goal {
  const next: LegacyRecord = { ...old }
  if (next.status === 'used' && typeof next.usedAt !== 'number') {
    next.usedAt = typeof next.createdAt === 'number' ? next.createdAt : Date.now()
  }
  delete next.savedAmount
  delete next.status
  return next as unknown as Goal
}

/** v1 -> v2: amountSisa jadi sumber nominal sweep baru. */
function migrateSweep(old: LegacyRecord): MonthSweep {
  const next: LegacyRecord = { ...old }
  if (typeof next.amount !== 'number') {
    next.amount = typeof next.amountSisa === 'number' ? next.amountSisa : 0
  }
  if (!Array.isArray(next.perBucketDetail)) next.perBucketDetail = []
  delete next.amountSisa
  delete next.amountAllocation
  return next as unknown as MonthSweep
}

/** v1 -> v2: lengkapi flag bucket; hanya satu bucket Tabungan. */
function migrateBucket(old: LegacyRecord, allowSavings: boolean): Bucket {
  const next: LegacyRecord = { ...old }
  const alreadySavings = next.isSavings === true
  const nameMatch = typeof next.name === 'string'
    && next.name.toLowerCase().includes('tabungan')
  const isSavings = alreadySavings || (allowSavings && nameMatch)
  next.isSavings = isSavings
  if (typeof next.allowOverbudget !== 'boolean') next.allowOverbudget = isSavings
  return next as unknown as Bucket
}

let _db: MoneeDB | null = null
let _opening: Promise<MoneeDB> | null = null

/** Buka (atau buat) IndexedDB, jalankan migrasi jika versi baru */
export async function openDatabase(): Promise<MoneeDB> {
  if (_db) return _db
  if (_opening) return _opening
  _opening = openAndCleanDatabase()
  try { return await _opening }
  finally { _opening = null }
}

async function openAndCleanDatabase(): Promise<MoneeDB> {
  const db = await openDB<MoneeSchema>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        for (const def of STORE_DEFS) {
          if (!db.objectStoreNames.contains(def.name as never)) {
            const store = db.createObjectStore(def.name as never, { keyPath: def.keyPath })
            for (const idx of def.indexes) {
              store.createIndex(idx.name as never, idx.keyPath as never, { unique: idx.unique })
            }
          }
        }
        return
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORES.lockout as never)) {
          db.createObjectStore(STORES.lockout as never, { keyPath: 'key' })
        }

        const txStore = tx.objectStore(STORES.transactions)
        if (!txStore.indexNames.contains('by-savings-source')) {
          txStore.createIndex('by-savings-source', 'savingsSource')
        }

        const goalStore = tx.objectStore(STORES.goals)
        if (goalStore.indexNames.contains('by-status' as never)) {
          goalStore.deleteIndex('by-status' as never)
        }

        let cursor = await txStore.openCursor()
        while (cursor) {
          await cursor.update(migrateTransaction(cursor.value as unknown as LegacyRecord))
          cursor = await cursor.continue()
        }

        let goalCursor = await goalStore.openCursor()
        while (goalCursor) {
          await goalCursor.update(migrateGoal(goalCursor.value as unknown as LegacyRecord))
          goalCursor = await goalCursor.continue()
        }

        let sweepCursor = await tx.objectStore(STORES.monthSweeps).openCursor()
        while (sweepCursor) {
          await sweepCursor.update(migrateSweep(sweepCursor.value as unknown as LegacyRecord))
          sweepCursor = await sweepCursor.continue()
        }

        const bucketStore = tx.objectStore(STORES.buckets)
        let savingsSeen = false
        let bucketCursor = await bucketStore.openCursor()
        while (bucketCursor) {
          const next = migrateBucket(
            bucketCursor.value as unknown as LegacyRecord,
            !savingsSeen,
          )
          if (next.isSavings) savingsSeen = true
          await bucketCursor.update(next)
          bucketCursor = await bucketCursor.continue()
        }
      }
    },
    blocked() {
      console.warn('[monee] DB blocked -- tab lain masih pakai versi lama')
    },
    blocking() {
      _db?.close()
      _db = null
    },
  })

  try {
    await db.delete(STORES.settings, 'groq-voice-credential')
    _db = db
    return db
  } catch (cause) { db.close(); throw cause }
}

/** Reset singleton (untuk testing dengan fake-indexeddb) */
export function resetDbSingleton(): void {
  _db = null
  _opening = null
}
