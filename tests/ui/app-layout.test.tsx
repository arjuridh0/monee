import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppLayout } from '@/components/layout/AppLayout'

describe('AppLayout', () => {
  it('provides a keyboard skip link and one main landmark', () => {
    render(<AppLayout><h1>Home</h1></AppLayout>)
    expect(screen.getByRole('link', { name: 'Lewati ke konten' })).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
  })

  it('renders optional navigation and analytics without mixing them into main', () => {
    render(<AppLayout navigation={<nav aria-label="Utama">Home</nav>} analytics={<p>Ringkasan</p>}>
      <h1>Dashboard</h1>
    </AppLayout>)
    expect(screen.getByRole('navigation')).not.toBeEmptyDOMElement()
    expect(screen.getByRole('complementary', { name: 'Ringkasan tambahan' })).toHaveTextContent('Ringkasan')
    expect(screen.getByRole('main')).not.toHaveTextContent('Ringkasan')
  })

  it('does not create an empty sidebar without analytics', () => {
    render(<AppLayout><h1>Atur</h1></AppLayout>)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})
