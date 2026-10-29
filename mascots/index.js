// Registry maskot. Import ini untuk mengakses semua maskot dan tema mereka.
import { mochi } from './mochi.js';
import { luna } from './luna.js';
import { bumi } from './bumi.js';

export const MASCOTS = { mochi, luna, bumi };

// Palet studio historis v1. Token runtime aplikasi v2: src/theme/mascot-themes.ts (MASCOT_THEMES).
export const THEMES = {
  mochi: { accent: '#34C759', accentSoft: '#D1F5DD', bgTone: '#F5FAF6', name: 'Mochi' },
  luna:  { accent: '#007AFF', accentSoft: '#D0E8FF', bgTone: '#F0F7FF', name: 'Luna' },
  bumi:  { accent: '#FF9500', accentSoft: '#FFF0CC', bgTone: '#FFFBF0', name: 'Bumi' },
};
