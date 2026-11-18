import { getConfiguredPeriod, offsetPeriod } from '@/core/finance/period-config'
import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button, Card, TextField } from '@/components/ui/controls'
import { InlineError } from '@/components/ui/feedback'
import { Dialog } from '@/components/ui/Dialog'
import { RubberSegment } from '@/components/reactbits/RubberSegment'
import { getToday, isInPeriod } from '@/core/finance/period'
import { calcBalance } from '@/core/finance/balance'
import { calcSavingsState } from '@/core/finance/savings'
import { isPeriodLocked } from '@/core/finance/period-lock'
import type { DateStr, Profile, Transaction } from '@/core/finance/types'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'
import { persistTransaction } from '@/features/transactions/persistence'
import { openDatabase } from '@/core/db/migrations'
import { FuseButton } from '@/components/reactbits/FuseButton'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
import { FinanceCharts } from '@/components/charts/FinanceCharts'
import { defaultCategoryId, transactionPresentation } from '@/core/finance/transaction-presentation'
import './history.css'

type PeriodMode = 'day' | 'week' | 'month' | 'year'
type TypeFilter = 'all' | Transaction['type']
interface DateRange { start: DateStr; end: DateStr; key: string }

function shiftDay(date: DateStr, offset: number): DateStr {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10)
}

function getRange(mode: PeriodMode, today: DateStr, offset: number, periodStartDay: number, periodChanges: Profile['periodChanges']): DateRange {
  if (mode === 'day') {
    const date = shiftDay(today, offset)
    return { start: date, end: date, key: date }
  }
  if (mode === 'week') {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
    const monday = shiftDay(today, -((weekday + 6) % 7) + offset * 7)
    return { start: monday, end: shiftDay(monday, 6), key: monday }
  }
  if (mode === 'month') {
    return offsetPeriod(today, offset, periodStartDay, periodChanges)
  }
  const year = Number(today.slice(0, 4)) + offset
  return { start: `${year}-01-01`, end: `${year}-12-31`, key: `${year}` }
}

function displayDate(date: DateStr, options: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('id-ID', { ...options, timeZone: 'UTC' })
}

function typeLabel(type: Transaction['type']) {
  if (type === 'income') return 'Pemasukan'
  if (type === 'savings_deposit') return 'Setoran tabungan'
  if (type === 'savings_expense') return 'Pengeluaran tabungan'
  return 'Pengeluaran'
}

function TransactionDetail({ transaction, onClose, locked }: { transaction: Transaction; onClose: () => void; locked: boolean }) {
  const rupiah = useRupiah()
  const categories = useMoneeStore(state => state.categories)
  const buckets = useMoneeStore(state => state.buckets)
  const transactions = useMoneeStore(state => state.transactions)
  const sweeps = useMoneeStore(state => state.sweeps)
  const updateTransaction = useMoneeStore(state => state.updateTransaction)
  const [current, setCurrent] = useState(transaction)
  const [mode, setMode] = useState<'view' | 'edit' | 'refund' | 'delete'>('view')
  const [amount, setAmount] = useState(String(transaction.amount))
  const [type, setType] = useState<'income' | 'expense' | 'savings_deposit'>(
    transaction.type === 'income' || transaction.type === 'savings_deposit' ? transaction.type : 'expense',
  )
  const [date, setDate] = useState(transaction.date)
  const [bucketId, setBucketId] = useState(transaction.bucketId ?? '')
  const [note, setNote] = useState(transaction.note ?? '')
  const [refundAmount, setRefundAmount] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('idle')
  const currentBucket = buckets.find(item => item.id === current.bucketId)
  const editableBuckets = buckets.filter(item => !item.isSavings).sort((a, b) => a.sortOrder - b.sortOrder)
  const selectableCategoryId = defaultCategoryId(categories, type, current.categoryId)
  const selectableBucketId = type === 'savings_deposit' ? buckets.find(item => item.isSavings)?.id
    : editableBuckets.some(item => item.id === bucketId) ? bucketId : editableBuckets[0]?.id

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amountValue = Number(amount)
    if (!Number.isSafeInteger(amountValue) || amountValue <= 0) { setError('ERR_AMOUNT_INVALID — Nominal harus lebih dari 0 rupiah utuh.'); return }
    if (type === 'expense' && amountValue < (current.refundedAmount ?? 0)) {
      setError(`ERR_REFUND_INVALID — Nominal minimal ${rupiah(current.refundedAmount ?? 0)} karena refund sudah tercatat.`); return
    }
    const selectedCategory = categories.find(item => item.id === selectableCategoryId)
    const selectedBucket = buckets.find(item => item.id === selectableBucketId)
    if (!selectedCategory || (type === 'expense' && (!selectedBucket || selectedBucket.isSavings))) {
      setError('Pilih bucket yang tersedia.'); return
    }
    if (!date || date > getToday()) { setError('ERR_DATE_INVALID — Tanggal transaksi tidak boleh di masa depan.'); return }
    const updated: Transaction = { ...current, type, amount: amountValue, date, categoryId: selectedCategory.id, updatedAt: Date.now() }
    if (type === 'income') delete updated.bucketId
    else if (selectableBucketId) updated.bucketId = selectableBucketId
    delete updated.savingsSource
    updated.refundedAmount = type === 'expense' ? current.refundedAmount ?? 0 : 0
    if (note.trim()) updated.note = note.trim()
    else delete updated.note
    const savingsAfterEdit = calcSavingsState(sweeps, transactions.map(item => item.id === current.id ? updated : item))
    if (savingsAfterEdit.sisaBalance < 0 || savingsAfterEdit.allocationBalance < 0) {
      setError('ERR_KOMPARTEMEN_KURANG — Koreksi ini membuat saldo kompartemen tabungan negatif.'); return
    }
    setBusy(true); setError('')
    try {
      await updateTransaction(updated, current)
      setCurrent(updated); setMode('view')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Transaksi belum tersimpan.') }
    finally { setBusy(false) }
  }

  async function saveRefund() {
    const value = Number(refundAmount)
    const available = current.amount - (current.refundedAmount ?? 0)
    if (!Number.isSafeInteger(value) || value <= 0 || value > available) {
      throw new Error(`ERR_REFUND_INVALID — Refund maksimal ${rupiah(Math.max(0, available))}.`)
    }
    setBusy(true); setError('')
    try {
      const updated = { ...current, refundedAmount: (current.refundedAmount ?? 0) + value, updatedAt: Date.now() }
      await updateTransaction(updated, current); setCurrent(updated)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Refund belum tersimpan.'); throw cause }
    finally { setBusy(false) }
  }

  async function confirmDelete() {
    setBusy(true); setError('')
    const deleted = { ...current, deleted: true, updatedAt: Date.now() }
    try { await updateTransaction(deleted, current) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Transaksi belum terhapus.'); throw cause }
    finally { setBusy(false) }
  }

  return <Dialog open title="Detail transaksi" onClose={() => { if (!busy && phase === 'idle') onClose() }} sheet>
    {mode === 'view' && <>
      <dl className="history-detail">
        <div><dt>Jenis</dt><dd>{typeLabel(current.type)}</dd></div>
        <div><dt>Nominal</dt><dd className="font-tabular">{rupiah(current.amount)}</dd></div>
        <div><dt>Tanggal</dt><dd>{displayDate(current.date, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
        {currentBucket && <div><dt>Bucket</dt><dd>{currentBucket.name}</dd></div>}
        {current.note && <div><dt>Catatan</dt><dd>{current.note}</dd></div>}
        {(current.refundedAmount ?? 0) > 0 && <div><dt>Refund</dt><dd>{rupiah(current.refundedAmount ?? 0)}</dd></div>}
      </dl>
      {locked ? <p className="history-locked-note" role="status">Periode ini sudah ditutup. Transaksi hanya bisa dilihat.</p> : <div className="history-actions">
        <Button variant="secondary" onClick={() => { setAmount(String(current.amount)); setType(current.type === 'income' || current.type === 'savings_deposit' ? current.type : 'expense'); setDate(current.date); setBucketId(current.bucketId ?? ''); setNote(current.note ?? ''); setMode('edit'); setError('') }}>Edit transaksi</Button>
        {current.type === 'expense' && (current.refundedAmount ?? 0) < current.amount && <Button variant="secondary" onClick={() => { setMode('refund'); setError('') }}>Refund</Button>}
        <Button variant="ghost" onClick={() => { setMode('delete'); setError('') }}>Hapus transaksi</Button>
      </div>}
    </>}
    {mode === 'edit' && <form className="history-edit-form" onSubmit={event => { void saveEdit(event) }}>
      <label htmlFor="history-edit-type">Jenis<select id="history-edit-type" value={type} disabled={busy} onChange={event => { setType(event.target.value as typeof type); setError('') }}>
        <option value="income">Pemasukan</option><option value="expense">Pengeluaran</option><option value="savings_deposit">Setoran tabungan</option>
      </select></label>
      <TextField label="Nominal transaksi" type="number" inputMode="numeric" min="1" step="1" value={amount} onChange={event => { setAmount(event.target.value); setError('') }} />
      <TextField label="Tanggal transaksi" type="date" max={getToday()} value={date} onChange={event => { setDate(event.target.value); setError('') }} />
      {type !== 'income' && <label htmlFor="history-edit-bucket">Bucket<select id="history-edit-bucket" value={selectableBucketId} disabled={busy || type === 'savings_deposit'} onChange={event => setBucketId(event.target.value)}>
        {type === 'savings_deposit' ? buckets.filter(item => item.isSavings).map(item => <option key={item.id} value={item.id}>{item.name}</option>) : editableBuckets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>}
      <TextField label="Catatan transaksi" value={note} maxLength={200} onChange={event => setNote(event.target.value)} />
      {error && <InlineError>{error}</InlineError>}
      <div className="history-actions"><Button type="submit" loading={busy}>Simpan perubahan</Button><Button variant="ghost" disabled={busy || phase !== 'idle'} onClick={() => setMode('view')}>Batal</Button></div>
    </form>}
    {mode === 'refund' && <form className="history-edit-form" onSubmit={event => event.preventDefault()}>
      <p>Refund mengurangi pengeluaran dan menambah saldo periode. Refund tersisa {rupiah(current.amount - (current.refundedAmount ?? 0))}.</p>
      <TextField label="Nominal refund" type="number" inputMode="numeric" min="1" step="1" max={current.amount - (current.refundedAmount ?? 0)} value={refundAmount} disabled={phase !== 'idle'} onChange={event => { setRefundAmount(event.target.value); setError('') }} />
      {error && <InlineError>{error}</InlineError>}
      <div className="history-actions"><FuseButton label="Simpan refund" doneLabel="Refund tersimpan" undoWindow={4000} commitOn="fuseEnd" settle="reset" onPhaseChange={setPhase} onSettled={onClose}
        beforeArm={async () => { const value = Number(refundAmount); if (!Number.isSafeInteger(value) || value <= 0 || value > current.amount - (current.refundedAmount ?? 0)) { setError('ERR_REFUND_INVALID - Periksa nominal refund.'); return false } try { await persistTransaction(await openDatabase(), { ...current, refundedAmount: (current.refundedAmount ?? 0) + value }, current, true); return true } catch (cause) { setError(cause instanceof Error ? cause.message : 'Refund belum dapat disimpan.'); return false } }}
        onCommit={saveRefund} onUndo={() => {}} getErrorMessage={cause => cause instanceof Error ? cause.message : 'Refund belum tersimpan.'} /><Button variant="ghost" disabled={busy || phase !== 'idle'} onClick={() => setMode('view')}>Batal</Button></div>
    </form>}
    {mode === 'delete' && <div className="history-edit-form"><p>Transaksi ini akan dihapus dari ringkasan. Perubahan saldo dan jatah akan dihitung ulang.</p>
      {error && <InlineError>{error}</InlineError>}
      <div className="history-actions"><FuseButton label="Ya, hapus" doneLabel="Transaksi dihapus" undoWindow={4000} commitOn="fuseEnd" settle="reset" onPhaseChange={setPhase} onSettled={onClose} beforeArm={async () => { try { await persistTransaction(await openDatabase(), { ...current, deleted: true }, current, true); return true } catch (cause) { setError(cause instanceof Error ? cause.message : 'Transaksi belum dapat dihapus.'); return false } }} onCommit={confirmDelete} onUndo={() => {}} getErrorMessage={cause => cause instanceof Error ? cause.message : 'Transaksi belum terhapus.'} /><Button variant="ghost" disabled={busy || phase !== 'idle'} onClick={() => setMode('view')}>Batal</Button></div>
    </div>}
  </Dialog>
}

export function HistoryScreen() {
  const rupiah = useRupiah()
  const transactions = useMoneeStore(state => state.transactions)
  const buckets = useMoneeStore(state => state.buckets)
  const profile = useMoneeStore(state => state.profile)
  const sweeps = useMoneeStore(state => state.sweeps)
  const [mode, setMode] = useState<PeriodMode>('month')
  const [offset, setOffset] = useState(0)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [bucketFilter, setBucketFilter] = useState('all')
  const [minimum, setMinimum] = useState('')
  const [maximum, setMaximum] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const today = getToday()
  const range = getRange(mode, today, offset, profile?.periodStartDay ?? 1, profile?.periodChanges)
  const mainTransactions = transactions.filter(transaction => !transaction.deleted && transaction.type !== 'savings_expense')
  const periodTransactions = mainTransactions.filter(transaction => isInPeriod(transaction.date, range))
  const summary = calcBalance(periodTransactions)
  const visibleTransactions = periodTransactions.filter(transaction => {
    if (typeFilter !== 'all' && transaction.type !== typeFilter) return false
    if (bucketFilter !== 'all' && transaction.bucketId !== bucketFilter) return false
    if (minimum && transaction.amount < Number(minimum)) return false
    if (maximum && transaction.amount > Number(maximum)) return false
    if (dateFrom && transaction.date < dateFrom) return false
    if (dateTo && transaction.date > dateTo) return false
    if (query) {
      const bucketName = transactionPresentation(transaction, buckets).name
      if (!`${transaction.note ?? ''} ${bucketName}`.toLocaleLowerCase('id-ID').includes(query.toLocaleLowerCase('id-ID'))) return false
    }
    return true
  }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)

  const groups = useMemo(() => {
    const map = new Map<DateStr, Transaction[]>()
    for (const transaction of visibleTransactions) {
      const group = map.get(transaction.date) ?? []
      group.push(transaction)
      map.set(transaction.date, group)
    }
    return [...map.entries()].map(([date, items]) => ({ date, items, totals: calcBalance(items) }))
  }, [visibleTransactions])

  const rangeLabel = mode === 'day'
    ? displayDate(range.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : `${displayDate(range.start, { day: 'numeric', month: 'short' })} – ${displayDate(range.end, { day: 'numeric', month: 'short', year: 'numeric' })}`
  const canGoForward = range.end < today
  const resetFilters = () => {
    setTypeFilter('all'); setBucketFilter('all')
    setMinimum(''); setMaximum(''); setDateFrom(''); setDateTo(''); setQuery('')
  }

  return <section className="history-screen" aria-label="Riwayat transaksi">
    <header className="history-header"><div><h1>Riwayat</h1><p>Semua pemasukan dan pengeluaran</p></div>{mainTransactions.length > 0 && <MascotCanvas mascotId={profile?.mascotId ?? 'mochi'} state="thinking" size={72} />}</header>
    <RubberSegment aria-label="Periode riwayat" items={[
      { value: 'day', label: 'Hari' }, { value: 'week', label: 'Minggu' },
      { value: 'month', label: 'Bulan' }, { value: 'year', label: 'Tahun' },
    ]} value={mode} onChange={value => { setMode(value as PeriodMode); setOffset(0) }} />
    <div className="history-range">
      <button type="button" aria-label="Periode sebelumnya" onClick={() => setOffset(value => value - 1)}><ArrowLeft size={18} /></button>
      <strong>{rangeLabel}</strong>
      <button type="button" aria-label="Periode selanjutnya" disabled={!canGoForward}
        onClick={() => setOffset(value => value + 1)}><ArrowRight size={18} /></button>
    </div>
    <section className="history-summary" aria-label="Ringkasan periode">
      <Card><span>Pemasukan</span><strong className="font-tabular">{rupiah(summary.totalIncome)}</strong></Card>
      <Card><span>Uang keluar</span><strong className="font-tabular">{rupiah(summary.totalExpense + summary.totalSavingsDeposit)}</strong>
        {summary.totalSavingsDeposit > 0 && <small>Termasuk setoran tabungan</small>}</Card>
      <Card><span>Sisa periode</span><strong className="font-tabular">{rupiah(summary.balance)}</strong></Card>
    </section>
    <details className="history-filters">
      <summary>Filter transaksi</summary>
      <div className="history-filter-grid">
        <label htmlFor="history-type">Jenis transaksi<select id="history-type" aria-label="Filter tipe" value={typeFilter}
          onChange={event => setTypeFilter(event.target.value as TypeFilter)}>
          <option value="all">Semua jenis</option><option value="income">Pemasukan</option>
          <option value="expense">Pengeluaran</option><option value="savings_deposit">Setoran tabungan</option>
        </select></label>
        <label htmlFor="history-bucket">Bucket<select id="history-bucket" aria-label="Filter bucket" value={bucketFilter}
          onChange={event => setBucketFilter(event.target.value)}>
          <option value="all">Semua bucket</option>
          {buckets.map(bucket => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}
        </select></label>
        <TextField label="Nominal minimum" type="number" min="0" value={minimum} onChange={event => setMinimum(event.target.value)} />
        <TextField label="Nominal maksimum" type="number" min="0" value={maximum} onChange={event => setMaximum(event.target.value)} />
        <TextField label="Dari tanggal" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
        <TextField label="Sampai tanggal" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} />
        <TextField label="Kata kunci" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari catatan atau bucket" />
        <Button variant="ghost" onClick={resetFilters}>Reset filter</Button>
      </div>
    </details>
    <details className="history-analytics"><summary>Grafik periode</summary>
      <p>Mengikuti periode dan filter yang kamu pilih.</p>
      <FinanceCharts transactions={visibleTransactions} buckets={buckets} />
    </details>
    <section className="history-list" aria-label="Daftar riwayat">
      {groups.length > 0 ? groups.map(group => <section className="history-day" key={group.date} aria-label={displayDate(group.date, { weekday: 'long', day: 'numeric', month: 'long' })}>
        <header><h2>{displayDate(group.date, { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
          <span className="font-tabular">{rupiah(group.totals.balance)}</span></header>
        <Card><ul>{group.items.map(transaction => {
          const income = transaction.type === 'income'
          const presentation = transactionPresentation(transaction, buckets)
          const label = presentation.name
          return <li key={transaction.id}>
            <button type="button" className="history-transaction" onClick={() => setSelected(transaction)}
              aria-label={`${label}${transaction.note ? `, ${transaction.note}` : ''}, ${rupiah(transaction.amount - (transaction.type === 'expense' ? transaction.refundedAmount ?? 0 : 0))}${transaction.refundedAmount ? `, refund ${rupiah(transaction.refundedAmount)}` : ''}`}>
              <span className={`history-transaction-icon${income ? ' is-income' : ''}`} style={{ background: presentation.color }} aria-hidden="true">
                <CategoryIcon name={presentation.icon} size={18} />
              </span>
              <span className="history-transaction-copy"><strong>{label}</strong>{transaction.note && <small>{transaction.note}</small>}
                {!!transaction.refundedAmount && <small>Refund {rupiah(transaction.refundedAmount)} · awal {rupiah(transaction.amount)}</small>}</span>
              <strong className={`font-tabular ${income ? 'history-amount-income' : 'history-amount-expense'}`}>{income ? '+' : '−'}{rupiah(transaction.amount - (transaction.type === 'expense' ? transaction.refundedAmount ?? 0 : 0))}</strong>
            </button>
          </li>
        })}</ul></Card>
      </section>) : <div className={`history-empty${periodTransactions.length === 0 ? ' history-empty--initial' : ''}`}>
        {periodTransactions.length === 0 && <div className="history-empty-blob"><MascotCanvas mascotId={profile?.mascotId ?? 'mochi'} state="idle" size={144} /></div>}
        <h2>{periodTransactions.length === 0 ? 'Belum ada transaksi' : 'Tidak ada transaksi yang cocok'}</h2>
        <p>{periodTransactions.length === 0 ? 'Yuk, catat pengeluaran pertamamu. Mulai dari kopi, ojek, atau makan siang.' : 'Coba ubah atau reset filter transaksi.'}</p>
        {periodTransactions.length === 0 && <><Button onClick={() => window.dispatchEvent(new CustomEvent('monee:quick-add'))}>Tambah transaksi pertama</Button><p>{profile?.mascotId === 'luna' ? 'Luna' : profile?.mascotId === 'bumi' ? 'Bumi' : 'Mochi'} akan menjaga sisanya dulu.</p></>}
        {periodTransactions.length > 0 && <Button variant="secondary" onClick={resetFilters}>Reset filter</Button>}
      </div>}
    </section>
    {selected && <TransactionDetail transaction={selected} locked={isPeriodLocked(
      getConfiguredPeriod(selected.date, profile?.periodStartDay ?? 1, profile?.periodChanges).key,
      sweeps,
    )} onClose={() => setSelected(null)} />}
  </section>
}
