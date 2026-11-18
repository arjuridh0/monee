import { getConfiguredPeriod } from '@/core/finance/period-config'
import { formatPercent } from '@/core/finance/percent'
import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, LockKeyhole, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, ProgressBar } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
import { FlipCard } from '@/components/reactbits/FlipCard'
import { getToday } from '@/core/finance/period'
import { validateTransaction } from '@/core/finance/guards'
import type { BucketProgress, Bucket } from '@/core/finance/types'
import { transactionPresentation } from '@/core/finance/transaction-presentation'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { isPeriodLocked } from '@/core/finance/period-lock'
import { recordRecurring } from '@/core/finance/recurring'
import type { FinanceSnapshot } from '@/core/finance/selectors'
import type { MonthSweep, Transaction } from '@/core/finance/types'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'
import type { RecurringIncome } from '@/core/finance/types'
import { IncomeStep, type FirstIncome } from './IncomeStep'
import { MASCOT_THEMES } from '@/theme/mascot-themes'
import './onboarding.css'
import './welcome-dashboard.css'

interface SalaryAction {
  recurring: RecurringIncome
  status: 'saving' | 'recorded'
}

function BucketProgressCard({ item }: { item: BucketProgress }) {
  const rupiah = useRupiah()
  const { bucket, budgetAmount, spentAmount, progressPct } = item
  return <div className={`dashboard-bucket${bucket.isSavings ? ' dashboard-bucket--savings' : ''}`}
    role="group" aria-label={`Jatah ${bucket.name}`}>
    <div className="dashboard-bucket-heading"><span className="dashboard-bucket-icon" style={{ background: bucket.color }}><CategoryIcon name={bucket.icon} /></span><h3>{bucket.name}</h3>
      {progressPct > 100 && <span className="dashboard-overbudget">Lewat jatah</span>}
      <span className="dashboard-bucket-percent">{formatPercent(progressPct)}%</span>
    </div>
    <ProgressBar label={`Pemakaian ${bucket.name}`} value={progressPct} />
    <p className="dashboard-bucket-amount"><strong className="font-tabular">{rupiah(spentAmount)}</strong>
      <span>dari {rupiah(budgetAmount)}</span></p>
  </div>
}

const byBucketOrder = (a: BucketProgress, b: BucketProgress) => a.bucket.sortOrder - b.bucket.sortOrder

function RecentTransaction({ transaction, buckets }: {
  transaction: NonNullable<ReturnType<typeof useMoneeStore.getState>['snapshot']>['recentTxs'][number]
  buckets: Bucket[]
}) {
  const rupiah = useRupiah()
  const isIncome = transaction.type === 'income'
  const presentation = transactionPresentation(transaction, buckets)
  const label = presentation.name
  const date = new Date(`${transaction.date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  return <li className="welcome-transaction">
    <span className={`welcome-transaction-icon${isIncome ? ' welcome-transaction-icon--income' : ''}`} style={{ background: presentation.color }} aria-hidden="true">
      <CategoryIcon name={presentation.icon} />
    </span>
    <span className="welcome-transaction-copy"><strong>{label}</strong>
      {transaction.note && <span>{transaction.note}</span>}
    </span>
    <span className="welcome-transaction-amount">
      <time dateTime={transaction.date}>{date}</time>
      <strong className={`font-tabular ${isIncome ? 'money-income' : 'money-expense'}`}>{isIncome ? '+' : '−'}{rupiah(transaction.amount - (transaction.type === 'expense' ? transaction.refundedAmount ?? 0 : 0))}</strong>
      {!!transaction.refundedAmount && <small>Refund {rupiah(transaction.refundedAmount)} · awal {rupiah(transaction.amount)}</small>}
    </span>
  </li>
}

function SavingsPockets({ snapshot, onOpenSavings }: { snapshot: FinanceSnapshot; onOpenSavings: () => void }) {
  const rupiah = useRupiah()
  return <div className="dashboard-savings-pockets">
    <button type="button" className="dashboard-savings-pocket" onClick={onOpenSavings} aria-label={`Sisa ${rupiah(snapshot.savings.sisaBalance)}, buka Tabungan`}>
      <span>Sisa</span><strong className="font-tabular">{rupiah(snapshot.savings.sisaBalance)}</strong><small>Dari saldo akhir</small>
    </button>
    <button type="button" className="dashboard-savings-pocket" onClick={onOpenSavings} aria-label={`Dari Allocation ${rupiah(snapshot.savings.allocationBalance)}, buka Tabungan`}>
      <span>Dari Allocation</span><strong className="font-tabular">{rupiah(snapshot.savings.allocationBalance)}</strong><small>Tujuan impianmu</small>
    </button>
  </div>
}

function SavingsBack({ snapshot, transactions, sweeps, onDeposit, onSpend }: {
  snapshot: FinanceSnapshot
  transactions: Transaction[]
  sweeps: MonthSweep[]
  onDeposit: () => void
  onSpend: () => void
}) {
  const rupiah = useRupiah()
  const activities = [
    ...transactions.filter(tx => !tx.deleted && (tx.type === 'savings_deposit' || tx.type === 'savings_expense'))
      .map(tx => ({ id: tx.id, createdAt: tx.createdAt, title: tx.type === 'savings_deposit' ? 'Setoran Allocation' : tx.note || 'Pakai tabungan', amount: tx.amount, incoming: tx.type === 'savings_deposit' })),
    ...sweeps.map(sweep => ({ id: sweep.id, createdAt: sweep.sweptAt, title: `Sweep Sisa · ${sweep.periodKey}`, amount: sweep.amount, incoming: true })),
  ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3)
  return <section className="dashboard-savings-back" aria-label="Rincian tabungan">
    <Card className="dashboard-sisa-detail"><h2>Sisa</h2><strong className="font-tabular">{rupiah(snapshot.savings.sisaBalance)}</strong><p>Dari saldo akhir periode yang disapu</p>
      <Button variant="secondary" onClick={onSpend}>Pakai dana Sisa</Button></Card>
    <div className="dashboard-savings-actions">
      <Button onClick={onDeposit}>Setor</Button>
      <Button variant="secondary" onClick={onSpend}>Pakai</Button>
    </div>
    <section className="dashboard-savings-section" aria-label="Tujuan tabungan">
      <h2>Tujuan tabungan</h2>
      {snapshot.savings.goals.length > 0 ? <ul className="dashboard-savings-goals">
        {snapshot.savings.goals.slice(0, 2).map(item => <li key={item.goal.id}>
          <div><strong>{item.goal.name}</strong><span className="font-tabular">{rupiah(item.allocated)} / {rupiah(item.goal.targetAmount)}</span></div>
          <ProgressBar label={`Progress ${item.goal.name}`} value={item.progressPct} />
        </li>)}
      </ul> : <p>Belum ada tujuan tabungan.</p>}
    </section>
    <section className="dashboard-savings-section" aria-label="Aktivitas tabungan terbaru">
      <h2>Aktivitas terbaru</h2>
      {activities.length > 0 ? <ul className="dashboard-savings-activity">
        {activities.map(item => <li key={item.id}><span>{item.title}</span>
          <strong className="font-tabular">{item.incoming ? '+' : '−'}{rupiah(item.amount)}</strong></li>)}
      </ul> : <p>Aktivitas tabungan akan muncul di sini.</p>}
    </section>
  </section>
}

/** Dashboard shell with the bucket, transaction, and savings panels. */
export function WelcomeDashboard() {
  const rupiah = useRupiah()
  const navigate = useNavigate()
  const profile = useMoneeStore(state => state.profile)
  const snapshot = useMoneeStore(state => state.snapshot)
  const categories = useMoneeStore(state => state.categories)
  const buckets = useMoneeStore(state => state.buckets)
  const transactions = useMoneeStore(state => state.transactions)
  const sweeps = useMoneeStore(state => state.sweeps)
  const addTransaction = useMoneeStore(state => state.addTransaction)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [salaryError, setSalaryError] = useState('')
  const [salaryActions, setSalaryActions] = useState<Record<string, SalaryAction>>({})
  const [focusRecentTitle, setFocusRecentTitle] = useState(false)
  const [savingsFlipped, setSavingsFlipped] = useState(false)
  const inFlight = useRef(false)
  const salaryInFlight = useRef(new Set<string>())
  const hasIncome = Boolean(snapshot && snapshot.balance.totalIncome > 0)

  useEffect(() => {
    const completed = Object.values(salaryActions).find(action => action.status === 'recorded')
    if (completed) document.getElementById(`salary-action-${encodeURIComponent(completed.recurring.id)}`)
      ?.focus({ preventScroll: true })
  }, [salaryActions])

  useEffect(() => {
    if (!focusRecentTitle) return
    document.getElementById('recent-transactions-title')?.focus({ preventScroll: true })
    setFocusRecentTitle(false)
  }, [focusRecentTitle, snapshot?.recentTxs])

  async function saveIncome(income: FirstIncome | null) {
    if (!income) { setAdding(false); return }
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const now = Date.now()
      const tx = { ...income, id: crypto.randomUUID(), type: 'income' as const,
        deleted: false, refundedAmount: 0, createdAt: now, updatedAt: now }
      const state = useMoneeStore.getState()
      const period = getConfiguredPeriod(income.date, state.profile?.periodStartDay ?? 1, state.profile?.periodChanges)
      const validation = validateTransaction(tx, { buckets: state.buckets, periodTxs: [],
        savings: state.snapshot?.savings ?? { sisaBalance: 0, allocationBalance: 0, totalSavings: 0 },
        locked: isPeriodLocked(period.key, state.sweeps) })
      if (!validation.ok) throw new Error(validation.message)
      if (!categories.some(category => category.id === income.categoryId && category.type === 'income')
        || income.date > getToday()) throw new Error('Periksa kategori dan tanggal pemasukan, ya.')
      await addTransaction(tx)
      setAdding(false)
      setFocusRecentTitle(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pemasukan belum tersimpan. Coba lagi, ya.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function saveRecurringIncome(recurring: RecurringIncome) {
    if (salaryInFlight.current.has(recurring.id) || salaryActions[recurring.id]?.status === 'recorded') return
    salaryInFlight.current.add(recurring.id)
    setSalaryActions(actions => ({ ...actions, [recurring.id]: { recurring, status: 'saving' } }))
    setSalaryError('')
    let saved = false
    try {
      const state = useMoneeStore.getState()
      if (!state.snapshot || !state.profile) throw new Error('Data periode belum siap. Coba lagi, ya.')
      const period = state.snapshot.period
      const income = recordRecurring(recurring, {
        period,
        today: getToday(),
        existingTxs: state.snapshot.periodTxs,
        id: `recurring:${recurring.id}:${period.key}`,
        now: Date.now(),
      })
      if (!income) {
        await state.load()
        return
      }
      if (!categories.some(category => category.id === recurring.categoryId && category.type === 'income')) {
        throw new Error('Kategori pemasukan pada template gaji sudah tidak tersedia.')
      }
      const validation = validateTransaction(income, {
        buckets: state.buckets,
        periodTxs: state.snapshot.periodTxs,
        savings: state.snapshot.savings,
        locked: isPeriodLocked(period.key, state.sweeps),
      })
      if (!validation.ok) throw new Error(validation.message)
      await addTransaction(income)
      saved = true
      setSalaryActions(actions => ({ ...actions, [recurring.id]: { recurring, status: 'recorded' } }))
    } catch (cause) {
      setSalaryError(cause instanceof Error ? cause.message : 'Gaji belum tercatat. Coba lagi, ya.')
    } finally {
      salaryInFlight.current.delete(recurring.id)
      if (!saved) setSalaryActions(actions => {
        const next = { ...actions }
        delete next[recurring.id]
        return next
      })
    }
  }

  const dueRecurring = snapshot?.recurringDue ?? []
  const recurringRows = [
    ...dueRecurring.map(recurring => ({ recurring, status: salaryActions[recurring.id]?.status ?? 'due' as const })),
    ...Object.values(salaryActions).filter(action => !dueRecurring.some(recurring => recurring.id === action.recurring.id)),
  ]

  return <section className="welcome-dashboard">
    <header className="welcome-header"><div><h1>Beranda</h1><p>Hai, {profile?.name}!</p></div>
      {profile?.pinHash && profile.pinSalt && <Button variant="secondary" aria-label="Kunci Monee" onClick={() => useMoneeStore.getState().setLocked(true)}><LockKeyhole size={18} aria-hidden="true" /></Button>}</header>
    {hasIncome && snapshot ? <>
      <div className={`dashboard-balance-stage${savingsFlipped ? ' dashboard-balance-stage--back' : ''}`}>
        <div className="dashboard-hero-mascot"><MascotCanvas mascotId={profile?.mascotId ?? 'mochi'} state={savingsFlipped ? 'happy' : 'idle'} size={190} /></div>
        <FlipCard flipped={savingsFlipped} onFlipChange={setSavingsFlipped}
          front={<div className="welcome-balance"><strong aria-label="Saldo periode" className="font-tabular">{rupiah(snapshot.balance.balance)}</strong>
            <div className="dashboard-money-summary"><span className="money-income"><ArrowDownLeft size={14} /> Masuk {rupiah(snapshot.balance.totalIncome)}</span>
              <span className="money-expense"><ArrowUpRight size={14} /> Belanja {rupiah(snapshot.balance.totalExpense)}</span>
              <span className="money-savings">Ke tabungan {rupiah(snapshot.balance.totalSavingsDeposit)}</span></div>
            <small>{snapshot.period.start} — {snapshot.period.end}</small></div>}
          back={<section aria-label="Ringkasan tabungan"><div className="dashboard-savings-total"><span>Total tabungan</span><strong className="font-tabular">{rupiah(snapshot.savings.totalSavings)}</strong></div>
            <SavingsPockets snapshot={snapshot} onOpenSavings={() => navigate('/tabungan')} /></section>} />
      </div>
      {!savingsFlipped && <>
      <section className="welcome-allocation" aria-label="Alokasi bulan ini"><h2>Jatah bulan ini</h2>
        <div className="welcome-buckets-grid">
          {snapshot.buckets.filter(item => !item.bucket.isSavings).sort(byBucketOrder)
            .map(item => <BucketProgressCard key={item.bucket.id} item={item} />)}
          {snapshot.buckets.filter(item => item.bucket.isSavings).sort(byBucketOrder)
            .map(item => <BucketProgressCard key={item.bucket.id} item={item} />)}
        </div>
      </section>
      <SavingsPockets snapshot={snapshot} onOpenSavings={() => navigate('/tabungan')} />
      <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" /> Tambah pemasukan</Button>
      </>}
      {savingsFlipped && <SavingsBack snapshot={snapshot} transactions={transactions} sweeps={sweeps}
        onDeposit={() => navigate('/tabungan?action=deposit')} onSpend={() => navigate('/tabungan?action=spend')} />}
    </> : <div className="welcome-empty"><h2>Belum ada pemasukan bulan ini</h2>
      <div className="welcome-companion"><MascotCanvas mascotId={profile?.mascotId ?? 'mochi'} state="greeting" size={154} /></div>
      <p className="welcome-greeting">Aku {MASCOT_THEMES[profile?.mascotId ?? 'mochi'].name}. Yuk mulai catat!</p>
      <p>Mulai dari satu pemasukan. Jatahmu akan terbagi sesuai rencana yang sudah kamu pilih.</p>
      <Button onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" /> Tambah pemasukan</Button></div>}
    {!savingsFlipped && recurringRows.length > 0 && <Card className="welcome-recurring">
      <div><h2>{dueRecurring.length > 0 ? 'Gaji bulan ini belum dicatat' : 'Gaji tercatat'}</h2>
        {recurringRows.map(({ recurring, status }) => <div className="welcome-recurring-row" key={recurring.id}>
          <div><strong>{recurring.name}</strong><span className="font-tabular">{rupiah(recurring.amount)}</span></div>
          <Button variant={status === 'recorded' ? 'secondary' : 'primary'}
            aria-disabled={status === 'recorded' || undefined} id={`salary-action-${encodeURIComponent(recurring.id)}`}
            loading={status === 'saving'}
            onClick={() => { void saveRecurringIncome(recurring) }}
            aria-label={status === 'recorded' ? 'Gaji tercatat'
              : recurringRows.length > 1 ? `Catat gaji ${recurring.name}` : 'Catat gaji'}>
            {status === 'recorded' ? 'Tercatat' : 'Catat gaji'}
          </Button>
        </div>)}
      </div>
      {salaryError && <InlineError>{salaryError}</InlineError>}
    </Card>}
    {!savingsFlipped && snapshot && <section className="welcome-recent" aria-label="Transaksi terakhir">
      <header><h2 id="recent-transactions-title" tabIndex={-1}>Transaksi terakhir</h2><Link to="/riwayat">Lihat semua</Link></header>
      {snapshot.recentTxs.length > 0 ? <Card className="welcome-recent-card">
        <ol aria-label="Daftar transaksi terakhir">
          {snapshot.recentTxs.map(transaction => <RecentTransaction key={transaction.id} transaction={transaction}
            buckets={buckets} />)}
        </ol>
      </Card> : <p className="welcome-recent-empty">
        Belum ada transaksi bulan ini. Catat pemasukan atau transaksi pertamamu, nanti muncul di sini.
      </p>}
    </section>}
    {adding && <Dialog open title="Tambah pemasukan" onClose={() => { if (!busy) setAdding(false) }}>
      <IncomeStep standalone income={null} categories={categories} busy={busy} onNext={income => { void saveIncome(income) }} />
      {error && <InlineError>{error}</InlineError>}
    </Dialog>}
  </section>
}
