/**
 * Tests for src/app/api/auth/login/route.ts
 * Mocks next/headers and next/server to test route handler in isolation
 */

process.env.COOKIE_SECRET = 'test-secret-for-login-tests-32chars!!'
process.env.GROUP_PASSWORD = 'test-group-password'
process.env.ADMIN_PASSWORD = 'test-admin-password-stronger'

// Mock cookie store
const mockCookieSet = jest.fn()
const mockCookieStore = { set: mockCookieSet }

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue(mockCookieStore),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}))

import { POST } from '../src/app/api/auth/login/route'

function makeRequest(body: Record<string, unknown>): Request {
  return {
    json: async () => body,
  } as unknown as Request
}

describe('login route handler', () => {
  beforeEach(() => {
    mockCookieSet.mockClear()
    const { NextResponse } = jest.requireMock('next/server')
    NextResponse.json.mockClear()
  })

  it('sets session cookie for correct group password', async () => {
    const req = makeRequest({ password: 'test-group-password' })
    await POST(req)
    const sessionCall = mockCookieSet.mock.calls.find(([name]: [string]) => name === 'session')
    expect(sessionCall).toBeDefined()
    expect(sessionCall[0]).toBe('session')
    // cookie value should be a hex HMAC string
    expect(typeof sessionCall[1]).toBe('string')
    expect(sessionCall[1].length).toBeGreaterThan(0)
  })

  it('rejects wrong password with 401', async () => {
    const req = makeRequest({ password: 'wrong-password' })
    const result = await POST(req)
    expect((result as any).status).toBe(401)
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('returns JSON with redirect URL for group password', async () => {
    const req = makeRequest({ password: 'test-group-password' })
    const result = await POST(req)
    expect((result as any).body).toEqual({ success: true, redirect: '/' })
    expect((result as any).status).toBe(200)
  })

  it('sets both cookies for admin password', async () => {
    const req = makeRequest({ password: 'test-admin-password-stronger' })
    await POST(req)
    const cookieNames = mockCookieSet.mock.calls.map(([name]: [string]) => name)
    expect(cookieNames).toContain('session')
    expect(cookieNames).toContain('admin_session')
  })

  it('returns redirect to /admin for admin login', async () => {
    const req = makeRequest({ password: 'test-admin-password-stronger' })
    const result = await POST(req)
    expect((result as any).body).toEqual({ success: true, redirect: '/admin' })
  })
})
