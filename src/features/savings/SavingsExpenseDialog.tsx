import { useRef, useState, type FormEvent } from 'react'
import { Button, Chip, TextField } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'
import type { SavingsSource } from '@/core/finance/types'
import { savingsErrorMessage } from './errors'

export function SavingsExpenseDialog({ source = 'sisa', onClose }: { source?: SavingsSource; onClose: () => void }) {
  const rupiah = useRupiah()
  const savings = useMoneeStore(state => state.snapshot?.savings)
  const [selectedSource, setSelectedSource] = useState(source)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  async function save(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      await useMoneeStore.getState().recordSavingsExpense({ amount: Number(amount), note, savingsSource: selectedSource })
      onClose()
    } catch (cause) { setError(savingsErrorMessage(cause, 'Pengeluaran belum tersimpan. Coba lagi.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <Dialog open title="Pakai tabungan" onClose={() => { if (!busy) onClose() }} sheet>
    <form className="savings-form" noValidate onSubmit={event => { void save(event) }}>
      <p>Dana diambil dari <strong>{selectedSource === 'sisa' ? 'Sisa' : 'Dari Allocation'}</strong>. Saldo periode dan jatah tidak berkurang.</p>
      <label className="savings-select" htmlFor="savings-expense-source">Sumber dana
        <select id="savings-expense-source" value={selectedSource} disabled={busy} onChange={event => {
          const next = event.target.value === 'allocation' ? 'allocation' : 'sisa'
          setSelectedSource(next); setError('')
          if (next === 'allocation' && note === 'Pindah ke investasi') setNote('')
        }}><option value="sisa">Sisa · {rupiah(savings?.sisaBalance ?? 0)}</option>
          <option value="allocation">Dari Allocation · {rupiah(savings?.allocationBalance ?? 0)}</option>
        </select>
      </label>
      <TextField label="Nominal (Rp)" type="number" inputMode="numeric" min="1" step="1" value={amount} autoFocus
        disabled={busy} onChange={event => { setAmount(event.target.value); setError('') }} />
      {selectedSource === 'sisa' && <div className="savings-presets" role="group" aria-label="Isi cepat catatan">
        <Chip selected={note.startsWith('Darurat:')} disabled={busy} onClick={() => { setNote('Darurat: '); setError(''); document.getElementById('savings-expense-note')?.focus() }}>Darurat</Chip>
        <Chip selected={note === 'Pindah ke investasi'} disabled={busy} onClick={() => { setNote('Pindah ke investasi'); setError('') }}>Pindah ke investasi</Chip>
      </div>}
      <TextField id="savings-expense-note" label="Catatan" value={note} maxLength={200} required disabled={busy}
        placeholder="Untuk apa dana ini dipakai?" onChange={event => { setNote(event.target.value); setError('') }} />
      {error && <InlineError>{error}</InlineError>}
      <Button type="submit" loading={busy}>Simpan pengeluaran</Button>
    </form>
  </Dialog>
}
