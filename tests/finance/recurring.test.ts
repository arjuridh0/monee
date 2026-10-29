import { describe, it, expect } from 'vitest'
import {
  getRecurringDatesInPeriod,
  hasRecurringInPeriod,
  shouldOfferRecurring,
  buildRecurringIncome,
  recordRecurring,
} from '@/core/finance/recurring'
import type { RecurringIncome, Transaction, PeriodBounds } from '@/core/finance/types'

const recurring = (over: Partial<RecurringIncome> = {}): RecurringIncome => ({
  id: 'rec-1', name: 'Gaji', amount: 5_000_000, dayOfMonth: 25,
  categoryId: 'cat-salary', isActive: true, createdAt: 0, ...over,
})

const period = (start: string, end: string, key: string): PeriodBounds => ({ start, end, key })

const incomeTx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1', type: 'income', amount: 5_000_000, categoryId: 'cat-salary',
  date: '2026-10-25', recurringId: 'rec-1', refundedAmount: 0, deleted: false,
  createdAt: 0, updatedAt: 0, ...over,
})

describe('recurring (v2)', () => {
  describe('getRecurringDatesInPeriod', () => {
    it('satu tanggal per periode kalender', () => {
      expect(getRecurringDatesInPeriod(recurring(), period('2026-10-01', '2026-10-31', '2026-10')))
        .toEqual(['2026-10-25'])
    })

    it('periode custom 25-24: tanggal 25 jatuh di awal', () => {
      expect(getRecurringDatesInPeriod(recurring(), period('2026-07-25', '2026-08-24', '2026-07-25')))
        .toEqual(['2026-07-25'])
    })

    it('periode custom 25-24: tanggal 10 jatuh di bulan kedua', () => {
      expect(getRecurringDatesInPeriod(recurring({ dayOfMonth: 10 }), period('2026-07-25', '2026-08-24', '2026-07-25')))
        .toEqual(['2026-08-10'])
    })
  })

  describe('hasRecurringInPeriod', () => {
    it('ada transaksi recurringId sama -> true', () => {
      expect(hasRecurringInPeriod('rec-1', [incomeTx()])).toBe(true)
    })

    it('transaksi deleted tidak dihitung', () => {
      expect(hasRecurringInPeriod('rec-1', [incomeTx({ deleted: true })])).toBe(false)
    })

    it('recurringId lain tidak dihitung', () => {
      expect(hasRecurringInPeriod('rec-2', [incomeTx()])).toBe(false)
    })
  })

  describe('shouldOfferRecurring', () => {
    const p = period('2026-10-01', '2026-10-31', '2026-10')

    it('tanggal jatuh tempo sudah lewat dan belum dicatat -> true', () => {
      expect(shouldOfferRecurring(recurring(), p, '2026-10-27', [])).toBe(true)
    })

    it('belum jatuh tempo -> false', () => {
      expect(shouldOfferRecurring(recurring(), p, '2026-10-24', [])).toBe(false)
    })

    it('sudah dicatat -> false', () => {
      expect(shouldOfferRecurring(recurring(), p, '2026-10-27', [incomeTx()])).toBe(false)
    })

    it('template nonaktif -> false', () => {
      expect(shouldOfferRecurring(recurring({ isActive: false }), p, '2026-10-27', [])).toBe(false)
    })
  })

  describe('buildRecurringIncome', () => {
    it('membuat income normal dengan recurringId', () => {
      const tx = buildRecurringIncome(recurring(), { id: 'tx-9', date: '2026-10-27', now: 123 })
      expect(tx).toMatchObject({
        id: 'tx-9', type: 'income', amount: 5_000_000,
        categoryId: 'cat-salary', date: '2026-10-27', recurringId: 'rec-1',
        deleted: false, refundedAmount: 0, createdAt: 123, updatedAt: 123,
      })
    })
  })

  describe('recordRecurring', () => {
    const p = period('2026-10-01', '2026-10-31', '2026-10')

    it('klik pertama -> transaksi dibuat', () => {
      const tx = recordRecurring(recurring(), {
        period: p, today: '2026-10-27', existingTxs: [], id: 'tx-9', now: 123,
      })
      expect(tx?.id).toBe('tx-9')
      expect(tx?.recurringId).toBe('rec-1')
    })

    it('klik kedua di periode sama -> null (idempotent)', () => {
      const first = recordRecurring(recurring(), {
        period: p, today: '2026-10-27', existingTxs: [], id: 'tx-9', now: 123,
      })
      expect(first).not.toBeNull()

      const second = recordRecurring(recurring(), {
        period: p, today: '2026-10-27', existingTxs: [first!], id: 'tx-10', now: 124,
      })
      expect(second).toBeNull()
    })

    it('tidak mengubah array existingTxs', () => {
      const existing: Transaction[] = []
      recordRecurring(recurring(), {
        period: p, today: '2026-10-27', existingTxs: existing, id: 'tx-9', now: 123,
      })
      expect(existing).toHaveLength(0)
    })

    it('belum jatuh tempo -> null', () => {
      const tx = recordRecurring(recurring(), {
        period: p, today: '2026-10-24', existingTxs: [], id: 'tx-9', now: 123,
      })
      expect(tx).toBeNull()
    })
  })
})
