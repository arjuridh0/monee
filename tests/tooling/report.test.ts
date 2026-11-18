// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reportSection, updateReport } from '../../tools/lib/report.mjs'

describe('single local report', () => {
  it('preserves notes and replaces only the latest suite result', () => {
    const initial = reportSection('# Notes\nKeep recovery notes.', 'app', { ok: false })
    const other = reportSection(initial, 'voice', { ok: true })
    const latest = reportSection(other, 'app', { ok: true, message: '$&' })
    expect(latest).toContain('Keep recovery notes.')
    expect(latest.match(/report:app:start/g)).toHaveLength(1)
    expect(latest).toContain('report:voice:start')
    expect(latest).not.toContain('false')
    expect(latest).toContain('$&')
  })

  it('rejects names that could break section boundaries', () => {
    expect(() => reportSection('', '../app', {})).toThrow('Invalid report section')
  })

  it('keeps concurrent results in one file and removes temporary files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'monee-report-test-'))
    const path = join(directory, 'report.md')
    try {
      await Promise.all(['app', 'voice', 'pwa'].map(name => updateReport(name, { ok: true }, path)))
      const contents = await readFile(path, 'utf8')
      for (const name of ['app', 'voice', 'pwa']) expect(contents).toContain(`report:${name}:start`)
      expect(await readdir(directory)).toEqual(['report.md'])
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
