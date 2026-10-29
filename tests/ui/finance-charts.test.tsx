import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FinanceCharts } from '@/components/charts/FinanceCharts'
import { DEFAULT_CATEGORIES } from '@/core/db/repositories'

afterEach(cleanup)
describe('accessible SVG charts', () => {
  it('provides names, readable values, and explains savings separately', () => {
    render(<FinanceCharts categories={DEFAULT_CATEGORIES} transactions={[
      { id: '1', type: 'income', amount: 1000000, categoryId: 'cat-gaji', date: '2026-10-26', createdAt: 0, updatedAt: 0 },
      { id: '2', type: 'expense', amount: 100000, refundedAmount: 25000, categoryId: 'cat-makan', date: '2026-10-26', createdAt: 0, updatedAt: 0 },
      { id: '3', type: 'savings_deposit', amount: 200000, date: '2026-10-26', createdAt: 0, updatedAt: 0 },
    ]} />)
    expect(screen.getByRole('img', { name: 'Pengeluaran per kategori' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Pemasukan dan pengeluaran' })).toBeInTheDocument()
    expect(screen.getByText('Makan')).toBeVisible()
    expect(screen.getByText('100%')).toBeVisible()
    expect(screen.getByText(/Setoran tabungan.*200.000/)).toBeVisible()
    expect(document.querySelectorAll('svg')).toHaveLength(2)
    expect(document.querySelector('svg')?.innerHTML).not.toMatch(/NaN|Infinity/)
  })
  it('shows useful empty states instead of meaningless zero charts', () => {
    render(<FinanceCharts categories={[]} transactions={[]} />)
    expect(screen.getByText('Belum ada pengeluaran untuk ditampilkan.')).toBeVisible()
    expect(screen.getByText('Belum ada pemasukan atau pengeluaran.')).toBeVisible()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
