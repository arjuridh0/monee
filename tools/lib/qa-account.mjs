/** Test-only fake account transport for browser suites; never bundled into the app. */
export async function installQaAccount(context, accountId = `acct_${'a'.repeat(64)}`) {
  const cloud = new Map()
  await context.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/session' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, accountId }) }); return
    }
    if (path === '/api/sync' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ changes: [...cloud.values()], nextCursor: '', hasMore: false }) }); return
    }
    if (path === '/api/sync' && request.method() === 'POST') {
      const body = request.postDataJSON()
      const applied = []
      for (const change of body.changes ?? []) {
        const prior = cloud.get(`${change.collection}:${change.id}`)
        if ((prior?.revision ?? 0) !== change.baseRevision) continue
        cloud.set(`${change.collection}:${change.id}`, { collection: change.collection, id: change.id,
          record: change.record ?? null, revision: (prior?.revision ?? 0) + 1, updatedAt: Date.now(), deleted: change.deleted === true })
        applied.push(change.opId)
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applied, conflicts: [] }) }); return
    }
    if (path === '/api/account/data' && request.method() === 'DELETE') { cloud.clear(); await route.fulfill({ status: 204, body: '' }); return }
    if (path === '/api/auth/logout' && request.method() === 'POST') { await route.fulfill({ status: 204, body: '' }); return }
    await route.continue()
  })
  return cloud
}
