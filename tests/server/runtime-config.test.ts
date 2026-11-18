// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('enables client-disconnect signals for the Worker cancellation handlers', () => {
  const config = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'))
  // request.signal is not enabled by default for this project's compatibility date.
  expect(config.compatibility_flags).toContain('enable_request_signal')
  expect(config.compatibility_flags).not.toContain('disable_request_signal')
})
