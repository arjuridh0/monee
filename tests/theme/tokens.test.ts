import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/theme/tokens.css', 'utf8')
const token = (name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim()

describe('Warm Clay tokens', () => {
  it('matches the approved canvas surfaces and accessible text', () => {
    expect(token('--bg-app')).toBe('#EFE7DA')
    expect(token('--surface-2')).toBe('#FAF6EE')
    expect(token('--text-primary')).toBe('#2E2A24')
    expect(token('--text-accessible')).toBe('#5C5347')
    expect(token('--danger-ink')).toBe('#9C382D')
  })

  it('uses the approved default mascot and navigation palette', () => {
    expect(token('--theme-accent')).toBe('#4F7C3A')
    expect(token('--nav-bg')).toBe('#3F3227')
    expect(token('--nav-accent')).toBe('#8FB565')
    expect(token('--accent')).toBe('var(--theme-accent)')
  })

  it('defines component geometry and reduced-motion support', () => {
    expect(token('--r-card')).toBe('28px')
    expect(token('--r-btn')).toBe('20px')
    expect(token('--control-min')).toBe('44px')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain(':focus-visible')
  })

  it('registers theme colors so a mascot change cross-fades them', () => {
    for (const name of [
      '--theme-accent', '--theme-accent-vivid', '--theme-accent-soft',
      '--theme-accent-ink', '--theme-bg-tone', '--nav-bg', '--nav-bg-2',
      '--nav-text', '--nav-accent', '--text-on-accent',
    ]) {
      expect(css).toMatch(new RegExp(`@property\\s+${name}\\s*\\{[^}]*syntax:\\s*'<color>'[^}]*inherits:\\s*true`))
    }
  })

  it('transitions accent and bg-tone with the slow motion token', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))
    expect(root).toContain('transition:')
    expect(root).toMatch(/--theme-accent\s+var\(--dur-slow\)/)
    expect(root).toMatch(/--theme-bg-tone\s+var\(--dur-slow\)/)
    expect(root).toMatch(/--nav-bg\s+var\(--dur-slow\)/)
  })

  it('paints the canvas with the active theme background tone', () => {
    expect(token('--theme-bg-tone')).toBe('#F3F0E4')
    expect(css).toMatch(/--app-canvas:\s*var\(--theme-bg-tone\)/)
    expect(css).toMatch(/html,\s*body\s*\{[^}]*background-color:\s*var\(--app-canvas\)/)
  })
})
