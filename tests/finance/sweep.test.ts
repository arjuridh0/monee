import { describe, it, expect } from 'vitest'
import { shouldSweep, createSweep, createMissingSweeps } from '@/core/finance/sweep'
import type { MonthSweep, Transaction, Bucket, TxType } from '@/core/finance/types'

const buckets: Bucket[] = [
  { id: 'needs',  name: 'Kebutuhan Pokok', allocPercent: 40, icon: '', color: '', sortOrder: 0, allowOverbudget: false, isSavings: false },
  { id: 'saving', name: 'Tabungan',        allocPercent: 25, icon: '', color: '', sortOrder: 1, allowOverbudget: true,  isSavings: true },
]

let seq = 0
const tx = (type: TxType, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${++seq}`, type, amount, date: '2026-10-15',
  refundedAmount: 0, deleted: false, createdAt: 0, updatedAt: 0, ...over,
})

const sweeping = (periodKey: string): MonthSweep => ({
  id: `sw-${periodKey}`, periodKey, amount: 0, perBucketDetail: [], sweptAt: 0,
})

describe('sweep (v2)', () => {
  describe('shouldSweep', () => {
    it('belum ada sweep periode itu -> true', () => {
      expect(shouldSweep('2026-10', [])).toBe(true)
    })

    it('sudah ada -> false (idempotent)', () => {
      expect(shouldSweep('2026-10', [sweeping('2026-10')])).toBe(false)
    })
  })

  describe('createSweep', () => {
    it('amount = saldo akhir, bukan jumlah sisa bucket', () => {
      const txs = [
        tx('income', 1_000_000),
        tx('expense', 400_000, { bucketId: 'needs' }),
        tx('savings_deposit', 250_000, { bucketId: 'saving' }),
      ]
      const sweep = createSweep('2026-10', txs, buckets, { id: 'sw-1', now: 123 })
      expect(sweep.amount).toBe(350_000)
      expect(sweep.id).toBe('sw-1')
      expect(sweep.sweptAt).toBe(123)
    })

    it('satu bucket overspend: amount tetap saldo akhir', () => {
      const overbudget: Bucket[] = [
        { ...buckets[0]!, allowOverbudget: true },
        buckets[1]!,
      ]
      const txs = [tx('income', 1_000_000), tx('expense', 900_000, { bucketId: 'needs' })]
      const sweep = createSweep('2026-10', txs, overbudget, { id: 'sw-1' })
      expect(sweep.amount).toBe(100_000)
      const needs = sweep.perBucketDetail.find(d => d.bucketId === 'needs')
      expect(needs).toEqual({ bucketId: 'needs', jatah: 400_000, terpakai: 900_000, sisa: -500_000 })
    })

    it('saldo 0 tetap membuat record', () => {
      const txs = [tx('income', 1_000_000), tx('expense', 1_000_000, { bucketId: 'needs' })]
      const sweep = createSweep('2026-10', txs, buckets, { id: 'sw-1' })
      expect(sweep.amount).toBe(0)
      expect(sweep.periodKey).toBe('2026-10')
    })

    it('saldo negatif -> amount 0, tidak bawa utang', () => {
      const txs = [tx('income', 100_000), tx('expense', 500_000, { bucketId: 'needs' })]
      const sweep = createSweep('2026-10', txs, buckets, { id: 'sw-1' })
      expect(sweep.amount).toBe(0)
    })

    it('setoran mengurangi sweep 1:1', () => {
      const base = [tx('income', 1_000_000)]
      const withDeposit = [...base, tx('savings_deposit', 500_000)]
      expect(createSweep('2026-10', base, buckets, { id: 'a' }).amount).toBe(1_000_000)
      expect(createSweep('2026-10', withDeposit, buckets, { id: 'b' }).amount).toBe(500_000)
    })

    it('perBucketDetail berisi jatah, terpakai, sisa per bucket', () => {
      const txs = [tx('income', 1_000_000), tx('expense', 100_000, { bucketId: 'needs' })]
      const sweep = createSweep('2026-10', txs, buckets, { id: 'sw-1' })
      expect(sweep.perBucketDetail).toEqual([
        { bucketId: 'needs', jatah: 400_000, terpakai: 100_000, sisa: 300_000 },
        { bucketId: 'saving', jatah: 250_000, terpakai: 0, sisa: 250_000 },
      ])
    })
  })

  describe('createMissingSweeps', () => {
    it('dua bulan terlewat -> dua record urut kronologis', () => {
      const result = createMissingSweeps(
        [
          { periodKey: '2026-09', txs: [tx('income', 500_000)] },
          { periodKey: '2026-08', txs: [tx('income', 300_000)] },
        ],
        buckets,
        [],
      )
      expect(result.map(s => s.periodKey)).toEqual(['2026-08', '2026-09'])
      expect(result.map(s => s.amount)).toEqual([300_000, 500_000])
    })

    it('periode yang sudah disweep dilewati', () => {
      const result = createMissingSweeps(
        [
          { periodKey: '2026-08', txs: [tx('income', 300_000)] },
          { periodKey: '2026-09', txs: [tx('income', 500_000)] },
        ],
        buckets,
        [sweeping('2026-08')],
      )
      expect(result.map(s => s.periodKey)).toEqual(['2026-09'])
    })
  })
})
