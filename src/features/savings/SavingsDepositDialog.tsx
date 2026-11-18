import { useRef, useState, type FormEvent } from 'react'
import { Button, TextField } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'
import { savingsErrorMessage } from './errors'

export function SavingsDepositDialog({ onClose }: { onClose: () => void }) {
  const rupiah = useRupiah()
  const balance = useMoneeStore(state => state.snapshot?.balance.balance ?? 0)
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
      await useMoneeStore.getState().recordSavingsDeposit({ amount: Number(amount), note })
      onClose()
    } catch (cause) { setError(savingsErrorMessage(cause, 'Setoran belum tersimpan. Coba lagi.')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <Dialog open title="Setor tabungan" onClose={() => { if (!busy) onClose() }} sheet>
    <form className="savings-form" noValidate onSubmit={event => { void save(event) }}>
      <p>Setoran masuk ke Dari Allocation. Saldo periode tersedia <strong>{rupiah(balance)}</strong>.</p>
      <TextField label="Nominal (Rp)" type="number" inputMode="numeric" min="1" step="1" value={amount} autoFocus
        disabled={busy} onChange={event => { setAmount(event.target.value); setError('') }} />
      {error && <InlineError>{error}</InlineError>}
      <TextField label="Catatan (opsional)" value={note} maxLength={200} disabled={busy} onChange={event => setNote(event.target.value)} />
      <Button type="submit" loading={busy}>Simpan setoran</Button>
    </form>
  </Dialog>
}
