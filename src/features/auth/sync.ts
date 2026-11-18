import type { MoneeDB } from '@/core/db/migrations'
import type { StoreName } from '@/core/db/schema'
import { openDatabase } from '@/core/db/migrations'
import { notifyDataChanged } from '@/core/db/changes'

const COLLECTIONS = ['profile', 'buckets', 'categories', 'transactions', 'recurringIncomes', 'goals', 'monthSweeps'] as const
export type Collection = typeof COLLECTIONS[number]
type RecordValue = Record<string, unknown> & { id: string }
interface BaselineEntry { revision: number; record: RecordValue | null; deleted: boolean }
interface Baseline { cursor: string; records: Partial<Record<Collection, Record<string, BaselineEntry>>> }
interface RemoteChange { collection: Collection; id: string; record: RecordValue | null; revision: number; updatedAt: number; deleted: boolean }
interface Conflict { collection: Collection; id: string; local: RecordValue | null; remote: BaselineEntry }
interface SyncApiReply { changes?: RemoteChange[]; nextCursor?: string; hasMore?: boolean; applied?: string[]; conflicts?: Array<{ opId: string; collection: Collection; id: string; revision: number; record: RecordValue | null; deleted: boolean }> }
export interface AccountSyncStatus { state: 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict'; pending: number; conflicts: number; lastSyncedAt?: number }

const BASELINE_KEY = 'account-sync-baseline'
const CONFLICTS_KEY = 'account-sync-conflicts'
const STATUS_KEY = 'account-sync-status'
const MAX_BATCH = 80
let status: AccountSyncStatus = { state: 'idle', pending: 0, conflicts: 0 }
let currentRun: Promise<void> | null = null

function emit() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('monee:sync-status', { detail: status }))
}
export function getSyncStatus(): AccountSyncStatus { return status }
export function subscribeSyncStatus(listener: (next: AccountSyncStatus) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const onStatus = (event: Event) => listener((event as CustomEvent<AccountSyncStatus>).detail)
  window.addEventListener('monee:sync-status', onStatus)
  return () => window.removeEventListener('monee:sync-status', onStatus)
}

async function setting<T>(db: MoneeDB, key: string, fallback: T): Promise<T> {
  const row = await db.get('settings', key)
  return (row?.value as T | undefined) ?? fallback
}

async function saveSetting(db: MoneeDB, key: string, value: unknown): Promise<void> {
  await db.put('settings', { key, value })
}

function cloudRecord(collection: Collection, value: RecordValue): RecordValue {
  if (collection !== 'profile') return structuredClone(value)
  const { pinHash: _pinHash, pinSalt: _pinSalt, ...shared } = value
  return shared as RecordValue
}

function equal(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown) => JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  return canonical(left) === canonical(right)
}

async function listCollection(db: MoneeDB, collection: Collection): Promise<RecordValue[]> {
  return collection === 'profile'
    ? (await db.get('profile', 'profile') ? [await db.get('profile', 'profile') as unknown as RecordValue] : [])
    : await db.getAll(collection as StoreName) as unknown as RecordValue[]
}

async function localValue(db: MoneeDB, collection: Collection, id: string): Promise<RecordValue | undefined> {
  if (collection === 'profile') return id === 'profile' ? await db.get('profile', id) as unknown as RecordValue | undefined : undefined
  return await db.get(collection as StoreName, id) as unknown as RecordValue | undefined
}

async function writeLocal(db: MoneeDB, collection: Collection, id: string, record: RecordValue | null, deleted: boolean): Promise<void> {
  if (collection === 'profile' && id !== 'profile') return
  if (deleted || !record) {
    await db.delete(collection as StoreName, id)
    return
  }
  let value = record
  if (collection === 'profile') {
    const current = await localValue(db, collection, id)
    value = { ...record, pinHash: current?.pinHash ?? '', pinSalt: current?.pinSalt ?? '' }
  }
  await db.put(collection as StoreName, value as never)
}

async function fetchJson(path: string, init?: RequestInit): Promise<SyncApiReply> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init })
  } catch { throw new Error('Sinkronisasi tertunda sampai perangkat kembali online.') }
  if (response.status === 401) {
    window.dispatchEvent(new Event('monee:session-expired'))
    throw new Error('Sesi akun berakhir. Masuk kembali untuk menyinkronkan data.')
  }
  if (!response.ok) throw new Error(response.status === 409 ? 'Ada perubahan yang perlu ditinjau.' : 'Sinkronisasi belum berhasil. Perubahan tetap tersimpan di perangkat.')
  try { return await response.json() as SyncApiReply }
  catch { throw new Error('Respons sinkronisasi tidak dapat dibaca.') }
}

async function pull(db: MoneeDB, baseline: Baseline, conflicts: Record<string, Conflict>): Promise<boolean> {
  let didWriteLocal = false
  let cursor = baseline.cursor
  let hasMore = true
  while (hasMore) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    const page = await fetchJson(`/api/sync${query}`)
    if (!Array.isArray(page.changes) || typeof page.nextCursor !== 'string') throw new Error('Respons sinkronisasi tidak valid.')
    for (const change of page.changes) {
      const base = baseline.records[change.collection]?.[change.id]
      const local = await localValue(db, change.collection, change.id)
      const localCloud = local ? cloudRecord(change.collection, local) : null
      const remoteEntry: BaselineEntry = { revision: change.revision, record: change.record, deleted: change.deleted }
      const localChanged = base
        ? (base.deleted ? Boolean(local) : !equal(localCloud, base.record))
        : Boolean(local)
      const sameAsRemote = change.deleted ? !local : equal(localCloud, change.record)
      if (localChanged && !sameAsRemote) {
        if (!base || base.revision !== change.revision) conflicts[`${change.collection}:${change.id}`] = { collection: change.collection, id: change.id, local: localCloud, remote: remoteEntry }
      } else {
        if (!sameAsRemote) didWriteLocal = true
        await writeLocal(db, change.collection, change.id, change.record, change.deleted)
        delete conflicts[`${change.collection}:${change.id}`]
      }
      baseline.records[change.collection] ??= {}
      baseline.records[change.collection]![change.id] = remoteEntry
    }
    cursor = page.nextCursor
    baseline.cursor = cursor
    hasMore = page.hasMore === true
    await saveSetting(db, BASELINE_KEY, baseline)
    await saveSetting(db, CONFLICTS_KEY, conflicts)
  }
  return didWriteLocal
}

async function localChanges(db: MoneeDB, baseline: Baseline, conflicts: Record<string, Conflict>) {
  const changes: Array<{ opId: string; collection: Collection; id: string; baseRevision: number; record?: RecordValue; deleted?: boolean }> = []
  for (const collection of COLLECTIONS) {
    const current = await listCollection(db, collection)
    const currentById = new Map(current.map(value => [value.id, cloudRecord(collection, value)]))
    const baseById = baseline.records[collection] ?? {}
    for (const [id, value] of currentById) {
      if (conflicts[`${collection}:${id}`]) continue
      const base = baseById[id]
      if (base?.deleted || !base || !equal(value, base.record)) {
        changes.push({ opId: crypto.randomUUID(), collection, id, baseRevision: base?.revision ?? 0, record: value })
      }
    }
    for (const [id, base] of Object.entries(baseById)) {
      if (conflicts[`${collection}:${id}`] || base.deleted || currentById.has(id)) continue
      changes.push({ opId: crypto.randomUUID(), collection, id, baseRevision: base.revision, deleted: true })
    }
  }
  return changes
}

async function push(db: MoneeDB, baseline: Baseline, conflicts: Record<string, Conflict>): Promise<boolean> {
  let pulledChanges = false
  while (true) {
    const changes = await localChanges(db, baseline, conflicts)
    if (!changes.length) return pulledChanges
    const batch = changes.slice(0, MAX_BATCH)
    const response = await fetchJson('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: batch }) })
    if (!Array.isArray(response.applied) || !Array.isArray(response.conflicts)) throw new Error('Respons sinkronisasi tidak valid.')
    for (const accepted of batch.filter(change => response.applied!.includes(change.opId))) {
      baseline.records[accepted.collection] ??= {}
      baseline.records[accepted.collection]![accepted.id] = { revision: accepted.baseRevision + 1, record: accepted.record ?? null, deleted: accepted.deleted === true }
    }
    for (const rejected of response.conflicts) {
      const local = await localValue(db, rejected.collection, rejected.id)
      const remote: BaselineEntry = { revision: rejected.revision, record: rejected.record, deleted: rejected.deleted }
      conflicts[`${rejected.collection}:${rejected.id}`] = { collection: rejected.collection, id: rejected.id,
        local: local ? cloudRecord(rejected.collection, local) : null, remote }
      baseline.records[rejected.collection] ??= {}
      baseline.records[rejected.collection]![rejected.id] = remote
    }
    await saveSetting(db, BASELINE_KEY, baseline)
    await saveSetting(db, CONFLICTS_KEY, conflicts)
    if (response.applied.length === 0 && response.conflicts.length === 0) throw new Error('Sinkronisasi belum menerima perubahan.')
    // Read the revisions assigned to accepted writes before computing the next
    // batch. Otherwise acknowledged records are resent with stale base revisions.
    pulledChanges = (await pull(db, baseline, conflicts)) || pulledChanges
  }
}

async function countPending(db: MoneeDB, baseline: Baseline, conflicts: Record<string, Conflict>): Promise<number> {
  return (await localChanges(db, baseline, conflicts)).length
}

export async function syncAccountData(): Promise<void> {
  if (currentRun) return currentRun
  currentRun = (async () => {
    const db = await openDatabase()
    const baseline = await setting<Baseline>(db, BASELINE_KEY, { cursor: '', records: {} })
    const conflicts = await setting<Record<string, Conflict>>(db, CONFLICTS_KEY, {})
    status = { ...status, state: 'syncing' }; emit()
    try {
      let pulledChanges = await pull(db, baseline, conflicts)
      pulledChanges = (await push(db, baseline, conflicts)) || pulledChanges
      pulledChanges = (await pull(db, baseline, conflicts)) || pulledChanges
      const pending = await countPending(db, baseline, conflicts)
      const conflictCount = Object.keys(conflicts).length
      status = { state: conflictCount ? 'conflict' : 'synced', pending, conflicts: conflictCount, lastSyncedAt: Date.now() }
      await saveSetting(db, STATUS_KEY, status)
      await saveSetting(db, BASELINE_KEY, baseline)
      await saveSetting(db, CONFLICTS_KEY, conflicts)
      if (pulledChanges) notifyDataChanged()
      emit()
    } catch (error) {
      const pending = await countPending(db, baseline, conflicts).catch(() => status.pending)
      status = { ...status, state: 'offline', pending, conflicts: Object.keys(conflicts).length }
      await saveSetting(db, STATUS_KEY, status).catch(() => undefined)
      emit()
      throw error
    }
  })()
  try { await currentRun }
  finally { currentRun = null }
}

export async function loadSyncStatus(): Promise<AccountSyncStatus> {
  const db = await openDatabase()
  status = await setting(db, STATUS_KEY, status)
  return status
}

export async function getSyncConflicts(): Promise<Conflict[]> {
  const db = await openDatabase()
  return Object.values(await setting<Record<string, Conflict>>(db, CONFLICTS_KEY, {}))
}

export async function resolveSyncConflict(collection: Collection, id: string, choice: 'device' | 'cloud'): Promise<void> {
  const db = await openDatabase()
  const conflicts = await setting<Record<string, Conflict>>(db, CONFLICTS_KEY, {})
  const key = `${collection}:${id}`
  const conflict = conflicts[key]
  if (!conflict) return
  const baseline = await setting<Baseline>(db, BASELINE_KEY, { cursor: '', records: {} })
  if (choice === 'cloud') await writeLocal(db, collection, id, conflict.remote.record, conflict.remote.deleted)
  baseline.records[collection] ??= {}
  baseline.records[collection]![id] = conflict.remote
  delete conflicts[key]
  await saveSetting(db, BASELINE_KEY, baseline)
  await saveSetting(db, CONFLICTS_KEY, conflicts)
  status = { ...status, state: Object.keys(conflicts).length ? 'conflict' : 'synced', conflicts: Object.keys(conflicts).length }
  emit()
  notifyDataChanged()
}
