import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/theme/tokens.css', 'utf8')
const token = (name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim()

describe('Monee warm pocket ledger tokens', () => {
  it('matches the approved canvas surfaces and accessible text', () => {
    expect(token('--bg-app')).toBe('#F7F3EA')
    expect(token('--surface-2')).toBe('#FAF7F0')
    expect(token('--text-primary')).toBe('#222D27')
    expect(token('--text-accessible')).toBe('#556158')
    expect(token('--danger-ink')).toBe('#9C382D')
  })

  it('uses the approved default mascot and navigation palette', () => {
    expect(token('--theme-accent')).toBe('#4F7C3A')
    expect(token('--nav-bg')).toBe('#3F3227')
    expect(token('--nav-accent')).toBe('#8FB565')
    expect(token('--accent')).toBe('var(--theme-accent)')
  })

  it('defines component geometry and reduced-motion support', () => {
    expect(token('--r-card')).toBe('20px')
    expect(token('--r-btn')).toBe('14px')
    expect(token('--control-min')).toBe('44px')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain(':focus-visible')
  })

  it('uses a local rounded display face with a separate readable body face', () => {
    expect(token('--font-display')).toContain('Baloo 2')
    expect(token('--font-body')).toContain('Satoshi')
    expect(css).toContain("url('/fonts/baloo-2-latin.woff2')")
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

  it('keeps a neutral canvas while mascot accents change', () => {
    expect(token('--theme-bg-tone')).toBe('#F3F0E4')
    expect(css).toMatch(/--app-canvas:\s*var\(--bg-app\)/)
    expect(css).toMatch(/html,\s*body\s*\{[^}]*background-color:\s*var\(--app-canvas\)/)
  })
})
