import { describe, expect, it } from 'vitest'
import {
  CARD_GAP_PX, CARD_PEEK_RATIO, MAX_DEPTH_PX, MAX_ROTATION_DEG, MIN_SCALE,
  cardMotion, cardStep, clamp, nearestIndex, snapTarget,
} from '@/features/mascot/carousel-math'

describe('mascot carousel math', () => {
  it('clamps values to the given range', () => {
    expect(clamp(-2, 0, 3)).toBe(0)
    expect(clamp(1.5, 0, 3)).toBe(1.5)
    expect(clamp(9, 0, 3)).toBe(3)
  })

  it('rounds to the nearest index and clamps at both ends', () => {
    expect(nearestIndex(-0.8, 3)).toBe(0)
    expect(nearestIndex(0.49, 3)).toBe(0)
    expect(nearestIndex(0.51, 3)).toBe(1)
    expect(nearestIndex(2.6, 3)).toBe(2)
  })

  it('keeps the active card frontal, full size, and opaque', () => {
    expect(cardMotion(0)).toEqual({
      offset: 0, rotateY: 0, depth: 0, scale: 1, opacity: 1,
    })
  })

  it('pushes and rotates the first ring of side cards', () => {
    const right = cardMotion(1)
    expect(right.rotateY).toBe(MAX_ROTATION_DEG)
    expect(right.depth).toBe(-MAX_DEPTH_PX)
    expect(right.scale).toBeCloseTo(MIN_SCALE)
    expect(right.opacity).toBeCloseTo(0.8)

    const left = cardMotion(-1)
    expect(left.rotateY).toBe(-MAX_ROTATION_DEG)
    expect(left.depth).toBe(-MAX_DEPTH_PX)
  })

  it('fades cards beyond the first ring', () => {
    const far = cardMotion(2)
    expect(far.rotateY).toBe(MAX_ROTATION_DEG)
    expect(far.depth).toBe(-2 * MAX_DEPTH_PX)
    expect(far.scale).toBeCloseTo(MIN_SCALE)
    expect(far.opacity).toBe(0.28)
  })

  it('snaps to the nearest card and lets a flick move one card', () => {
    expect(snapTarget(0.2, 0, 3)).toBe(0)
    expect(snapTarget(0.6, 0, 3)).toBe(1)
    expect(snapTarget(0, 0.5, 3)).toBe(1)
    expect(snapTarget(1.9, 0.9, 3)).toBe(2)
  })

  it('exposes a positive card gap', () => {
    expect(CARD_GAP_PX).toBeGreaterThan(0)
  })

  it('keeps neighbouring cards peeking at every stage width', () => {
    expect(cardStep(300)).toBeCloseTo(300 * CARD_PEEK_RATIO + CARD_GAP_PX)
    expect(cardStep(300)).toBeLessThan(300 + CARD_GAP_PX)
  })
})
