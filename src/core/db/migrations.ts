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
let activeAccountId: string | undefined
let accountGeneration = 0

/** Select the isolated local database associated with the authenticated account. */
export function setActiveAccountId(accountId: string | undefined): void {
  if (accountId !== undefined && !/^acct_[a-f0-9]{64}$/.test(accountId)) throw new Error('ID akun tidak valid.')
  if (activeAccountId === accountId) return
  accountGeneration += 1
  _db?.close()
  _db = null
  _opening = null
  activeAccountId = accountId
}

export interface LegacyDataPreview {
  profileName: string | null
  buckets: number
  categories: number
  transactions: number
  recurringIncomes: number
  goals: number
  monthSweeps: number
}

async function inspectLegacyDatabase(): Promise<{ db: MoneeDB; preview: LegacyDataPreview }> {
  const db = await openAndCleanDatabase(DB_NAME, false)
  const [profile, buckets, categories, transactions, recurringIncomes, goals, monthSweeps] = await Promise.all([
    db.get('profile', 'profile'), db.getAll('buckets'), db.getAll('categories'), db.getAll('transactions'),
    db.getAll('recurringIncomes'), db.getAll('goals'), db.getAll('monthSweeps'),
  ])
  return { db, preview: { profileName: profile?.name ?? null, buckets: buckets.length, categories: categories.length,
    transactions: transactions.length, recurringIncomes: recurringIncomes.length, goals: goals.length, monthSweeps: monthSweeps.length } }
}

/** Return a count preview; this never copies or removes local data. */
export async function inspectLegacyData(): Promise<LegacyDataPreview> {
  const { db, preview } = await inspectLegacyDatabase()
  db.close()
  return preview
}

/** Copy the original browser ledger into the selected account DB after the user confirms. */
export async function importLegacyData(options: { replaceConfirmed?: boolean } = {}): Promise<LegacyDataPreview> {
  if (!activeAccountId) throw new Error('Masuk ke akun sebelum memindahkan data.')
  const { db: legacy, preview } = await inspectLegacyDatabase()
  try {
    if (!preview.profileName) return preview
    const target = await openDatabase()
    const stores = Object.values(STORES).filter(store => !options.replaceConfirmed || (store !== 'settings' && store !== 'lockout'))
    const counts = await Promise.all(stores.map(store => target.count(store)))
    if (counts.some(Boolean) && !options.replaceConfirmed) throw new Error('Data akun sudah tersedia di perangkat ini.')
    const legacyRecords = await Promise.all(stores.map(store => legacy.getAll(store)))
    const tx = target.transaction(stores, 'readwrite')
    try {
      const currentProfile = await tx.objectStore('profile').get('profile')
      for (let index = 0; index < stores.length; index += 1) {
        const store = tx.objectStore(stores[index]!)
        if (options.replaceConfirmed) await store.clear()
        for (const record of legacyRecords[index]!) {
          const next = options.replaceConfirmed && stores[index] === 'profile'
            ? { ...record, pinHash: currentProfile?.pinHash ?? '', pinSalt: currentProfile?.pinSalt ?? '' } : record
          await store.put(next as never)
        }
      }
      await tx.done
    } catch (error) {
      try { tx.abort() } catch { /* Already aborted or complete. */ }
      await tx.done.catch(() => undefined)
      throw error
    }
    return preview
  } finally { legacy.close() }
}

/** Buka (atau buat) IndexedDB, jalankan migrasi jika versi baru */
export async function openDatabase(): Promise<MoneeDB> {
  if (_db) return _db
  if (_opening) return _opening
  const databaseName = activeAccountId ? `${DB_NAME}-${activeAccountId}` : DB_NAME
  const generation = accountGeneration
  const opening = openAndCleanDatabase(databaseName).then(db => {
    if (generation !== accountGeneration) {
      db.close()
      if (_db === db) _db = null
      throw new Error('Akun berubah saat penyimpanan dibuka. Coba lagi.')
    }
    _db = db
    return db
  })
  _opening = opening
  try { return await opening }
  finally { if (_opening === opening) _opening = null }
}

async function openAndCleanDatabase(databaseName: string, cache = true): Promise<MoneeDB> {
  const db = await openDB<MoneeSchema>(databaseName, DB_VERSION, {
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
      if (cache) { _db?.close(); _db = null }
    },
  })

  try {
    await db.delete(STORES.settings, 'groq-voice-credential')
    return db
  } catch (cause) { db.close(); throw cause }
}

/** Reset singleton (untuk testing dengan fake-indexeddb) */
export function resetDbSingleton(): void {
  accountGeneration += 1
  _db?.close()
  _db = null
  _opening = null
  activeAccountId = undefined
}
