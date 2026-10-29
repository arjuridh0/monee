/**
 * Monee - Finance Domain Types
 * dok 08: semua entitas, immutable & serializable (IndexedDB-friendly)
 * ponytail: hanya type/interface, no class, no methods
 */

// --- Primitives -----------------------------------------------
/** Nominal dalam rupiah (integer, tidak pernah float) */
export type Rupiah = number

/** ISO date string YYYY-MM-DD - tanggal WIB */
export type DateStr = string

/** Unix ms timestamp */
export type Timestamp = number

/** Unique ID: crypto.randomUUID() */
export type Id = string

// --- Enums ----------------------------------------------------
export type TxType = 'income' | 'expense' | 'savings_deposit' | 'savings_expense'
export type SavingsSource = 'sisa' | 'allocation'
export type MascotId = 'mochi' | 'luna' | 'bumi'

// --- Profile --------------------------------------------------
export interface Profile {
  id: Id
  name: string
  mascotId: MascotId
  /** Hari reset periode (1-28, default 1) */
  periodStartDay: number
  /** Prospective changes; the initial day continues to describe older history. */
  periodChanges?: { effectiveFrom: DateStr; startDay: number }[]
  /** ID bucket default untuk pengeluaran uncategorized */
  defaultBucketId: Id
  pinHash: string   // SHA-256(pin + salt) hex
  pinSalt: string   // hex random 16 bytes
  createdAt: Timestamp
  currency?: { code: 'IDR'; format: string }
}

// --- Category -------------------------------------------------
export interface Category {
  id: Id
  name: string
  icon: string      // nama ikon Lucide
  color: string     // hex tile
  type: 'expense' | 'income'
  isDefault: boolean
}

// --- Bucket (Allocation slot) ---------------------------------
export interface Bucket {
  id: Id
  name: string
  /** Persentase dari total income periode (0-100) */
  allocPercent: number
  icon: string
  color: string
  sortOrder: number
  /** true = boleh melewati jatah. Default false; Tabungan default true. */
  allowOverbudget: boolean
  /** Tepat satu bucket bernilai true. Tujuan savings_deposit otomatis. */
  isSavings: boolean
}

// --- Transaction ----------------------------------------------
export interface Transaction {
  id: Id
  type: TxType
  amount: Rupiah        // selalu positif
  date: DateStr
  note?: string
  /** Wajib income/expense; savings_deposit = Tabungan; savings_expense tidak */
  categoryId?: Id
  /** Wajib expense; savings_deposit = bucket Tabungan otomatis */
  bucketId?: Id
  /** Wajib savings_expense */
  savingsSource?: SavingsSource
  /** Default 0. Hanya dipakai expense. */
  refundedAmount?: Rupiah
  /** Soft delete. Default false. */
  deleted?: boolean
  /** Kalau dibuat dari template recurring income */
  recurringId?: Id
  createdAt: Timestamp
  updatedAt: Timestamp
}

// --- Recurring Income -----------------------------------------
/** Template. Tidak pernah membuat transaksi otomatis (D51). */
export interface RecurringIncome {
  id: Id
  name: string
  amount: Rupiah
  /** Tanggal dalam bulan (1-28) */
  dayOfMonth: number
  categoryId: Id
  isActive: boolean
  createdAt: Timestamp
}

// --- Goal (Wishlist) ------------------------------------------
/**
 * Progress & status selalu derived (dok 08 §5).
 * Satu-satunya status tersimpan: usedAt.
 */
export interface Goal {
  id: Id
  name: string
  targetAmount: Rupiah
  sortOrder: number
  icon?: string
  usedAt?: Timestamp
  createdAt: Timestamp
}

export type GoalStatus = 'active' | 'fulfilled' | 'used'

export interface GoalProgress {
  goal: Goal
  /** Nominal yang dialokasikan dari pool Allocation saat ini */
  allocated: Rupiah
  progressPct: number
  status: GoalStatus
}

// --- Month Sweep ----------------------------------------------
export interface SweepBucketDetail {
  bucketId: Id
  jatah: Rupiah
  terpakai: Rupiah
  sisa: Rupiah
}

/** Record sweep akhir periode. Satu periodKey hanya boleh satu record. */
export interface MonthSweep {
  id: Id
  /** key periode yang di-sweep */
  periodKey: string
  /** Nominal yang disapu = saldo akhir periode */
  amount: Rupiah
  /** Audit rincian per bucket, bukan sumber nominal */
  perBucketDetail: SweepBucketDetail[]
  sweptAt: Timestamp
}

// --- Lockout --------------------------------------------------
export interface LockoutState {
  attempts: number
  lockedUntil: Timestamp
}

// --- Derived / Computed (tidak disimpan di DB) ----------------
export interface PeriodBounds {
  start: DateStr
  end: DateStr
  key: string
}

export interface BucketProgress {
  bucket: Bucket
  /** Jatah nominal periode ini (rupiah) */
  budgetAmount: Rupiah
  /** Terpakai = expense net refund; bucket Tabungan = setoran */
  spentAmount: Rupiah
  /** sisa = budgetAmount - spentAmount; bisa negatif */
  remaining: Rupiah
  /** 0-100+; jatah 0 -> 0 */
  progressPct: number
}

export interface BalanceState {
  totalIncome: Rupiah
  totalExpense: Rupiah
  totalSavingsDeposit: Rupiah
  /** = income - expense(net) - deposit */
  balance: Rupiah
}

export interface SavingsBalances {
  /** Saldo kompartemen Sisa (sweep - pengeluaran source sisa) */
  sisaBalance: Rupiah
  /** Saldo kompartemen Allocation (setoran - pengeluaran source allocation) */
  allocationBalance: Rupiah
  totalSavings: Rupiah
}

export interface SavingsState extends SavingsBalances {
  goals: GoalProgress[]
}
