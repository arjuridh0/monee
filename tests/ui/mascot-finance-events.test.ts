import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinanceSnapshot } from '@/core/finance/selectors'
import type { Transaction } from '@/core/finance/types'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { profileRepo, seedDefaultData, transactionRepo } from '@/core/db/repositories'
import { getToday } from '@/core/finance/period'
import { useMoneeStore } from '@/store'
import {
  MASCOT_EVENT, dispatchMascotEvent, milestoneReached, reactionForError,
  reactionForTransaction,
} from '@/features/mascot/mascot-events'
import type { MascotEvent } from '@/features/mascot/mascot-machine'

function expense(bucketId = 'bucket-needs'): Transaction {
  return {
    id: `tx-${Math.random()}`, type: 'expense', amount: 1, date: getToday(), bucketId,
    categoryId: 'cat-makan', createdAt: 1, updatedAt: 1,
  } as Transaction
}

function snapshot(progressPct: number, goals: Partial<FinanceSnapshot['savings']['goals'][number]>[] = []): FinanceSnapshot {
  return {
    buckets: [{ bucket: { id: 'bucket-needs' }, progressPct }],
    savings: { sisaBalance: 0, allocationBalance: 0, goals },
  } as unknown as FinanceSnapshot
}

function goal(id: string, status: 'active' | 'fulfilled' | 'used') {
  return { goal: { id }, allocated: 0, progressPct: 0, status }
}

describe('finance event mapping', () => {
  it('classifies transactions and bucket thresholds', () => {
    const tx = expense()
    expect(reactionForTransaction({ ...tx, type: 'income' }, null)).toBe('incomeSaved')
    expect(reactionForTransaction({ ...tx, type: 'savings_deposit' }, null)).toBe('savingsDeposit')
    expect(reactionForTransaction({ ...tx, type: 'savings_expense' }, null)).toBe('suddenExpense')
    expect(reactionForTransaction(tx, snapshot(40))).toBe('transactionSaved')
    expect(reactionForTransaction(tx, snapshot(74.9))).toBe('transactionSaved')
    expect(reactionForTransaction(tx, snapshot(75))).toBe('budgetWarning')
    expect(reactionForTransaction(tx, snapshot(100))).toBe('budgetWarning')
    expect(reactionForTransaction(tx, snapshot(100.1))).toBe('budgetBlocked')
    expect(reactionForTransaction(expense('missing'), snapshot(90))).toBe('transactionSaved')
  })

  it('maps domain errors and ignores unrelated failures', () => {
    expect(reactionForError(new Error('ERR_JATAH_HABIS — jatah'))).toBe('budgetBlocked')
    expect(reactionForError(new Error('ERR_SALDO_KURANG — saldo'))).toBe('balanceShort')
    expect(reactionForError(new Error('ERR_KOMPARTEMEN_KURANG — dana'))).toBe('balanceShort')
    expect(reactionForError(new Error('ERR_PERIODE_TERKUNCI — periode'))).toBe('periodLocked')
    expect(reactionForError(new Error('ERR_CATEGORY_INVALID — kategori'))).toBeNull()
    expect(reactionForError(new Error('jaringan putus'))).toBeNull()
    expect(reactionForError('bukan error')).toBeNull()
  })

  it('detects a goal that just became fulfilled', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const before = { savings: { goals: [goal('a', 'active'), goal('b', 'fulfilled')] } } as any as FinanceSnapshot
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const after = { savings: { goals: [goal('a', 'fulfilled'), goal('b', 'fulfilled')] } } as any as FinanceSnapshot
    expect(milestoneReached(before, after)).toBe(true)
    expect(milestoneReached(after, after)).toBe(false)
    expect(milestoneReached(null, after)).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usedFirst = { savings: { goals: [goal('a', 'used')] } } as any as FinanceSnapshot
    expect(milestoneReached(before, usedFirst)).toBe(false)
  })

  it('broadcasts one event per dispatch', () => {
    const seen: MascotEvent[] = []
    const listener = (event: Event) => seen.push((event as CustomEvent<MascotEvent>).detail)
    window.addEventListener(MASCOT_EVENT, listener)
    dispatchMascotEvent('balanceShort')
    window.removeEventListener(MASCOT_EVENT, listener)
    expect(seen).toEqual(['balanceShort'])
  })
})

describe('store announcements', () => {
  let seen: MascotEvent[]
  const listener = (event: Event) => seen.push((event as CustomEvent<MascotEvent>).detail)

  beforeEach(async () => {
    seen = []
    window.addEventListener(MASCOT_EVENT, listener)
    vi.stubGlobal('indexedDB', new IDBFactory()); resetDbSingleton()
    useMoneeStore.setState(useMoneeStore.getInitialState(), true)
    const db = await openDatabase(); await seedDefaultData(db)
    await profileRepo.save(db, {
      id: 'profile', name: 'Nara', mascotId: 'mochi', pinHash: 'hash', pinSalt: 'salt',
      periodStartDay: 1, defaultBucketId: 'bucket-needs', createdAt: Date.now(),
    })
    await transactionRepo.save(db, { id: 'income', type: 'income', amount: 1_000_000, date: getToday(), createdAt: 1, updatedAt: 1 })
    await useMoneeStore.getState().load()
  })

  afterEach(() => {
    window.removeEventListener(MASCOT_EVENT, listener)
    vi.unstubAllGlobals()
  })

  it('announces a warning when an expense crosses 75% of its bucket', async () => {
    await useMoneeStore.getState().addTransaction({
      id: 'warn', type: 'expense', amount: 300_000, bucketId: 'bucket-needs', categoryId: 'cat-makan',
      date: getToday(), createdAt: 2, updatedAt: 2,
    })
    expect(seen).toContain('budgetWarning')
  })

  it('announces a blocked bucket and keeps the persistence error', async () => {
    await expect(useMoneeStore.getState().addTransaction({
      id: 'blocked', type: 'expense', amount: 500_000, bucketId: 'bucket-needs', categoryId: 'cat-makan',
      date: getToday(), createdAt: 2, updatedAt: 2,
    })).rejects.toThrow('ERR_JATAH_HABIS')
    expect(seen).toContain('budgetBlocked')
  })

  it('announces income as a happy event', async () => {
    await useMoneeStore.getState().addTransaction({
      id: 'salary', type: 'income', amount: 250_000, categoryId: 'cat-gaji', date: getToday(), createdAt: 2, updatedAt: 2,
    })
    expect(seen).toContain('incomeSaved')
  })
})
