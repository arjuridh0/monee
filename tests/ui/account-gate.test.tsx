import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { AccountGate } from '@/features/auth/AccountGate'
import { openDatabase, resetDbSingleton, setActiveAccountId } from '@/core/db/migrations'

const accountId = `acct_${'a'.repeat(64)}`
vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <span>Teman Monee</span> }))

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  resetDbSingleton()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetDbSingleton() })

describe('account entry and recovery UI', () => {
  it('offers email and PIN login with separate registration and recovery', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'expired' }, { status: 401 })))
    render(<AccountGate><p>private ledger</p></AccountGate>)
    expect(await screen.findByRole('heading', { name: 'Masuk ke Monee' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeVisible()
    expect(screen.getByLabelText('PIN akun 6 digit')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Masuk', exact: true })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Buat akun' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Lupa PIN' })).toBeVisible()
    expect(screen.queryByText('private ledger')).not.toBeInTheDocument()
  })

  it('opens the account database only after a server session is verified', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/session'
      ? Response.json({ authenticated: true, accountId })
      : Response.json({ changes: [], nextCursor: '', hasMore: false })))
    render(<AccountGate><p>private ledger</p></AccountGate>)
    expect(await screen.findByText('private ledger')).toBeVisible()
    await waitFor(async () => {
      const { openDatabase } = await import('@/core/db/migrations')
      expect(await (await openDatabase()).get('profile', 'profile')).toBeUndefined()
    })
  })

  it('allows cached local work while offline after a previous account login', async () => {
    localStorage.setItem('monee:active-account', accountId)
    localStorage.setItem('monee:last-verified', String(Date.now()))
    setActiveAccountId(accountId)
    await (await openDatabase()).put('profile', { id: 'profile', name: 'Arju', mascotId: 'mochi', periodStartDay: 1,
      defaultBucketId: 'bucket-needs', pinHash: '', pinSalt: '', createdAt: 1 })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    render(<AccountGate><p>offline ledger</p></AccountGate>)
    expect(await screen.findByText('offline ledger')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Offline')
  })

  it('does not start onboarding offline on a device with no cached ledger', async () => {
    localStorage.setItem('monee:active-account', accountId)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    render(<AccountGate><p>private ledger</p></AccountGate>)
    expect(await screen.findByRole('heading', { name: 'Akun belum bisa diperiksa' })).toBeVisible()
    expect(screen.queryByText('private ledger')).not.toBeInTheDocument()
  })

  it('shows a retryable service error instead of treating a D1 outage as logout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'unavailable' }, { status: 503 })))
    render(<AccountGate><p>private ledger</p></AccountGate>)
    expect(await screen.findByRole('heading', { name: 'Akun belum bisa diperiksa' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Masuk atau buat akun' })).not.toBeInTheDocument()
  })
})
