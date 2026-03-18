/**
 * Tests for src/app/api/auth/logout/route.ts
 * Mocks next/headers and next/server to test route handler in isolation
 */

process.env.COOKIE_SECRET = 'test-secret-for-logout-tests-32chars!!'

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

import { POST } from '../src/app/api/auth/logout/route'

describe('logout route handler', () => {
  beforeEach(() => {
    mockCookieSet.mockClear()
    const { NextResponse } = jest.requireMock('next/server')
    NextResponse.json.mockClear()
  })

  it('clears session cookie with maxAge 0', async () => {
    await POST()
    const sessionCall = mockCookieSet.mock.calls.find(([name]: [string]) => name === 'session')
    expect(sessionCall).toBeDefined()
    expect(sessionCall[1]).toBe('')
    expect(sessionCall[2]).toMatchObject({ maxAge: 0 })
  })

  it('clears admin_session cookie with maxAge 0', async () => {
    await POST()
    const adminCall = mockCookieSet.mock.calls.find(([name]: [string]) => name === 'admin_session')
    expect(adminCall).toBeDefined()
    expect(adminCall[1]).toBe('')
    expect(adminCall[2]).toMatchObject({ maxAge: 0 })
  })

  it('returns redirect to /login', async () => {
    const result = await POST()
    expect((result as any).body).toEqual({ success: true, redirect: '/login' })
  })
})
