import { useRef, useState } from 'react'
import { Button, TextField } from '@/components/ui/controls'
import { FuseButton } from '@/components/reactbits/FuseButton'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { getToday, isValidDateStr } from '@/core/finance/period'
import type { Transaction, TxType } from '@/core/finance/types'
import { defaultCategoryId } from '@/core/finance/transaction-presentation'
import { useMoneeStore } from '@/store'
import type { VoiceDraft } from './parser'

export function VoiceDraftReview({ draft, index, total, transcript = '', issues = [], onNext, onClose }: {
  draft: VoiceDraft; index: number; total: number; transcript?: string; issues?: string[]; onNext: () => void; onClose: () => void
}) {
  const categories = useMoneeStore(state => state.categories)
  const buckets = useMoneeStore(state => state.buckets)
  const [type, setType] = useState<TxType>(draft.type)
  const [amount, setAmount] = useState(String(draft.amount)), [date, setDate] = useState(draft.date)
  const [bucketId, setBucket] = useState(draft.bucketId)
  const [source, setSource] = useState(draft.savingsSource ?? 'sisa'), [note, setNote] = useState(draft.note)
  const [error, setError] = useState(''), [phase, setPhase] = useState('idle'), [busy, setBusy] = useState(false)
  const id = useRef(crypto.randomUUID())
  const saved = useRef<Transaction | null>(null)
  const prepared = useRef<Transaction | null>(null)
  const savingsBucket = buckets.find(bucket => bucket.isSavings)
  const locked = busy || phase !== 'idle'
  const review = draft.review.filter(field => field !== 'category')
  function prepare() {
    setError('')
    const value = Number(amount)
    if (!Number.isSafeInteger(value) || value <= 0) { setError('Nominal harus lebih dari 0 rupiah utuh.'); return false }
    if (!isValidDateStr(date) || date > getToday()) { setError('Pilih tanggal yang valid dan tidak di masa depan.'); return false }
    // Preserve the legacy persistence contract without exposing categories in review.
    const categoryId = defaultCategoryId(categories, type, type === draft.type ? draft.categoryId : undefined)
    const category = categories.find(item => item.id === categoryId && item.type === (type === 'income' ? 'income' : 'expense'))
    if (type !== 'savings_expense' && !category) { setError('Data transaksi belum siap. Buka ulang input transaksi, ya.'); return false }
    const bucket = type === 'savings_deposit' ? savingsBucket : buckets.find(item => item.id === bucketId && !item.isSavings)
    if (['expense', 'savings_deposit'].includes(type) && !bucket) { setError('Pilih bucket yang tersedia.'); return false }
    if (type === 'savings_expense' && !note.trim()) { setError('Catatan pengeluaran tabungan wajib diisi.'); return false }
    const now = Date.now()
    prepared.current = { id: id.current, type, amount: value, date, note: note.trim(), refundedAmount: 0, deleted: false,
      ...(type !== 'savings_expense' ? { categoryId: category!.id } : { savingsSource: source }),
      ...(['expense', 'savings_deposit'].includes(type) ? { bucketId: bucket!.id } : {}), createdAt: now, updatedAt: now }
    return true
  }
  const footer = <div className="voice-form">
    <p className="ui-helper">Periksa sebelum simpan. Kamu punya 2 detik untuk membatalkan setiap draft.</p>
    <FuseButton label="Simpan draft" beforeArm={prepare} onPhaseChange={setPhase} settle="stay" onSettled={onNext}
      getErrorMessage={cause => cause instanceof Error ? cause.message : 'Draft belum tersimpan.'}
      onCommit={async () => {
        if (!prepared.current) return
        setBusy(true)
        try { await useMoneeStore.getState().addTransaction(prepared.current); saved.current = prepared.current }
        finally { setBusy(false) }
      }}
      onUndo={async () => {
        if (!saved.current) return
        setBusy(true)
        try {
          await useMoneeStore.getState().updateTransaction({ ...saved.current, deleted: true, updatedAt: Date.now() }, saved.current)
          saved.current = null; id.current = crypto.randomUUID()
        } finally { setBusy(false) }
      }} />
    <Button variant="ghost" disabled={locked} onClick={onNext}>Lewati draft ini</Button>
  </div>
  return <Dialog open sheet title="Review transaksi" footer={footer} onClose={() => { if (!locked) onClose() }}>
    <form className="voice-form" onSubmit={event => event.preventDefault()}>
      <p className="voice-progress" role="status">Draft {index + 1} dari {total}</p>
      {transcript && <div className="voice-transcript"><p className="ui-helper">Teks transaksi</p><p>{transcript}</p></div>}
      {issues.map((issue, i) => <InlineError key={i}>{issue}</InlineError>)}
      {review.length > 0 && <p className="voice-review-hint">Perlu diperiksa: {review.map(field => ({ bucket: 'bucket', date: 'tanggal', source: 'sumber dana' }[field])).join(', ')}.</p>}
      <fieldset className="voice-fields" disabled={locked}>
        <label className="voice-field">Jenis transaksi<select value={type} onChange={event => {
          setType(event.target.value as TxType); setBucket(''); setError('')
        }}>
          <option value="expense">Pengeluaran</option><option value="income">Pemasukan</option>
          <option value="savings_deposit">Setoran tabungan</option><option value="savings_expense">Pengeluaran tabungan</option>
        </select></label>
        <TextField label="Nominal (Rp)" type="number" inputMode="numeric" min="1" step="1" value={amount} onChange={event => { setAmount(event.target.value); setError('') }} />
        {type === 'expense' && <label className="voice-field">Bucket<select value={bucketId} onChange={event => { setBucket(event.target.value); setError('') }}>
          <option value="">Pilih bucket</option>{buckets.filter(item => !item.isSavings).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
        {type === 'savings_deposit' && <p>Setoran masuk ke Dari Allocation dan memakai saldo periode.</p>}
        {type === 'savings_expense' && <label className="voice-field">Sumber tabungan<select value={source} onChange={event => setSource(event.target.value === 'allocation' ? 'allocation' : 'sisa')}>
          <option value="sisa">Sisa</option><option value="allocation">Dari Allocation</option>
        </select></label>}
        <TextField label="Tanggal" type="date" value={date} max={getToday()} onChange={event => { setDate(event.target.value); setError('') }} />
        <TextField label={type === 'savings_expense' ? 'Catatan (wajib)' : 'Catatan (opsional)'} value={note} maxLength={200} onChange={event => { setNote(event.target.value); setError('') }} />
      </fieldset>
      {error && <InlineError>{error}</InlineError>}
    </form>
  </Dialog>
}
