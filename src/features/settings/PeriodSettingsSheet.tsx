import { useState } from 'react'
import { Button } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { adjacentDate, getConfiguredPeriod } from '@/core/finance/period-config'
import { getToday } from '@/core/finance/period'
import { useMoneeStore } from '@/store'

export function PeriodSettingsSheet({ onClose }: { onClose: () => void }) {
  const [profile] = useState(() => useMoneeStore.getState().profile!)
  const today = getToday()
  const pending = profile.periodChanges?.find(change => change.effectiveFrom > today)
  const applied = profile.periodChanges?.filter(change => change.effectiveFrom <= today).slice(-1)[0]
  const [day, setDay] = useState(pending?.startDay ?? applied?.startDay ?? profile.periodStartDay)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const state = useMoneeStore.getState()
  const hasHistory = state.transactions.length > 0 || state.sweeps.length > 0
  const effective = adjacentDate(getConfiguredPeriod(today, profile.periodStartDay, profile.periodChanges).end, 1)
  async function save() {
    setBusy(true); setError('')
    try { await useMoneeStore.getState().setPeriodStartDay(day, profile); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Awal periode belum dapat disimpan.') }
    finally { setBusy(false) }
  }
  return <Dialog open sheet title="Awal Periode" onClose={() => { if (!busy) onClose() }}>
    <div className="settings-form">
      <label>Tanggal awal periode<select value={day} disabled={busy} onChange={event => setDay(Number(event.target.value))}>
        {Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
      </select></label>
      <p className="ui-helper">{hasHistory
        ? `Perubahan berlaku mulai ${effective}. Periode transisi dapat lebih pendek. Riwayat lama tetap menggunakan batas sebelumnya.`
        : 'Belum ada transaksi. Tanggal baru langsung berlaku.'}</p>
      {pending && <p role="status">Terjadwal: tanggal {pending.startDay}, berlaku {pending.effectiveFrom}.</p>}
      {error && <InlineError>{error}</InlineError>}
      <Button loading={busy} onClick={() => { void save() }}>Simpan awal periode</Button>
    </div>
  </Dialog>
}
