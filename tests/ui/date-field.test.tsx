import { useState } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { DateField } from '@/components/ui/DateField'

afterEach(cleanup)
function Field() {
  const [value, setValue] = useState('2024-02-28')
  return <DateField label="Tanggal" value={value} onChange={setValue} max="2024-03-02" />
}

it('opens a themed calendar on the selected date and handles leap day without submitting the form', async () => {
  const user = userEvent.setup(), submit = vi.fn(event => event.preventDefault())
  render(<form onSubmit={submit}><Field /></form>)
  await user.click(screen.getByRole('button', { name: 'Tanggal 28 Februari 2024' }))
  expect(screen.getByRole('button', { name: 'Rabu, 28 Februari 2024' })).toHaveFocus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('button', { name: 'Kamis, 29 Februari 2024' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Tanggal 28 Februari 2024' })).toBeInTheDocument()
  await user.keyboard('{Enter}')
  expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tanggal 29 Februari 2024' })).toHaveFocus()
  expect(submit).not.toHaveBeenCalled()
})

it('navigates across months and prevents dates outside limits', async () => {
  const user = userEvent.setup()
  render(<Field />)
  await user.click(screen.getByLabelText('Tanggal'))
  await user.keyboard('{ArrowDown}')
  expect(screen.getByRole('button', { name: 'Sabtu, 2 Maret 2024' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Minggu, 3 Maret 2024' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Bulan berikutnya' })).toBeDisabled()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('button', { name: 'Sabtu, 2 Maret 2024' })).toHaveFocus()
})

it('Escape closes only the calendar and restores the trigger', async () => {
  const user = userEvent.setup(), escape = vi.fn()
  render(<div onKeyDown={event => { if (event.key === 'Escape') escape() }}><Field /></div>)
  await user.click(screen.getByLabelText('Tanggal'))
  await user.keyboard('{Home}{End}{PageUp}{PageDown}{Escape}')
  expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Tanggal')).toHaveFocus()
  expect(escape).not.toHaveBeenCalled()
})

it('supports direct month and year selection for older dates', async () => {
  const user = userEvent.setup(), change = vi.fn()
  render(<DateField label="Dari tanggal" value="2024-02-28" onChange={change} />)
  await user.click(screen.getByLabelText('Dari tanggal'))
  await user.click(screen.getByRole('button', { name: 'Pilih bulan dan tahun, Februari 2024' }))
  await user.clear(screen.getByRole('spinbutton', { name: 'Tahun kalender' }))
  await user.type(screen.getByRole('spinbutton', { name: 'Tahun kalender' }), '2020')
  await user.click(screen.getByRole('button', { name: 'Januari' }))
  await user.click(screen.getByRole('button', { name: 'Rabu, 1 Januari 2020' }))
  expect(change).toHaveBeenCalledWith('2020-01-01')
})

it('clears optional filters explicitly and never invents a selected date', async () => {
  const user = userEvent.setup(), change = vi.fn()
  render(<DateField label="Dari tanggal" value="2024-02-28" onChange={change} clearable />)
  await user.click(screen.getByLabelText('Dari tanggal'))
  await user.click(screen.getByRole('button', { name: 'Hapus tanggal' }))
  expect(change).toHaveBeenCalledWith('')
})

it('respects disabled fields, invalid values and lower bounds', async () => {
  const user = userEvent.setup(), change = vi.fn()
  const { rerender } = render(<DateField label="Tanggal" value="2024-02-30" onChange={change} disabled />)
  expect(screen.getByLabelText('Tanggal')).toBeDisabled()
  expect(change).not.toHaveBeenCalled()
  rerender(<DateField label="Tanggal" value="2024-02-28" onChange={change} min="2024-02-28" />)
  await user.click(screen.getByLabelText('Tanggal'))
  expect(screen.getByRole('button', { name: 'Selasa, 27 Februari 2024' })).toBeDisabled()
  expect(within(screen.getByRole('grid')).getAllByRole('button').filter(button => button.tabIndex === 0)).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Bulan sebelumnya' })).toBeDisabled()
})

it('opens empty filters within bounds without selecting or emitting a date', async () => {
  const user = userEvent.setup(), change = vi.fn()
  render(<DateField label="Tanggal" value="" onChange={change} max="2024-02-29" />)
  await user.click(screen.getByLabelText('Tanggal'))
  expect(screen.getByRole('button', { name: 'Kamis, 29 Februari 2024' })).toHaveFocus()
  expect(screen.getAllByRole('gridcell').every(cell => cell.getAttribute('aria-selected') !== 'true')).toBe(true)
  expect(change).not.toHaveBeenCalled()
})

it('closes on outside interaction without stealing focus', async () => {
  const user = userEvent.setup()
  render(<><Field /><button type="button">Di luar</button></>)
  await user.click(screen.getByLabelText('Tanggal'))
  await user.click(screen.getByRole('button', { name: 'Di luar' }))
  expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Di luar' })).toHaveFocus()
})

it('rejects an empty year and keeps navigation within supported calendar years', async () => {
  const user = userEvent.setup(), change = vi.fn()
  render(<DateField label="Tanggal" value="0001-01-01" onChange={change} />)
  await user.click(screen.getByLabelText('Tanggal'))
  await user.keyboard('{ArrowLeft}{PageUp}')
  expect(screen.getByRole('grid', { name: 'Januari 1' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Pilih bulan dan tahun, Januari 1' }))
  await user.clear(screen.getByRole('spinbutton', { name: 'Tahun kalender' }))
  expect(screen.getByRole('button', { name: 'Januari', exact: true })).toBeDisabled()
  await user.type(screen.getByRole('spinbutton', { name: 'Tahun kalender' }), '9999')
  await user.click(screen.getByRole('button', { name: 'Desember', exact: true }))
  await user.keyboard('{End}{PageDown}')
  expect(screen.getByRole('grid', { name: 'Desember 9999' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Bulan berikutnya' })).toBeDisabled()
  expect(change).not.toHaveBeenCalled()
})
