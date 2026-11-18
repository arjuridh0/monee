import { describe, expect, it } from 'vitest'
import { nearestIndex, swipeDirection } from '@/features/mascot/carousel-math'

describe('circular mascot selection', () => {
  it('wraps signed indices without accumulating position over many cycles', () => {
    for (let position = -300; position <= 300; position++) {
      expect(nearestIndex(position, 3)).toBe(((position % 3) + 3) % 3)
    }
    expect(nearestIndex(2.6, 3)).toBe(0)
    expect(nearestIndex(-0.8, 3)).toBe(2)
  })
  it('uses a safe origin for invalid positions or empty options', () => {
    expect(nearestIndex(Number.NaN, 3)).toBe(0)
    expect(nearestIndex(Infinity, 3)).toBe(0)
    expect(nearestIndex(3, 0)).toBe(0)
    expect(nearestIndex(3, 1)).toBe(0)
  })
  it('only accepts intentional horizontal swipes', () => {
    expect(swipeDirection(-80, 10)).toBe(1)
    expect(swipeDirection(80, -10)).toBe(-1)
    expect(swipeDirection(12, 2)).toBe(0)
    expect(swipeDirection(-80, 100)).toBe(0)
  })
})
