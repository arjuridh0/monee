import { createServer } from 'vite'
import { performance } from 'node:perf_hooks'
import assert from 'node:assert/strict'
import { updateReport } from './lib/report.mjs'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [], entries: [] } })
try {
  const { computeSnapshot } = await server.ssrLoadModule('/src/core/finance/selectors.ts')
  const { calcBucketAnalytics } = await server.ssrLoadModule('/src/core/finance/analytics.ts')
  const { DEFAULT_BUCKETS } = await server.ssrLoadModule('/src/core/db/repositories.ts')
  const transactions = Array.from({ length: 10000 }, (_, i) => ({ id: `bench-${i}`, type: i % 20 === 0 ? 'income' : 'expense',
    amount: i % 20 === 0 ? 5000000 : 10000, categoryId: i % 20 === 0 ? 'cat-gaji' : 'cat-makan', bucketId: 'bucket-needs',
    date: `2026-${String(i % 12 + 1).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')}`, createdAt: i, updatedAt: i }))
  const input = { transactions, buckets: DEFAULT_BUCKETS, goals: [], sweeps: [], today: '2026-10-26', periodStartDay: 1 }
  const measure = run => {
    for (let i = 0; i < 5; i++) run()
    const samples = Array.from({ length: 30 }, () => { const start = performance.now(); run(); return performance.now() - start }).sort((a, b) => a - b)
    return { medianMs: samples[15], p95Ms: samples[28], maxMs: samples[29] }
  }
  const report = { dataset: { transactions: 10000, periods: 12 }, runtime: process.version,
    snapshot: measure(() => computeSnapshot(input)), charts: measure(() => calcBucketAnalytics(transactions, DEFAULT_BUCKETS)) }
  report.ok = report.snapshot.maxMs < 50 && report.charts.maxMs < 50
  await updateReport('benchmark', report)
  console.log(JSON.stringify(report, null, 2))
  assert.equal(report.ok, true, 'Finance recompute exceeds the 50ms budget at 10k transactions')
} finally { await server.close() }
