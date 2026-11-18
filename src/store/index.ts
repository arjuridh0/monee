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
import { deleteAllData as persistDeleteAllData, validateDeleteAllData } from '@/features/settings/delete-all'
import { deleteAccountLedger } from '@/features/auth/account-client'
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
  /** Hydrate only after the caller has verified the current PIN. This is a UI/session gate, not database encryption. */
  unlockProfile: (expected: Profile, canUnlock?: () => boolean) => Promise<void>
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
  deleteAllData: (pin: string | undefined, expectedPinHash: string) => Promise<void>
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
let lockRevision = 0

const emptyLedger = () => ({ buckets: [] as Bucket[], categories: [] as Category[], transactions: [] as Transaction[],
  recurringIncomes: [] as RecurringIncome[], goals: [] as Goal[], sweeps: [] as MonthSweep[], snapshot: null })

async function readLedger() {
  const db = await openDatabase()
  await seedDefaultData(db)
  await runLazyEffects(db)
  const read = db.transaction(['profile', 'buckets', 'categories', 'transactions', 'recurringIncomes', 'goals', 'monthSweeps'], 'readonly')
  const [profile, buckets, categories, transactions, recurringIncomes, goals, sweeps] = await Promise.all([
    read.objectStore('profile').get('profile'), read.objectStore('buckets').getAll(),
    read.objectStore('categories').getAll(), read.objectStore('transactions').getAll(),
    read.objectStore('recurringIncomes').getAll(), read.objectStore('goals').getAll(), read.objectStore('monthSweeps').getAll(),
  ])
  await read.done
  return { profile: profile ?? null, buckets, categories, transactions, recurringIncomes, goals, sweeps, isLoaded: true }
}

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

  setLocked: (locked) => {
    if (locked) { lockRevision++; set({ isLocked: true, ...emptyLedger() }) }
    else set({ isLocked: false })
  },

  unlockProfile: async (expected, canUnlock = () => true) => {
    const revision = lockRevision
    const nextState = await readLedger()
    if (revision !== lockRevision || !canUnlock() || document.visibilityState === 'hidden') {
      throw new Error('ERR_SESSION_CANCELLED')
    }
    if (nextState.profile?.pinHash !== expected.pinHash || nextState.profile.pinSalt !== expected.pinSalt) {
      throw new Error('ERR_PROFILE_STALE')
    }
    set({ ...nextState, snapshot: deriveSnapshot(nextState), isLocked: false })
  },

  load: async () => {
    requestedLoad++
    if (loadInFlight) return loadInFlight
    loadInFlight = (async () => {
      let revision: number
      do {
      revision = requestedLoad
      const nextState = await readLedger()
      const { profile } = nextState
      set(previous => {
        const hasPin = Boolean(profile?.pinHash && profile.pinSalt)
        const isLocked = profile
          ? hasPin && (previous.isLocked || !previous.profile || previous.profile.pinHash !== profile.pinHash
            || previous.profile.pinSalt !== profile.pinSalt)
          : previous.isLocked
        // Keep only the profile needed by PinScreen while locked. Refreshes must not restore ledger memory.
        // No profile means first-run onboarding still needs the seeded buckets/categories.
        return isLocked && profile ? { ...nextState, ...emptyLedger(), isLocked }
          : { ...nextState, snapshot: deriveSnapshot(nextState), isLocked }
      })
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
      if (!result.profile.pinHash) await get().setLocked(false)
      else if (result.created && !backgrounded) await get().unlockProfile(result.profile, () => !backgrounded)
      else get().setLocked(true)
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
    const db = await openDatabase()
    const input = { ...(pin ? { pin } : {}), expectedPinHash }
    await validateDeleteAllData(db, input)
    await deleteAccountLedger()
    await persistDeleteAllData(db, input)
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
