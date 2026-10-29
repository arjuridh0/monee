import type { MoneeDB } from '@/core/db/migrations'
import { STORES, type StoreName } from '@/core/db/schema'
import type { Bucket, Category, Goal, MonthSweep, Profile, RecurringIncome, Transaction } from '@/core/finance/types'
import { isValidDateStr, isValidPeriodKey } from '@/core/finance/period'
import { calcSavingsState } from '@/core/finance/savings'
import { hasSafeFinanceTotals } from '@/core/finance/safe-totals'
// Legacy credentials must remain excluded from old backup files.
const VOICE_CREDENTIAL_KEY = 'groq-voice-credential'

const FORMAT = 'monee-backup'
const VERSION = 1
const ITERATIONS = 250_000
const MAX_BACKUP_BYTES = 20 * 1024 * 1024
const STORE_NAMES = Object.values(STORES) as StoreName[]

type BackupStores = Record<StoreName, Record<string, unknown>[]>
type PlainBackup = { format: string; version: number; encrypted: false; exportedAt: string; stores: BackupStores }
type EncryptedBackup = {
  format: string; version: number; encrypted: true; cipher: 'AES-GCM'; kdf: 'PBKDF2-SHA-256'
  iterations: number; salt: string; iv: string; ciphertext: string; exportedAt: string
}

export class BackupError extends Error {
  constructor(readonly code: 'ERR_BACKUP_INVALID' | 'ERR_BACKUP_DECRYPT' | 'ERR_BACKUP_TOO_LARGE', message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

const invalid = (message = 'File backup tidak valid atau tidak didukung.') => new BackupError('ERR_BACKUP_INVALID', message)
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const isNatural = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const isAmount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
const isHex = (value: unknown, length: number) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(value)

function assertRecords(stores: unknown): asserts stores is BackupStores {
  if (!isObject(stores) || Object.keys(stores).length !== STORE_NAMES.length
    || !STORE_NAMES.every(name => Array.isArray(stores[name]))) throw invalid('Isi backup tidak lengkap.')
  const rows = stores as unknown as BackupStores
  for (const storeName of STORE_NAMES) {
    const keys = new Set<string>()
    for (const record of rows[storeName]) {
      if (!isObject(record)) throw invalid('Ada data yang formatnya tidak benar.')
      const key = record[storeName === STORES.settings || storeName === STORES.lockout ? 'key' : 'id']
      if (!isText(key) || keys.has(key)) throw invalid('Ada ID data yang kosong atau ganda.')
      keys.add(key)
    }
  }
  const profiles = rows.profile as unknown as Profile[]
  const categories = rows.categories as unknown as Category[]
  const buckets = rows.buckets as unknown as Bucket[]
  const transactions = rows.transactions as unknown as Transaction[]
  const recurring = rows.recurringIncomes as unknown as RecurringIncome[]
  const goals = rows.goals as unknown as Goal[]
  const sweeps = rows.monthSweeps as unknown as MonthSweep[]
  if (profiles.length !== 1 || profiles[0]!.id !== 'profile' || buckets.length < 2 || buckets.filter(item => item.isSavings === true).length !== 1) throw invalid('Profil atau susunan bucket tidak valid.')
  if (Math.abs(buckets.reduce((sum, item) => sum + (Number.isFinite(item?.allocPercent) ? item.allocPercent : 0), 0) - 100) > 1e-9) throw invalid('Total alokasi bucket harus 100%.')
  if (!categories.length) throw invalid('Backup tidak memiliki kategori.')

  const categoryById = new Map(categories.map(item => [item?.id, item]))
  const bucketById = new Map(buckets.map(item => [item?.id, item]))
  const savingsCategory = categoryById.get('cat-tabungan')
  if (savingsCategory?.type !== 'expense' || savingsCategory.name !== 'Tabungan') throw invalid('Kategori Tabungan pada backup tidak valid.')
  for (const p of profiles) {
    if (!isText(p?.id) || !isText(p.name) || !['mochi', 'luna', 'bumi'].includes(p.mascotId)
      || !Number.isInteger(p.periodStartDay) || p.periodStartDay < 1 || p.periodStartDay > 28
      || !isHex(p.pinHash, 64) || !isHex(p.pinSalt, 32) || !isNatural(p.createdAt)
      || bucketById.get(p.defaultBucketId)?.isSavings !== false
      || (p.currency !== undefined && (!isObject(p.currency) || p.currency.code !== 'IDR'
        || typeof p.currency.format !== 'string' || !['Rp#.###', 'Rp #.###', '#.###'].includes(p.currency.format)))) throw invalid('Profil pada backup tidak valid.')
  }
  const periodChanges = rows.profile[0]!.periodChanges
  if (periodChanges !== undefined) {
    if (!Array.isArray(periodChanges)) throw invalid('Riwayat awal periode tidak valid.')
    let previousDate = ''
    for (const change of periodChanges) {
      if (!isObject(change) || !isValidDateStr(change.effectiveFrom) || change.effectiveFrom <= previousDate
        || !isNatural(change.startDay) || change.startDay < 1 || change.startDay > 28) throw invalid('Riwayat awal periode tidak valid.')
      previousDate = change.effectiveFrom
    }
  }
  for (const c of categories) if (!isText(c?.id) || !isText(c.name) || !isText(c.icon)
    || typeof c.color !== 'string' || !/^#[\da-f]{6}$/i.test(c.color) || !['income', 'expense'].includes(c.type) || typeof c.isDefault !== 'boolean') throw invalid('Kategori pada backup tidak valid.')
  for (const b of buckets) if (!isText(b?.id) || !isText(b.name) || !isText(b.icon)
    || typeof b.color !== 'string' || !/^#[\da-f]{6}$/i.test(b.color) || !Number.isFinite(b.allocPercent) || b.allocPercent < 0 || b.allocPercent > 100
    || !isNatural(b.sortOrder) || typeof b.allowOverbudget !== 'boolean' || typeof b.isSavings !== 'boolean') throw invalid('Bucket pada backup tidak valid.')
  for (const t of transactions) {
    if (!isText(t?.id) || !['income', 'expense', 'savings_deposit', 'savings_expense'].includes(t.type)
      || !isAmount(t.amount) || !isValidDateStr(t.date) || !isNatural(t.createdAt) || !isNatural(t.updatedAt)
      || (t.note !== undefined && typeof t.note !== 'string')
      || (t.categoryId !== undefined && !isText(t.categoryId))
      || (t.bucketId !== undefined && !isText(t.bucketId))
      || (t.recurringId !== undefined && (!isText(t.recurringId) || t.type !== 'income'))
      || (t.savingsSource !== undefined && t.type !== 'savings_expense')
      || (t.refundedAmount !== undefined && (!isNatural(t.refundedAmount) || t.refundedAmount > t.amount || (t.type !== 'expense' && t.refundedAmount !== 0)))
      || (t.deleted !== undefined && typeof t.deleted !== 'boolean')) throw invalid('Transaksi pada backup tidak valid.')
    if (t.type === 'income' && (!t.categoryId || categoryById.get(t.categoryId)?.type !== 'income' || t.bucketId !== undefined)) throw invalid('Kategori pemasukan tidak cocok.')
    if (t.type === 'expense' && (!t.categoryId || t.categoryId === 'cat-tabungan' || categoryById.get(t.categoryId)?.type !== 'expense' || bucketById.get(t.bucketId ?? '')?.isSavings !== false)) throw invalid('Kategori atau bucket pengeluaran tidak cocok.')
    if (t.type === 'savings_deposit' && (t.categoryId !== 'cat-tabungan' || !t.bucketId || bucketById.get(t.bucketId)?.isSavings !== true)) throw invalid('Kategori atau bucket setoran tidak cocok.')
    if (t.type === 'savings_expense' && (!['sisa', 'allocation'].includes(t.savingsSource ?? '') || t.categoryId !== undefined || t.bucketId !== undefined || !isText(t.note))) throw invalid('Pengeluaran tabungan tidak valid.')
  }
  for (const r of recurring) if (!isText(r?.id) || !isText(r.name) || !isAmount(r.amount)
    || !Number.isInteger(r.dayOfMonth) || r.dayOfMonth < 1 || r.dayOfMonth > 28
    || categoryById.get(r.categoryId)?.type !== 'income' || typeof r.isActive !== 'boolean' || !isNatural(r.createdAt)) throw invalid('Template pemasukan rutin tidak valid.')
  for (const g of goals) if (!isText(g?.id) || !isText(g.name) || !isAmount(g.targetAmount)
    || !isNatural(g.sortOrder) || !isNatural(g.createdAt) || (g.usedAt !== undefined && !isNatural(g.usedAt))
    || (g.icon !== undefined && !isText(g.icon))) throw invalid('Tujuan tabungan tidak valid.')
  const sweepPeriods = new Set<string>()
  for (const s of sweeps) {
    if (!isText(s?.id) || !isValidPeriodKey(s.periodKey) || sweepPeriods.has(s.periodKey)
      || !isNatural(s.amount) || !isNatural(s.sweptAt) || !Array.isArray(s.perBucketDetail)) throw invalid('Data tutup periode tidak valid.')
    sweepPeriods.add(s.periodKey)
    const detailBuckets = new Set<string>()
    for (const d of s.perBucketDetail) {
      if (!isObject(d) || !isText(d.bucketId) || !bucketById.has(d.bucketId) || detailBuckets.has(d.bucketId)
        || !isNatural(d.jatah) || !isNatural(d.terpakai) || !Number.isSafeInteger(d.sisa)) throw invalid('Rincian bucket periode tidak valid.')
      detailBuckets.add(d.bucketId)
    }
  }
  for (const row of rows.settings) if (!('value' in row)) throw invalid('Pengaturan pada backup tidak valid.')
  if (rows.lockout.length > 1) throw invalid('Status keamanan pada backup tidak valid.')
  for (const row of rows.lockout) if (row.key !== 'lockout' || !isNatural(row.attempts) || !isNatural(row.lockedUntil)) throw invalid('Status keamanan pada backup tidak valid.')

  if (!hasSafeFinanceTotals(transactions, sweeps, profiles[0])) throw invalid('Total nominal melewati batas hitungan rupiah yang aman.')
  const savings = calcSavingsState(sweeps, transactions)
  if (![savings.sisaBalance, savings.allocationBalance, savings.totalSavings].every(isNatural)) throw invalid('Saldo kompartemen tabungan tidak valid.')
  const transactionById = new Map(transactions.map(item => [item.id, item]))
  for (const goal of goals) {
    const expense = transactionById.get(`goal-use:${goal.id}`)
    // Migrated used goals can predate canonical IDs. Validate the link when it exists.
    if (expense && (expense.type !== 'savings_expense' || expense.savingsSource !== 'allocation'
      || (!expense.deleted && expense.amount !== goal.targetAmount) || (expense.deleted ? goal.usedAt !== undefined : goal.usedAt === undefined))) throw invalid('Penggunaan tujuan tabungan tidak cocok.')
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
function fromBase64(value: string): Uint8Array {
  try { return Uint8Array.from(atob(value), char => char.charCodeAt(0)) }
  catch { throw invalid('Data enkripsi pada backup rusak.') }
}
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  // PBKDF2 is intended for password-derived keys; AES-GCM supplies authenticated encryption.
  // References: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey
  // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: Uint8Array.from(salt) as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function exportBackup(db: MoneeDB, passphrase?: string): Promise<string> {
  const tx = db.transaction(STORE_NAMES, 'readonly')
  const storeRows = Object.fromEntries(await Promise.all(STORE_NAMES.map(async name => [name, await tx.objectStore(name).getAll()]))) as BackupStores
  storeRows.settings = storeRows.settings.filter(row => row.key !== VOICE_CREDENTIAL_KEY)
  await tx.done
  assertRecords(storeRows)
  const exportedAt = new Date().toISOString()
  if (!passphrase) {
    const contents = JSON.stringify({ format: FORMAT, version: VERSION, encrypted: false, exportedAt, stores: storeRows } satisfies PlainBackup, null, 2)
    if (new TextEncoder().encode(contents).byteLength > MAX_BACKUP_BYTES) throw new BackupError('ERR_BACKUP_TOO_LARGE', 'Backup melebihi batas 20 MB.')
    return contents
  }
  if (passphrase.length < 8) throw invalid('Passphrase harus minimal 8 karakter.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: Uint8Array.from(iv) as BufferSource }, key, new TextEncoder().encode(JSON.stringify(storeRows)))
  const contents = JSON.stringify({ format: FORMAT, version: VERSION, encrypted: true, cipher: 'AES-GCM', kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), exportedAt } satisfies EncryptedBackup, null, 2)
  if (new TextEncoder().encode(contents).byteLength > MAX_BACKUP_BYTES) throw new BackupError('ERR_BACKUP_TOO_LARGE', 'Backup melebihi batas 20 MB.')
  return contents
}

export async function importBackup(db: MoneeDB, contents: string, passphrase?: string): Promise<void> {
  if (new TextEncoder().encode(contents).byteLength > MAX_BACKUP_BYTES) throw new BackupError('ERR_BACKUP_TOO_LARGE', 'File backup melebihi batas 20 MB.')
  let envelope: unknown
  try { envelope = JSON.parse(contents) } catch { throw invalid() }
  if (!isObject(envelope) || envelope.format !== FORMAT || envelope.version !== VERSION || typeof envelope.encrypted !== 'boolean'
    || typeof envelope.exportedAt !== 'string' || !isValidDateStr(envelope.exportedAt.slice(0, 10))
    || !Number.isFinite(Date.parse(envelope.exportedAt))) throw invalid()
  let stores: unknown
  if (envelope.encrypted === false) stores = envelope.stores
  else {
    if (envelope.cipher !== 'AES-GCM' || envelope.kdf !== 'PBKDF2-SHA-256' || envelope.iterations !== ITERATIONS
      || !isText(envelope.salt) || !isText(envelope.iv) || !isText(envelope.ciphertext)) throw invalid('Format enkripsi backup tidak didukung.')
    if (!passphrase) throw new BackupError('ERR_BACKUP_DECRYPT', 'Passphrase backup wajib diisi.')
    try {
      const salt = fromBase64(envelope.salt); const iv = fromBase64(envelope.iv)
      if (salt.length !== 16 || iv.length !== 12) throw invalid('Parameter enkripsi backup tidak valid.')
      const key = await deriveKey(passphrase, salt)
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(iv) as BufferSource }, key, Uint8Array.from(fromBase64(envelope.ciphertext)) as BufferSource)
      stores = JSON.parse(new TextDecoder().decode(plaintext))
    } catch (error) {
      if (error instanceof BackupError) throw error
      throw new BackupError('ERR_BACKUP_DECRYPT', 'Passphrase salah atau file backup rusak.')
    }
  }
  assertRecords(stores)
  const rows = stores as BackupStores
  const tx = db.transaction(STORE_NAMES, 'readwrite')
  try {
    for (const name of STORE_NAMES) {
      const store = tx.objectStore(name)
      await store.clear()
      for (const row of rows[name]) {
        if (name === STORES.settings && row.key === VOICE_CREDENTIAL_KEY) continue
        await store.put(row as never)
      }
    }
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* Transaction already ended. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
