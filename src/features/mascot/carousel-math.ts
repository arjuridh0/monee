/** Keep the position bounded even after thousands of turns in either direction. */
export function nearestIndex(position: number, count: number): number {
  if (!Number.isFinite(position) || !Number.isInteger(count) || count < 1) return 0
  return ((Math.round(position) % count) + count) % count
}

/** Positive means next; vertical scrolling and incidental finger movement stay native. */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < 36 || Math.abs(dx) <= Math.abs(dy) * 1.2) return 0
  return dx < 0 ? 1 : -1
}
