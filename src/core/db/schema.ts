/**
 * DB Schema - IndexedDB v2 stores + indexes (dok 08 §2)
 * ponytail: hanya konstanta + type, tidak ada logic
 */

export const DB_NAME    = 'monee-db'
export const DB_VERSION = 2

/** Nama semua object store */
export const STORES = {
  profile:         'profile',
  categories:      'categories',
  buckets:         'buckets',
  transactions:    'transactions',
  recurringIncomes: 'recurringIncomes',
  goals:           'goals',
  monthSweeps:     'monthSweeps',
  settings:        'settings',
  lockout:         'lockout',
} as const

export type StoreName = typeof STORES[keyof typeof STORES]

/**
 * Definisi store: { keyPath, indexes }
 * indexes: [{ name, keyPath, unique }]
 */
export const STORE_DEFS = [
  {
    name: STORES.profile,
    keyPath: 'id',
    indexes: [],
  },
  {
    name: STORES.categories,
    keyPath: 'id',
    indexes: [
      { name: 'by-type',  keyPath: 'type',      unique: false },
    ],
  },
  {
    name: STORES.buckets,
    keyPath: 'id',
    indexes: [
      { name: 'by-order', keyPath: 'sortOrder', unique: false },
    ],
  },
  {
    name: STORES.transactions,
    keyPath: 'id',
    indexes: [
      { name: 'by-date',     keyPath: 'date',      unique: false },
      { name: 'by-bucket',   keyPath: 'bucketId',  unique: false },
      { name: 'by-category', keyPath: 'categoryId',unique: false },
      { name: 'by-savings-source', keyPath: 'savingsSource', unique: false },
    ],
  },
  {
    name: STORES.recurringIncomes,
    keyPath: 'id',
    indexes: [],
  },
  {
    name: STORES.goals,
    keyPath: 'id',
    indexes: [
      { name: 'by-order',  keyPath: 'sortOrder', unique: false },
    ],
  },
  {
    name: STORES.monthSweeps,
    keyPath: 'id',
    indexes: [
      { name: 'by-period', keyPath: 'periodKey', unique: true },
    ],
  },
  {
    name: STORES.settings,
    keyPath: 'key',
    indexes: [],
  },
  {
    name: STORES.lockout,
    keyPath: 'key',
    indexes: [],
  },
] as const
