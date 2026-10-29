/**
 * Lazy effects (v2) -- sweep semua periode tertutup, tanpa auto-create recurring.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { sweepRepo } from '@/core/db/repositories'
import { runLazyEffects } from '@/store/lazy-effects'
import type { Bucket, Transaction, TxType, MonthSweep } from '@/core/finance/types'

beforeEach(() => {
  // @ts-expect-error -- override global indexedDB
  globalThis.indexedDB = new IDBFactory()
  resetDbSingleton()
})

const BUCKETS: Bucket[] = [
  { id: 'needs',  name: 'Kebutuhan Pokok', allocPercent: 40, icon: '', color: '', sortOrder: 0, allowOverbudget: false, isSavings: false },
  { id: 'saving', name: 'Tabungan',        allocPercent: 25, icon: '', color: '', sortOrder: 1, allowOverbudget: true,  isSavings: true },
]

let seq = 0
const tx = (type: TxType, amount: number, date: string, over: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${++seq}`, type, amount, date,
  refundedAmount: 0, deleted: false, createdAt: seq, updatedAt: seq, ...over,
})

const sweepFor = (periodKey: string): MonthSweep => ({
  id: `sw-${periodKey}`, periodKey, amount: 0, perBucketDetail: [], sweptAt: 0,
})

async function sweepStored(transactions: Transaction[], sweeps: MonthSweep[] = [], today = '2026-10-15') {
  const db = await openDatabase()
  await db.put('profile', { id: 'profile', name: 'Nara', mascotId: 'mochi', periodStartDay: 1,
    defaultBucketId: 'needs', pinHash: 'hash', pinSalt: 'salt', createdAt: 1 })
  for (const bucket of BUCKETS) await db.put('buckets', bucket)
  for (const entry of transactions) await db.put('transactions', entry)
  for (const sweep of sweeps) await db.put('monthSweeps', sweep)
  return runLazyEffects(db, today)
}

describe('runLazyEffects (v2)', () => {
  it('tanpa transaksi -> tidak ada sweep', async () => {
    const result = await sweepStored([])
    expect(result.newSweeps).toEqual([])
  })

  it('satu periode tertutup -> satu sweep, amount = saldo akhir', async () => {
    const existing = [
      tx('income', 1_000_000, '2026-09-01'),
      tx('expense', 400_000, '2026-09-10', { bucketId: 'needs' }),
      tx('savings_deposit', 250_000, '2026-09-15', { bucketId: 'saving' }),
    ]
    const result = await sweepStored(existing)
    expect(result.newSweeps).toHaveLength(1)
    expect(result.newSweeps[0]?.periodKey).toBe('2026-09')
    expect(result.newSweeps[0]?.amount).toBe(350_000)

    const db = await openDatabase()
    expect(await sweepRepo.getAll(db)).toHaveLength(1)
  })

  it('sudah disweep -> tidak membuat duplikat', async () => {
    const existing = [tx('income', 1_000_000, '2026-09-01')]
    const result = await sweepStored(existing, [sweepFor('2026-09')])
    expect(result.newSweeps).toEqual([])
  })

  it('dua bulan terlewat -> dua record urut kronologis', async () => {
    const existing = [
      tx('income', 300_000, '2026-08-05'),
      tx('income', 500_000, '2026-09-05'),
    ]
    const result = await sweepStored(existing)
    expect(result.newSweeps.map(s => s.periodKey)).toEqual(['2026-08', '2026-09'])
    expect(result.newSweeps.map(s => s.amount)).toEqual([300_000, 500_000])

    const db = await openDatabase()
    expect(await sweepRepo.getAll(db)).toHaveLength(2)
  })

  it('bulan kosong di tengah tetap disweep 0', async () => {
    const existing = [tx('income', 300_000, '2026-08-05')]
    const result = await sweepStored(existing)
    expect(result.newSweeps.map(s => s.periodKey)).toEqual(['2026-08', '2026-09'])
    expect(result.newSweeps[1]?.amount).toBe(0)
  })

  it('periode berjalan tidak disweep', async () => {
    const existing = [tx('income', 1_000_000, '2026-10-05')]
    const result = await sweepStored(existing)
    expect(result.newSweeps).toEqual([])
  })

  it('tidak menambah transaksi apa pun (recurring tidak auto-create)', async () => {
    const existing = [tx('income', 1_000_000, '2026-09-01')]
    const result = await sweepStored(existing)
    expect(result).not.toHaveProperty('newTxs')
    const db = await openDatabase()
    const rows = await db.getAll('transactions')
    expect(rows).toEqual(existing) // Menutup periode tidak membuat income otomatis.
  })
})
