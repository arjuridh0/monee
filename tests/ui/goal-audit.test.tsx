import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { GoalDialog } from '@/features/savings/GoalDialog'
import { useMoneeStore } from '@/store'

afterEach(() => useMoneeStore.setState(useMoneeStore.getInitialState(), true))

it('saves a Lucide icon choice instead of structural emoji', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  useMoneeStore.setState({ saveGoal: save })
  render(<GoalDialog onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Nama tujuan'), { target: { value: 'Liburan' } })
  fireEvent.change(screen.getByLabelText('Target (Rp)'), { target: { value: '500000' } })
  await userEvent.selectOptions(screen.getByLabelText('Ikon (opsional)'), 'plane')
  await userEvent.click(screen.getByRole('button', { name: 'Simpan tujuan' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Liburan', icon: 'plane', targetAmount: 500000 }))
})

it('can explicitly clear a legacy emoji icon without losing the goal', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  useMoneeStore.setState({ saveGoal: save })
  render(<GoalDialog goal={{ id: 'old-goal', name: 'Rencana', targetAmount: 100000, sortOrder: 2, createdAt: 1, icon: '🏡' }} onClose={vi.fn()} />)
  await userEvent.selectOptions(screen.getByLabelText('Ikon (opsional)'), '')
  await userEvent.click(screen.getByRole('button', { name: 'Simpan tujuan' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'old-goal', name: 'Rencana', targetAmount: 100000 }))
  expect(save.mock.calls[0]?.[0]).not.toHaveProperty('icon')
})
