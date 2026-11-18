import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteAccountLedger, getAccountSession, logoutAccount } from '@/features/auth/account-client'

afterEach(() => vi.unstubAllGlobals())

describe('Monee account client', () => {
  it('checks the cookie session without storing credentials in JavaScript', async () => {
    const fetcher = vi.fn(async () => Response.json({ authenticated: true, accountId: `acct_${'a'.repeat(64)}` }))
    vi.stubGlobal('fetch', fetcher)
    await expect(getAccountSession()).resolves.toMatchObject({ authenticated: true, accountId: `acct_${'a'.repeat(64)}` })
    expect(fetcher).toHaveBeenCalledWith('/api/session', expect.objectContaining({
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
    }))
  })

  it('treats an expired or missing session as signed out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'expired' }, { status: 401 })))
    await expect(getAccountSession()).resolves.toBeNull()
  })

  it('does not turn service outages into signed-out state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'offline' }, { status: 503 })))
    await expect(getAccountSession()).rejects.toThrow('Akun belum bisa diperiksa. Periksa koneksi lalu coba lagi.')
  })

  it('logs out with same-origin credentials and never sends a user id', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    await logoutAccount()
    expect(fetcher).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }))
  })

  it('requests an authenticated, deliberate account-wide ledger deletion', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetcher)
    await deleteAccountLedger()
    expect(fetcher).toHaveBeenCalledWith('/api/account/data', expect.objectContaining({
      method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Monee-Request': 'account-delete' },
    }))
  })
})
