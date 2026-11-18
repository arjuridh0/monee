// @vitest-environment node
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorker, type Env } from '../../server/index'
import { createTestDatabase, seedTestSession, TEST_ACCOUNT_ID } from '../server/test-database'
import { openDatabase, resetDbSingleton, setActiveAccountId } from '@/core/db/migrations'
import { getSyncStatus, syncAccountData, resolveSyncConflict } from '@/features/auth/sync'
import { subscribeDataChanges } from '@/core/db/changes'

const origin = 'https://monee.example'
let serverDb: Awaited<ReturnType<typeof createTestDatabase>>
let cookie: string
let worker: ReturnType<typeof createWorker>
let env: Env
let fetcher: ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  resetDbSingleton(); setActiveAccountId(TEST_ACCOUNT_ID)
  serverDb = await createTestDatabase()
  cookie = await seedTestSession(serverDb.binding)
  worker = createWorker(async () => new Response('unused'))
  env = { DB: serverDb.binding, ACCESS_TEAM_DOMAIN: 'https://monee-test.cloudflareaccess.com', ACCESS_AUD: 'a'.repeat(64),
    AI_RATE_LIMIT: { limit: async () => ({ success: true }) }, AUTH_RATE_LIMIT: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response('app') } }
  fetcher = vi.fn(async (path: string, init: RequestInit = {}) => worker.fetch(new Request(new URL(path, origin), {
    ...init, headers: { Origin: origin, Cookie: cookie, ...(init.headers as Record<string, string> | undefined) },
  }), env))
  vi.stubGlobal('fetch', fetcher)
})

afterEach(() => { serverDb.close(); vi.unstubAllGlobals(); resetDbSingleton() })

describe('account ledger sync', () => {
  it('keeps a newer local edit made while its previous value is being acknowledged', async () => {
    const local = await openDatabase()
    const original = { id: 'edit-during-upload', type: 'income' as const, amount: 2500, date: '2026-11-16', createdAt: 1, updatedAt: 1 }
    await local.put('transactions', original)
    const transport = fetcher.getMockImplementation()!
    let edited = false
    fetcher.mockImplementation(async (path: string, init: RequestInit = {}) => {
      const response = await transport(path, init)
      if (init.method === 'POST' && !edited) { edited = true; await local.put('transactions', { ...original, amount: 3500, updatedAt: 2 }) }
      return response
    })
    await syncAccountData()
    expect(getSyncStatus()).toMatchObject({ state: 'synced', conflicts: 0, pending: 0 })
    expect(await local.get('transactions', original.id)).toMatchObject({ amount: 3500 })
    const stored = await serverDb.binding.prepare('SELECT record_json FROM sync_records WHERE account_id = ? AND record_id = ?').bind(TEST_ACCOUNT_ID, original.id).first<{ record_json: string }>()
    expect(JSON.parse(stored!.record_json)).toMatchObject({ amount: 3500 })
  })
  it('acknowledges an accepted batch before sending again and avoids false conflicts', async () => {
    const local = await openDatabase()
    await local.put('transactions', { id: 'accepted-once', type: 'income', amount: 2500, date: '2026-11-16', createdAt: 1, updatedAt: 1 })
    await syncAccountData()
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    expect(getSyncStatus()).toMatchObject({ state: 'synced', conflicts: 0, pending: 0 })
  })
  it('notifies the app store when a remote device change is pulled into the local cache', async () => {
    vi.stubGlobal('window', new EventTarget())
    await worker.fetch(new Request(`${origin}/api/sync`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [{ opId: 'remote-first', collection: 'transactions', id: 'tx-remote', baseRevision: 0,
        record: { id: 'tx-remote', type: 'income', amount: 2400, date: '2026-11-16', createdAt: 1, updatedAt: 1 } }] }) }), env)
    const onChanged = vi.fn()
    const unsubscribe = subscribeDataChanges(onChanged)
    await syncAccountData()
    unsubscribe()
    expect(onChanged).toHaveBeenCalledOnce()
    expect(await (await openDatabase()).get('transactions', 'tx-remote')).toMatchObject({ amount: 2400 })
  })

  it('applies an account-wide reset tombstone to an offline device when it reconnects', async () => {
    const local = await openDatabase()
    await local.put('transactions', { id: 'tx-before-reset', type: 'income', amount: 4200, date: '2026-11-16', createdAt: 1, updatedAt: 1 })
    await syncAccountData()
    const deleted = await worker.fetch(new Request(`${origin}/api/account/data`, {
      method: 'DELETE', headers: { Cookie: cookie, Origin: origin, 'X-Monee-Request': 'account-delete' },
    }), env)
    expect(deleted.status).toBe(204)
    await syncAccountData()
    expect(await local.get('transactions', 'tx-before-reset')).toBeUndefined()
  })

  it('uploads local ledger without device PIN and restores it into a clean device database', async () => {
    const local = await openDatabase()
    await local.put('profile', { id: 'profile', name: 'Arju', mascotId: 'luna', periodStartDay: 1,
      defaultBucketId: 'bucket-needs', pinHash: 'do-not-upload-hash', pinSalt: 'do-not-upload-salt', createdAt: 1 })
    await local.put('transactions', { id: 'tx-one', type: 'income', amount: 42000, date: '2026-11-16', createdAt: 1, updatedAt: 1 })
    await syncAccountData()
    const stored = await serverDb.binding.prepare('SELECT record_json FROM sync_records WHERE account_id = ? AND collection = ?')
      .bind(TEST_ACCOUNT_ID, 'profile').first<{ record_json: string }>()
    expect(stored?.record_json).not.toMatch(/do-not-upload/)

    vi.stubGlobal('indexedDB', new IDBFactory())
    resetDbSingleton(); setActiveAccountId(TEST_ACCOUNT_ID)
    await syncAccountData()
    const restored = await openDatabase()
    expect(await restored.get('transactions', 'tx-one')).toMatchObject({ amount: 42000 })
    expect(await restored.get('profile', 'profile')).toMatchObject({ name: 'Arju', pinHash: '', pinSalt: '' })
  })

  it('keeps simultaneous local edits visible and offers an explicit cloud resolution', async () => {
    const local = await openDatabase()
    await local.put('transactions', { id: 'tx-conflict', type: 'income', amount: 1000, date: '2026-11-16', createdAt: 1, updatedAt: 1 })
    await syncAccountData()

    await worker.fetch(new Request(`${origin}/api/sync`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [{ opId: 'remote-edit', collection: 'transactions', id: 'tx-conflict', baseRevision: 1,
        record: { id: 'tx-conflict', type: 'income', amount: 2000, date: '2026-11-16', createdAt: 1, updatedAt: 2 } }] }) }), env)
    await local.put('transactions', { id: 'tx-conflict', type: 'income', amount: 3000, date: '2026-11-16', createdAt: 1, updatedAt: 3 })
    await syncAccountData()
    expect(await local.get('transactions', 'tx-conflict')).toMatchObject({ amount: 3000 })
    expect(getSyncStatus().conflicts).toBe(1)
    await resolveSyncConflict('transactions', 'tx-conflict', 'cloud')
    expect(await local.get('transactions', 'tx-conflict')).toMatchObject({ amount: 2000 })
    expect(getSyncStatus().conflicts).toBe(0)
  })

  it('retains unsent local changes when the network is unavailable', async () => {
    const local = await openDatabase()
    await local.put('transactions', { id: 'tx-offline', type: 'income', amount: 1500, date: '2026-11-16', createdAt: 1, updatedAt: 1 })
    fetcher.mockRejectedValue(new TypeError('offline'))
    await expect(syncAccountData()).rejects.toThrow()
    expect(await local.get('transactions', 'tx-offline')).toBeDefined()
  })
})
