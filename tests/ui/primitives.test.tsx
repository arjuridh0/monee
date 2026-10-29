import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button, Card, Chip, ProgressBar, TextField, Toggle } from '@/components/ui/controls'
import { EmptyState, InlineError, Skeleton, Toast } from '@/components/ui/feedback'
import { BottomSheet, Dialog } from '@/components/ui/Dialog'

afterEach(() => vi.useRealTimers())

describe('UI controls', () => {
  it('does not submit a form accidentally and blocks loading clicks', async () => {
    const click = vi.fn()
    render(<Button loading onClick={click}>Simpan</Button>)
    const button = screen.getByRole('button', { name: /Simpan/ })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(click).not.toHaveBeenCalled()
  })

  it('keeps card composition and chip selection accessible', async () => {
    const click = vi.fn()
    render(<Card><Chip selected onClick={click}>Makan</Chip></Card>)
    await userEvent.click(screen.getByRole('button', { pressed: true }))
    expect(click).toHaveBeenCalledOnce()
  })

  it('toggles from the label and supports disabled state', async () => {
    const change = vi.fn()
    const { rerender } = render(<Toggle label="Boleh lewat batas" checked={false} onChange={change} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Boleh lewat batas' }))
    expect(change).toHaveBeenCalledWith(true)
    rerender(<Toggle label="Boleh lewat batas" checked disabled onChange={change} />)
    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('caps the progress graphic but does not hide overbudget information', () => {
    render(<ProgressBar label="Fun" value={125} />)
    const bar = screen.getByRole('progressbar', { name: 'Fun' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(bar).toHaveAttribute('aria-valuetext', '125% · lewat jatah')
  })

  it('associates field labels and validation feedback', () => {
    render(<TextField label="Nominal" error="Saldo tidak cukup" />)
    const field = screen.getByRole('textbox', { name: 'Nominal' })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('Saldo tidak cukup')
    expect(screen.getByRole('alert')).toHaveTextContent('Saldo tidak cukup')
  })
})

describe('feedback and overlays', () => {
  it('renders empty, error and loading states with meaningful labels', () => {
    render(<><EmptyState title="Belum ada transaksi" message="Catat pemasukan pertamamu." />
      <InlineError>Saldo kurang</InlineError><Skeleton label="Memuat riwayat" /></>)
    expect(screen.getByRole('heading', { name: 'Belum ada transaksi' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Saldo kurang')
    expect(screen.getByRole('status', { name: 'Memuat riwayat' })).toHaveAttribute('aria-busy', 'true')
  })

  it('dismisses toast on timeout and clears its timer on unmount', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    const { unmount } = render(<Toast message="Tersimpan" onDismiss={dismiss} />)
    expect(screen.getByRole('status')).toHaveTextContent('Tersimpan')
    act(() => vi.advanceTimersByTime(3000))
    expect(dismiss).toHaveBeenCalledOnce()
    unmount()
    act(() => vi.runAllTimers())
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it.each(['dialog', 'sheet'] as const)('opens and dismisses the native %s', (variant) => {
    const close = vi.fn()
    const Component = variant === 'dialog' ? Dialog : BottomSheet
    const { rerender } = render(<Component open title="Konfirmasi" onClose={close}>Isi dialog</Component>)
    const dialog = screen.getByRole('dialog', { name: 'Konfirmasi' })
    expect(dialog).toHaveAttribute('open')
    fireEvent.click(screen.getByRole('button', { name: 'Tutup Konfirmasi' }))
    expect(close).toHaveBeenCalledOnce()
    fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }))
    expect(close).toHaveBeenCalledTimes(2)
    rerender(<Component open={false} title="Konfirmasi" onClose={close}>Isi dialog</Component>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([Dialog, BottomSheet].map(c => [c.name, c]) as const)('loops Tab within the %s, never behind it', (_name, Component) => {
    render(<Component open title="Konfirmasi" onClose={() => {}} footer={
      <>
        <Button variant="secondary">Kembali</Button>
        <Button>Ya</Button>
      </>
    }>Isi dialog</Component>)
    const dialog = screen.getByRole('dialog', { name: 'Konfirmasi' })
    const close = dialog.querySelector<HTMLButtonElement>('.ui-icon-button')
    const back = screen.getByRole('button', { name: 'Kembali' })
    const yes = screen.getByRole('button', { name: 'Ya' })
    close?.focus()
    fireEvent(dialog, new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(yes)
    fireEvent(dialog, new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(close)
    expect(back).not.toHaveFocus()
  })
})
