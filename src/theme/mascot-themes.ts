export type MascotId = 'mochi' | 'luna' | 'bumi'

export interface MascotTheme {
  id: MascotId
  name: string
  accent: string
  accentVivid: string
  accentSoft: string
  accentInk: string
  bgTone: string
  navBg: string
  navBg2: string
  navText: string
  navAccent: string
  onAccent: string
}

export const MASCOT_THEMES = {
  mochi: {
    id: 'mochi', name: 'Mochi', accent: '#4F7C3A', accentVivid: '#8FB565',
    accentSoft: '#E6EFDB', accentInk: '#33501F', bgTone: '#F3F0E4',
    navBg: '#3F3227', navBg2: '#4E3F31', navText: '#BCAE9A', navAccent: '#8FB565', onAccent: '#FFFFFF',
  },
  luna: {
    id: 'luna', name: 'Luna', accent: '#3F6FB5', accentVivid: '#5C8FD6',
    accentSoft: '#DEE9F8', accentInk: '#24466F', bgTone: '#EDF3FA',
    navBg: '#1E2A44', navBg2: '#2B3A5C', navText: '#9FB0CE', navAccent: '#5C8FD6', onAccent: '#FFFFFF',
  },
  bumi: {
    id: 'bumi', name: 'Bumi', accent: '#C0862B', accentVivid: '#E0A84A',
    accentSoft: '#F8E9CE', accentInk: '#654510', bgTone: '#FAF3E6',
    navBg: '#4A3418', navBg2: '#5E4423', navText: '#D2BE96', navAccent: '#E0A84A', onAccent: '#2E2A24',
  },
} as const satisfies Record<MascotId, MascotTheme>

export function applyMascotTheme(id: MascotId): void {
  const t = MASCOT_THEMES[id]
  const r = document.documentElement.style
  const tokens = {
    '--theme-accent': t.accent,
    '--theme-accent-vivid': t.accentVivid,
    '--theme-accent-soft': t.accentSoft,
    '--theme-accent-ink': t.accentInk,
    '--theme-bg-tone': t.bgTone,
    '--nav-bg': t.navBg,
    '--nav-bg-2': t.navBg2,
    '--nav-text': t.navText,
    '--nav-accent': t.navAccent,
    '--text-on-accent': t.onAccent,
  }
  for (const [name, value] of Object.entries(tokens)) r.setProperty(name, value)
  document.documentElement.dataset.mascot = id
}
