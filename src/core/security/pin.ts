/**
 * PIN Security -- SHA-256 + random salt via Web Crypto API (dok 09 SS5)
 * ponytail: fungsi pure + 1 state lockout, no external dep
 */

// ---- Hash -------------------------------------------------------

function hexFromBuffer(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Generate random 16-byte hex salt */
export function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return hexFromBuffer(bytes.buffer)
}

/** Hash PIN + salt menjadi hex SHA-256 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(pin + salt)
  const buf  = await crypto.subtle.digest('SHA-256', data)
  return hexFromBuffer(buf)
}

/** Verifikasi PIN yang diinput terhadap hash tersimpan */
export async function verifyPin(input: string, storedHash: string, salt: string): Promise<boolean> {
  const inputHash = await hashPin(input, salt)
  return inputHash === storedHash
}

// Lockout dipindah ke `lockout.ts` agar state persisten di IndexedDB (D52).
