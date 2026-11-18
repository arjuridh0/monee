import { open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const localReportPath = fileURLToPath(new URL('../../LOCAL_REPORT.md', import.meta.url))

/** Replace a suite's latest result without accumulating reports or losing other sections. */
export function reportSection(markdown, name, result) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid report section name')
  const start = `<!-- report:${name}:start -->`, end = `<!-- report:${name}:end -->`
  const section = `${start}\n## ${name}\n\nUpdated: ${new Date().toISOString()}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n${end}`
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`)
  return pattern.test(markdown) ? markdown.replace(pattern, () => section) : `${markdown.trimEnd()}\n\n${section}\n`
}

export async function updateReport(name, result, path = localReportPath) {
  let lock
  // Different browser suites may finish together; serialize read/replace/write.
  for (let attempt = 0; attempt < 100; attempt++) {
    try { lock = await open(`${path}.lock`, 'wx'); break }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      await new Promise(done => setTimeout(done, 50))
    }
  }
  if (!lock) throw new Error(`Report is busy: ${path}.lock`)
  try {
    let contents
    try { contents = await readFile(path, 'utf8') }
    catch (error) { if (error.code !== 'ENOENT') throw error; contents = '# Monee — local report\n' }
    await writeFile(`${path}.tmp`, reportSection(contents, name, result), 'utf8')
    await rename(`${path}.tmp`, path)
  } finally {
    await lock.close()
    await rm(`${path}.tmp`, { force: true })
    await rm(`${path}.lock`, { force: true })
  }
}
