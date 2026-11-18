// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createWorker, type Env } from '../../server/index'

const origin = 'https://monee.example'
const domain = 'https://monee-test.cloudflareaccess.com'
const audience = 'a'.repeat(64)
const rate = vi.fn(async () => ({ success: true }))
const assets = { fetch: async () => new Response('app') }
let sqlite: DatabaseSync
let keys: Awaited<ReturnType<typeof generateKeyPair>>
let jwks: object
let now = 1_800_000_000_000

async function token(subject = 'person-one', email = `${subject}@example.com`) {
  return new SignJWT({ sub: subject, email })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(domain).setAudience(audience)
    .setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(now / 1000) + 300).sign(keys.privateKey)
}

async function request(path: string, options: { method?: string; subject?: string; cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const method = options.method ?? 'GET'
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      ...(options.subject ? { 'Cf-Access-Jwt-Assertion': await token(options.subject) } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify(options.body ?? {}) }),
  })
}

const db = {
  prepare(sql: string) {
    let values: unknown[] = []
    const statement = {
      bind(...bound: unknown[]) { values = bound; return statement },
      first<T>() { return sqlite.prepare(sql).get(...values as never[]) as T | undefined },
      all<T>() { return { results: sqlite.prepare(sql).all(...values as never[]) as T[] } },
      run() { return { meta: sqlite.prepare(sql).run(...values as never[]) } },
    }
    return statement
  },
  async batch(statements: ReturnType<typeof db.prepare>[]) {
    sqlite.exec('BEGIN')
    try {
      const result = statements.map(statement => statement.run())
      sqlite.exec('COMMIT')
      return result
    } catch (error) { sqlite.exec('ROLLBACK'); throw error }
  },
  async exec(sql: string) { sqlite.exec(sql); return { count: 0, duration: 0 } },
} as unknown as NonNullable<Env['DB']>
let worker: ReturnType<typeof createWorker>
let env: Env

beforeAll(async () => {
  keys = await generateKeyPair('RS256', { extractable: true })
  jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256', use: 'sig' }] }
  sqlite = new DatabaseSync(':memory:')
  const schema = await readFile('migrations/0001_accounts.sql', 'utf8')
  await db.exec(schema)
  const fetcher: typeof fetch = async input => String(input) === `${domain}/cdn-cgi/access/certs`
    ? Response.json(jwks) : fetch(input)
  worker = createWorker(fetcher)
  env = { ASSETS: assets, DB: db, ACCESS_TEAM_DOMAIN: domain, ACCESS_AUD: audience,
    AUTH_RATE_LIMIT: { limit: rate } }
})

beforeEach(async () => {
  now = 1_800_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.clearAllMocks()
  rate.mockResolvedValue({ success: true })
  await db.exec('DELETE FROM monee_sessions; DELETE FROM account_identities; DELETE FROM sync_records; DELETE FROM sync_operations; DELETE FROM accounts;')
})

afterAll(() => sqlite?.close())

describe('Monee account sessions', () => {
  it('creates an account session from a verified Access identity without exposing the email', async () => {
    const response = await worker.fetch(await request('/auth/bootstrap', { method: 'GET', subject: 'person-one' }), env)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^__Host-monee_session=/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/SameSite=Strict/)
    expect(cookie).not.toContain('person-one@example.com')
    const session = await worker.fetch(await request('/api/session', { cookie: cookie.split(';')[0] }), env)
    expect(session.status).toBe(200)
    const sessionBody = await session.text()
    expect(JSON.parse(sessionBody)).toMatchObject({ authenticated: true, accountId: expect.any(String) })
    expect(sessionBody).not.toContain('person-one@example.com')
  })

  it('rejects missing or forged Access identity and does not create account rows', async () => {
    for (const assertion of [undefined, 'forged']) {
      const response = await worker.fetch(new Request(`${origin}/auth/bootstrap`, {
        headers: assertion ? { 'Cf-Access-Jwt-Assertion': assertion } : {},
      }), env)
      expect(response.status).toBe(401)
    }
    expect((await db.prepare('SELECT COUNT(*) AS count FROM accounts').first<{ count: number }>())?.count).toBe(0)
  })

  it('requires a same-origin request for logout and revokes a valid session', async () => {
    const bootstrap = await worker.fetch(await request('/auth/bootstrap', { subject: 'person-one' }), env)
    const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!
    const crossOrigin = await worker.fetch(new Request(`${origin}/api/auth/logout`, {
      method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example' },
    }), env)
    expect(crossOrigin.status).toBe(403)
    const logout = await worker.fetch(await request('/api/auth/logout', { method: 'POST', cookie }), env)
    expect(logout.status).toBe(204)
    expect((await worker.fetch(await request('/api/session', { cookie }), env)).status).toBe(401)
  })

  it('returns account-scoped sync data and never accepts a client supplied account id', async () => {
    const one = await worker.fetch(await request('/auth/bootstrap', { subject: 'person-one' }), env)
    const two = await worker.fetch(await request('/auth/bootstrap', { subject: 'person-two' }), env)
    const cookieOne = one.headers.get('set-cookie')!.split(';')[0]!
    const cookieTwo = two.headers.get('set-cookie')!.split(';')[0]!
    const push = await worker.fetch(await request('/api/sync', { method: 'POST', cookie: cookieOne, body: {
      accountId: 'person-two', changes: [{ opId: 'op-one', collection: 'transactions', id: 'tx-one', baseRevision: 0, record: { id: 'tx-one', type: 'income', amount: 5000, date: '2026-10-24', categoryId: 'cat-gaji', createdAt: 1, updatedAt: 1 } }],
    } }), env)
    expect(push.status).toBe(200)
    const own = await worker.fetch(await request('/api/sync', { cookie: cookieOne }), env)
    const other = await worker.fetch(await request('/api/sync', { cookie: cookieTwo }), env)
    expect(await own.json()).toMatchObject({ changes: [expect.objectContaining({ id: 'tx-one' })] })
    expect(await other.json()).toMatchObject({ changes: [] })
  })

  it('deletes only the signed-in account ledger after same-origin confirmation', async () => {
    const one = await worker.fetch(await request('/auth/bootstrap', { subject: 'person-one' }), env)
    const two = await worker.fetch(await request('/auth/bootstrap', { subject: 'person-two' }), env)
    const cookieOne = one.headers.get('set-cookie')!.split(';')[0]!
    const cookieTwo = two.headers.get('set-cookie')!.split(';')[0]!
    await worker.fetch(await request('/api/sync', { method: 'POST', cookie: cookieOne, body: {
      changes: [{ opId: 'one', collection: 'transactions', id: 'tx-one', baseRevision: 0, record: { id: 'tx-one', type: 'income', amount: 5000, date: '2026-10-24', categoryId: 'cat-gaji', createdAt: 1, updatedAt: 1 } }],
    } }), env)
    await worker.fetch(await request('/api/sync', { method: 'POST', cookie: cookieTwo, body: {
      changes: [{ opId: 'two', collection: 'transactions', id: 'tx-two', baseRevision: 0, record: { id: 'tx-two', type: 'income', amount: 7000, date: '2026-10-24', categoryId: 'cat-gaji', createdAt: 1, updatedAt: 1 } }],
    } }), env)

    const deleted = await worker.fetch(await request('/api/account/data', { method: 'DELETE', cookie: cookieOne,
      headers: { 'X-Monee-Request': 'account-delete' } }), env)
    expect(deleted.status).toBe(204)
    expect(await (await worker.fetch(await request('/api/sync', { cookie: cookieOne }), env)).json()).toMatchObject({
      changes: [expect.objectContaining({ id: 'tx-one', deleted: true })],
    })
    expect(await (await worker.fetch(await request('/api/sync', { cookie: cookieTwo }), env)).json()).toMatchObject({ changes: [expect.objectContaining({ id: 'tx-two' })] })
  })

  it('requires the account deletion intent header and rejects cross-origin deletion', async () => {
    const auth = await worker.fetch(await request('/auth/bootstrap', { subject: 'person-one' }), env)
    const cookie = auth.headers.get('set-cookie')!.split(';')[0]!
    const missingIntent = await worker.fetch(new Request(`${origin}/api/account/data`, {
      method: 'DELETE', headers: { Cookie: cookie, Origin: origin },
    }), env)
    expect(missingIntent.status).toBe(400)
    const crossOrigin = await worker.fetch(new Request(`${origin}/api/account/data`, {
      method: 'DELETE', headers: { Cookie: cookie, Origin: 'https://evil.example', 'X-Monee-Request': 'account-delete' },
    }), env)
    expect(crossOrigin.status).toBe(403)
  })

  it('rejects malformed finance records and private profile fields before writing', async () => {
    const auth = await worker.fetch(await request('/auth/bootstrap', { subject: 'person-one' }), env)
    const cookie = auth.headers.get('set-cookie')!.split(';')[0]!
    for (const change of [
      { opId: 'bad-amount', collection: 'transactions', id: 'tx-bad', baseRevision: 0,
        record: { id: 'tx-bad', type: 'income', amount: '5000', date: '2026-10-24', categoryId: 'cat-gaji', createdAt: 1, updatedAt: 1 } },
      { opId: 'bad-profile', collection: 'profile', id: 'profile', baseRevision: 0,
        record: { id: 'profile', name: 'Ayu', mascotId: 'mochi', periodStartDay: 1, defaultBucketId: 'b', createdAt: 1, pinHash: 'secret' } },
    ]) {
      expect((await worker.fetch(await request('/api/sync', { method: 'POST', cookie, body: { changes: [change] } }), env)).status).toBe(400)
    }
    expect((await worker.fetch(await request('/api/sync', { cookie }), env).then(response => response.json())).changes).toEqual([])
  })

  it('extends an active session but rejects it after 30 days without activity', async () => {
    const bootstrap = await worker.fetch(await request('/auth/bootstrap', { subject: 'person-one' }), env)
    const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!
    now += 29 * 24 * 60 * 60 * 1000
    expect((await worker.fetch(await request('/api/session', { cookie }), env)).status).toBe(200)
    now += 31 * 24 * 60 * 60 * 1000
    expect((await worker.fetch(await request('/api/session', { cookie }), env)).status).toBe(401)
  })
})
