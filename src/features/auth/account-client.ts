export interface AccountSession {
  authenticated: true
  accountId: string
  pinAuth?: boolean
  pinSetupRequired?: boolean
}

const ACCOUNT_ID = /^acct_[a-f0-9]{64}$/

export async function getAccountSession(): Promise<AccountSession | null> {
  let response: Response
  try {
    response = await fetch('/api/session', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
  } catch {
    throw new Error('Akun belum bisa diperiksa. Periksa koneksi lalu coba lagi.')
  }
  if (response.status === 401) return null
  if (!response.ok) throw new Error('Akun belum bisa diperiksa. Periksa koneksi lalu coba lagi.')
  try {
    const body = await response.json() as Partial<AccountSession>
    if (body.authenticated !== true || typeof body.accountId !== 'string' || !ACCOUNT_ID.test(body.accountId)) throw new Error()
    return { authenticated: true, accountId: body.accountId, pinAuth: body.pinAuth === true, pinSetupRequired: body.pinSetupRequired === true }
  } catch {
    throw new Error('Respons akun tidak valid. Muat ulang Monee lalu coba lagi.')
  }
}

export async function logoutAccount(): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/auth/logout', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
  } catch {
    throw new Error('Belum bisa keluar karena koneksi terputus. Coba lagi saat online.')
  }
  if (!response.ok) throw new Error('Belum bisa keluar dari akun. Coba lagi.')
}

export async function deleteAccountLedger(): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/account/data', {
      method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Monee-Request': 'account-delete' },
    })
  } catch {
    throw new Error('Perlu koneksi internet untuk menghapus data dari semua perangkat.')
  }
  if (!response.ok) throw new Error('Data akun belum terhapus. Periksa koneksi lalu coba lagi.')
}

export function beginAccountLogin(): void {
  window.location.assign('/')
}

export async function accountRequest<T>(path: string, body?: object): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  } catch { throw new Error('Tidak tersambung. Periksa koneksi lalu coba lagi.') }
  const value = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(value.error || 'Permintaan belum berhasil. Coba lagi.')
  return value as T
}

export async function verifyAccountEmail(intent: 'register' | 'recover' | 'activate'): Promise<void> {
  const result = await accountRequest<{ url: string }>('/api/auth/verify', { intent })
  if (result.url !== '/auth/bootstrap') throw new Error('Tujuan verifikasi tidak valid.')
  window.location.assign(result.url)
}
