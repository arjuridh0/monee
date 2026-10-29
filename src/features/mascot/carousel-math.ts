export const MAX_ROTATION_DEG = 28
export const MAX_DEPTH_PX = 200
export const MIN_SCALE = 0.85
export const CARD_GAP_PX = 16
export const CARD_PEEK_RATIO = 0.78

export function cardStep(cardWidth: number): number {
  return cardWidth * CARD_PEEK_RATIO + CARD_GAP_PX
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function nearestIndex(position: number, count: number): number {
  return clamp(Math.round(position), 0, Math.max(0, count - 1))
}

export interface CardMotion {
  /** Jarak horizontal dalam satuan kartu; kalikan dengan lebar kartu + gap. */
  offset: number
  rotateY: number
  depth: number
  scale: number
  opacity: number
}

export function cardMotion(offset: number): CardMotion {
  const distance = Math.min(Math.abs(offset), 2)
  return {
    offset,
    rotateY: clamp(offset, -1, 1) * MAX_ROTATION_DEG,
    depth: distance === 0 ? 0 : -distance * MAX_DEPTH_PX,
    scale: Math.max(MIN_SCALE, 1 - distance * (1 - MIN_SCALE)),
    opacity: Math.abs(offset) > 1.8 ? 0.28 : Math.max(0.55, 1 - distance * 0.2),
  }
}

export function snapTarget(position: number, velocity: number, count: number): number {
  const kick = clamp(velocity * 2.4, -0.9, 0.9)
  return nearestIndex(position + kick, count)
}
