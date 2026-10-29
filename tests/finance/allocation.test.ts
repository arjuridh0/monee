import { describe, it, expect } from 'vitest'
import { calcBucketBudgets, calcBucketProgress, isOverspent } from '@/core/finance/allocation'
import type { Bucket, Transaction, TxType } from '@/core/finance/types'

const buckets: Bucket[] = [
  { id: 'needs',  name: 'Kebutuhan Pokok', allocPercent: 40, icon: 'home', color: '#888', sortOrder: 0, allowOverbudget: false, isSavings: false },
  { id: 'daily',  name: 'Pulsa/Transport', allocPercent: 20, icon: 'car',  color: '#888', sortOrder: 1, allowOverbudget: false, isSavings: false },
  { id: 'saving', name: 'Tabungan',        allocPercent: 25, icon: 'piggy-bank', color: '#888', sortOrder: 2, allowOverbudget: true, isSavings: true },
  { id: 'charity',name: 'Sedekah',         allocPercent: 10, icon: 'hand-heart', color: '#888', sortOrder: 3, allowOverbudget: false, isSavings: false },
  { id: 'fun',    name: 'Fun',             allocPercent:  5, icon: 'party-popper', color: '#888', sortOrder: 4, allowOverbudget: false, isSavings: false },
]

let seq = 0
const tx = (type: TxType, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${++seq}`, type, amount, date: '2026-10-15',
  refundedAmount: 0, deleted: false, createdAt: 0, updatedAt: 0, ...over,
})

describe('allocation (v2)', () => {
  describe('calcBucketBudgets', () => {
    it('income 1jt -> 400/200/250/100/50 (rb)', () => {
      expect(calcBucketBudgets(buckets, 1_000_000)).toEqual({
        needs: 400_000, daily: 200_000, saving: 250_000, charity: 100_000, fun: 50_000,
      })
    })

    it('income 0 -> semua jatah 0', () => {
      expect(Object.values(calcBucketBudgets(buckets, 0))).toEqual([0, 0, 0, 0, 0])
    })

    it('income 1.5jt -> jatah proporsional', () => {
      expect(calcBucketBudgets(buckets, 1_500_000)).toEqual({
        needs: 600_000, daily: 300_000, saving: 375_000, charity: 150_000, fun: 75_000,
      })
    })

    it('dibulatkan ke ratusan bawah', () => {
      const odd: Bucket[] = [{ ...buckets[0], allocPercent: 13 }]
      expect(calcBucketBudgets(odd, 777_000).needs).toBe(101_000)
    })
  })

  describe('calcBucketProgress', () => {
    it('spent net refund: 100rb - 25rb = 75rb', () => {
      const budgets = { needs: 400_000 }
      const txs = [tx('expense', 100_000, { bucketId: 'needs', refundedAmount: 25_000 })]
      const p = calcBucketProgress(buckets, budgets, txs).find(x => x.bucket.id === 'needs')!
      expect(p.spentAmount).toBe(75_000)
      expect(p.remaining).toBe(325_000)
    })

    it('transaksi deleted tidak dihitung', () => {
      const budgets = { needs: 400_000 }
      const txs = [tx('expense', 100_000, { bucketId: 'needs', deleted: true })]
      const p = calcBucketProgress(buckets, budgets, txs).find(x => x.bucket.id === 'needs')!
      expect(p.spentAmount).toBe(0)
    })

    it('bucket Tabungan dihitung dari savings_deposit', () => {
      const budgets = { saving: 250_000 }
      const txs = [
        tx('savings_deposit', 250_000, { bucketId: 'saving' }),
        tx('expense', 999_000, { bucketId: 'saving' }), // tidak boleh dipakai expense
      ]
      const p = calcBucketProgress(buckets, budgets, txs).find(x => x.bucket.id === 'saving')!
      expect(p.spentAmount).toBe(250_000)
      expect(p.progressPct).toBe(100)
    })

    it('keeps fractional progress below status thresholds', () => {
      const result = calcBucketProgress(buckets, { needs: 10000 }, [tx('expense', 7499, { bucketId: 'needs' })])[0]!
      expect(result.progressPct).toBeCloseTo(74.99)
      expect(result.progressPct).toBeLessThan(75)
    })

    it('overspent 500rb dari jatah 400rb -> 125%', () => {
      const txs = [tx('expense', 500_000, { bucketId: 'needs' })]
      const p = calcBucketProgress(buckets, { needs: 400_000 }, txs).find(x => x.bucket.id === 'needs')!
      expect(p.progressPct).toBe(125)
      expect(p.remaining).toBe(-100_000)
    })

    it('jatah 0 -> progress 0 walau ada spending', () => {
      const txs = [tx('expense', 50_000, { bucketId: 'needs' })]
      const p = calcBucketProgress(buckets, { needs: 0 }, txs).find(x => x.bucket.id === 'needs')!
      expect(p.progressPct).toBe(0)
    })
  })

  describe('isOverspent', () => {
    it('100 ke atas true', () => {
      expect(isOverspent(100)).toBe(true)
      expect(isOverspent(125)).toBe(true)
      expect(isOverspent(99)).toBe(false)
    })
  })
})
