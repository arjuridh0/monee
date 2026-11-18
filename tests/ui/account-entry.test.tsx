import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountEntry } from '@/features/auth/AccountEntry'

vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: () => <span>Mochi</span> }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('submits email and PIN directly without visiting email verification', async () => {
  const fetcher = vi.fn(async () => Response.json({ authenticated: true, accountId: `acct_${'a'.repeat(64)}` }))
  vi.stubGlobal('fetch', fetcher)
  const success = vi.fn(), user = userEvent.setup()
  render(<AccountEntry onSuccess={success} />)
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'one@example.com')
  await user.type(screen.getByLabelText('PIN akun 6 digit'), '582916')
  await user.click(screen.getByRole('button', { name: 'Masuk', exact: true }))
  await waitFor(() => expect(success).toHaveBeenCalledOnce())
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0]).toMatchObject(['/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'one@example.com', pin: '582916' }) }])
})
it('shows a safe login error and allows retry without losing the email', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Email atau PIN tidak cocok.' }, { status: 401 })))
  const user = userEvent.setup()
  render(<AccountEntry onSuccess={vi.fn()} />)
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'one@example.com')
  await user.type(screen.getByLabelText('PIN akun 6 digit'), '000001')
  await user.click(screen.getByRole('button', { name: 'Masuk', exact: true }))
  expect(await screen.findByText('Email atau PIN tidak cocok.')).toBeVisible()
  expect(screen.getByLabelText('PIN akun 6 digit')).toHaveValue('')
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('one@example.com')
})
it('requires matching confirmation and saves a PIN only after email verification', async () => {
  const fetcher = vi.fn(async () => Response.json({ authenticated: true })); vi.stubGlobal('fetch', fetcher)
  const success = vi.fn(), user = userEvent.setup()
  render(<AccountEntry verifiedEmail="one@example.com" onSuccess={success} />)
  await user.type(screen.getByLabelText('PIN akun 6 digit'), '582916')
  await user.type(screen.getByLabelText('Konfirmasi PIN akun'), '739152')
  await user.click(screen.getByRole('button', { name: 'Simpan PIN dan lanjutkan' }))
  expect(await screen.findByText('Konfirmasi PIN belum sama.')).toBeVisible()
  expect(fetcher).not.toHaveBeenCalled()
})
