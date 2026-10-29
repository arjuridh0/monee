import { useId, useMemo } from 'react'
import { Card } from '@/components/ui/controls'
import { calcAnalytics } from '@/core/finance/analytics'
import { formatPercent } from '@/core/finance/percent'
import type { Category, Transaction } from '@/core/finance/types'
import { useRupiah } from '@/hooks/useRupiah'
import './charts.css'

export function FinanceCharts({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const money = useRupiah(), id = useId()
  const data = useMemo(() => calcAnalytics(transactions, categories), [transactions, categories])
  const max = Math.max(data.income, data.expense, 1)
  let offset = 0
  return <div className="finance-charts">
    <Card className="finance-chart-card"><h3>Pengeluaran per kategori</h3>
      {data.expense > 0 ? <>
        <svg className="finance-donut" viewBox="0 0 120 120" role="img" aria-labelledby={`${id}-category-title`} aria-describedby={`${id}-category-desc`}>
          <title id={`${id}-category-title`}>Pengeluaran per kategori</title>
          <desc id={`${id}-category-desc`}>{data.categories.map(row => `${row.name}: ${money(row.amount)}, ${formatPercent(row.percent)}%`).join('; ')}</desc>
          {data.categories.map(row => {
            const start = offset; offset += row.percent
            return <circle key={row.id} cx="60" cy="60" r="44" fill="none" stroke={row.color} strokeWidth="18"
              pathLength="100" strokeDasharray={`${row.percent} ${100 - row.percent}`} strokeDashoffset={-start} transform="rotate(-90 60 60)" />
          })}
          <text x="60" y="59" textAnchor="middle" className="finance-donut-label">Belanja net</text>
          <text x="60" y="72" textAnchor="middle" className="finance-donut-total">{money(data.expense)}</text>
        </svg>
        <dl className="finance-chart-legend">{data.categories.map(row => <div key={row.id}>
          <dt><span className="finance-chart-swatch" style={{ background: row.color }} aria-hidden="true" />{row.name}</dt>
          <dd><strong>{money(row.amount)}</strong><small>{formatPercent(row.percent)}%</small></dd>
        </div>)}</dl>
      </> : <p>Belum ada pengeluaran untuk ditampilkan.</p>}
      <p className="finance-chart-note">Pengeluaran setelah refund. Tabungan dihitung terpisah.</p>
    </Card>
    <Card className="finance-chart-card"><h3>Pemasukan dan pengeluaran</h3>
      {data.income > 0 || data.expense > 0 ? <>
        <svg className="finance-comparison" viewBox="0 0 240 70" role="img" aria-labelledby={`${id}-balance-title`} aria-describedby={`${id}-balance-desc`}>
          <title id={`${id}-balance-title`}>Pemasukan dan pengeluaran</title>
          <desc id={`${id}-balance-desc`}>Pemasukan {money(data.income)}; pengeluaran net {money(data.expense)}.</desc>
          <rect x="0" y="8" width="240" height="20" rx="6" className="finance-chart-track" />
          <rect x="0" y="8" width={data.income / max * 240} height="20" rx="6" className="finance-chart-income" />
          <rect x="0" y="42" width="240" height="20" rx="6" className="finance-chart-track" />
          <rect x="0" y="42" width={data.expense / max * 240} height="20" rx="6" className="finance-chart-expense" />
        </svg>
        <dl className="finance-chart-legend"><div><dt>Pemasukan</dt><dd>{money(data.income)}</dd></div>
          <div><dt>Pengeluaran net</dt><dd>{money(data.expense)}</dd></div></dl>
      </> : <p>Belum ada pemasukan atau pengeluaran.</p>}
      {data.savingsDeposit > 0 && <p className="finance-chart-note">Setoran tabungan {money(data.savingsDeposit)}; tidak masuk belanja.</p>}
    </Card>
  </div>
}
