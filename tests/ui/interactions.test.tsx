import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlipCard } from '@/components/reactbits/FlipCard'
import { CodeSlots } from '@/components/reactbits/CodeSlots'
import { RubberSegment } from '@/components/reactbits/RubberSegment'
import { FuseButton } from '@/components/reactbits/FuseButton'

afterEach(() => vi.useRealTimers())

describe('FlipCard', () => {
  it('flips on a body tap while keeping child actions independent', async () => {
    render(<FlipCard front={<p>Saldo contoh</p>} back={<p>Tabungan contoh</p>} />)
    await userEvent.click(screen.getByText('Saldo contoh'))
    expect(screen.getByText('Tabungan contoh')).toBeVisible()
  })
  it('switches the entire content and removes inactive controls from the accessibility tree', async () => {
    render(<FlipCard front={<button>Transaksi utama</button>} back={<button>Setor tabungan</button>} />)
    expect(screen.getByRole('button', { name: 'Transaksi utama' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Lihat tabungan' }))
    expect(screen.queryByRole('button', { name: 'Transaksi utama' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Setor tabungan' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Kembali ke saldo periode' }))
    expect(screen.getByRole('button', { name: 'Transaksi utama' })).toBeVisible()
  })

  it('does not flip when an inner action is clicked', async () => {
    render(<FlipCard front={<button>Tambah pemasukan</button>} back={<p>Tabungan</p>} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tambah pemasukan' }))
    expect(screen.getByRole('button', { name: 'Lihat tabungan' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders a static front when the savings side is not implemented yet', () => {
    render(<FlipCard front={<p>Saldo periode</p>} />)
    expect(screen.getByText('Saldo periode', { selector: 'p' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Lihat tabungan' })).not.toBeInTheDocument()
  })
})

describe('CodeSlots', () => {
  it('accepts only six digits, masks the code, and emits completion once', () => {
    const complete = vi.fn()
    render(<CodeSlots onComplete={complete} />)
    const input = screen.getByLabelText('PIN 6 digit')
    fireEvent.change(input, { target: { value: 'a1234567' } })
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveValue('123456')
    expect(screen.queryByText('123456')).not.toBeInTheDocument()
    expect(complete).toHaveBeenCalledWith('123456')
    fireEvent.change(input, { target: { value: '123456' } })
    expect(complete).toHaveBeenCalledOnce()
  })

  it('clears the code on error and disables entry during lockout', () => {
    const { rerender } = render(<CodeSlots defaultValue="123456" />)
    rerender(<CodeSlots defaultValue="123456" status="error" disabled />)
    expect(screen.getByLabelText('PIN 6 digit')).toHaveValue('')
    expect(screen.getByLabelText('PIN 6 digit')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('PIN 6 digit')).toBeDisabled()
  })
})

describe('RubberSegment', () => {
  it('supports keyboard selection and isolates multiple instances', async () => {
    const change = vi.fn()
    render(<><RubberSegment aria-label="Tipe" items={['Pengeluaran', 'Pemasukan']} onChange={change} />
      <RubberSegment aria-label="Periode" items={['Bulan', 'Tahun']} /></>)
    const group = screen.getByRole('radiogroup', { name: 'Tipe' })
    const radios = within(group).getAllByRole('radio')
    radios[0]?.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(radios[1]).toBeChecked()
    expect(radios[1]).toHaveFocus()
    expect(change).toHaveBeenCalledWith('Pemasukan', 1)
    expect(within(screen.getByRole('radiogroup', { name: 'Periode' })).getByRole('radio', { name: 'Bulan' })).toBeChecked()
  })
})

describe('FuseButton', () => {
  it('does not arm or commit when validation refuses the action', async () => {
    const commit = vi.fn()
    render(<FuseButton beforeArm={() => false} onCommit={commit} onUndo={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(commit).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Batal' })).not.toBeInTheDocument()
  })

  it('keeps settled visible before notifying its parent to close', async () => {
    vi.useFakeTimers()
    const settled = vi.fn()
    render(<FuseButton onCommit={vi.fn()} onUndo={vi.fn()} onSettled={settled} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simpan' })) })
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('button', { name: 'Tersimpan' })).toBeVisible()
    expect(settled).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(799))
    expect(settled).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(settled).toHaveBeenCalledOnce()
  })
  it('commits once then lets the whole button undo, including Escape', async () => {
    const commit = vi.fn()
    const undo = vi.fn()
    render(<FuseButton onCommit={commit} onUndo={undo} />)
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(commit).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Batal' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(undo).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeEnabled()
  })

  it('settles after the exact undo window without committing twice', async () => {
    vi.useFakeTimers()
    const commit = vi.fn()
    render(<FuseButton onCommit={commit} onUndo={vi.fn()} undoWindow={2000} settle="stay" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simpan' })) })
    act(() => vi.advanceTimersByTime(1999))
    expect(screen.getByRole('button', { name: 'Batal' })).toBeEnabled()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('button', { name: 'Tersimpan' })).toBeDisabled()
    expect(commit).toHaveBeenCalledOnce()
  })

  it('does not show success when persistence fails', async () => {
    render(<FuseButton onCommit={() => Promise.reject(new Error('DB unavailable'))} onUndo={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Aksi belum tersimpan')
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Tersimpan' })).not.toBeInTheDocument()
  })

  it('can defer commit until fuseEnd and cancel it without writing', async () => {
    vi.useFakeTimers()
    const commit = vi.fn()
    render(<FuseButton commitOn="fuseEnd" onCommit={commit} onUndo={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Batal' })) })
    act(() => vi.runAllTimers())
    expect(commit).not.toHaveBeenCalled()
  })
})
