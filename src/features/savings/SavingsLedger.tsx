import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Button, Card } from '@/components/ui/controls'
import { RubberSegment } from '@/components/reactbits/RubberSegment'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'
import type { SavingsSource, Transaction } from '@/core/finance/types'
import { SavingsExpenseDetail } from './SavingsExpenseDetail'
import { periodLabel } from './format'

export function SavingsLedger() {
  const rupiah = useRupiah()
  const transactions = useMoneeStore(state => state.transactions)
  const sweeps = useMoneeStore(state => state.sweeps)
  const [source, setSource] = useState<SavingsSource | 'all'>('all')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const rows = [
    ...sweeps.map(sweep => ({ id: `sweep:${sweep.id}`, source: 'sisa', incoming: true, amount: sweep.amount,
      title: `Sisa periode ${periodLabel(sweep.periodKey)}`, note: '', time: sweep.sweptAt,
      date: new Date(sweep.sweptAt + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) })),
    ...transactions.filter(tx => !tx.deleted && (tx.type === 'savings_deposit' || tx.type === 'savings_expense'))
      .map(tx => ({ id: `transaction:${tx.id}`, source: tx.type === 'savings_deposit' ? 'allocation' : tx.savingsSource,
        incoming: tx.type === 'savings_deposit', amount: tx.amount, title: tx.type === 'savings_deposit' ? 'Setoran tabungan' : tx.note || 'Pakai tabungan',
        note: tx.type === 'savings_deposit' ? tx.note ?? '' : '', time: tx.createdAt, date: tx.date })),
  ].filter(row => source === 'all' || row.source === source)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time - a.time || a.id.localeCompare(b.id))
  return <section className="savings-ledger" aria-label="Ledger tabungan">
    <h2>Aktivitas tabungan</h2>
    <RubberSegment aria-label="Sumber ledger tabungan" value={source} onChange={value => setSource(value as typeof source)}
      items={[{ value: 'all', label: 'Semua' }, { value: 'sisa', label: 'Sisa' }, { value: 'allocation', label: 'Allocation' }]} />
    {rows.length > 0 ? <Card className="savings-ledger-card"><ol aria-label="Daftar aktivitas tabungan">
      {rows.map(row => <li key={row.id}>
        <span className={`savings-ledger-icon${row.incoming ? ' is-incoming' : ''}`} aria-hidden="true">{row.incoming ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
        <div className="savings-ledger-copy"><strong>{row.title}</strong>{row.note && <span>{row.note}</span>}
          <small>{row.source === 'sisa' ? 'Sisa' : 'Dari Allocation'} · <time dateTime={row.date}>{new Date(`${row.date}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time></small>
        </div>
        <strong className="savings-ledger-amount font-tabular">{row.incoming ? '+' : '−'}{rupiah(row.amount)}</strong>
        {!row.incoming && <Button variant="ghost" aria-label={`Detail ${row.title}`} onClick={() => {
          setSelected(transactions.find(item => `transaction:${item.id}` === row.id) ?? null)
        }}>Detail</Button>}
      </li>)}
    </ol></Card> : <Card className="savings-ledger-empty"><p>{source === 'all' ? 'Belum ada aktivitas tabungan.' : 'Belum ada aktivitas untuk sumber ini.'}</p>
      {source !== 'all' && <Button variant="ghost" onClick={() => setSource('all')}>Tampilkan semua</Button>}
    </Card>}
    {selected && <SavingsExpenseDetail transaction={selected} onClose={() => setSelected(null)} />}
  </section>
}
