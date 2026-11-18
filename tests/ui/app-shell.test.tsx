import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '@/app/AppShell'
import { useMoneeStore } from '@/store'

vi.mock('@/features/mascot/MascotCanvas', () => ({ MascotCanvas: ({ state }: { state: string }) => <span role="img" aria-label="Maskot" data-state={state} /> }))
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  useMoneeStore.setState({ ...useMoneeStore.getInitialState(), isLoaded: true, isLocked: false,
    profile: { id: 'profile', name: 'Arju', mascotId: 'mochi', pinHash: 'hash', pinSalt: 'salt',
      periodStartDay: 1, defaultBucketId: 'bucket-needs', createdAt: 0 } }, true)
})
afterEach(() => { vi.restoreAllMocks() })

const shell = (path: string) =>
  render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppShell /></MemoryRouter>)

describe('AppShell routing', () => {
  it('keeps the developer playground unavailable in production', async () => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'signed out' }, { status: 401 })))
    try {
      shell('/dev/ui')
      expect(await screen.findByRole('heading', { name: 'Masuk ke Monee' })).toBeVisible()
      expect(screen.queryByRole('heading', { name: 'Ruang coba UI' })).not.toBeInTheDocument()
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals() }
  })
  it('shows a recoverable data error with a mascot, code and one retry action', async () => {
    const user = userEvent.setup()
    useMoneeStore.setState({ isLoaded: false, load: vi.fn().mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockImplementationOnce(async () => { useMoneeStore.setState({ isLoaded: true }) }) })
    shell('/')
    expect(await screen.findByRole('heading', { name: 'Pengaturan belum bisa dibuka' })).toBeVisible()
    expect(screen.queryByText('ERR_DATA_READ')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Maskot' })).toHaveAttribute('data-state', 'sad')
    expect(screen.getAllByRole('button', { name: 'Coba lagi', exact: true })).toHaveLength(1)
    expect(screen.getByText(/Data yang sudah tersimpan tetap ada/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Coba lagi', exact: true }))
    expect(await screen.findByRole('heading', { name: 'Beranda', level: 1 })).toBeVisible()
  })
  it.each([
    ['/', 'Beranda'],
    ['/riwayat', 'Riwayat'],
    ['/tabungan', 'Tabungan'],
    ['/atur', 'Atur'],
    ['/pin', 'Beranda'],
    ['/onboarding', 'Beranda'],
  ] as const)('lands on %s showing screen %s', (path, title) => {
    shell(path)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible()
  })

  it('redirects unknown paths to the dashboard', async () => {
    const user = userEvent.setup()
    shell('/tidak-ada')
    await user.click(screen.getByRole('link', { name: /Tabungan/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Tabungan' })).toBeVisible())
  })
})

describe('root navigation', () => {
  it('opens voice by default from Catat, with manual and receipt paths still available', async () => {
    shell('/')
    await userEvent.click(screen.getByRole('button', { name: 'Tambah transaksi' }))
    expect(await screen.findByRole('dialog', { name: 'Catat dengan suara' })).toBeVisible()
    expect(await screen.findByRole('button', { name: 'Mulai rekam' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Scan struk' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Ketik manual' }))
    expect(await screen.findByRole('dialog', { name: 'Tambah transaksi' })).toBeVisible()
  })
  it('immediately shows only the latest route during rapid tab changes', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    try {
      const { container } = shell('/')
      for (const [tab, title] of [['Tabungan', 'Tabungan'], ['Riwayat', 'Riwayat'], ['Home', 'Beranda'], ['Atur', 'Atur']]) {
        await act(async () => { fireEvent.click(screen.getByRole('link', { name: tab, exact: true })) })
        expect(screen.getByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
        expect(container.querySelectorAll('.tab-content')).toHaveLength(1)
        expect(container.querySelectorAll('.nav-active-pill')).toHaveLength(1)
        expect(screen.getByRole('link', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page')
      }
    } finally { scroll.mockRestore() }
  })

  it('mounts live analytics beside the root content', () => {
    shell('/')
    expect(screen.getByRole('complementary', { name: 'Ringkasan tambahan' })).toHaveTextContent('Analitik')
  })
  it('shows four root tabs plus the center add button on root tabs', () => {
    shell('/')
    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' })
    const items = within(nav).getAllByRole('link')
    expect(items.map(item => item.textContent)).toEqual(['Home', 'Riwayat', 'Tabungan', 'Atur'])
    expect(within(nav).getByRole('button', { name: 'Tambah transaksi' })).toBeEnabled()
    expect(within(nav).getByRole('link', { name: /Home/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /Tabungan/ })).not.toHaveAttribute('aria-current')
  })

  it('keeps the developer playground outside the root navigation', () => {
    shell('/dev/ui')
    expect(screen.queryByRole('navigation', { name: 'Navigasi utama' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tambah transaksi' })).not.toBeInTheDocument()
  })

  it('swaps the bottom nav for the tablet sidebar at 768px and up', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 768px)', media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    }))
    try {
      shell('/')
      const sidebar = screen.getByRole('navigation', { name: 'Navigasi utama' })
      expect(within(sidebar).getByText('Monee')).toBeVisible()
      expect(within(sidebar).getAllByRole('link')).toHaveLength(4)
      expect(screen.queryByRole('link', { name: /Riwayat/ })).toHaveAttribute('class', expect.stringContaining('sidebar-item'))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
