import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NameStep } from '@/features/onboarding/NameStep'
import { IncomeStep } from '@/features/onboarding/IncomeStep'
import { AllocationStep } from '@/features/onboarding/AllocationStep'
import { PinStep } from '@/features/onboarding/PinStep'
import { DEFAULT_BUCKETS, DEFAULT_CATEGORIES } from '@/core/db/repositories'
import { getToday } from '@/core/finance/period'

vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <span>Teman Monee</span> }))

describe('onboarding name', () => {
  it('requires a nonblank name and submits its trimmed value', async () => {
    const next = vi.fn()
    render(<NameStep name="" onNext={next} busy={false} />)
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: /Lanjut/ })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('Nama panggilan'), '   ')
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('Nama panggilan'), 'Arju  ')
    await user.click(button)
    expect(next).toHaveBeenCalledWith('Arju')
  })
})

describe('first income', () => {
  it('skips without creating a zero-value income', async () => {
    const next = vi.fn()
    render(<IncomeStep income={null} categories={DEFAULT_CATEGORIES} onNext={next} busy={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Lewati dulu' }))
    expect(next).toHaveBeenCalledWith(null)
  })

  it('requires positive whole rupiah and an income category, preserves the chosen date', async () => {
    const next = vi.fn()
    const user = userEvent.setup()
    render(<IncomeStep income={null} categories={DEFAULT_CATEGORIES} onNext={next} busy={false} />)
    expect(screen.getByRole('button', { name: 'Catat & lanjut' })).toBeDisabled()
    await user.type(screen.getByLabelText('Nominal pemasukan (Rp)'), '1500000')
    await user.selectOptions(screen.getByLabelText('Kategori pemasukan'), 'cat-freelance')
    await user.click(screen.getByRole('button', { name: 'Catat & lanjut' }))
    expect(next).toHaveBeenCalledWith({ amount: 1500000, categoryId: 'cat-freelance', date: getToday(), note: '' })
    expect(screen.getAllByRole('option')).toHaveLength(4)
  })
})

describe('allocation setup', () => {
  it('offers the 100% preset and only allows valid custom totals', async () => {
    const next = vi.fn()
    const user = userEvent.setup()
    render(<AllocationStep buckets={DEFAULT_BUCKETS} onNext={next} busy={false} />)
    expect(screen.getByRole('button', { name: 'Lanjut' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Custom sendiri' }))
    const field = screen.getByLabelText('Persentase Kebutuhan Pokok')
    await user.clear(field)
    await user.type(field, '35')
    expect(screen.getByRole('button', { name: 'Lanjut' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('100%')
    await user.click(screen.getByRole('button', { name: 'Pakai preset' }))
    await user.click(screen.getByRole('button', { name: 'Lanjut' }))
    expect(next).toHaveBeenCalledWith(DEFAULT_BUCKETS)
  })

  it('persists custom overbudget permissions with the allocation', async () => {
    const next = vi.fn()
    render(<AllocationStep buckets={DEFAULT_BUCKETS} onNext={next} busy={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Custom sendiri' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Boleh lewat batas Kebutuhan Pokok' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lanjut' }))
    expect(next.mock.calls[0][0][0].allowOverbudget).toBe(true)
  })
})

describe('PIN setup', () => {
  it('requires a matching six-digit PIN and acknowledgment of no recovery', async () => {
    const finish = vi.fn()
    render(<PinStep onFinish={finish} busy={false} />)
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: 'Selesai & masuk' })
    await user.type(screen.getByLabelText('Buat PIN 6 digit'), '123456')
    await user.type(screen.getByLabelText('Ulangi PIN 6 digit'), '123455')
    await user.click(screen.getByRole('checkbox'))
    expect(button).toBeDisabled()
    const confirm = screen.getByLabelText('Ulangi PIN 6 digit')
    await user.clear(confirm)
    await user.type(confirm, '123456')
    expect(button).toBeEnabled()
    await user.click(button)
    expect(finish).toHaveBeenCalledWith('123456')
    expect(screen.getByLabelText('Buat PIN 6 digit')).toHaveAttribute('type', 'password')
  })
})
