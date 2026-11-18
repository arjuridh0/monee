import { useEffect, useState } from 'react'
import { Cloud, LoaderCircle, WifiOff } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/controls'
import { formatRupiah } from '@/core/finance/currency'
import { useMoneeStore } from '@/store'
import { getSyncConflicts, getSyncStatus, loadSyncStatus, resolveSyncConflict, subscribeSyncStatus, syncAccountData, type AccountSyncStatus } from './sync'
import type { Collection } from './sync'
import './account.css'

interface ConflictView { collection: Collection; id: string; local: Record<string, unknown> | null; remote: { record: Record<string, unknown> | null; deleted: boolean } }

function collectionLabel(collection: Collection): string {
  return ({ profile: 'Profil', buckets: 'Bucket', categories: 'Kategori', transactions: 'Transaksi',
    recurringIncomes: 'Pemasukan rutin', goals: 'Tujuan', monthSweeps: 'Sisa periode' })[collection]
}

function brief(record: Record<string, unknown> | null, deleted = false): string {
  if (deleted) return 'Dihapus di perangkat lain'
  if (!record) return 'Tidak ada data'
  if (typeof record.amount === 'number') return formatRupiah(record.amount)
  if (typeof record.name === 'string') return record.name
  return 'Perubahan data'
}

export function SyncNotice() {
  const [status, setStatus] = useState<AccountSyncStatus>(getSyncStatus())
  const [conflicts, setConflicts] = useState<ConflictView[]>([])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [retrying, setRetrying] = useState(false)
  const load = useMoneeStore(state => state.load)

  useEffect(() => {
    let active = true
    void loadSyncStatus().then(next => { if (active) setStatus(next) })
    const unsubscribe = subscribeSyncStatus(next => { setStatus(next) })
    return () => { active = false; unsubscribe() }
  }, [])

  async function review() {
    const next = await getSyncConflicts()
    setConflicts(next)
    setOpen(true)
  }

  async function choose(item: ConflictView, choice: 'device' | 'cloud') {
    const key = `${item.collection}:${item.id}`
    setBusyId(key)
    try {
      await resolveSyncConflict(item.collection, item.id, choice)
      await load()
      const next = await getSyncConflicts()
      setConflicts(next)
      if (!next.length) setOpen(false)
    } finally { setBusyId('') }
  }

  if (!status.pending && !status.conflicts && status.state !== 'offline' && status.state !== 'syncing') return null
  const Icon = status.state === 'syncing' ? LoaderCircle : status.state === 'offline' ? WifiOff : Cloud
  const label = status.state === 'syncing' ? 'Menyinkronkan perubahan…'
    : status.state === 'offline' ? `${status.pending} perubahan menunggu koneksi`
      : status.conflicts ? `${status.conflicts} perubahan perlu ditinjau` : `${status.pending} perubahan menunggu sinkronisasi`

  return <>
    <div className={`account-sync-notice account-sync-notice--${status.state}`} role={status.conflicts ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden="true" className={status.state === 'syncing' ? 'ui-spin' : undefined} />
      <span>{label}</span>
      {status.conflicts > 0
        ? <button type="button" onClick={() => { void review() }}>Tinjau</button>
        : status.state === 'offline' && <button type="button" onClick={() => { setRetrying(true); void syncAccountData().catch(() => undefined).finally(() => setRetrying(false)) }} disabled={retrying}>{retrying ? 'Mencoba…' : 'Coba lagi'}</button>}
    </div>
    <Dialog open={open} title="Perubahan di dua perangkat" onClose={() => setOpen(false)}>
      <div className="account-conflicts">
        <p>Pilih versi yang ingin dipertahankan untuk setiap catatan. Versi lain akan diganti pada akun ini.</p>
        {conflicts.map(item => {
          const key = `${item.collection}:${item.id}`
          return <section key={key} className="account-conflict" aria-label={collectionLabel(item.collection)}>
            <h2>{collectionLabel(item.collection)}</h2>
            <div className="account-conflict__values">
              <p><strong>Perangkat ini</strong><span>{brief(item.local)}</span></p>
              <p><strong>Akun cloud</strong><span>{brief(item.remote.record, item.remote.deleted)}</span></p>
            </div>
            <div className="account-conflict__actions">
              <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => { void choose(item, 'device') }}>Pakai versi perangkat</Button>
              <Button disabled={Boolean(busyId)} loading={busyId === key} onClick={() => { void choose(item, 'cloud') }}>Pakai versi cloud</Button>
            </div>
          </section>
        })}
      </div>
    </Dialog>
  </>
}
