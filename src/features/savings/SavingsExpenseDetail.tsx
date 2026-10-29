import { useState } from 'react'
import { Button, TextField } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { FuseButton } from '@/components/reactbits/FuseButton'
import { getToday } from '@/core/finance/period'
import { getConfiguredPeriod } from '@/core/finance/period-config'
import { isPeriodLocked } from '@/core/finance/period-lock'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'
import type { SavingsSource, Transaction } from '@/core/finance/types'

export function SavingsExpenseDetail({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  const rupiah = useRupiah()
  const profile = useMoneeStore(state => state.profile)
  const sweeps = useMoneeStore(state => state.sweeps)
  const locked = isPeriodLocked(getConfiguredPeriod(transaction.date, profile?.periodStartDay ?? 1, profile?.periodChanges).key, sweeps)
  const linkedGoal = transaction.id.startsWith('goal-use:')
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [amount, setAmount] = useState(String(transaction.amount))
  const [note, setNote] = useState(transaction.note ?? '')
  const [date, setDate] = useState(transaction.date)
  const [source, setSource] = useState<SavingsSource>(transaction.savingsSource ?? 'sisa')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('idle')
  const close = () => { if (!busy && phase === 'idle') onClose() }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await useMoneeStore.getState().updateTransaction({ ...transaction, amount: Number(amount), note: note.trim(), date,
        savingsSource: source, updatedAt: Date.now() }, transaction)
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pengeluaran belum dapat diubah.') }
    finally { setBusy(false) }
  }
  return <Dialog open sheet title="Detail pengeluaran tabungan" onClose={close}>
    <div className="savings-form">
      {locked && <p role="status">Periode ini sudah ditutup. Pengeluaran tersimpan sebagai riwayat dan tidak dapat diubah.</p>}
      {linkedGoal && <p className="savings-hint">Pengeluaran terhubung ke tujuan. Koreksi nominal ikut memperbarui target tujuan; penghapusan mengaktifkan kembali tujuan.</p>}
      {mode === 'view' && <>
        <strong className="savings-pocket-amount">{rupiah(transaction.amount)}</strong>
        <p>{transaction.note}</p><p>{transaction.date} · {transaction.savingsSource === 'sisa' ? 'Sisa' : 'Allocation'}</p>
        <div className="savings-actions">
          <Button disabled={locked} onClick={() => setMode('edit')}>Edit pengeluaran</Button>
          <Button variant="danger" disabled={locked} onClick={() => setMode('delete')}>Hapus pengeluaran</Button>
        </div>
      </>}
      {mode === 'edit' && <form className="savings-form" onSubmit={event => { void save(event) }}>
        <TextField label="Nominal (Rp)" type="number" inputMode="numeric" min={1} step={1} required value={amount}
          disabled={busy || locked} onChange={event => setAmount(event.target.value)} />
        <TextField label="Catatan" required maxLength={240} value={note} disabled={busy || locked} onChange={event => setNote(event.target.value)} />
        <TextField label="Tanggal" type="date" max={getToday()} required value={date} disabled={busy || locked} onChange={event => setDate(event.target.value)} />
        <label className="savings-select">Sumber dana<select value={source} disabled={busy || locked || linkedGoal}
          onChange={event => setSource(event.target.value as SavingsSource)}>
          <option value="sisa">Sisa</option><option value="allocation">Allocation</option>
        </select></label>
        {error && <InlineError>{error}</InlineError>}
        <Button type="submit" loading={busy} disabled={locked}>Simpan perubahan</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setMode('view')}>Batal</Button>
      </form>}
      {mode === 'delete' && <>
        <p>Dana kembali ke kompartemen asal. Pengeluaran dihapus dari perhitungan; riwayat pembatalan tetap tersimpan.</p>
        <FuseButton label="Ya, hapus" doneLabel="Pengeluaran dihapus" undoWindow={4000} commitOn="fuseEnd" disabled={locked}
          onPhaseChange={setPhase} onSettled={onClose}
          onCommit={async () => { await useMoneeStore.getState().updateTransaction({ ...transaction, deleted: true, updatedAt: Date.now() }, transaction) }}
          onUndo={() => {}} getErrorMessage={cause => cause instanceof Error ? cause.message : 'Pengeluaran belum dapat dihapus.'} />
        <Button variant="ghost" disabled={phase !== 'idle'} onClick={() => setMode('view')}>Kembali</Button>
      </>}
    </div>
  </Dialog>
}
