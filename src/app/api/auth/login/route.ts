import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { signCookie, COOKIE_OPTIONS, COOKIE_NAMES } from '@/lib/auth'

export async function POST(request: Request) {
  const { password } = await request.json()
  const cookieStore = await cookies()  // MUST await in Next.js 16

  // Admin password grants full access (both cookies)
  if (password === process.env.ADMIN_PASSWORD) {
    cookieStore.set(COOKIE_NAMES.session, await signCookie(COOKIE_NAMES.session), COOKIE_OPTIONS)
    cookieStore.set(COOKIE_NAMES.adminSession, await signCookie(COOKIE_NAMES.adminSession), COOKIE_OPTIONS)
    return NextResponse.json({ success: true, redirect: '/admin' })
  }

  // Group password grants group access only
  if (password === process.env.GROUP_PASSWORD) {
    cookieStore.set(COOKIE_NAMES.session, await signCookie(COOKIE_NAMES.session), COOKIE_OPTIONS)
    return NextResponse.json({ success: true, redirect: '/' })
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
}
