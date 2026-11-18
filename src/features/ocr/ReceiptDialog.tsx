import { useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, ScanLine } from 'lucide-react'
import { Button, TextField } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import { BucketPicker } from '@/components/ui/BucketPicker'
import { DateField } from '@/components/ui/DateField'
import { InlineError } from '@/components/ui/feedback'
import { ServiceReadiness } from '@/components/ui/ServiceReadiness'
import { getToday, isValidDateStr } from '@/core/finance/period'
import type { Transaction } from '@/core/finance/types'
import { defaultCategoryId } from '@/core/finance/transaction-presentation'
import { useMoneeStore } from '@/store'
import { useRupiah } from '@/hooks/useRupiah'
import { receiptRecognizer, ReceiptAccessError } from './provider'
import { MAX_RECEIPT_ITEMS, normalizeReceipt, RECEIPT_IMAGE_ACCEPT, validateReceiptImage, type ReceiptRecognizer } from './receipt'
import './receipt.css'

interface ReviewItem { id: string; label: string; amount: string; bucketId: string }
export function ReceiptDialog({ onClose, recognizer = receiptRecognizer }: { onClose: () => void; recognizer?: ReceiptRecognizer | undefined }) {
  const money = useRupiah()
  const privacyHelpId = useId()
  const imageInputId = useId()
  const imageInput = useRef<HTMLInputElement>(null)
  const categories = useMoneeStore(state => state.categories)
  const categoryId = defaultCategoryId(categories, 'expense')
  const buckets = useMoneeStore(state => state.buckets).filter(item => !item.isSavings)
  const profile = useMoneeStore(state => state.profile)
  function row(label = '', amount = ''): ReviewItem {
    return { id: crypto.randomUUID(), label, amount,
      bucketId: buckets.find(item => item.id === profile?.defaultBucketId)?.id ?? buckets[0]?.id ?? '' }
  }
  const [items, setItems] = useState<ReviewItem[]>(() => [row()])
  const [merchant, setMerchant] = useState(''), [date, setDate] = useState(getToday())
  const [image, setImage] = useState<File | null>(null), [preview, setPreview] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
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
    cancelReading(); setError(''); setNeedsLogin(false)
    try {
      validateReceiptImage(file)
      const url = URL.createObjectURL(file)
      releasePreview(); previewRef.current = url; setPreview(url); setImage(file)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Foto belum bisa dibuka.') }
  }
  function removeImage() {
    cancelReading(); releasePreview(); setPreview(''); setImage(null)
    setNeedsLogin(false); setError('')
    if (imageInput.current) { imageInput.current.value = ''; imageInput.current.focus() }
  }
  async function recognize() {
    if (!recognizer || !image || reading || controller.current || saveInFlight.current) return
    const request = new AbortController(); controller.current = request; setReading(true); setError(''); setNeedsLogin(false)
    try {
      const result = normalizeReceipt(await recognizer(image, request.signal))
      if (!active.current || request.signal.aborted) return
      setItems(result.items.map(item => row(item.label, String(item.amount))))
      setMerchant(result.merchant ?? ''); setDate(result.date ?? getToday()); setSourceTotal(result.total)
    } catch (cause) {
      if (active.current && !request.signal.aborted) {
        setNeedsLogin(cause instanceof ReceiptAccessError)
        setError(cause instanceof Error ? cause.message : 'Pembacaan gagal. Coba lagi atau isi manual.')
      }
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
      if (!categoryId) throw new Error('Pengeluaran belum dapat disimpan. Buka ulang aplikasi lalu coba lagi.')
      for (const item of items) {
        if (!item.label.trim() || item.label.trim().length > 120 || !Number.isSafeInteger(Number(item.amount)) || Number(item.amount) <= 0) throw new Error('Isi nama dan nominal rupiah utuh untuk setiap item.')
        if (!buckets.some(bucket => bucket.id === item.bucketId)) throw new Error('Pilih bucket setiap item.')
      }
      const fingerprint = JSON.stringify({ items, merchant: merchant.trim(), date, categoryId })
      if (lastBatch.current?.fingerprint !== fingerprint) {
        const now = Date.now()
        lastBatch.current = { fingerprint, batch: items.map(item => ({ id: item.id, type: 'expense', amount: Number(item.amount), date,
          categoryId, bucketId: item.bucketId, note: merchant.trim() ? `${merchant.trim()} · ${item.label.trim()}` : item.label.trim(),
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
      <details className="receipt-service-status"><summary>Status pembaca otomatis</summary><ServiceReadiness service="receipt" /></details>
      <p className="ui-helper">Pilih foto, lalu baca dan periksa itemnya. Foto baru dikirim ke Google Gemini saat kamu menekan Baca otomatis.</p>
      <fieldset disabled={saving || reading} className="receipt-fields">
        <div className="ui-field receipt-photo-field">
          <label htmlFor={imageInputId}>Foto struk</label>
          <label htmlFor={imageInputId} className="receipt-upload-prompt" aria-hidden="true"><ImagePlus size={28} strokeWidth={1.5} /><span>Ambil foto atau pilih struk</span><small>JPEG, PNG, WebP · maks. 10 MB</small></label>
          <input id={imageInputId} ref={imageInput} className="receipt-photo-input" type="file" accept={RECEIPT_IMAGE_ACCEPT}
            aria-describedby={`${imageInputId}-help ${imageInputId}-selection`}
            onChange={event => selectImage(event.target.files?.[0])} />
          <p id={`${imageInputId}-help`} className="ui-helper">JPEG, PNG, atau WebP, maksimal 10 MB.</p>
          <p id={`${imageInputId}-selection`} className="receipt-photo-name" aria-live="polite" aria-atomic="true">{image ? `Foto dipilih: ${image.name}` : 'Belum ada foto dipilih.'}</p>
          {image && <Button variant="ghost" className="receipt-photo-remove" onClick={removeImage}>Hapus foto struk</Button>}
        </div>
        {preview && <img className="receipt-preview" src={preview} alt="Pratinjau foto struk" />}
        <p id={privacyHelpId} className="ui-helper">Tutup informasi pribadi/nomor kartu sebelum mengirim. Kebijakan pemakaian data mengikuti paket Google. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Ketentuan penggunaan data Google Gemini (tab baru)</a></p>
        <Button loading={reading} aria-describedby={privacyHelpId} disabled={!recognizer || !image} onClick={() => void recognize()}><ScanLine size={18} aria-hidden="true" />Baca otomatis</Button>
      </fieldset>
      {reading && <><p role="status">Membaca struk…</p><Button variant="ghost" onClick={cancelReading}>Batalkan pembacaan</Button></>}
      {error && <InlineError>{error}</InlineError>}
      {needsLogin && <a href="/auth/refresh?service=receipt">Masuk ulang pembaca struk</a>}
      <fieldset disabled={saving || reading} className="receipt-fields">
        <TextField label="Nama toko (opsional)" value={merchant} maxLength={120} onChange={event => { setMerchant(event.target.value); setError('') }} />
        <DateField label="Tanggal struk" max={getToday()} value={date} onChange={value => { setDate(value); setError('') }} />
        {items.map((item, index) => <section className="receipt-item" key={item.id} aria-label={`Item ${index + 1}`}>
          <h3>Item {index + 1}</h3>
          <TextField label={`Nama item ${index + 1}`} maxLength={120} value={item.label} onChange={event => edit(item.id, { label: event.target.value })} />
          <TextField label={`Nominal item ${index + 1} (Rp)`} type="number" min="1" step="1" inputMode="numeric" value={item.amount} onChange={event => edit(item.id, { amount: event.target.value })} />
          <BucketPicker label={`Bucket item ${index + 1}`} buckets={buckets} value={item.bucketId}
            disabled={saving || reading} onChange={bucketId => edit(item.id, { bucketId })} />
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
