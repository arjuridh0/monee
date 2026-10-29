import { getConfiguredPeriod } from '@/core/finance/period-config'
import { lazy, Suspense, useRef, useState } from 'react'
import { Mic, ScanLine } from 'lucide-react'
import { Button, TextField } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError, Skeleton } from '@/components/ui/feedback'
import { RubberSegment } from '@/components/reactbits/RubberSegment'
import { getToday, isInPeriod } from '@/core/finance/period'
import { validateTransaction } from '@/core/finance/guards'
import { isPeriodLocked } from '@/core/finance/period-lock'
import type { Transaction } from '@/core/finance/types'
import { useMoneeStore } from '@/store'
import { FuseButton } from '@/components/reactbits/FuseButton'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { calcBucketBudgets, calcBucketProgress } from '@/core/finance/allocation'
import { calcBalance } from '@/core/finance/balance'
import './quick-add.css'

interface QuickAddDialogProps {
  open: boolean
  onClose: () => void
  initialVoice?: boolean
}

const VoiceDialog = lazy(() => import('@/features/voice/VoiceDialog').then(module => ({ default: module.VoiceDialog })))
const ReceiptDialog = lazy(() => import('@/features/ocr/ReceiptDialog').then(module => ({ default: module.ReceiptDialog })))

type TransactionKind = 'expense' | 'income'
const categoryOrder = ['cat-makan', 'cat-minum', 'cat-transport', 'cat-pulsa', 'cat-belanja', 'cat-hiburan', 'cat-sedekah', 'cat-tabungan', 'cat-edukasi', 'cat-lain-exp', 'cat-gaji', 'cat-bonus', 'cat-freelance', 'cat-hadiah']

export function QuickAddDialog({ open, onClose, initialVoice = false }: QuickAddDialogProps) {
  const [voiceOpen, setVoiceOpen] = useState(initialVoice)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const categories = useMoneeStore(state => state.categories)
  const buckets = useMoneeStore(state => state.buckets)
  const [kind, setKind] = useState<TransactionKind>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [bucketId, setBucketId] = useState('')
  const [date, setDate] = useState(getToday())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const draft = useRef<Transaction | null>(null)
  const saved = useRef<Transaction | null>(null)
  const [phase, setPhase] = useState('idle')
  const transactions = useMoneeStore(state => state.transactions)
  const profile = useMoneeStore(state => state.profile)
  const period = getConfiguredPeriod(date, profile?.periodStartDay ?? 1, profile?.periodChanges)
  const periodTxs = transactions.filter(item => isInPeriod(item.date, period))
  const progress = calcBucketProgress(buckets, calcBucketBudgets(buckets, calcBalance(periodTxs).totalIncome), periodTxs)
  const orderedCategories = [...categories].sort((a, b) => (categoryOrder.indexOf(a.id) < 0 ? Infinity : categoryOrder.indexOf(a.id)) - (categoryOrder.indexOf(b.id) < 0 ? Infinity : categoryOrder.indexOf(b.id)))
  const expenseCategories = orderedCategories.filter(category => category.type === 'expense')
  const incomeCategories = orderedCategories.filter(category => category.type === 'income')
  const availableCategories = kind === 'expense' ? expenseCategories : incomeCategories
  const availableBuckets = buckets.filter(bucket => !bucket.isSavings).sort((a, b) => a.sortOrder - b.sortOrder)
  const selectedCategoryId = categoryId || availableCategories[0]?.id || ''
  const selectableBuckets = availableBuckets.filter(bucket => bucket.allowOverbudget || (progress.find(item => item.bucket.id === bucket.id)?.remaining ?? 0) > 0)
  const selectedBucketId = selectableBuckets.find(bucket => bucket.id === bucketId)?.id
    ?? selectableBuckets.find(bucket => bucket.id === profile?.defaultBucketId)?.id
    ?? selectableBuckets[0]?.id ?? ''
  const savingsDeposit = kind === 'expense' && selectedCategoryId === 'cat-tabungan'

  function switchKind(value: string) {
    const next: TransactionKind = value === 'Pemasukan' ? 'income' : 'expense'
    setKind(next)
    setCategoryId((next === 'income' ? incomeCategories : expenseCategories)[0]?.id ?? '')
    setError('')
  }

  function prepare() {
    setError('')
    try {
      const state = useMoneeStore.getState()
      const today = getToday()
      const amountValue = Number(amount)
      const category = availableCategories.find(item => item.id === selectedCategoryId)
      const bucket = savingsDeposit
        ? state.buckets.find(item => item.isSavings)
        : availableBuckets.find(item => item.id === selectedBucketId)
      if (!Number.isSafeInteger(amountValue) || amountValue <= 0) {
        setError('ERR_AMOUNT_INVALID — Nominal harus lebih dari 0 rupiah utuh.')
        return false
      }
      if (!category) {
        setError('ERR_CATEGORY_INVALID — Pilih kategori yang tersedia.')
        return false
      }
      if (!date || date > today) {
        setError('ERR_DATE_INVALID — Tanggal transaksi tidak boleh di masa depan.')
        return false
      }
      if (kind === 'expense' && !bucket) {
        setError('ERR_BUCKET_INVALID — Pilih bucket pengeluaran.')
        return false
      }
      const now = Date.now()
      const transaction: Transaction = {
        id: crypto.randomUUID(),
        type: savingsDeposit ? 'savings_deposit' : kind,
        amount: amountValue,
        date,
        categoryId: selectedCategoryId,
        ...(kind === 'expense' && bucket ? { bucketId: bucket.id } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        refundedAmount: 0,
        deleted: false,
        createdAt: now,
        updatedAt: now,
      }
      const period = getConfiguredPeriod(date, state.profile?.periodStartDay ?? 1, state.profile?.periodChanges)
      const periodTxs = state.transactions.filter(item => !item.deleted && isInPeriod(item.date, period))
      const validation = validateTransaction(transaction, {
        buckets: state.buckets,
        periodTxs,
        savings: state.snapshot?.savings ?? { sisaBalance: 0, allocationBalance: 0, totalSavings: 0 },
        locked: isPeriodLocked(period.key, state.sweeps),
      })
      if (!validation.ok) {
        setError(`${validation.code} — ${validation.message}`)
        return false
      }
      draft.current = transaction
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transaksi belum tersimpan. Coba lagi, ya.')
      return false
    }
  }

  const footer = <div className="quick-add-footer">
      <p className="quick-add-savings-note">Setelah menyimpan, kamu punya 2 detik untuk membatalkan.</p>
      <FuseButton label="Simpan" undoWindow={2000} commitOn="press" settle="reset" disabled={!!error}
        beforeArm={prepare} onPhaseChange={setPhase} onSettled={onClose}
        getErrorMessage={cause => cause instanceof Error ? cause.message : 'Transaksi belum tersimpan.'}
        onCommit={async () => { if (!draft.current) throw new Error('Isi transaksi terlebih dahulu.'); setBusy(true); try { await useMoneeStore.getState().addTransaction(draft.current); saved.current = draft.current } catch (cause) { setError(cause instanceof Error ? cause.message : 'Transaksi belum tersimpan.'); throw cause } finally { setBusy(false) } }}
        onUndo={async () => { if (!saved.current) return; setBusy(true); try { await useMoneeStore.getState().updateTransaction({ ...saved.current, deleted: true, updatedAt: Date.now() }, saved.current); saved.current = null } finally { setBusy(false) } }} />
  </div>

  if (receiptOpen && open) return <Suspense fallback={<Dialog open sheet title="Scan struk" onClose={() => setReceiptOpen(false)}><Skeleton label="Menyiapkan scan struk" /></Dialog>}>
    <ReceiptDialog onClose={() => setReceiptOpen(false)} />
  </Suspense>

  if (voiceOpen && open) return <Suspense fallback={<Dialog open sheet title="Catat dengan suara" onClose={() => setVoiceOpen(false)}><Skeleton label="Menyiapkan voice" /></Dialog>}>
    <VoiceDialog onClose={() => setVoiceOpen(false)} />
  </Suspense>

  return <Dialog open={open} title="Tambah transaksi" onClose={() => { if (!busy && phase !== 'armed') onClose() }} sheet footer={footer}>
    <form className="quick-add-form" onSubmit={event => event.preventDefault()}><fieldset className="quick-add-fields" disabled={busy || phase !== 'idle'}>
      <RubberSegment aria-label="Jenis transaksi" items={['Pengeluaran', 'Pemasukan']}
        value={kind === 'expense' ? 'Pengeluaran' : 'Pemasukan'} onChange={switchKind} disabled={busy} />
      <TextField label="Nominal (Rp)" type="number" inputMode="numeric" min="1" step="1" required
        value={amount} onChange={event => { setAmount(event.target.value); setError('') }} autoFocus />
      <Button variant="secondary" onClick={() => setVoiceOpen(true)}><Mic size={18} aria-hidden="true" />Catat dengan suara</Button>
      <Button variant="secondary" onClick={() => setReceiptOpen(true)}><ScanLine size={18} aria-hidden="true" />Scan struk</Button>
      {error && <InlineError>{error}</InlineError>}
      <div className="quick-amounts" aria-label="Nominal cepat">{[5000,10000,20000,50000,100000].map(value => <button type="button" key={value} onClick={() => { setAmount(String(value)); setError('') }}>{value / 1000}rb</button>)}</div>
      <div className="quick-add-category-grid" role="group" aria-label="Kategori">{availableCategories.map(category => <button type="button" key={category.id} aria-pressed={selectedCategoryId === category.id} onClick={() => { setCategoryId(category.id); setError('') }}><span style={{ background: category.color }}><CategoryIcon name={category.icon} size={20} /></span>{category.name}</button>)}</div>
      {savingsDeposit && <p className="quick-add-savings-note">Setoran ini masuk ke Tabungan dan memakai saldo periode.</p>}
      {kind === 'expense' && !savingsDeposit && <div className="quick-add-buckets" role="group" aria-label="Bucket">{availableBuckets.map(bucket => {
        const item = progress.find(item => item.bucket.id === bucket.id)
        const full = !bucket.allowOverbudget && (item?.remaining ?? 0) <= 0
        return <button type="button" key={bucket.id} disabled={full} aria-pressed={selectedBucketId === bucket.id} onClick={() => { setBucketId(bucket.id); setError('') }}>{bucket.name}{full ? ' - penuh' : ''}<progress max="100" value={item?.progressPct ?? 0} /></button>
      })}</div>}
      <TextField label="Tanggal" type="date" value={date} max={getToday()} required
        onChange={event => { setDate(event.target.value); setError('') }} disabled={busy} />
      <TextField label="Catatan (opsional)" value={note} maxLength={200}
        placeholder="Tambahkan catatan" onChange={event => setNote(event.target.value)} disabled={busy} />
      </fieldset>
    </form>
  </Dialog>
}
