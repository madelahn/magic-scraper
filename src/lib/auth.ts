// Uses Web Crypto API (crypto.subtle) — compatible with Next.js Edge Runtime (middleware)
// and Node.js 18+ (API routes, tests)

const SECRET = process.env.COOKIE_SECRET!

export const COOKIE_NAMES = {
  session: 'session',
  adminSession: 'admin_session',
} as const

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return buf
}

export async function signCookie(cookieName: string): Promise<string> {
  const key = await getKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(cookieName))
  return bytesToHex(sig)
}

export async function verifyHmac(value: string, cookieName: string): Promise<boolean> {
  try {
    const key = await getKey()
    return crypto.subtle.verify('HMAC', key, hexToBytes(value), new TextEncoder().encode(cookieName))
  } catch {
    return false
  }
}
