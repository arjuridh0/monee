import type { MascotId } from '@/core/finance/types'
import { MASCOT_THEMES } from '@/theme/mascot-themes'

export interface MascotOption {
  id: MascotId
  name: string
  personality: string
  themeName: string
  tagline: string
  accent: string
  accentVivid: string
  soft: string
  ink: string
  bgTone: string
}

const DETAILS: Record<MascotId, Pick<MascotOption, 'personality' | 'themeName' | 'tagline'>> = {
  mochi: {
    personality: 'Tenang & hangat',
    themeName: 'Fresh Olive',
    tagline: 'Menemani langkah kecilmu dengan sabar.',
  },
  luna: {
    personality: 'Energik & setia',
    themeName: 'Ocean Blue',
    tagline: 'Selalu siap menyemangati hari-harimu.',
  },
  bumi: {
    personality: 'Ceria & dermawan',
    themeName: 'Sunny Amber',
    tagline: 'Teman hangat untuk setiap rencana.',
  },
}

export const MASCOT_OPTIONS: MascotOption[] = (['mochi', 'luna', 'bumi'] as const).map((id) => {
  const theme = MASCOT_THEMES[id]
  return {
    id,
    name: theme.name,
    ...DETAILS[id],
    accent: theme.accent,
    accentVivid: theme.accentVivid,
    soft: theme.accentSoft,
    ink: theme.accentInk,
    bgTone: theme.bgTone,
  }
})

export function mascotIndex(id: MascotId | null | undefined): number {
  const index = MASCOT_OPTIONS.findIndex((mascot) => mascot.id === id)
  return index < 0 ? 0 : index
}
