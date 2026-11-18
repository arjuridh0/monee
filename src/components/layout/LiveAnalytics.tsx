import { Card } from '@/components/ui/controls'
import { useRupiah } from '@/hooks/useRupiah'
import { useMoneeStore } from '@/store'
import { TriangleAlert } from 'lucide-react'
import { FinanceCharts } from '@/components/charts/FinanceCharts'

export function LiveAnalytics() {
  const money = useRupiah()
  const snapshot = useMoneeStore(state => state.snapshot)
  const allBuckets = useMoneeStore(state => state.buckets)
  const buckets = snapshot?.buckets.filter(item => !item.bucket.isSavings).sort((a,b) => a.bucket.sortOrder-b.bucket.sortOrder) ?? []
  const full = buckets.find(item => item.progressPct >= 100 && !item.bucket.allowOverbudget)
  return <section className="live-analytics" aria-label="Analitik periode">
    <h2>Analitik</h2>
    <Card><h3>Tabungan</h3><strong className="analytics-total font-tabular">{money(snapshot?.savings.totalSavings ?? 0)}</strong>
      <p>Setoran periode ini {money(snapshot?.balance.totalSavingsDeposit ?? 0)}</p></Card>
    <p>Periode berjalan</p>
    <FinanceCharts transactions={snapshot?.periodTxs ?? []} buckets={allBuckets} />
    {full && <div className="analytics-insight" role="status"><TriangleAlert size={18} aria-hidden="true" />
      <p>{full.bucket.name} sudah penuh. Pilih bucket lain atau catat pemasukan.</p></div>}
  </section>
}
