import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import { createPinAuth } from './pin-auth'

export interface AccountStatement {
  bind(...values: unknown[]): AccountStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { changes?: number } }>
}

export interface AccountDatabase {
  prepare(sql: string): AccountStatement
  batch(statements: AccountStatement[]): Promise<Array<{ meta: { changes?: number } }>>
}

export interface AccountEnv {
  AUTH_PIN_PEPPER?: string
  DB?: AccountDatabase
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  AUTH_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> }
}

interface Identity { issuer: string; subject: string }
interface Session { account_id: string; expires_at: number; last_seen_at: number }
interface ChangeInput { opId: string; collection: string; id: string; baseRevision: number; record?: Record<string, unknown>; deleted?: boolean }

const COOKIE = '__Host-monee_session'
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const TOUCH_MS = 60 * 60 * 1000
const MAX_BODY = 256 * 1024
const MAX_RECORD = 48 * 1024
const MAX_CHANGES = 80
const COLLECTIONS = new Set(['profile', 'buckets', 'categories', 'transactions', 'recurringIncomes', 'goals', 'monthSweeps'])
const PRIVATE_PROFILE_FIELDS = new Set(['pinHash', 'pinSalt', 'email', 'accountId', 'userId'])
const RECORD_FIELDS: Record<string, Set<string>> = {
  profile: new Set(['id', 'name', 'mascotId', 'periodStartDay', 'periodChanges', 'defaultBucketId', 'createdAt', 'currency']),
  buckets: new Set(['id', 'name', 'allocPercent', 'icon', 'color', 'sortOrder', 'allowOverbudget', 'isSavings']),
  categories: new Set(['id', 'name', 'icon', 'color', 'type', 'isDefault']),
  transactions: new Set(['id', 'type', 'amount', 'date', 'note', 'categoryId', 'bucketId', 'savingsSource', 'refundedAmount', 'deleted', 'recurringId', 'createdAt', 'updatedAt']),
  recurringIncomes: new Set(['id', 'name', 'amount', 'dayOfMonth', 'categoryId', 'isActive', 'createdAt']),
  goals: new Set(['id', 'name', 'targetAmount', 'sortOrder', 'icon', 'usedAt', 'createdAt']),
  monthSweeps: new Set(['id', 'periodKey', 'amount', 'perBucketDetail', 'sweptAt']),
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function json(body: object, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
  responseHeaders.set('Cache-Control', 'no-store')
  responseHeaders.set('X-Content-Type-Options', 'nosniff')
  responseHeaders.set('Referrer-Policy', 'no-referrer')
  responseHeaders.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

function config(env: AccountEnv) {
  if (env.AUTH_PIN_PEPPER && env.AUTH_PIN_PEPPER.length < 32) throw new ApiError(503, 'Login PIN belum disiapkan oleh pengelola.')
  const team = env.ACCESS_TEAM_DOMAIN?.trim()
  const audience = env.ACCESS_AUD?.trim()
  if (!env.AUTH_PIN_PEPPER && (!team || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\/?$/i.test(team)
    || !audience || !/^[a-f0-9]{64}$/i.test(audience))) throw new ApiError(503, 'Layanan akun belum disiapkan.')
  if (!env.DB) throw new ApiError(503, 'Penyimpanan akun belum disiapkan.')
  return { issuer: team?.replace(/\/$/, '') ?? '', audience, db: env.DB }
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function encodeCursor(value: { updatedAt: number; collection: string; id: string }): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)))
}

function decodeCursor(value: string | null): { updatedAt: number; collection: string; id: string } {
  if (!value) return { updatedAt: 0, collection: '', id: '' }
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const raw = JSON.parse(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))) as Record<string, unknown>
    if (!Number.isSafeInteger(raw.updatedAt) || typeof raw.collection !== 'string' || typeof raw.id !== 'string') throw new Error()
    return { updatedAt: raw.updatedAt as number, collection: raw.collection, id: raw.id }
  } catch { throw new ApiError(400, 'Penanda sinkronisasi tidak valid.') }
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function cookie(token: string, maxAge = 30 * 24 * 60 * 60): string {
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
}

function readCookie(request: Request): string | undefined {
  const header = request.headers.get('Cookie')
  if (!header || header.length > 4096) return undefined
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === COOKIE) {
      const token = value.join('=')
      return /^[A-Za-z0-9_-]{40,64}$/.test(token) ? token : undefined
    }
  }
  return undefined
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('Origin')
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    throw new ApiError(403, 'Permintaan harus berasal dari Monee.')
  }
}

async function boundedBody(request: Request): Promise<unknown> {
  const declared = request.headers.get('Content-Length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) throw new ApiError(413, 'Data yang dikirim terlalu besar.')
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'Data permintaan belum diterima.')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY) { await reader.cancel(); throw new ApiError(413, 'Data yang dikirim terlalu besar.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)) }
  catch { throw new ApiError(400, 'Format data tidak valid.') }
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)
}

function safeInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validRecord(collection: string, record: Record<string, unknown>): boolean {
  const fields = RECORD_FIELDS[collection]
  if (!fields || Object.keys(record).some(key => !fields.has(key))) return false
  const validId = boundedString(record.id, 160)
  if (!validId) return false
  const validColor = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
  const validName = (value: unknown) => boundedString(value, 120)
  const validTimestamp = (value: unknown) => safeInteger(value, 0, 8_640_000_000_000_000)

  switch (collection) {
    case 'profile':
      return record.id === 'profile' && validName(record.name) && record.name.length <= 40
        && ['mochi', 'luna', 'bumi'].includes(String(record.mascotId))
        && safeInteger(record.periodStartDay, 1, 28) && boundedString(record.defaultBucketId, 160)
        && validTimestamp(record.createdAt)
        && (record.periodChanges === undefined || (Array.isArray(record.periodChanges) && record.periodChanges.length <= 120
          && record.periodChanges.every(item => item && typeof item === 'object' && !Array.isArray(item)
            && validDate((item as Record<string, unknown>).effectiveFrom)
            && safeInteger((item as Record<string, unknown>).startDay, 1, 28))))
        && (record.currency === undefined || (record.currency !== null && typeof record.currency === 'object' && !Array.isArray(record.currency)
          && (record.currency as Record<string, unknown>).code === 'IDR'
          && boundedString((record.currency as Record<string, unknown>).format, 24)))
    case 'buckets':
      return validName(record.name) && record.name.length <= 32 && typeof record.allocPercent === 'number'
        && Number.isFinite(record.allocPercent) && record.allocPercent >= 0 && record.allocPercent <= 100
        && boundedString(record.icon, 64) && validColor(record.color) && safeInteger(record.sortOrder, 0, 100_000)
        && typeof record.allowOverbudget === 'boolean' && typeof record.isSavings === 'boolean'
    case 'categories':
      return validName(record.name) && record.name.length <= 64 && boundedString(record.icon, 64)
        && validColor(record.color) && ['income', 'expense'].includes(String(record.type)) && typeof record.isDefault === 'boolean'
    case 'transactions':
      return ['income', 'expense', 'savings_deposit', 'savings_expense'].includes(String(record.type))
        && safeInteger(record.amount, 1) && validDate(record.date) && validTimestamp(record.createdAt)
        && validTimestamp(record.updatedAt) && (record.note === undefined || typeof record.note === 'string' && record.note.length <= 500)
        && (record.categoryId === undefined || boundedString(record.categoryId, 160))
        && (record.bucketId === undefined || boundedString(record.bucketId, 160))
        && (record.recurringId === undefined || boundedString(record.recurringId, 160))
        && (record.refundedAmount === undefined || safeInteger(record.refundedAmount, 0))
        && (record.deleted === undefined || typeof record.deleted === 'boolean')
        && (record.savingsSource === undefined || ['sisa', 'allocation'].includes(String(record.savingsSource)))
    case 'recurringIncomes':
      return validName(record.name) && record.name.length <= 64 && safeInteger(record.amount, 1)
        && safeInteger(record.dayOfMonth, 1, 28) && boundedString(record.categoryId, 160)
        && typeof record.isActive === 'boolean' && validTimestamp(record.createdAt)
    case 'goals':
      return validName(record.name) && record.name.length <= 80 && safeInteger(record.targetAmount, 1)
        && safeInteger(record.sortOrder, 0, 100_000) && validTimestamp(record.createdAt)
        && (record.icon === undefined || boundedString(record.icon, 64))
        && (record.usedAt === undefined || validTimestamp(record.usedAt))
    case 'monthSweeps':
      return typeof record.periodKey === 'string' && /^\d{4}-\d{2}$/.test(record.periodKey)
        && safeInteger(record.amount, 0) && validTimestamp(record.sweptAt)
        && Array.isArray(record.perBucketDetail) && record.perBucketDetail.length <= 200
        && record.perBucketDetail.every(item => item && typeof item === 'object' && !Array.isArray(item)
          && boundedString((item as Record<string, unknown>).bucketId, 160)
          && safeInteger((item as Record<string, unknown>).jatah, 0)
          && safeInteger((item as Record<string, unknown>).terpakai, 0)
          && safeInteger((item as Record<string, unknown>).sisa, -Number.MAX_SAFE_INTEGER))
    default: return false
  }
}

function validChange(value: unknown): value is ChangeInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const change = value as Record<string, unknown>
  if (typeof change.opId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(change.opId)) return false
  if (typeof change.collection !== 'string' || !COLLECTIONS.has(change.collection)) return false
  if (typeof change.id !== 'string' || change.id.length < 1 || change.id.length > 160) return false
  if (!Number.isSafeInteger(change.baseRevision) || (change.baseRevision as number) < 0) return false
  if (change.deleted === true) return change.record === undefined
  if (!change.record || typeof change.record !== 'object' || Array.isArray(change.record)) return false
  const record = change.record as Record<string, unknown>
  if (record.id !== change.id || !validRecord(change.collection, record)) return false
  if (change.collection === 'profile' && Object.keys(record).some(key => PRIVATE_PROFILE_FIELDS.has(key))) return false
  try { return JSON.stringify(record).length <= MAX_RECORD }
  catch { return false }
}

export function createAccountApi(fetcher: typeof fetch = fetch) {
  const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

  async function identity(request: Request, env: AccountEnv): Promise<{ identity: Identity; identityHash: string; email: string; issuedAt: number }> {
    const { issuer, audience } = config(env)
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(issuer) || !audience || !/^[a-f0-9]{64}$/i.test(audience)) throw new ApiError(503, 'Verifikasi email belum disiapkan.')
    const assertion = request.headers.get('Cf-Access-Jwt-Assertion')
    if (!assertion || assertion.length > 16_384) throw new ApiError(401, 'Sesi masuk diperlukan.')
    try {
      let jwks = keySets.get(issuer)
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), { [customFetch]: fetcher, timeoutDuration: 5000 })
        keySets.set(issuer, jwks)
      }
      const { payload } = await jwtVerify(assertion, jwks, {
        issuer, audience, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub'],
      })
      if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256
        || typeof payload.email !== 'string' || payload.email.length > 320) throw new Error('invalid identity')
      const normalized = { issuer, subject: payload.sub }
      const identityHash = await digest(`${issuer}\n${payload.sub}`)
      return { identity: normalized, identityHash, email: payload.email, issuedAt: Number(payload.iat) * 1000 }
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(401, 'Sesi masuk tidak valid. Silakan masuk kembali.')
    }
  }

  async function bootstrap(request: Request, env: AccountEnv): Promise<Response> {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } })
    const { db } = config(env)
    const { identityHash } = await identity(request, env)
    if (!env.AUTH_RATE_LIMIT) throw new ApiError(503, 'Layanan akun belum disiapkan.')
    const rate = await env.AUTH_RATE_LIMIT.limit({ key: identityHash })
    if (!rate.success) return json({ error: 'Terlalu banyak percobaan masuk. Coba lagi nanti.' }, 429, { 'Retry-After': '60' })
    const accountId = `acct_${identityHash}`
    const now = Date.now()
    await db.batch([
      db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING').bind(accountId, now),
      db.prepare('INSERT INTO account_identities (identity_hash, account_id, created_at) VALUES (?, ?, ?) ON CONFLICT(identity_hash) DO NOTHING').bind(identityHash, accountId, now),
    ])
    const identityRow = await db.prepare('SELECT account_id FROM account_identities WHERE identity_hash = ?').bind(identityHash).first<{ account_id: string }>()
    if (!identityRow) throw new ApiError(503, 'Akun belum dapat disiapkan. Coba lagi.')
    const random = crypto.getRandomValues(new Uint8Array(32))
    const rawSession = base64url(random)
    const sessionHash = await digest(rawSession)
    await db.prepare('INSERT INTO monee_sessions (session_hash, account_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(sessionHash, identityRow.account_id, now, now, now + SESSION_MS).run()
    return new Response(null, { status: 302, headers: {
      Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Set-Cookie': cookie(rawSession),
    } })
  }

  async function session(request: Request, env: AccountEnv): Promise<{ accountId: string; token: string; setCookie: string }> {
    const { db } = config(env)
    const token = readCookie(request)
    if (!token) throw new ApiError(401, 'Sesi Monee berakhir. Masuk kembali untuk melanjutkan.')
    const hash = await digest(token)
    const now = Date.now()
    const current = await db.prepare('SELECT account_id, expires_at, last_seen_at FROM monee_sessions WHERE session_hash = ?')
      .bind(hash).first<Session>()
    if (!current || current.expires_at <= now) {
      if (current) await db.prepare('DELETE FROM monee_sessions WHERE session_hash = ?').bind(hash).run()
      throw new ApiError(401, 'Sesi Monee berakhir. Masuk kembali untuk melanjutkan.')
    }
    if (!env.AUTH_PIN_PEPPER && now - current.last_seen_at >= TOUCH_MS) {
      await db.prepare('UPDATE monee_sessions SET last_seen_at = ?, expires_at = ? WHERE session_hash = ? AND expires_at > ?')
        .bind(now, now + SESSION_MS, hash, now).run()
    }
    return { accountId: current.account_id, token, setCookie: cookie(token, Math.max(0, Math.floor((env.AUTH_PIN_PEPPER ? current.expires_at - now : SESSION_MS) / 1000))) }
  }

  async function sync(request: Request, env: AccountEnv): Promise<Response> {
    const active = await session(request, env)
    if (request.method === 'GET') {
      const url = new URL(request.url)
      const cursorToken = url.searchParams.get('cursor')
      const cursor = decodeCursor(cursorToken)
      const { db } = config(env)
      const result = await db.prepare('SELECT collection, record_id AS id, record_json AS record, revision, updated_at AS updatedAt, deleted FROM sync_records WHERE account_id = ? AND (updated_at > ? OR (updated_at = ? AND (collection > ? OR (collection = ? AND record_id > ?)))) ORDER BY updated_at, collection, record_id LIMIT 501')
        .bind(active.accountId, cursor.updatedAt, cursor.updatedAt, cursor.collection, cursor.collection, cursor.id)
        .all<{ collection: string; id: string; record: string; revision: number; updatedAt: number; deleted: number }>()
      const rows = result.results.slice(0, 500).map(row => ({ ...row, record: JSON.parse(row.record), deleted: Boolean(row.deleted) }))
      const last = rows.at(-1)
      const nextCursor = last ? encodeCursor({ updatedAt: last.updatedAt, collection: last.collection, id: last.id }) : cursorToken ?? ''
      return json({ changes: rows, nextCursor, hasMore: result.results.length > 500 }, 200, { 'Set-Cookie': active.setCookie })
    }
    if (request.method !== 'POST') return json({ error: 'Metode tidak didukung.' }, 405, { Allow: 'GET, POST' })
    assertSameOrigin(request)
    const body = await boundedBody(request) as { changes?: unknown }
    if (!body || typeof body !== 'object' || !Array.isArray(body.changes) || body.changes.length > MAX_CHANGES
      || !body.changes.every(validChange)) throw new ApiError(400, 'Perubahan sinkronisasi tidak valid.')
    const { db } = config(env)
    const applied: string[] = []
    const conflicts: Array<{ opId: string; collection: string; id: string; revision: number; record: unknown; deleted: boolean }> = []
    for (const change of body.changes as ChangeInput[]) {
      const prior = await db.prepare('SELECT operation_id FROM sync_operations WHERE account_id = ? AND operation_id = ?')
        .bind(active.accountId, change.opId).first()
      if (prior) { applied.push(change.opId); continue }
      const clock = await db.prepare('SELECT COALESCE(MAX(updated_at), 0) AS latest FROM sync_records WHERE account_id = ?')
        .bind(active.accountId).first<{ latest: number }>()
      const updatedAt = Math.max(Date.now(), (clock?.latest ?? 0) + 1)
      const record = change.record ? JSON.stringify(change.record) : '{}'
      const results = await db.batch([
        db.prepare('INSERT INTO sync_records (account_id, collection, record_id, record_json, revision, updated_at, deleted) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(account_id, collection, record_id) DO UPDATE SET record_json = excluded.record_json, revision = sync_records.revision + 1, updated_at = excluded.updated_at, deleted = excluded.deleted WHERE sync_records.revision = ?')
          .bind(active.accountId, change.collection, change.id, record, updatedAt, change.deleted === true ? 1 : 0, change.baseRevision),
        db.prepare('INSERT INTO sync_operations (account_id, operation_id, collection, record_id, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() = 1 ON CONFLICT(account_id, operation_id) DO NOTHING')
          .bind(active.accountId, change.opId, change.collection, change.id, updatedAt),
      ])
      if ((results[0]?.meta.changes ?? 0) === 1) applied.push(change.opId)
      else {
        const latest = await db.prepare('SELECT record_json AS record, revision, deleted FROM sync_records WHERE account_id = ? AND collection = ? AND record_id = ?')
          .bind(active.accountId, change.collection, change.id).first<{ record: string; revision: number; deleted: number }>()
        conflicts.push({ opId: change.opId, collection: change.collection, id: change.id,
          revision: latest?.revision ?? 0, record: latest ? JSON.parse(latest.record) : null, deleted: Boolean(latest?.deleted) })
      }
    }
    return json({ applied, conflicts }, 200, { 'Set-Cookie': active.setCookie })
  }

  async function deleteAccountData(request: Request, env: AccountEnv): Promise<Response> {
    if (request.method !== 'DELETE') return json({ error: 'Metode tidak didukung.' }, 405, { Allow: 'DELETE' })
    assertSameOrigin(request)
    if (request.headers.get('X-Monee-Request') !== 'account-delete') throw new ApiError(400, 'Konfirmasi penghapusan tidak valid.')
    const active = await session(request, env)
    const { db } = config(env)
    await db.batch([
      db.prepare("UPDATE sync_records SET record_json = '{}', revision = revision + 1, updated_at = MAX(?, (SELECT COALESCE(MAX(updated_at), 0) + 1 FROM sync_records WHERE account_id = ?)), deleted = 1 WHERE account_id = ?")
        .bind(Date.now(), active.accountId, active.accountId),
      db.prepare('DELETE FROM sync_operations WHERE account_id = ?').bind(active.accountId),
    ])
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Set-Cookie': active.setCookie } })
  }

  const pinAuth = createPinAuth({ identity, session })
  async function handle(request: Request, env: AccountEnv): Promise<Response | null> {
    const path = new URL(request.url).pathname
    const pinResponse = await pinAuth.handle(request, env)
    if (pinResponse) return pinResponse
    if (path === '/auth/bootstrap') {
      try {
        if (env.AUTH_PIN_PEPPER) {
          if (request.method !== 'GET') return json({ error: 'Metode tidak didukung.' }, 405, { Allow: 'GET' })
          return await pinAuth.callback(request, env)
        }
        return await bootstrap(request, env)
      }
      catch (error) { return json({ error: error instanceof ApiError ? error.message : 'Layanan akun sedang tidak tersedia.' }, error instanceof ApiError ? error.status : 503) }
    }
    if (path === '/api/session') {
      if (request.method !== 'GET') return json({ error: 'Metode tidak didukung.' }, 405, { Allow: 'GET' })
      try {
        const active = await session(request, env)
        const configured = env.AUTH_PIN_PEPPER ? await config(env).db.prepare('SELECT account_id FROM account_credentials WHERE account_id = ?').bind(active.accountId).first() : null
        return json({ authenticated: true, accountId: active.accountId, ...(env.AUTH_PIN_PEPPER ? { pinAuth: true, pinSetupRequired: !configured } : {}) }, 200, { 'Set-Cookie': active.setCookie })
      } catch (error) { return json({ error: error instanceof ApiError ? error.message : 'Sesi tidak dapat diperiksa.' }, error instanceof ApiError ? error.status : 503) }
    }
    if (path === '/api/auth/logout') {
      if (request.method !== 'POST') return json({ error: 'Metode tidak didukung.' }, 405, { Allow: 'POST' })
      try {
        assertSameOrigin(request)
        const active = await session(request, env)
        const { db } = config(env)
        await db.prepare('DELETE FROM monee_sessions WHERE session_hash = ?').bind(await digest(active.token)).run()
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Set-Cookie': cookie('', 0) } })
      } catch (error) { return json({ error: error instanceof ApiError ? error.message : 'Sesi tidak dapat ditutup.' }, error instanceof ApiError ? error.status : 503) }
    }
    if (path === '/api/sync') {
      try { return await sync(request, env) }
      catch (error) { return json({ error: error instanceof ApiError ? error.message : 'Sinkronisasi sedang tidak tersedia.' }, error instanceof ApiError ? error.status : 503) }
    }
    if (path === '/api/account/data') {
      try { return await deleteAccountData(request, env) }
      catch (error) { return json({ error: error instanceof ApiError ? error.message : 'Data akun belum bisa dihapus.' }, error instanceof ApiError ? error.status : 503) }
    }
    return null
  }

  return {
    handle,
    authenticate: (request: Request, env: AccountEnv) => session(request, env),
  }
}
