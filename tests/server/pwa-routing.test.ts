// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { navigationDenylist } from '../../src/app/pwa-routes'

describe('service worker navigation fallback boundaries', () => {
  it.each(['/api', '/api?x=1', '/api/missing', '/api/transcribe?x=1', '/cdn-cgi/access/login', '/cdn-cgi/access/logout', '/auth/refresh', '/auth/refresh?x=1'])('keeps %s on the network', path => {
    expect(navigationDenylist.some(pattern => pattern.test(path))).toBe(true)
  })
  it.each(['/', '/riwayat', '/atur', '/tabungan', '/onboarding'])('preserves the offline shell for %s', path => {
    expect(navigationDenylist.some(pattern => pattern.test(path))).toBe(false)
  })
})
