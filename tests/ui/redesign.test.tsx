import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Dialog } from '@/components/ui/Dialog'
import { Brand } from '@/components/ui/Brand'

afterEach(cleanup)

it('uses the same logo artwork for an application brand lockup', () => {
  const { container } = render(<Brand />)
  expect(screen.getByRole('img', { name: 'Monee' })).toBeVisible()
  expect(container.querySelector('img')).toHaveAttribute('src', '/icons/monee.svg')
  expect(screen.getByText('Monee')).toBeVisible()
})

it('provides a plain immersive mascot surface with a semantic back action', () => {
  const back = vi.fn()
  render(<Dialog open title="Maskot & Tema" presentation="immersive" onClose={back}><p>Pilih temanmu</p></Dialog>)
  expect(screen.getByRole('dialog', { name: 'Maskot & Tema' })).toHaveClass('ui-dialog--immersive')
  expect(screen.queryByRole('button', { name: 'Tutup Maskot & Tema' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Kembali dari Maskot & Tema' }))
  expect(back).toHaveBeenCalledOnce()
})
