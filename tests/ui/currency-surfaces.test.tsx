import { webcrypto } from 'node:crypto'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '@/app/AppShell'
import { useMoneeStore } from '@/store'
import { openDatabase, resetDbSingleton } from '@/core/db/migrations'
import { profileRepo, seedDefaultData, transactionRepo } from '@/core/db/repositories'
import type { Transaction } from '@/core/finance/types'

vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <span>Teman Monee</span> }))

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T03:00:00Z'))
  resetDbSingleton()
  useMoneeStore.setState(useMoneeStore.getInitialState(), true)
})

afterEach(async () => {
  cleanup()
  const db = await openDatabase(); db.close()
  resetDbSingleton(); vi.useRealTimers(); vi.unstubAllGlobals()
})

async function prepare(path: string) {
  const db = await openDatabase()
  await seedDefaultData(db)
  await profileRepo.save(db, {
    id: 'profile', name: 'Nara', mascotId: 'luna', pinHash: 'hash', pinSalt: 'salt',
    periodStartDay: 1, defaultBucketId: 'bucket-needs', createdAt: Date.now(),
    currency: { code: 'IDR', format: '#.###' },
  })
  const base = { date: '2026-10-24', deleted: false, refundedAmount: 0, createdAt: Date.now(), updatedAt: Date.now() }
  const rows: Transaction[] = [
    { ...base, id: 'income', type: 'income', amount: 1_000_000, categoryId: 'cat-gaji' },
    { ...base, id: 'expense', type: 'expense', amount: 300_000, categoryId: 'cat-makan', bucketId: 'bucket-needs' },
    { ...base, id: 'deposit', type: 'savings_deposit', amount: 200_000, categoryId: 'cat-tabungan', bucketId: 'bucket-savings' },
  ]
  for (const row of rows) await transactionRepo.save(db, row)
  await useMoneeStore.getState().load()
  await useMoneeStore.getState().unlockProfile(useMoneeStore.getState().profile!)
  render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppShell /></MemoryRouter>)
}

describe('rupiah format surfaces', () => {
  it('follows the profile format on the dashboard balance and analytics', async () => {
    await prepare('/')
    expect(screen.getByLabelText('Saldo periode')).toHaveTextContent(/^500\.000$/)
    const analytics = screen.getByRole('complementary', { name: 'Ringkasan tambahan' })
    expect(within(analytics).getByText('200.000')).toBeVisible()
    expect(within(analytics).queryByText(/Rp/)).not.toBeInTheDocument()
  })

  it('follows the profile format on the history summary', async () => {
    await prepare('/riwayat')
    const summary = screen.getByRole('region', { name: 'Ringkasan periode' })
    expect(within(summary).getByText('1.000.000')).toBeVisible()
    expect(within(summary).getAllByText('500.000')).toHaveLength(2)
    expect(summary).not.toHaveTextContent('Rp')
  })

  it('follows the profile format on the savings screen', async () => {
    await prepare('/tabungan')
    const total = screen.getByRole('region', { name: 'Total tabungan' })
    expect(within(total).getByText('200.000')).toBeVisible()
  })
})
