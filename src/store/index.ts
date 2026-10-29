/**
 * Zustand Store -- data mentah + derived snapshot via finance engine
 * Zustand v5: create() tidak berubah API nya, tapi require named exports
 * ponytail: 1 store, load sekali, semua actions di sini
 */
import { create } from 'zustand'
import type {
  Profile, Bucket, Category, Transaction,
  RecurringIncome, Goal, MonthSweep,
} from '@/core/finance/types'
import { computeSnapshot, type FinanceSnapshot } from '@/core/finance/selectors'
import { getToday } from '@/core/finance/period'
import { openDatabase } from '@/core/db/migrations'
import { seedDefaultData } from '@/core/db/repositories'
import { persistTransaction } from '@/features/transactions/persistence'
import { persistReceiptExpenses } from '@/features/ocr/persistence'
import { savePreferences, type ProfilePreferences } from '@/features/settings/profile-persistence'
import { saveBucketConfiguration } from '@/features/settings/bucket-persistence'
import { savePeriodStartDay } from '@/features/settings/period-persistence'
import { notifyDataChanged } from '@/core/db/changes'
import { runLazyEffects } from './lazy-effects'
import { completeOnboarding, type CompleteOnboardingInput } from '@/features/onboarding/persistence'
import { recordSavingsExpense, recordSavingsDeposit, type SavingsExpenseInput, type SavingsDepositInput } from '@/features/savings/persistence'
import { reorderGoals, commitGoalUse, saveActiveGoal, deleteActiveGoal } from '@/features/savings/goal-persistence'
import { changePin as persistPinChange } from '@/features/security/change-pin'
import { deleteCategory as persistDeleteCategory, saveCategory as persistCategory } from '@/features/settings/category-persistence'
import { saveAllocation as persistAllocation, type SaveAllocationInput } from '@/features/settings/allocation-persistence'
import { deleteRecurringIncome as persistDeleteRecurringIncome, saveRecurringIncome as persistRecurringIncome } from '@/features/settings/recurring-persistence'
import { deleteAllData as persistDeleteAllData } from '@/features/settings/delete-all'
import { announceMascotError, announceMascotTransaction, announceMilestone } from '@/features/mascot/mascot-events'

// ---- State shape ------------------------------------------------

interface MoneeState {
  // Raw data (from DB)
  profile:         Profile | null
  buckets:         Bucket[]
  categories:      Category[]
  transactions:    Transaction[]
  recurringIncomes: RecurringIncome[]
  goals:           Goal[]
  sweeps:          MonthSweep[]

  // Derived (recomputed on every data change)
  snapshot:        FinanceSnapshot | null

  // App state
  isLoaded:        boolean
  isLocked:        boolean

  // Actions
  load:            () => Promise<void>
  setLocked:       (locked: boolean) => void
  saveProfile:     (p: Profile) => Promise<void>
  changePin:       (currentPin: string, newPin: string) => Promise<void>
  finishOnboarding: (input: CompleteOnboardingInput) => Promise<void>
  addTransaction:  (t: Transaction) => Promise<void>
  saveReceiptExpenses: (items: Transaction[]) => Promise<void>
  updateTransaction: (t: Transaction, expected?: Transaction) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  saveBuckets:     (buckets: Bucket[], expected?: Bucket[]) => Promise<void>
  setPeriodStartDay: (day: number, expected: Profile) => Promise<void>
  saveAllocation:  (input: SaveAllocationInput) => Promise<void>
  saveCategory: (category: Category, expected?: Category) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  saveRecurringIncome: (recurring: RecurringIncome, expected?: RecurringIncome) => Promise<void>
  deleteRecurringIncome: (id: string) => Promise<void>
  deleteAllData: (pin: string, expectedPinHash: string) => Promise<void>
  saveGoal:        (g: Goal) => Promise<void>
  deleteGoal:      (id: string) => Promise<void>
  recordSavingsExpense: (input: SavingsExpenseInput) => Promise<void>
  recordSavingsDeposit: (input: SavingsDepositInput) => Promise<void>
  reorderGoals: (ids: string[]) => Promise<void>
  useGoal: (id: string, expectedTarget: number) => Promise<void>
}

// ---- Helpers ----------------------------------------------------

function deriveSnapshot(state: { profile: Profile | null; buckets: Bucket[]; transactions: Transaction[]; sweeps: MonthSweep[]; goals: Goal[]; recurringIncomes: RecurringIncome[] }): FinanceSnapshot | null {
  const { profile, buckets, transactions, sweeps, goals, recurringIncomes } = state
  if (!profile) return null
  return computeSnapshot({
    transactions,
    buckets,
    sweeps,
    goals,
    recurringIncomes,
    today: getToday(),
    periodStartDay: profile.periodStartDay,
    periodChanges: profile.periodChanges,
  })
}

// ---- Store -------------------------------------------------------

let loadInFlight: Promise<void> | null = null
let requestedLoad = 0

export const useMoneeStore = create<MoneeState>()((set, get) => ({
  profile:          null,
  buckets:          [],
  categories:       [],
  transactions:     [],
  recurringIncomes: [],
  goals:            [],
  sweeps:           [],
  snapshot:         null,
  isLoaded:         false,
  isLocked:         true,

  setLocked: (locked) => set({ isLocked: locked }),

  load: async () => {
    requestedLoad++
    if (loadInFlight) return loadInFlight
    loadInFlight = (async () => {
      let revision: number
      do {
      revision = requestedLoad
      const db = await openDatabase()
      await seedDefaultData(db)
      await runLazyEffects(db)
      const read = db.transaction(['profile', 'buckets', 'categories', 'transactions', 'recurringIncomes', 'goals', 'monthSweeps'], 'readonly')
      const [profile, buckets, categories, transactions, recurringIncomes, goals, sweeps] =
        await Promise.all([
          read.objectStore('profile').get('profile'), read.objectStore('buckets').getAll(),
          read.objectStore('categories').getAll(), read.objectStore('transactions').getAll(),
          read.objectStore('recurringIncomes').getAll(), read.objectStore('goals').getAll(), read.objectStore('monthSweeps').getAll(),
        ])
      await read.done
      const nextState = {
        profile: profile ?? null,
        buckets,
        categories,
        transactions,
        recurringIncomes,
        goals,
        sweeps,
        isLoaded: true,
      }

      set(previous => ({ ...nextState, snapshot: deriveSnapshot(nextState),
        isLocked: previous.isLocked || Boolean(profile && !previous.profile) || Boolean(previous.profile && (!profile
          || previous.profile.pinHash !== profile.pinHash || previous.profile.pinSalt !== profile.pinSalt)) }))
      } while (revision !== requestedLoad)
    })()
    try { await loadInFlight }
    finally { loadInFlight = null }
  },

  finishOnboarding: async (input) => {
    let backgrounded = document.visibilityState === 'hidden'
    const onVisibility = () => { if (document.visibilityState === 'hidden') backgrounded = true }
    const onPageHide = () => { backgrounded = true }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    try {
      const result = await completeOnboarding(await openDatabase(), input)
      // Only the tab that created the profile may enter directly; stale wizards use PinGate.
      await get().load()
      set({ isLocked: !result.created || backgrounded })
      notifyDataChanged()
    } finally {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  },

  saveProfile: async (p) => {
    const expected = get().profile
    if (!expected) throw new Error('ERR_PROFILE_MISSING — Profil belum tersedia.')
    const changes: Partial<ProfilePreferences> = {}
    if (p.name !== expected.name) changes.name = p.name
    if (p.mascotId !== expected.mascotId) changes.mascotId = p.mascotId
    if (JSON.stringify(p.currency) !== JSON.stringify(expected.currency) && p.currency) changes.currency = p.currency
    const db = await openDatabase()
    await savePreferences(db, changes, expected)
    await get().load(); notifyDataChanged()
  },

  changePin: async (currentPin, newPin) => {
    const profile = get().profile
    if (!profile) throw new Error('Profil belum tersedia. Muat ulang Monee.')
    const updated = await persistPinChange(await openDatabase(), {
      currentPin, newPin, expectedPinHash: profile.pinHash,
    })
    set({ profile: updated })
    await get().load(); notifyDataChanged()
  },

  addTransaction: async (t) => {
    const before = get().snapshot
    const db = await openDatabase()
    await runLazyEffects(db)
    try {
      await persistTransaction(db, t)
    } catch (error) {
      announceMascotError(error)
      throw error
    }
    await get().load(); notifyDataChanged()
    announceMascotTransaction(t, get().snapshot)
    announceMilestone(before, get().snapshot)
  },

  saveReceiptExpenses: async (items) => {
    const before = get().snapshot
    const db = await openDatabase()
    await runLazyEffects(db)
    let changed: boolean
    try { changed = await persistReceiptExpenses(db, items) }
    catch (error) { announceMascotError(error); throw error }
    await get().load(); notifyDataChanged()
    if (changed) {
      for (const item of items) announceMascotTransaction(item, get().snapshot)
      announceMilestone(before, get().snapshot)
    }
  },

  updateTransaction: async (t, expected) => {
    const before = get().snapshot
    const db = await openDatabase()
    await runLazyEffects(db)
    try {
      await persistTransaction(db, t, expected ?? get().transactions.find(item => item.id === t.id))
    } catch (error) {
      announceMascotError(error)
      throw error
    }
    await get().load(); notifyDataChanged()
    announceMascotTransaction(t, get().snapshot)
    announceMilestone(before, get().snapshot)
  },

  deleteTransaction: async (id) => {
    const current = get().transactions.find(item => item.id === id)
    if (!current) throw new Error('ERR_TRANSACTION_STALE — Transaksi sudah berubah. Buka ulang riwayat.')
    await get().updateTransaction({ ...current, deleted: true, updatedAt: Date.now() }, current)
  },

  saveBuckets: async (buckets, expected) => {
    const db = await openDatabase()
    await saveBucketConfiguration(db, buckets, expected ?? get().buckets)
    await get().load(); notifyDataChanged()
  },

  setPeriodStartDay: async (day, expected) => {
    await savePeriodStartDay(await openDatabase(), day, expected)
    await get().load(); notifyDataChanged()
  },

  saveAllocation: async (input) => {
    await persistAllocation(await openDatabase(), input)
    await get().load(); notifyDataChanged()
  },

  saveCategory: async (category, expected) => {
    await persistCategory(await openDatabase(), category, expected)
    await get().load(); notifyDataChanged()
  },

  deleteCategory: async (id) => {
    await persistDeleteCategory(await openDatabase(), id)
    await get().load(); notifyDataChanged()
  },

  saveRecurringIncome: async (recurring, expected) => {
    const db = await openDatabase()
    await persistRecurringIncome(db, recurring, expected)
    await get().load(); notifyDataChanged()
  },

  deleteRecurringIncome: async (id) => {
    const db = await openDatabase()
    await persistDeleteRecurringIncome(db, id)
    await get().load(); notifyDataChanged()
  },

  deleteAllData: async (pin, expectedPinHash) => {
    await persistDeleteAllData(await openDatabase(), { pin, expectedPinHash })
    set({
      profile: null, buckets: [], categories: [], transactions: [], recurringIncomes: [],
      goals: [], sweeps: [], snapshot: null, isLoaded: true, isLocked: false,
    })
    notifyDataChanged()
  },

  saveGoal: async (g) => {
    const db = await openDatabase()
    await saveActiveGoal(db, g)
    await get().load(); notifyDataChanged()
  },

  recordSavingsExpense: async (input) => {
    const before = get().snapshot
    const db = await openDatabase(); await runLazyEffects(db)
    let saved: Transaction
    try {
      saved = await recordSavingsExpense(db, input)
    } catch (error) {
      announceMascotError(error)
      throw error
    }
    await get().load(); notifyDataChanged()
    announceMascotTransaction(saved, get().snapshot)
    announceMilestone(before, get().snapshot)
  },
  recordSavingsDeposit: async (input) => {
    const before = get().snapshot
    const db = await openDatabase(); await runLazyEffects(db)
    let saved: Transaction
    try {
      saved = await recordSavingsDeposit(db, input)
    } catch (error) {
      announceMascotError(error)
      throw error
    }
    await get().load(); notifyDataChanged()
    announceMascotTransaction(saved, get().snapshot)
    announceMilestone(before, get().snapshot)
  },

  deleteGoal: async (id) => {
    const db = await openDatabase()
    await deleteActiveGoal(db, id)
    await get().load(); notifyDataChanged()
  },
  reorderGoals: async (ids) => {
    await reorderGoals(await openDatabase(), ids)
    await get().load(); notifyDataChanged()
  },
  useGoal: async (id, expectedTarget) => {
    const db = await openDatabase(); await runLazyEffects(db)
    await commitGoalUse(db, id, expectedTarget)
    await get().load(); notifyDataChanged()
  },
}))

// ---- Selector shortcuts (memoized by zustand) -------------------
export const selectSnapshot  = (s: MoneeState) => s.snapshot
export const selectProfile   = (s: MoneeState) => s.profile
export const selectBalance   = (s: MoneeState) => s.snapshot?.balance
export const selectBuckets   = (s: MoneeState) => s.snapshot?.buckets ?? []
export const selectSavings   = (s: MoneeState) => s.snapshot?.savings
export const selectPeriodTxs = (s: MoneeState) => s.snapshot?.periodTxs ?? []
export const selectRecentTxs = (s: MoneeState) => s.snapshot?.recentTxs ?? []
export const selectCategories= (s: MoneeState) => s.categories
export const selectIsLoaded  = (s: MoneeState) => s.isLoaded
export const selectIsLocked  = (s: MoneeState) => s.isLocked



