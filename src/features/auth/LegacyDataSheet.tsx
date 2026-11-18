import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button, TextField } from '@/components/ui/controls'
import { InlineError, Skeleton } from '@/components/ui/feedback'
import { importLegacyData, inspectLegacyData, openDatabase, type LegacyDataPreview } from '@/core/db/migrations'
import { exportBackup } from '@/features/settings/backup'
import { notifyDataChanged } from '@/core/db/changes'
import { useMoneeStore } from '@/store'
import { getSyncStatus, syncAccountData } from './sync'

export function LegacyDataSheet({ onClose }: { onClose(): void }) {
  const [preview, setPreview] = useState<LegacyDataPreview | null>(null), [ready, setReady] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false)
  const [passphrase, setPassphrase] = useState(''), [backedUp, setBackedUp] = useState(false)
  useEffect(() => {
    let active = true
    void inspectLegacyData().then(value => { if (active) setPreview(value) }).catch(() => { if (active) setError('Data lama belum dapat dibaca.') }).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])
  return <Dialog open sheet title="Data lama di browser ini" onClose={() => { if (!busy) onClose() }}>
    {!ready ? <Skeleton label="Memeriksa data lama" /> : preview?.profileName ? <div className="settings-form">
      <p><strong>{preview.profileName}</strong> · {preview.transactions} transaksi · {preview.buckets} bucket · {preview.goals} tujuan.</p>
      <p>Impor akan mengganti ledger akun ini dan disinkronkan ke perangkat lain. Data lokal aslinya tetap tersimpan. Unduh backup akun saat ini terlebih dahulu.</p>
      <TextField type="password" label="Passphrase backup akun saat ini" autoComplete="new-password" minLength={8} value={passphrase} disabled={busy} onChange={event => { setPassphrase(event.target.value); setBackedUp(false) }} />
      <Button variant="secondary" loading={busy} disabled={passphrase.length < 8} onClick={() => {
        setBusy(true); setError('')
        void exportBackupPromise().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Backup belum berhasil.')).finally(() => setBusy(false))
      }}>{backedUp ? 'Backup sudah diunduh' : 'Unduh backup terenkripsi'}</Button>
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> Saya ingin mengganti ledger akun dengan data lama ini.</label>
      <Button loading={busy} disabled={!confirmed || !backedUp} onClick={() => {
        setBusy(true); setError('')
        void (async () => {
          await syncAccountData()
          const status = getSyncStatus()
          if (status.conflicts || status.pending) throw new Error('Selesaikan sinkronisasi dan konflik akun terlebih dahulu.')
          await importLegacyData({ replaceConfirmed: true })
          await useMoneeStore.getState().load(); notifyDataChanged()
          await syncAccountData(); onClose()
        })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Impor belum berhasil.')).finally(() => setBusy(false))
      }}>Impor dan ganti ledger akun</Button>
    </div> : <p>Tidak ada ledger lama di browser ini.</p>}
    {error && <InlineError>{error}</InlineError>}
  </Dialog>

  async function exportBackupPromise() {
    await syncAccountData()
    const contents = await exportBackup(await openDatabase(), passphrase)
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'monee-before-legacy-import.json'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setBackedUp(true)
  }
}
