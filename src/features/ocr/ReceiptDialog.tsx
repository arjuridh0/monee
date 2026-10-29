import { useEffect, useRef, useState } from 'react'
import { Button, TextField } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { InlineError } from '@/components/ui/feedback'
import { getToday, isValidDateStr } from '@/core/finance/period'
import type { Transaction } from '@/core/finance/types'
import { useMoneeStore } from '@/store'
import { useRupiah } from '@/hooks/useRupiah'
import { receiptRecognizer } from './provider'
import { MAX_RECEIPT_ITEMS, normalizeReceipt, RECEIPT_IMAGE_ACCEPT, validateReceiptImage, type ReceiptRecognizer } from './receipt'
import './receipt.css'

interface ReviewItem { id: string; label: string; amount: string; categoryId: string; bucketId: string }
export function ReceiptDialog({ onClose, recognizer = receiptRecognizer }: { onClose: () => void; recognizer?: ReceiptRecognizer | undefined }) {
  const money = useRupiah()
  const categories = useMoneeStore(state => state.categories).filter(item => item.type === 'expense' && item.id !== 'cat-tabungan')
  const buckets = useMoneeStore(state => state.buckets).filter(item => !item.isSavings)
  const profile = useMoneeStore(state => state.profile)
  function row(label = '', amount = ''): ReviewItem {
    return { id: crypto.randomUUID(), label, amount, categoryId: categories.find(item => item.id === 'cat-lain-exp')?.id ?? categories[0]?.id ?? '',
      bucketId: buckets.find(item => item.id === profile?.defaultBucketId)?.id ?? buckets[0]?.id ?? '' }
  }
  const [items, setItems] = useState<ReviewItem[]>(() => [row()])
  const [merchant, setMerchant] = useState(''), [date, setDate] = useState(getToday())
  const [image, setImage] = useState<File | null>(null), [preview, setPreview] = useState('')
  const [sourceTotal, setSourceTotal] = useState<number | undefined>()
  const [error, setError] = useState(''), [reading, setReading] = useState(false), [saving, setSaving] = useState(false)
  const controller = useRef<AbortController | null>(null), previewRef = useRef('')
  const active = useRef(true), saveInFlight = useRef(false)
  const lastBatch = useRef<{ fingerprint: string; batch: Transaction[] } | null>(null)
  function cancelReading() { controller.current?.abort(); controller.current = null; setReading(false) }
  function releasePreview() { if (previewRef.current) URL.revokeObjectURL(previewRef.current); previewRef.current = '' }
  useEffect(() => {
    active.current = true
    const cancel = () => { if (document.visibilityState === 'hidden') cancelReading() }
    const pagehide = () => cancelReading()
    document.addEventListener('visibilitychange', cancel); window.addEventListener('pagehide', pagehide)
    return () => { active.current = false; controller.current?.abort(); controller.current = null; releasePreview(); document.removeEventListener('visibilitychange', cancel); window.removeEventListener('pagehide', pagehide) }
  }, [])
  function close() {
    if (saveInFlight.current) return
    cancelReading(); releasePreview(); active.current = false; onClose()
  }
  function selectImage(file?: File) {
    if (!file) return
    cancelReading(); setError('')
    try {
      validateReceiptImage(file)
      const url = URL.createObjectURL(file)
      releasePreview(); previewRef.current = url; setPreview(url); setImage(file)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Foto belum bisa dibuka.') }
  }
  async function recognize() {
    if (!recognizer || !image || reading || saveInFlight.current) return
    const request = new AbortController(); controller.current = request; setReading(true); setError('')
    try {
      const result = normalizeReceipt(await recognizer(image, request.signal))
      if (!active.current || request.signal.aborted) return
      setItems(result.items.map(item => row(item.label, String(item.amount))))
      setMerchant(result.merchant ?? ''); setDate(result.date ?? getToday()); setSourceTotal(result.total)
    } catch (cause) {
      if (active.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Pembacaan gagal. Coba lagi atau isi manual.')
    } finally {
      if (controller.current === request) { controller.current = null; if (active.current) setReading(false) }
    }
  }
  function edit(id: string, patch: Partial<ReviewItem>) { setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item)); setError('') }
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  async function save() {
    if (saveInFlight.current || reading) return
    setError('')
    try {
      if (!isValidDateStr(date) || date > getToday()) throw new Error('Periksa tanggal struk; tanggal tidak boleh di masa depan.')
      if (!items.length || items.length > MAX_RECEIPT_ITEMS) throw new Error('Isi 1–50 item terlebih dahulu.')
      if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Periksa total nominal item.')
      for (const item of items) {
        if (!item.label.trim() || item.label.trim().length > 120 || !Number.isSafeInteger(Number(item.amount)) || Number(item.amount) <= 0) throw new Error('Isi nama dan nominal rupiah utuh untuk setiap item.')
        if (!categories.some(category => category.id === item.categoryId) || !buckets.some(bucket => bucket.id === item.bucketId)) throw new Error('Pilih kategori dan bucket setiap item.')
      }
      const fingerprint = JSON.stringify({ items, merchant: merchant.trim(), date })
      if (lastBatch.current?.fingerprint !== fingerprint) {
        const now = Date.now()
        lastBatch.current = { fingerprint, batch: items.map(item => ({ id: item.id, type: 'expense', amount: Number(item.amount), date,
          categoryId: item.categoryId, bucketId: item.bucketId, note: merchant.trim() ? `${merchant.trim()} · ${item.label.trim()}` : item.label.trim(),
          createdAt: now, updatedAt: now, refundedAmount: 0, deleted: false })) }
      }
      saveInFlight.current = true; setSaving(true)
      await useMoneeStore.getState().saveReceiptExpenses(lastBatch.current.batch)
      if (active.current) { releasePreview(); active.current = false; onClose() }
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Item belum tersimpan. Coba lagi.') }
    finally { saveInFlight.current = false; if (active.current) setSaving(false) }
  }
  return <Dialog open sheet title="Scan struk" onClose={close} footer={<Button loading={saving} disabled={reading || !items.length} onClick={() => void save()}>Simpan semua item</Button>}>
    <div className="receipt-form">
      <p className="ui-helper">Foto hanya dipakai selama review ini dan tidak disimpan ke riwayat atau backup. Periksa semua item sebelum menyimpan sebagai pengeluaran.</p>
      {!recognizer && <p className="receipt-notice">Model pembaca otomatis belum dikonfigurasi. Kamu bisa melihat foto dan mengisi item secara manual.</p>}
      <fieldset disabled={saving || reading} className="receipt-fields">
        <TextField label="Foto struk" type="file" accept={RECEIPT_IMAGE_ACCEPT} hint="JPEG, PNG, atau WebP, maksimal 10 MB." onChange={event => { selectImage(event.target.files?.[0]); event.target.value = '' }} />
        {preview && <img className="receipt-preview" src={preview} alt="Pratinjau foto struk" />}
        <Button variant="secondary" disabled={!recognizer || !image} onClick={() => void recognize()}>Baca otomatis</Button>
      </fieldset>
      {reading && <><p role="status">Membaca struk…</p><Button variant="ghost" onClick={cancelReading}>Batalkan pembacaan</Button></>}
      {error && <InlineError>{error}</InlineError>}
      <fieldset disabled={saving || reading} className="receipt-fields">
        <TextField label="Nama toko (opsional)" value={merchant} maxLength={120} onChange={event => { setMerchant(event.target.value); setError('') }} />
        <TextField label="Tanggal struk" type="date" max={getToday()} value={date} onChange={event => { setDate(event.target.value); setError('') }} />
        {items.map((item, index) => <section className="receipt-item" key={item.id} aria-label={`Item ${index + 1}`}>
          <h3>Item {index + 1}</h3>
          <TextField label={`Nama item ${index + 1}`} maxLength={120} value={item.label} onChange={event => edit(item.id, { label: event.target.value })} />
          <TextField label={`Nominal item ${index + 1} (Rp)`} type="number" min="1" step="1" inputMode="numeric" value={item.amount} onChange={event => edit(item.id, { amount: event.target.value })} />
          <label className="receipt-select">Kategori item {index + 1}<select value={item.categoryId} onChange={event => edit(item.id, { categoryId: event.target.value })}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="receipt-select">Bucket item {index + 1}<select value={item.bucketId} onChange={event => edit(item.id, { bucketId: event.target.value })}>{buckets.map(bucket => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}</select></label>
          <Button variant="ghost" onClick={() => { setItems(current => current.filter(row => row.id !== item.id)); setError('') }}>Hapus item {index + 1}</Button>
        </section>)}
        <Button variant="secondary" disabled={items.length >= MAX_RECEIPT_ITEMS} onClick={() => setItems(current => [...current, row()])}>Tambah item</Button>
      </fieldset>
      <p className="receipt-total">Total item: {Number.isSafeInteger(total) ? money(total) : '—'}</p>
      {sourceTotal !== undefined && <p className="ui-helper">Total pada struk: {money(sourceTotal)}. {sourceTotal !== total && 'Total struk berbeda dari jumlah item. Periksa diskon, pajak, atau item yang terlewat sebelum menyimpan.'}</p>}
      <p className="ui-helper">Semua item disimpan sekaligus setelah kamu menekan Simpan. Jika saldo atau jatah tidak cukup, seluruh item tetap di review.</p>
    </div>
  </Dialog>
}
