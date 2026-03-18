import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.COOKIE_SECRET!

export const COOKIE_NAMES = {
  session: 'session',
  adminSession: 'admin_session',
} as const

export function signCookie(cookieName: string): string {
  return createHmac('sha256', SECRET).update(cookieName).digest('hex')
}

export function verifyHmac(value: string, cookieName: string): boolean {
  const expected = signCookie(cookieName)
  try {
    return timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}
