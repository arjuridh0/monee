// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { AccountDatabase, AccountStatement } from '../../server/accounts'

export const TEST_ACCOUNT_ID = `acct_${'c'.repeat(64)}`
export const TEST_SESSION_TOKEN = '0123456789abcdefghijklmnopqrstuvwxyzABCDE'
export const TEST_SESSION_COOKIE = `__Host-monee_session=${TEST_SESSION_TOKEN}`

export async function createTestDatabase(): Promise<{ binding: AccountDatabase; close: () => void; reset: () => void }> {
  const sqlite = new DatabaseSync(':memory:')
  for (const migration of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(await readFile(`migrations/${migration}`, 'utf8'))
  const binding = {
    prepare(sql: string) {
      let values: unknown[] = []
      const statement: AccountStatement = {
        bind(...bound: unknown[]) { values = bound; return statement },
        async first<T>() { return sqlite.prepare(sql).get(...values as never[]) as T | undefined ?? null },
        async all<T>() { return { results: sqlite.prepare(sql).all(...values as never[]) as T[] } },
        async run() { return { meta: sqlite.prepare(sql).run(...values as never[]) as { changes?: number } } },
      }
      return statement
    },
    async batch(statements: AccountStatement[]) {
      sqlite.exec('BEGIN')
      try {
        const result = []
        for (const statement of statements) result.push(await statement.run())
        sqlite.exec('COMMIT')
        return result
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  } satisfies AccountDatabase
  return {
    binding,
    close: () => sqlite.close(),
    reset: () => sqlite.exec('DELETE FROM auth_verifications; DELETE FROM auth_attempts; DELETE FROM account_credentials; DELETE FROM monee_sessions; DELETE FROM account_identities; DELETE FROM sync_records; DELETE FROM sync_operations; DELETE FROM accounts;'),
  }
}

export async function seedTestSession(binding: AccountDatabase, accountId = TEST_ACCOUNT_ID, rawToken = TEST_SESSION_TOKEN) {
  const now = Date.now()
  const hash = createHash('sha256').update(rawToken).digest('hex')
  await binding.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').bind(accountId, now).run()
  await binding.prepare('INSERT INTO monee_sessions (session_hash, account_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(hash, accountId, now, now, now + 60 * 24 * 60 * 60 * 1000).run()
  return `__Host-monee_session=${rawToken}`
}
