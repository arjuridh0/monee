import { useState } from 'react'
import { Button, TextField, Toggle } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { CATEGORY_ICONS } from '@/core/finance/category-options'
import type { Bucket } from '@/core/finance/types'
import { useMoneeStore } from '@/store'

export function BucketManagerSheet({ onClose }: { onClose: () => void }) {
  const [baseline] = useState(() => useMoneeStore.getState().buckets.map(item => ({ ...item })))
  const [buckets, setBuckets] = useState(() => [...baseline].sort((a, b) => a.sortOrder - b.sortOrder))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const total = buckets.reduce((sum, item) => sum + item.allocPercent, 0)
  function update(id: string, patch: Partial<Bucket>) {
    setBuckets(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await useMoneeStore.getState().saveBuckets(buckets.map((item, index) => ({ ...item, sortOrder: index })), baseline)
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bucket belum bisa disimpan.') }
    finally { setBusy(false) }
  }
  return <Dialog open sheet title="Kelola Bucket" onClose={() => { if (!busy) onClose() }}>
    <form className="settings-form bucket-manager" onSubmit={event => { void save(event) }}>
      <p className="ui-helper">Atur nama, tampilan, dan jatah. Bucket yang sudah dipakai riwayat tidak dapat dihapus. Perubahan alokasi berlaku untuk periode terbuka.</p>
      {buckets.map((bucket, index) => <fieldset key={bucket.id} disabled={busy} className="bucket-manager-item">
        <legend>Bucket {index + 1}{bucket.isSavings ? ' · Tabungan' : ''}</legend>
        <TextField label={`Nama bucket ${index + 1}`} value={bucket.name} maxLength={32} required
          onChange={event => update(bucket.id, { name: event.target.value })} />
        <div className="bucket-manager-fields">
          <TextField label={`Alokasi bucket ${index + 1} (%)`} type="number" min={0} max={100} step="0.1"
            value={bucket.allocPercent} required onChange={event => update(bucket.id, { allocPercent: Number(event.target.value) })} />
          <label>Ikon bucket {index + 1}<select value={bucket.icon} onChange={event => update(bucket.id, { icon: event.target.value })}>
            {CATEGORY_ICONS.map(icon => <option key={icon} value={icon}>{icon.split('-').join(' ')}</option>)}
          </select></label>
          <TextField label={`Warna bucket ${index + 1}`} type="color" value={bucket.color}
            onChange={event => update(bucket.id, { color: event.target.value })} />
        </div>
        <Toggle label={`Boleh melewati jatah bucket ${index + 1}`} checked={bucket.allowOverbudget}
          onChange={allowOverbudget => update(bucket.id, { allowOverbudget })} />
        {!bucket.isSavings && <Button variant="ghost" onClick={() => setBuckets(items => items.filter(item => item.id !== bucket.id))}>
          Hapus bucket {index + 1}
        </Button>}
      </fieldset>)}
      <Button variant="secondary" disabled={busy || buckets.length >= 20} onClick={() => setBuckets(items => [...items, {
        id: `bucket-${crypto.randomUUID()}`, name: 'Bucket baru', icon: 'shapes', color: '#DDE9F7',
        allocPercent: 0, sortOrder: items.length, isSavings: false, allowOverbudget: false,
      }])}>Tambah bucket</Button>
      <p role="status">Total alokasi: {total.toLocaleString('id-ID', { maximumFractionDigits: 2 })}% dari 100%</p>
      {error && <InlineError>{error}</InlineError>}
      <Button type="submit" loading={busy} disabled={Math.abs(total - 100) > 1e-8}>Simpan bucket</Button>
    </form>
  </Dialog>
}
