import { afterEach, describe, expect, it } from 'vitest'
import { applyMascotTheme, MASCOT_THEMES } from '@/theme/mascot-themes'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  delete document.documentElement.dataset.mascot
})

describe('mascot themes v2', () => {
  it('matches approved accent colors', () => {
    expect(Object.values(MASCOT_THEMES).map(t => t.accent)).toEqual([
      '#4F7C3A', '#3F6FB5', '#C0862B',
    ])
  })

  it('switches navigation and text colors, not only accent', () => {
    applyMascotTheme('luna')
    const style = document.documentElement.style
    expect(style.getPropertyValue('--nav-bg')).toBe('#1E2A44')
    expect(style.getPropertyValue('--nav-accent')).toBe('#5C8FD6')
    expect(style.getPropertyValue('--theme-accent-ink')).toBe('#24466F')
    expect(document.documentElement.dataset.mascot).toBe('luna')
  })

  it('replaces all theme tokens when switching back', () => {
    applyMascotTheme('bumi')
    expect(document.documentElement.style.getPropertyValue('--text-on-accent')).toBe('#2E2A24')
    applyMascotTheme('mochi')
    expect(document.documentElement.style.getPropertyValue('--text-on-accent')).toBe('#FFFFFF')
    expect(document.documentElement.style.getPropertyValue('--nav-bg')).toBe('#3F3227')
  })
})
