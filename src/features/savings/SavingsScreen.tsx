import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PiggyBank } from 'lucide-react'
import { Button, Card } from '@/components/ui/controls'
import { useMoneeStore } from '@/store'
import { useRupiah } from '@/hooks/useRupiah'
import { periodLabel } from './format'
import { SavingsExpenseDialog } from './SavingsExpenseDialog'
import { SavingsDepositDialog } from './SavingsDepositDialog'
import type { SavingsSource } from '@/core/finance/types'
import { GoalsPanel } from './GoalsPanel'
import { SavingsLedger } from './SavingsLedger'
import { MascotCanvas } from '@/features/mascot/MascotCanvas'
import './savings.css'

export function SavingsScreen() {
  const rupiah = useRupiah()
  const snapshot = useMoneeStore(state => state.snapshot)
  const sweeps = useMoneeStore(state => state.sweeps)
  const transactions = useMoneeStore(state => state.transactions)
  const mascotId = useMoneeStore(state => state.profile?.mascotId ?? 'mochi')
  const orderedSweeps = [...sweeps].sort((a, b) => b.periodKey.localeCompare(a.periodKey))
  const [params, setParams] = useSearchParams()
  const [spending, setSpending] = useState<SavingsSource | null>(params.get('action') === 'spend' ? 'sisa' : null)
  const [depositing, setDepositing] = useState(params.get('action') === 'deposit')
  const closeForm = () => { setSpending(null); setDepositing(false); setParams({}, { replace: true }) }
  const hasActivity = sweeps.length > 0 || transactions.some(tx => !tx.deleted && (tx.type === 'savings_deposit' || tx.type === 'savings_expense'))
  const locked = snapshot?.locked ?? false
  return <section className="savings-screen">
    <header className="savings-header"><p>Sedikit demi sedikit, jadi berarti.</p><h1>Tabungan</h1></header>
    <section aria-label="Total tabungan">
      <Card className="savings-hero"><div><p>Total tabungan</p>
        <strong className="font-tabular">{rupiah(snapshot?.savings.totalSavings ?? 0)}</strong>
        <span>Gabungan Sisa dan Dari Allocation</span></div>{hasActivity
          ? <MascotCanvas mascotId={mascotId} state="happy" size={80} />
          : <PiggyBank size={40} aria-hidden="true" />}
      </Card>
    </section>
    {!hasActivity && <section className="savings-empty" aria-label="Mulai menabung">
      <div className="savings-empty-mascot"><MascotCanvas mascotId={mascotId} state="idle" size={144} /></div>
      <h2>Mulai tabunganmu</h2><p>Satu setoran kecil bisa jadi awal rencana besarmu. Sisa saldo periode juga akan terkumpul di sini saat periode ditutup.</p>
      {(snapshot?.balance.balance ?? 0) > 0 ? <Button disabled={locked} onClick={() => setDepositing(true)}>Setor pertama</Button>
        : <Link className="ui-button ui-button--primary" to="/">Catat pemasukan</Link>}
    </section>}
    {locked && <p className="savings-hint" role="status">Periode ini sudah ditutup. Setoran dan pemakaian tersedia kembali pada periode berjalan.</p>}
    <section aria-label="Kompartemen Sisa">
      <Card className="savings-pocket"><header><div><h2>Sisa</h2><p>Saldo akhir periode yang sudah ditutup</p></div></header>
        <strong className="savings-pocket-amount font-tabular">{rupiah(snapshot?.savings.sisaBalance ?? 0)}</strong>
        <Button variant="secondary" disabled={locked || (snapshot?.savings.sisaBalance ?? 0) <= 0} onClick={() => setSpending('sisa')}>Pakai Sisa</Button>
        <section className="savings-sweeps" aria-label="Sisa dari periode sebelumnya"><h3>Sisa dari periode sebelumnya</h3>
          {orderedSweeps.length > 0 ? <ul>{orderedSweeps.map(sweep => <li key={sweep.id}>
            <span>{periodLabel(sweep.periodKey)}</span><strong className="font-tabular">+{rupiah(sweep.amount)}</strong>
          </li>)}</ul> : <p>Belum ada periode yang ditutup.</p>}
        </section>
      </Card>
    </section>
    <section aria-label="Kompartemen Allocation"><Card className="savings-pocket">
      <header><h2>Dari Allocation</h2><p>Setoranmu untuk rencana dan tujuan</p></header>
      <strong className="savings-pocket-amount font-tabular">{rupiah(snapshot?.savings.allocationBalance ?? 0)}</strong>
      <div className="savings-actions"><Button disabled={locked} onClick={() => setDepositing(true)}>Setor ke Allocation</Button>
        <Button variant="secondary" disabled={locked || (snapshot?.savings.allocationBalance ?? 0) <= 0} onClick={() => setSpending('allocation')}>Pakai Allocation</Button></div>
    </Card></section>
    <GoalsPanel />
    <SavingsLedger />
    {spending && <SavingsExpenseDialog source={spending} onClose={closeForm} />}
    {depositing && <SavingsDepositDialog onClose={closeForm} />}
  </section>
}
