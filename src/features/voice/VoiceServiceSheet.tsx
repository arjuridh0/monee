import { Button } from '@/components/ui/controls'
import { Dialog } from '@/components/ui/Dialog'
import './voice.css'

export function VoiceServiceSheet({ onClose }: { onClose: () => void }) {
  return <Dialog open sheet title="Layanan suara" onClose={onClose}>
    <div className="voice-form">
      <p>Layanan suara disediakan pengelola Monee untuk pengguna yang memiliki akses. Hubungi pengelola jika akses belum tersedia.</p>
      <p>Dengan persetujuanmu sebelum merekam, audio dikirim ke server Monee lalu ke Groq untuk diubah menjadi teks. Hanya audio rekaman yang dikirim; data keuangan lainnya tetap di perangkat.</p>
      <p>Monee tidak menyimpan audio. Pemrosesan dan retensi di Groq mengikuti kebijakan mereka serta pengaturan layanan oleh pengelola.</p>
      <p>Teks diproses di perangkat menjadi draft yang kamu periksa sebelum disimpan. Kamu juga bisa mengetik transaksi tanpa internet.</p>
      <a href="/auth/refresh">Masuk ulang layanan suara</a>
      <a href="https://console.groq.com/docs/your-data" target="_blank" rel="noreferrer">Kebijakan data Groq</a>
      <Button variant="ghost" onClick={onClose}>Tutup</Button>
    </div>
  </Dialog>
}
