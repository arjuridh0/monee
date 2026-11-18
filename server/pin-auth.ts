import { ApiError, type AccountEnv } from './accounts'

const SESSION = '__Host-monee_session', VERIFY = '__Host-monee_verify'
const DAYS30 = 30 * 86400_000, WINDOW = 15 * 60_000, ITERATIONS = 100_000
const encoder = new TextEncoder()
interface Verification { intent: string; account_id: string | null; email: string | null; verified: number; consumed: number; created_at: number; expires_at: number }
interface Credential { account_id: string; email: string; pin_hash: string; salt: string; iterations: number }
interface Dependencies {
  identity(request: Request, env: AccountEnv): Promise<{ identityHash: string; email: string; issuedAt: number }>
  session(request: Request, env: AccountEnv): Promise<{ accountId: string; token: string; setCookie: string }>
}
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
export const digestToken = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('')
function readCookie(request: Request, name: string) {
  const header = request.headers.get('Cookie') ?? ''
  if (header.length > 4096) return ''
  const value = header.split(';').find(item => item.trim().startsWith(`${name}=`))?.trim().slice(name.length + 1) ?? ''
  return /^[a-f0-9]{64}$/.test(value) ? value : ''
}
const verificationCookie = (token: string, age = 600) => `${VERIFY}=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`
const sessionCookie = (token: string) => `${SESSION}=${token}; Path=/; Max-Age=${DAYS30 / 1000}; HttpOnly; Secure; SameSite=Strict`
function reply(body: object, status = 200, cookie?: string) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer',
    ...(cookie ? { 'Set-Cookie': cookie } : {}), ...(status === 429 ? { 'Retry-After': '900' } : {}) } })
}
function sameOrigin(request: Request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new ApiError(403, 'Permintaan harus berasal dari Monee.')
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') ?? '')) throw new ApiError(400, 'Format permintaan tidak valid.')
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'Data belum diterima.')
  let text = '', size = 0
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break
      size += next.value.byteLength
      if (size > 2048) { await reader.cancel(); throw new ApiError(413, 'Permintaan terlalu besar.') }
      text += decoder.decode(next.value, { stream: true })
    }
    text += decoder.decode()
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed as Record<string, unknown>
  } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'Format permintaan tidak valid.') }
  finally { reader.releaseLock() }
}
function setup(env: AccountEnv) {
  if (!env.DB || !env.AUTH_PIN_PEPPER || env.AUTH_PIN_PEPPER.length < 32 || !env.AUTH_RATE_LIMIT) throw new ApiError(503, 'Login PIN belum disiapkan oleh pengelola.')
  return { db: env.DB, pepper: env.AUTH_PIN_PEPPER }
}
async function hashPin(pin: string, salt: string, pepper: string, iterations = ITERATIONS) {
  const hmac = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const material = await crypto.subtle.sign('HMAC', hmac, encoder.encode(pin))
  const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits'])
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' }, key, 256))
}
function constantEqual(a: string, b: string) { let difference = a.length ^ b.length; for (let i = 0; i < 64; i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return difference === 0 }
const validPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{6}$/.test(pin)
const normalizeEmail = (email: unknown) => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.trim().toLowerCase() : ''

export function createPinAuth(deps: Dependencies) {
  async function limit(request: Request, env: AccountEnv) {
    const { db } = setup(env)
    const scope = `ip:${await digestToken(request.headers.get('CF-Connecting-IP') ?? 'unknown')}`
    const now = Date.now()
    await db.prepare('INSERT INTO auth_attempts(scope, failures, window_at, blocked_until) VALUES (?, 1, ?, 0) ON CONFLICT(scope) DO UPDATE SET failures = CASE WHEN window_at < ? THEN 1 ELSE failures + 1 END, window_at = CASE WHEN window_at < ? THEN excluded.window_at ELSE window_at END')
      .bind(scope, now, now - WINDOW, now - WINDOW).run()
    const attempts = await db.prepare('SELECT failures FROM auth_attempts WHERE scope = ?').bind(scope).first<{ failures: number }>()
    if ((attempts?.failures ?? 0) > 60 || !(await env.AUTH_RATE_LIMIT!.limit({ key: scope })).success) throw new ApiError(429, 'Terlalu banyak percobaan. Coba lagi nanti.')
  }
  async function issue(env: AccountEnv, accountId: string, expectedHash: string) {
    const { db } = setup(env), token = random(), now = Date.now()
    const result = await db.prepare('INSERT INTO monee_sessions(session_hash, account_id, created_at, last_seen_at, expires_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS(SELECT 1 FROM account_credentials WHERE account_id = ? AND pin_hash = ?)')
      .bind(await digestToken(token), accountId, now, now, now + DAYS30, accountId, expectedHash).run()
    if (!result.meta.changes) throw new ApiError(401, 'PIN akun telah berubah. Masuk kembali.')
    return reply({ authenticated: true, accountId, pinSetupRequired: false, pinAuth: true }, 200, sessionCookie(token))
  }
  async function verification(request: Request, env: AccountEnv) {
    const token = readCookie(request, VERIFY)
    const { db } = setup(env)
    const hash = await digestToken(token)
    const row = token ? await db.prepare('SELECT * FROM auth_verifications WHERE token_hash = ?').bind(hash).first<Verification>() : null
    if (!row || row.consumed || row.expires_at <= Date.now()) throw new ApiError(401, 'Verifikasi berakhir. Verifikasi email lagi.')
    return { row, hash }
  }
  async function callback(request: Request, env: AccountEnv) {
    const { db } = setup(env), { row, hash } = await verification(request, env)
    const identity = await deps.identity(request, env)
    // Reuse a recently verified Access session only; stale assertions require reauthentication.
    if (identity.issuedAt < Date.now() - 15 * 60_000 || identity.issuedAt > Date.now() + 60_000) throw new ApiError(401, 'Verifikasi email perlu diperbarui. Keluar dari sesi verifikasi dan coba lagi.')
    const email = normalizeEmail(identity.email)
    if (!email) throw new ApiError(401, 'Identitas email tidak valid.')
    const mapped = await db.prepare('SELECT account_id FROM account_identities WHERE identity_hash = ?').bind(identity.identityHash).first<{ account_id: string }>()
    const credential = await db.prepare('SELECT account_id FROM account_credentials WHERE email = ?').bind(email).first<{ account_id: string }>()
    if (mapped && credential && mapped.account_id !== credential.account_id) throw new ApiError(409, 'Identitas akun perlu ditinjau pengelola.')
    let accountId = mapped?.account_id ?? credential?.account_id
    if (row.account_id && row.account_id !== accountId) throw new ApiError(403, 'Verifikasi harus memakai email akun yang sedang dibuka.')
    if (row.intent === 'recover' && !credential) throw new ApiError(400, 'Akun belum diaktifkan. Pilih buat atau aktifkan akun.')
    if (!accountId) {
      accountId = `acct_${identity.identityHash}`
      await db.batch([
        db.prepare('INSERT INTO accounts(id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING').bind(accountId, Date.now()),
        db.prepare('INSERT INTO account_identities(identity_hash, account_id, created_at) VALUES (?, ?, ?) ON CONFLICT(identity_hash) DO NOTHING').bind(identity.identityHash, accountId, Date.now()),
      ])
    }
    await db.prepare('UPDATE auth_verifications SET account_id = ?, email = ?, verified = 1 WHERE token_hash = ? AND consumed = 0 AND expires_at > ?')
      .bind(accountId, email, hash, Date.now()).run()
    return new Response(null, { status: 302, headers: { Location: '/?account=verified', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
  }
  async function handle(request: Request, env: AccountEnv): Promise<Response | null> {
    const path = new URL(request.url).pathname
    if (!['/api/auth/login', '/api/auth/verify', '/api/auth/verification', '/api/auth/complete', '/api/auth/change-pin', '/api/session/activity'].includes(path)) return null
    try {
      if (request.method !== (path === '/api/auth/verification' ? 'GET' : 'POST')) return reply({ error: 'Metode tidak didukung.' }, 405)
      const { db, pepper } = setup(env)
      if (request.method === 'POST') { sameOrigin(request); await limit(request, env) }
      if (path === '/api/auth/verification') {
        const { row } = await verification(request, env)
        return reply({ verified: row.verified === 1, intent: row.intent, ...(row.verified ? { email: row.email } : {}) })
      }
      if (path === '/api/session/activity') {
        const active = await deps.session(request, env), now = Date.now()
        await db.prepare('UPDATE monee_sessions SET last_seen_at = ?, expires_at = ? WHERE session_hash = ? AND expires_at > ?')
          .bind(now, now + DAYS30, await digestToken(active.token), now).run()
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie(active.token) } })
      }
      const input = await body(request)
      if (path === '/api/auth/verify') {
        if (!['register', 'recover', 'activate'].includes(String(input.intent))) throw new ApiError(400, 'Tujuan verifikasi tidak valid.')
        let accountId: string | null = null
        if (input.intent === 'activate') accountId = (await deps.session(request, env)).accountId
        const token = random(), now = Date.now()
        await db.prepare('DELETE FROM auth_verifications WHERE expires_at <= ?').bind(now).run()
        await db.prepare('INSERT INTO auth_verifications(token_hash, intent, account_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
          .bind(await digestToken(token), input.intent, accountId, now, now + 600_000).run()
        return reply({ url: '/auth/bootstrap' }, 200, verificationCookie(token))
      }
      if (path === '/api/auth/complete') {
        const { row, hash } = await verification(request, env)
        if (!row.verified || !row.account_id || !row.email) throw new ApiError(401, 'Verifikasi email terlebih dahulu.')
        if (!validPin(input.pin) || input.pin !== input.confirmPin) throw new ApiError(400, 'PIN harus 6 digit dan konfirmasi harus sama.')
        const existing = await db.prepare('SELECT account_id FROM account_credentials WHERE account_id = ?').bind(row.account_id).first()
        if (existing && row.intent !== 'recover') throw new ApiError(409, 'Akun sudah memiliki PIN. Gunakan masuk atau lupa PIN.')
        const salt = random(), pinHash = await hashPin(input.pin, salt, pepper)
        // Each following statement is conditional on the proof being claimed in this atomic batch.
        const claimed = random()
        const result = await db.batch([
          db.prepare('UPDATE auth_verifications SET consumed = 1, email = ? WHERE token_hash = ? AND consumed = 0 AND verified = 1 AND expires_at > ?').bind(claimed, hash, Date.now()),
          db.prepare('INSERT INTO account_credentials(account_id, email, pin_hash, salt, iterations, updated_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS(SELECT 1 FROM auth_verifications WHERE token_hash = ? AND email = ?) ON CONFLICT(account_id) DO UPDATE SET email = excluded.email, pin_hash = excluded.pin_hash, salt = excluded.salt, iterations = excluded.iterations, updated_at = excluded.updated_at')
            .bind(row.account_id, row.email, pinHash, salt, ITERATIONS, Date.now(), hash, claimed),
          db.prepare('DELETE FROM monee_sessions WHERE account_id = ? AND EXISTS(SELECT 1 FROM auth_verifications WHERE token_hash = ? AND email = ?)').bind(row.account_id, hash, claimed),
          db.prepare('DELETE FROM auth_attempts WHERE scope = ? AND EXISTS(SELECT 1 FROM auth_verifications WHERE token_hash = ? AND email = ?)').bind(`email:${await digestToken(row.email)}`, hash, claimed),
          db.prepare('DELETE FROM auth_verifications WHERE account_id = ? AND token_hash <> ? AND EXISTS(SELECT 1 FROM auth_verifications WHERE token_hash = ? AND email = ?)').bind(row.account_id, hash, hash, claimed),
        ])
        if (!result[0]?.meta.changes) throw new ApiError(401, 'Verifikasi sudah digunakan. Verifikasi ulang.')
        const response = await issue(env, row.account_id, pinHash)
        response.headers.append('Set-Cookie', verificationCookie('', 0))
        return response
      }
      if (path === '/api/auth/change-pin') {
        const active = await deps.session(request, env)
        const credential = await db.prepare('SELECT * FROM account_credentials WHERE account_id = ?').bind(active.accountId).first<Credential>()
        if (!credential) throw new ApiError(401, 'Aktifkan PIN akun terlebih dahulu.')
        const matched = await checkPin(credential.email, input.currentPin, env)
        if (!validPin(input.pin) || input.pin !== input.confirmPin) throw new ApiError(400, 'PIN harus 6 digit dan konfirmasi harus sama.')
        const salt = random(), pinHash = await hashPin(input.pin, salt, pepper)
        const updated = await db.batch([
          db.prepare('UPDATE account_credentials SET pin_hash = ?, salt = ?, iterations = ?, updated_at = ? WHERE account_id = ? AND pin_hash = ? AND EXISTS(SELECT 1 FROM monee_sessions WHERE session_hash = ? AND expires_at > ?)')
            .bind(pinHash, salt, ITERATIONS, Date.now(), active.accountId, matched.pin_hash, await digestToken(active.token), Date.now()),
          db.prepare('DELETE FROM monee_sessions WHERE account_id = ? AND EXISTS(SELECT 1 FROM account_credentials WHERE account_id = ? AND pin_hash = ?)').bind(active.accountId, active.accountId, pinHash),
        ])
        if (!updated[0]?.meta.changes) throw new ApiError(401, 'PIN atau sesi akun berubah. Masuk kembali.')
        return issue(env, active.accountId, pinHash)
      }
      const email = normalizeEmail(input.email)
      if (!email || !validPin(input.pin)) throw new ApiError(401, 'Email atau PIN tidak cocok.')
      const credential = await checkPin(email, input.pin, env)
      return issue(env, credential.account_id, credential.pin_hash)
    } catch (error) { return reply({ error: error instanceof ApiError ? error.message : 'Layanan akun sedang tidak tersedia.' }, error instanceof ApiError ? error.status : 503) }
  }
  async function checkPin(email: string, pin: unknown, env: AccountEnv): Promise<Credential> {
    const { db, pepper } = setup(env), now = Date.now(), scope = `email:${await digestToken(email)}`
    const prior = await db.prepare('SELECT blocked_until FROM auth_attempts WHERE scope = ?').bind(scope).first<{ blocked_until: number }>()
    if (prior && prior.blocked_until > now) throw new ApiError(429, 'Terlalu banyak percobaan. Tunggu 15 menit atau pulihkan PIN.')
    // Reserve an attempt atomically before hashing, so parallel requests cannot bypass the limit.
    await db.prepare('INSERT INTO auth_attempts(scope, failures, window_at, blocked_until) VALUES (?, 1, ?, 0) ON CONFLICT(scope) DO UPDATE SET failures = CASE WHEN window_at < ? THEN 1 ELSE failures + 1 END, window_at = CASE WHEN window_at < ? THEN excluded.window_at ELSE window_at END')
      .bind(scope, now, now - WINDOW, now - WINDOW).run()
    const attempt = await db.prepare('SELECT failures FROM auth_attempts WHERE scope = ?').bind(scope).first<{ failures: number }>()
    if ((attempt?.failures ?? 0) > 5) throw new ApiError(429, 'Terlalu banyak percobaan. Tunggu 15 menit atau pulihkan PIN.')
    const credential = await db.prepare('SELECT * FROM account_credentials WHERE email = ?').bind(email).first<Credential>()
    const hash = await hashPin(validPin(pin) ? pin : 'invalid', credential?.salt ?? '0'.repeat(64), pepper, credential?.iterations ?? ITERATIONS)
    if (!credential || !validPin(pin) || !constantEqual(hash, credential.pin_hash)) {
      if ((attempt?.failures ?? 0) >= 5) await db.prepare('UPDATE auth_attempts SET blocked_until = ? WHERE scope = ?').bind(now + WINDOW, scope).run()
      throw new ApiError(401, 'Email atau PIN tidak cocok.')
    }
    await db.prepare('DELETE FROM auth_attempts WHERE scope = ?').bind(scope).run()
    return credential
  }
  return { handle, callback }
}
