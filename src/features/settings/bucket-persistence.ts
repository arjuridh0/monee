import type { MoneeDB } from '@/core/db/migrations'
import { CATEGORY_ICONS, type CategoryIconName } from '@/core/finance/category-options'
import type { Bucket } from '@/core/finance/types'

const canonical = (items: Bucket[]) => JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)))

export async function saveBucketConfiguration(db: MoneeDB, buckets: Bucket[], expected: Bucket[]): Promise<void> {
  const tx = db.transaction(['buckets', 'profile', 'transactions', 'monthSweeps'], 'readwrite')
  try {
    const current = await tx.objectStore('buckets').getAll()
    if (canonical(current) !== canonical(expected)) throw new Error('ERR_BUCKET_STALE — Bucket berubah di tab lain. Buka ulang pengaturan.')
    const removed = current.filter(item => !buckets.some(next => next.id === item.id))
    const [transactions, sweeps] = await Promise.all([tx.objectStore('transactions').getAll(), tx.objectStore('monthSweeps').getAll()])
    if (removed.some(item => transactions.some(t => t.bucketId === item.id)
      || sweeps.some(sweep => sweep.perBucketDetail.some(detail => detail.bucketId === item.id)))) {
      throw new Error('ERR_BUCKET_IN_USE — Bucket yang sudah dipakai riwayat tidak dapat dihapus.')
    }
    const savings = current.find(item => item.isSavings)
    const names = buckets.map(item => item.name.trim().toLocaleLowerCase('id-ID'))
    if (buckets.length < 2 || buckets.length > 20 || new Set(buckets.map(item => item.id)).size !== buckets.length
      || new Set(names).size !== names.length || buckets.filter(item => item.isSavings).length !== 1
      || !savings || !buckets.some(item => item.id === savings.id && item.isSavings)
      || buckets.some(item => current.some(old => old.id === item.id && old.isSavings !== item.isSavings))
      || Math.abs(buckets.reduce((sum, item) => sum + item.allocPercent, 0) - 100) > 1e-8
      || buckets.some(item => !item.id.trim() || !item.name.trim() || item.name.trim().length > 32
        || !CATEGORY_ICONS.includes(item.icon as CategoryIconName) || !/^#[\da-f]{6}$/i.test(item.color)
        || !Number.isFinite(item.allocPercent) || item.allocPercent < 0 || item.allocPercent > 100
        || !Number.isSafeInteger(item.sortOrder) || item.sortOrder < 0
        || typeof item.allowOverbudget !== 'boolean' || typeof item.isSavings !== 'boolean')) {
      throw new Error('ERR_BUCKET_INVALID — Periksa bucket, ikon, warna, dan total alokasi 100%. Bucket Tabungan harus dipertahankan.')
    }
    for (const item of removed) await tx.objectStore('buckets').delete(item.id)
    for (const item of buckets) await tx.objectStore('buckets').put({ ...item, name: item.name.trim() })
    const profile = await tx.objectStore('profile').get('profile')
    if (profile && !buckets.some(item => item.id === profile.defaultBucketId && !item.isSavings)) {
      await tx.objectStore('profile').put({ ...profile, defaultBucketId: buckets.find(item => !item.isSavings)!.id })
    }
    await tx.done
  } catch (error) {
    try { tx.abort() } catch { /* Already ended. */ }
    await tx.done.catch(() => undefined)
    throw error
  }
}
