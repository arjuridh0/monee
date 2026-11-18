import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { UIPlayground } from '@/app/UIPlayground'

describe('UI playground', () => {
  it('labels its sample data and previews theme without writing finance data', async () => {
    render(<UIPlayground />)
    expect(screen.getByRole('heading', { name: 'Ruang coba UI' })).toBeVisible()
    expect(screen.getByText(/Tidak menulis data keuangan/)).toBeVisible()
    await userEvent.click(screen.getByRole('radio', { name: 'Luna' }))
    expect(document.documentElement.dataset.mascot).toBe('luna')
  })

  it('lets a user explore the native confirmation dialog', async () => {
    render(<UIPlayground />)
    await userEvent.click(screen.getByRole('button', { name: 'Buka dialog' }))
    expect(screen.getByRole('dialog', { name: 'Konfirmasi contoh' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Tutup Konfirmasi contoh' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps production typography local for offline and privacy', () => {
    const html = readFileSync('index.html', 'utf8')
    const css = readFileSync('src/theme/tokens.css', 'utf8')
    expect(html).not.toContain('fonts.googleapis.com')
    for (const weight of [400, 500, 700]) {
      expect(css).toContain(`/fonts/satoshi-${weight}.woff2`)
    }
    expect(html).toContain('/fonts/satoshi-400.woff2')
    expect(html).toContain('/fonts/satoshi-700.woff2')
  })
})
