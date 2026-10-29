/**
 * Repositories -- CRUD per-entity + seed data default (dok 08 SS2)
 * ponytail: langsung pakai idb API, no generic wrapper
 */
import type { MoneeDB } from './migrations'
import type {
  Profile, Category, Bucket, Transaction,
  RecurringIncome, Goal, MonthSweep,
} from '@/core/finance/types'
import { STORES } from './schema'
import { getConfiguredPeriod } from '@/core/finance/period-config'
import { assertPeriodOpen } from '@/core/finance/period-lock'

// ---- Profile -------------------------------------------------------

export const profileRepo = {
  get:  (db: MoneeDB) => db.get(STORES.profile, 'profile'),
  save: (db: MoneeDB, p: Profile) => db.put(STORES.profile, p),
}

// ---- Categories ----------------------------------------------------

export const categoryRepo = {
  getAll: (db: MoneeDB) => db.getAll(STORES.categories),
  save:   (db: MoneeDB, c: Category) => db.put(STORES.categories, c),
  delete: (db: MoneeDB, id: string)  => db.delete(STORES.categories, id),
}

// ---- Buckets -------------------------------------------------------

export const bucketRepo = {
  getAll: (db: MoneeDB) => db.getAll(STORES.buckets),
  save:   (db: MoneeDB, b: Bucket)  => db.put(STORES.buckets, b),
  delete: (db: MoneeDB, id: string) => db.delete(STORES.buckets, id),
  saveAll: async (db: MoneeDB, buckets: Bucket[]) => {
    const tx = db.transaction(STORES.buckets, 'readwrite')
    await Promise.all([...buckets.map(b => tx.store.put(b)), tx.done])
  },
}

// ---- Transactions --------------------------------------------------

/**
 * Guard periode terkunci di layer repo (D53).
 * Periode transaksi lama ikut dicek agar edit tidak bisa lolos dari periode tertutup.
 */
async function writeTransaction(db: MoneeDB, id: string, next?: Transaction) {
  const write = db.transaction(['profile', 'transactions', 'monthSweeps'], 'readwrite')
  try {
    const [profile, existing, sweeps] = await Promise.all([
      write.objectStore('profile').get('profile'), write.objectStore('transactions').get(id),
      write.objectStore('monthSweeps').getAll(),
    ])
    for (const entry of [existing, next]) {
      if (entry) assertPeriodOpen(getConfiguredPeriod(entry.date, profile?.periodStartDay ?? 1, profile?.periodChanges).key, sweeps)
    }
    if (next) await write.objectStore('transactions').put(next)
    else await write.objectStore('transactions').delete(id)
    await write.done
  } catch (error) {
    try { write.abort() } catch { /* Already ended. */ }
    await write.done.catch(() => undefined); throw error
  }
}

export const transactionRepo = {
  getAll:  (db: MoneeDB) => db.getAll(STORES.transactions),
  getById: (db: MoneeDB, id: string) => db.get(STORES.transactions, id),
  save: async (db: MoneeDB, t: Transaction) => {
    await writeTransaction(db, t.id, t)
    return t.id
  },
  delete: async (db: MoneeDB, id: string) => {
    await writeTransaction(db, id)
  },
  getByDateRange: (db: MoneeDB, start: string, end: string) =>
    db.getAllFromIndex(STORES.transactions, 'by-date', IDBKeyRange.bound(start, end)),
}

// ---- Recurring -----------------------------------------------------

export const recurringRepo = {
  getAll: (db: MoneeDB) => db.getAll(STORES.recurringIncomes),
  save:   (db: MoneeDB, r: RecurringIncome) => db.put(STORES.recurringIncomes, r),
  delete: (db: MoneeDB, id: string)         => db.delete(STORES.recurringIncomes, id),
}

// ---- Goals ---------------------------------------------------------

export const goalRepo = {
  getAll: (db: MoneeDB) => db.getAll(STORES.goals),
  save:   (db: MoneeDB, g: Goal)    => db.put(STORES.goals, g),
  delete: (db: MoneeDB, id: string) => db.delete(STORES.goals, id),
  saveAll: async (db: MoneeDB, goals: Goal[]) => {
    const tx = db.transaction(STORES.goals, 'readwrite')
    await Promise.all([...goals.map(g => tx.store.put(g)), tx.done])
  },
}

// ---- Month Sweeps --------------------------------------------------

export const sweepRepo = {
  getAll:  (db: MoneeDB) => db.getAll(STORES.monthSweeps),
  save:    (db: MoneeDB, s: MonthSweep) => db.put(STORES.monthSweeps, s),
  getByPeriod: (db: MoneeDB, periodKey: string) =>
    db.getFromIndex(STORES.monthSweeps, 'by-period', periodKey),
}

// ---- Settings ------------------------------------------------------

export const settingsRepo = {
  get: async <T>(db: MoneeDB, key: string): Promise<T | undefined> => {
    const row = await db.get(STORES.settings, key)
    return row?.value as T | undefined
  },
  set: (db: MoneeDB, key: string, value: unknown) =>
    db.put(STORES.settings, { key, value }),
}

// ---- Seed Default Data ---------------------------------------------

export const DEFAULT_BUCKETS: Bucket[] = [
  { id: 'bucket-needs',     name: 'Kebutuhan Pokok', allocPercent: 40, icon: 'home',          color: '#8FB565', sortOrder: 0, allowOverbudget: false, isSavings: false },
  { id: 'bucket-transport', name: 'Pulsa/Transport', allocPercent: 20, icon: 'car',           color: '#FBE3CE', sortOrder: 1, allowOverbudget: false, isSavings: false },
  { id: 'bucket-savings',   name: 'Tabungan',        allocPercent: 25, icon: 'piggy-bank',    color: '#DCEEE0', sortOrder: 2, allowOverbudget: true,  isSavings: true  },
  { id: 'bucket-charity',   name: 'Sedekah',         allocPercent: 10, icon: 'hand-heart',    color: '#F8E9CE', sortOrder: 3, allowOverbudget: false, isSavings: false },
  { id: 'bucket-fun',       name: 'Fun',             allocPercent:  5, icon: 'party-popper',  color: '#E4DFF5', sortOrder: 4, allowOverbudget: false, isSavings: false },
]

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-makan',     name: 'Makan',       icon: 'utensils',        color: '#E6EFDB', type: 'expense', isDefault: true },
  { id: 'cat-minum',     name: 'Minum',       icon: 'coffee',          color: '#F3E3D3', type: 'expense', isDefault: true },
  { id: 'cat-transport', name: 'Transport',   icon: 'car',             color: '#FBE3CE', type: 'expense', isDefault: true },
  { id: 'cat-pulsa',     name: 'Pulsa/Data',  icon: 'smartphone',      color: '#E4DFF5', type: 'expense', isDefault: true },
  { id: 'cat-belanja',   name: 'Belanja',     icon: 'shopping-bag',    color: '#F7DCD6', type: 'expense', isDefault: true },
  { id: 'cat-hiburan',   name: 'Hiburan',     icon: 'party-popper',    color: '#E4DFF5', type: 'expense', isDefault: true },
  { id: 'cat-sedekah',   name: 'Sedekah',     icon: 'hand-heart',      color: '#F8E9CE', type: 'expense', isDefault: true },
  { id: 'cat-tabungan',  name: 'Tabungan',    icon: 'piggy-bank',      color: '#DCEEE0', type: 'expense', isDefault: true },
  { id: 'cat-edukasi',   name: 'Edukasi',     icon: 'graduation-cap',  color: '#DDE9F7', type: 'expense', isDefault: true },
  { id: 'cat-lain-exp',  name: 'Lainnya',     icon: 'shapes',          color: '#ECE6DC', type: 'expense', isDefault: true },
  { id: 'cat-gaji',      name: 'Gaji',        icon: 'briefcase',       color: '#DCEEE0', type: 'income',  isDefault: true },
  { id: 'cat-bonus',     name: 'Bonus',       icon: 'sparkles',        color: '#F8E9CE', type: 'income',  isDefault: true },
  { id: 'cat-freelance', name: 'Freelance',   icon: 'laptop',          color: '#DDE9F7', type: 'income',  isDefault: true },
  { id: 'cat-hadiah',    name: 'Hadiah',      icon: 'gift',            color: '#F3E3D3', type: 'income',  isDefault: true },
]

export async function seedDefaultData(db: MoneeDB): Promise<void> {
  const tx = db.transaction(['buckets', 'categories'], 'readwrite')
  const [buckets, categories] = await Promise.all([tx.objectStore('buckets').count(), tx.objectStore('categories').count()])
  if (!buckets) for (const bucket of DEFAULT_BUCKETS) await tx.objectStore('buckets').put(bucket)
  if (!categories) for (const category of DEFAULT_CATEGORIES) await tx.objectStore('categories').put(category)
  await tx.done
}

// Re-export
export type { Category }
