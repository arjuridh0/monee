import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { BucketPicker } from '@/components/ui/BucketPicker'
import { DEFAULT_BUCKETS } from '@/core/db/repositories'

const buckets = DEFAULT_BUCKETS.filter(bucket => !bucket.isSavings)
afterEach(cleanup)

function Picker() {
  const [value, setValue] = useState('bucket-needs')
  return <BucketPicker buckets={buckets} value={value} onChange={setValue} />
}

it('keeps selection in the form and restores focus after choosing an option', async () => {
  const user = userEvent.setup()
  render(<Picker />)
  const trigger = screen.getByRole('button', { name: 'Bucket Kebutuhan Pokok' })
  await user.click(trigger)
  expect(screen.getByRole('option', { name: 'Kebutuhan Pokok' })).toHaveFocus()
  expect(screen.getByRole('option', { name: 'Kebutuhan Pokok' })).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('option', { name: 'Fun' }))
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Bucket Fun' })).toHaveFocus()
})

it('supports arrows, Home, End, type-ahead and Enter without changing value during navigation', async () => {
  const user = userEvent.setup()
  render(<Picker />)
  screen.getByRole('button', { name: 'Bucket Kebutuhan Pokok' }).focus()
  await user.keyboard('{ArrowDown}{End}')
  expect(screen.getByRole('option', { name: 'Fun' })).toHaveFocus()
  await user.keyboard('{Home}{ArrowDown}')
  expect(screen.getByRole('option', { name: 'Pulsa/Transport' })).toHaveFocus()
  await user.keyboard('f')
  expect(screen.getByRole('option', { name: 'Fun' })).toHaveFocus()
  expect(screen.getByRole('option', { name: 'Kebutuhan Pokok' })).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Bucket Fun' })).toHaveFocus()
})

it('Escape dismisses choices without dismissing the containing dialog', async () => {
  const user = userEvent.setup(), parentEscape = vi.fn()
  render(<div onKeyDown={event => { if (event.key === 'Escape') parentEscape() }}><Picker /></div>)
  await user.click(screen.getByRole('button', { name: 'Bucket Kebutuhan Pokok' }))
  await user.keyboard('{ArrowDown}{Escape}')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Bucket Kebutuhan Pokok' })).toHaveFocus()
  expect(parentEscape).not.toHaveBeenCalled()
})

it('displays a missing choice honestly and never picks a bucket automatically', () => {
  const change = vi.fn()
  render(<BucketPicker buckets={buckets} value="retired-bucket" onChange={change} />)
  fireEvent.click(screen.getByRole('button', { name: 'Bucket Pilih bucket' }))
  expect(screen.getAllByRole('option').every(option => option.getAttribute('aria-selected') === 'false')).toBe(true)
  expect(change).not.toHaveBeenCalled()
})

it('does not submit the parent form when opening or choosing a bucket', async () => {
  const user = userEvent.setup(), submit = vi.fn(event => event.preventDefault())
  render(<form onSubmit={submit}><Picker /></form>)
  await user.click(screen.getByRole('button', { name: 'Bucket Kebutuhan Pokok' }))
  await user.click(screen.getByRole('option', { name: 'Kebutuhan Pokok' }))
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(submit).not.toHaveBeenCalled()
})

it('blocks interaction while disabled and handles an empty bucket list', async () => {
  const user = userEvent.setup(), change = vi.fn()
  const view = render(<BucketPicker buckets={buckets} value="bucket-needs" onChange={change} disabled />)
  await user.click(screen.getByRole('button', { name: 'Bucket Kebutuhan Pokok' }))
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  view.rerender(<BucketPicker buckets={[]} value={undefined} onChange={change} />)
  expect(screen.getByRole('button', { name: 'Bucket Belum ada bucket' })).toBeDisabled()
  expect(change).not.toHaveBeenCalled()
})

it('closes when focus leaves the field and preserves full custom bucket names', async () => {
  const user = userEvent.setup(), name = 'Dana perjalanan keluarga dan kebutuhan selama liburan'
  render(<><BucketPicker buckets={[{ ...buckets[0]!, name }]} value="bucket-needs" onChange={() => {}} /><button>Lanjut</button></>)
  await user.click(screen.getByRole('button', { name: `Bucket ${name}` }))
  expect(screen.getByRole('option', { name })).toBeVisible()
  await user.tab()
  expect(screen.getByRole('button', { name: 'Lanjut' })).toHaveFocus()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
