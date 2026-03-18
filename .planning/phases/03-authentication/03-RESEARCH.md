# Phase 3: Authentication - Research

**Researched:** 2026-03-17
**Domain:** Next.js 16 route protection, httpOnly cookie authentication, proxy.ts
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single `/login` page handles both group and admin login — no separate admin login page
- Group password sets `session` cookie; admin password sets both `session` + `admin_session` cookies
- A group member hitting `/admin` is redirected to `/login` with message: "Admin access required — enter the admin password"
- Admin back-navigation after logout must not restore access (cookie cleared = session gone)
- Card/box layout for login page — centered panel (not the full-page bold style of the home page)
- Box header: app name "MTGCardSearch" + subtitle "Enter group password to continue"
- Single password input field + submit button using existing `button` CSS class
- Group session cookie: 30-day persistent httpOnly cookie
- Admin session cookie: 30-day persistent httpOnly cookie
- Logout link lives in the header nav, visible to all authenticated users
- Clicking logout clears BOTH `session` and `admin_session` cookies (full logout — no downgrade option)
- After logout, redirect to `/login`

### Claude's Discretion
- Exact cookie signing/encryption mechanism (iron-session vs jose vs Next.js signed cookies) — no auth library overhead preferred, keep it minimal
- Error feedback animation/style on wrong password
- Exact card/box styling (border, shadow, padding) — should be clean and on-brand with Tailwind v4

### Deferred Ideas (OUT OF SCOPE)
- Overall site visual redesign — the rest of the site should eventually get a visual refresh to match the improved login page aesthetic, but this is V2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Any visitor is redirected to a login page before accessing any route | `proxy.ts` with matcher covering all non-public routes; `request.cookies.has()` for fast presence check |
| AUTH-02 | Visitor can log in with the shared group password and gain access via httpOnly cookie | POST `/api/auth/login` validates env var password, sets signed httpOnly cookie with 30-day maxAge |
| AUTH-03 | Admin routes (`/admin`, `/api/admin/*`) require a separate stronger admin password | Proxy checks `admin_session` cookie in addition to `session` cookie for admin paths; same login endpoint sets both cookies when admin password given |
| AUTH-04 | User can log out, which clears the session cookie and redirects to login | POST `/api/auth/logout` deletes both cookies via `maxAge: 0`; redirect to `/login`; back-nav cannot restore because cookie is gone |
</phase_requirements>

## Summary

This phase gates the entire Next.js 16 app behind a shared-password cookie system. The mechanism is two httpOnly cookies (`session` and `admin_session`) set by a login API route and validated on every request by the new `proxy.ts` file (the Next.js 16 replacement for `middleware.ts`).

The user preference is minimal — no auth library. Since both cookies contain no session data (they are purely presence gates), a simple HMAC-signed value using Node.js `crypto` is sufficient and introduces zero new dependencies. The cookie value is `hmac(secret, cookieName)` — the proxy verifies the signature synchronously before every request.

**Primary recommendation:** Use Node.js `crypto` (no new package) for HMAC cookie signing. Store the HMAC digest as the cookie value. The proxy reads the cookie and re-computes the expected HMAC to validate. This satisfies the "minimal, no auth library overhead" constraint while preventing cookie forgery.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.1.6 (installed) | App framework, proxy.ts, route handlers, cookies() API | Already in project |
| Node.js `crypto` | built-in | HMAC signing of cookie values | Zero dependencies, available in proxy Node.js runtime |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `iron-session` | 8.0.4 | Encrypted stateful cookie sessions | Prefer if session data needs to be stored in the cookie; overkill for boolean gate |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual HMAC crypto | iron-session 8.0.4 | iron-session adds encryption + structure but requires `npm install iron-session` and 32-char password env var; overkill for this use case |
| Manual HMAC crypto | jose (JWT) | jose is popular but brings JWT overhead; unnecessary for a simple presence check |
| proxy.ts (Node runtime) | middleware.ts (Edge runtime) | middleware.ts still works but is deprecated in Next.js 16 and prints warnings; use proxy.ts |

**Installation (if iron-session chosen):**
```bash
npm install iron-session
```

**Installation (manual HMAC — no install needed):** Uses `import { createHmac, timingSafeEqual } from 'crypto'` which is built into Node.js.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── login/
│   │   └── page.tsx          # Login page (card/box layout)
│   ├── api/
│   │   └── auth/
│   │       ├── login/
│   │       │   └── route.ts  # POST: validate password, set cookies, redirect
│   │       └── logout/
│   │           └── route.ts  # POST: clear both cookies, redirect to /login
│   ├── components/
│   │   └── header.tsx        # Add logout link
│   └── admin/
│       └── page.tsx          # Remove existing manual password pattern
└── lib/
    └── auth.ts               # Cookie name constants, HMAC sign/verify helpers
proxy.ts                       # Route protection (project root, same level as src/)
```

### Pattern 1: proxy.ts Route Protection (Next.js 16)

**What:** File at project root (same level as `src/`) that intercepts all matched requests. Named export `proxy` (NOT `middleware` — that is deprecated in Next.js 16).

**When to use:** Every request before page render; reads cookies synchronously via `request.cookies`.

**Example:**
```typescript
// proxy.ts — Source: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ADMIN_PATHS = ['/admin', '/api/admin']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip the login page and auth API routes themselves
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get('session')
  const hasSession = sessionCookie && verifyHmac(sessionCookie.value, 'session')

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Admin path check
  const isAdminPath = ADMIN_PATHS.some(p => pathname.startsWith(p))
  if (isAdminPath) {
    const adminCookie = request.cookies.get('admin_session')
    const hasAdmin = adminCookie && verifyHmac(adminCookie.value, 'admin_session')
    if (!hasAdmin) {
      const url = new URL('/login', request.url)
      url.searchParams.set('message', 'admin-required')
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all paths except static assets and _next internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

### Pattern 2: HMAC Cookie Signing (lib/auth.ts)

**What:** Sign and verify cookie values using Node.js built-in `crypto` module. Prevents cookie forgery without any library.

**When to use:** Setting cookies in route handlers; verifying in proxy.

```typescript
// src/lib/auth.ts
import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.COOKIE_SECRET!  // must be set in env

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
  maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
}
```

### Pattern 3: Setting Cookies in Route Handlers (Next.js 16)

**What:** In Next.js 16, `cookies()` is fully async — must use `await`. Can only be called from Route Handlers or Server Actions (not Server Components at render time).

```typescript
// src/app/api/auth/login/route.ts
// Source: https://nextjs.org/docs/app/api-reference/functions/cookies
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { signCookie, COOKIE_OPTIONS, COOKIE_NAMES } from '@/lib/auth'

export async function POST(request: Request) {
  const { password } = await request.json()
  const cookieStore = await cookies()  // MUST be awaited in Next.js 16

  if (password === process.env.GROUP_PASSWORD) {
    cookieStore.set(COOKIE_NAMES.session, signCookie(COOKIE_NAMES.session), COOKIE_OPTIONS)
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (password === process.env.ADMIN_PASSWORD) {
    cookieStore.set(COOKIE_NAMES.session, signCookie(COOKIE_NAMES.session), COOKIE_OPTIONS)
    cookieStore.set(COOKIE_NAMES.adminSession, signCookie(COOKIE_NAMES.adminSession), COOKIE_OPTIONS)
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
}
```

### Pattern 4: Clearing Cookies (Logout)

**What:** Delete cookies by setting `maxAge: 0` (immediately expires). The `delete()` method also works.

```typescript
// src/app/api/auth/logout/route.ts
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { COOKIE_NAMES } from '@/lib/auth'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAMES.session, '', { maxAge: 0, path: '/' })
  cookieStore.set(COOKIE_NAMES.adminSession, '', { maxAge: 0, path: '/' })
  return NextResponse.redirect(new URL('/login', request.url))
}
```

### Anti-Patterns to Avoid

- **Using `export function middleware()` in proxy.ts**: In Next.js 16, the named export must be `proxy`, not `middleware`. Using the old name triggers deprecation warnings and will break in a future release.
- **Calling `cookies()` from next/headers inside proxy.ts**: The `cookies()` helper from `next/headers` uses async storage that is NOT available in proxy context. Read cookies directly from `request.cookies` in proxy.ts.
- **Forgetting to exclude `/login` and `/api/auth` from the matcher**: Without exclusions, the proxy would redirect the login page and auth API routes themselves, creating an infinite redirect loop.
- **String equality for cookie validation**: Always use `timingSafeEqual` when comparing HMAC digests to prevent timing attacks.
- **Forgetting `await` on `cookies()`**: In Next.js 16, synchronous `cookies()` access is fully removed. Missing `await` causes runtime errors.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie HMAC comparison | Raw string equality `===` | `timingSafeEqual` from Node.js `crypto` | Timing attacks allow brute-forcing secrets via response time differences |
| 30-day cookie expiry | Manual `Date` calculation | `maxAge: 60 * 60 * 24 * 30` (seconds) | `maxAge` is simpler and browser-consistent; `expires` requires a Date object |
| Admin path matching | Per-route checks in every page | Centralized `proxy.ts` matcher | Route handlers can be bypassed; proxy runs unconditionally before every request |

**Key insight:** The proxy layer is the only reliable enforcement point. Even if `/admin/page.tsx` checks cookies, API routes under `/api/admin/*` could be called directly without the page. Only the proxy covers all entry points.

## Common Pitfalls

### Pitfall 1: middleware.ts vs proxy.ts File Name
**What goes wrong:** Creating `middleware.ts` with `export function middleware()` works but logs deprecation warnings in Next.js 16 console and on Vercel. The build may work but the intent is wrong for a new file.
**Why it happens:** Training data and most tutorials still reference `middleware.ts` because Next.js 16 was released recently.
**How to avoid:** Use `proxy.ts` at the project root with `export function proxy(request: NextRequest)`.
**Warning signs:** Console warning `[DEPRECATION] middleware.ts is deprecated, rename to proxy.ts`.

### Pitfall 2: Infinite Redirect Loop on Login Page
**What goes wrong:** The proxy redirects all unauthenticated requests to `/login`. If `/login` itself is not excluded, it also gets redirected — infinite loop, browser shows ERR_TOO_MANY_REDIRECTS.
**Why it happens:** Forgetting to add the login route and auth API routes to the exclusion list.
**How to avoid:** The matcher regex must exclude `/login` and `/api/auth`. Example: `/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)`.
**Warning signs:** ERR_TOO_MANY_REDIRECTS in browser after deploying.

### Pitfall 3: HMAC Digest Length Mismatch Panics timingSafeEqual
**What goes wrong:** `timingSafeEqual` throws if the two Buffers have different lengths. A tampered cookie with wrong-length hex will crash the proxy with an uncaught error.
**Why it happens:** Cookie values can be anything — attacker could send a 1-character cookie value.
**How to avoid:** Wrap `timingSafeEqual` in a try/catch and return `false` on error (as shown in the auth.ts pattern above).
**Warning signs:** 500 errors in proxy when cookie is malformed.

### Pitfall 4: cookies() Called Without await in Route Handlers
**What goes wrong:** Runtime error: `cookies() should be awaited before using its value`.
**Why it happens:** Next.js 16 removed synchronous `cookies()` access. In Next.js 15 it still worked synchronously.
**How to avoid:** Always `const cookieStore = await cookies()` in route handlers and server actions.

### Pitfall 5: Admin Route Missing from Proxy Matcher
**What goes wrong:** `/api/admin/updateCollections` remains unprotected — it only has the old `body.secret` check, which gets removed in this phase.
**Why it happens:** The matcher regex is written to cover page routes but misses API sub-routes.
**How to avoid:** Include `/api/admin/:path*` explicitly in the proxy matcher, or use a broad matcher that covers all paths except the exclusions.

### Pitfall 6: Back-Navigation Restoring Access After Logout
**What goes wrong:** Browser caches the admin page. After logout, pressing Back shows the cached page. This appears to "restore access" but the user cannot make any API calls.
**Why it happens:** Browser cache — this is a UI/UX perception issue, not an auth bypass. The server always checks the cookie.
**How to avoid:** Add `Cache-Control: no-store` headers on admin pages, or note in the plan that the server-side check is the authoritative guard and back-navigation shows a stale page that won't load data.

## Code Examples

Verified patterns from official sources:

### proxy.ts — Reading Cookies
```typescript
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Read cookie directly from request — do NOT use cookies() from next/headers here
  const sessionCookie = request.cookies.get('session')
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
}
```

### Route Handler — Async cookies()
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/cookies (version 16.1.7)
import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = await cookies()  // await is REQUIRED in Next.js 16
  cookieStore.set('session', 'value', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}
```

### Deleting a Cookie
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/cookies
const cookieStore = await cookies()
// Set maxAge to 0 to immediately expire the cookie
cookieStore.set('session', '', { maxAge: 0, path: '/' })
// OR use delete method
cookieStore.delete('session')
```

### timingSafeEqual for Constant-Time Comparison
```typescript
// Source: Node.js crypto docs (built-in module)
import { timingSafeEqual } from 'crypto'

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false  // different lengths or invalid hex
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` + `export function middleware()` | `proxy.ts` + `export function proxy()` | Next.js 16 (v16.0.0) | Must create `proxy.ts`, not `middleware.ts` for new code |
| Synchronous `cookies()` | `await cookies()` | Next.js 15→16 (fully removed in 16) | Every `cookies()` call in route handlers requires `await` |
| Edge runtime in middleware | Node.js runtime in proxy | Next.js 16 | `proxy.ts` runs Node.js, enabling full `crypto` module access |
| Body-based secret check in `/api/admin/updateCollections` | Cookie-based admin auth via proxy | This phase | Remove `{ secret: password }` pattern; admin check moves to proxy |

**Deprecated/outdated:**
- `middleware.ts` with `export function middleware()`: Deprecated in v16, prints warnings, rename to `proxy.ts`.
- Synchronous `cookies()`: Removed in Next.js 16. All calls must be awaited.
- `src/app/admin/page.tsx` manual password in body: This ad-hoc pattern is replaced entirely by the `admin_session` cookie check in proxy.

## Open Questions

1. **Where exactly does proxy.ts live with `src/` directory?**
   - What we know: The Next.js docs say "same level as `pages` or `app`" or "in the project root or inside `src`"
   - What's confirmed: The project has `src/app/`. Based on the Next.js docs, `proxy.ts` can live at `src/proxy.ts` (next to `src/app/`) OR at the project root. Both are supported.
   - Recommendation: Place at project root (same level as `src/`) — this is the most commonly documented and unambiguous location. The matcher sees all routes either way.

2. **Login form: server action vs client-side fetch to `/api/auth/login`?**
   - What we know: Both work. Server actions call `cookies()` directly; client fetch hits a route handler.
   - What's unclear: Whether a redirect from a server action POSTing to the origin would cause the browser to preserve cookies properly.
   - Recommendation: Use a client component login form that POSTs to `/api/auth/login` route handler — this is the most explicit, debuggable pattern and consistent with the existing admin page pattern.

3. **Cookie `secure: true` on localhost dev?**
   - What we know: `secure: true` cookies are not sent over HTTP (only HTTPS). `localhost` is treated as a secure context in Chrome/Firefox but `http://localhost` does not trigger this for all browsers.
   - Recommendation: Use `secure: process.env.NODE_ENV === 'production'` so cookies work on both localhost dev and Vercel production.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected |
| Config file | None — Wave 0 setup needed |
| Quick run command | `npx jest --testPathPattern=auth --passWithNoTests` |
| Full suite command | `npx jest --passWithNoTests` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Unauthenticated request to `/` redirects to `/login` | unit (proxy logic) | `npx jest tests/proxy.test.ts -t "redirects unauthenticated"` | ❌ Wave 0 |
| AUTH-01 | Request with valid `session` cookie passes through | unit (proxy logic) | `npx jest tests/proxy.test.ts -t "allows valid session"` | ❌ Wave 0 |
| AUTH-02 | POST with correct group password sets `session` cookie | unit (route handler) | `npx jest tests/auth-login.test.ts -t "sets session cookie"` | ❌ Wave 0 |
| AUTH-02 | POST with wrong password returns 401 | unit (route handler) | `npx jest tests/auth-login.test.ts -t "rejects wrong password"` | ❌ Wave 0 |
| AUTH-03 | `session` cookie without `admin_session` redirects on `/admin` | unit (proxy logic) | `npx jest tests/proxy.test.ts -t "redirects group user from admin"` | ❌ Wave 0 |
| AUTH-03 | Admin password sets both cookies | unit (route handler) | `npx jest tests/auth-login.test.ts -t "sets both cookies for admin"` | ❌ Wave 0 |
| AUTH-04 | Logout clears both cookies | unit (route handler) | `npx jest tests/auth-logout.test.ts -t "clears cookies"` | ❌ Wave 0 |
| AUTH-04 | Post-logout request redirects to login | unit (proxy logic) | `npx jest tests/proxy.test.ts -t "redirects after logout"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest --passWithNoTests` (fast — no browser)
- **Per wave merge:** `npx jest --passWithNoTests`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/proxy.test.ts` — covers AUTH-01, AUTH-03, AUTH-04 (proxy redirect logic)
- [ ] `tests/auth-login.test.ts` — covers AUTH-02, AUTH-03 (login route handler)
- [ ] `tests/auth-logout.test.ts` — covers AUTH-04 (logout route handler)
- [ ] `jest.config.ts` + `jest.setup.ts` — framework install: `npm install --save-dev jest @types/jest ts-jest`
- [ ] `src/lib/auth.ts` — shared HMAC helpers used by all test targets

## Sources

### Primary (HIGH confidence)
- https://nextjs.org/docs/app/api-reference/file-conventions/proxy — proxy.ts file convention, matcher config, cookie API in proxy context, Next.js 16 deprecation of middleware.ts
- https://nextjs.org/docs/app/guides/upgrading/version-16 — Full breaking changes for Next.js 16 including middleware→proxy rename, async cookies() fully enforced
- https://nextjs.org/docs/app/api-reference/functions/cookies — cookies() async API, set/delete options, maxAge behavior

### Secondary (MEDIUM confidence)
- https://github.com/vvo/iron-session/issues/694 — Confirmed: `getIronSession` works in middleware/proxy via `request.cookies`, NOT via `cookies()` from next/headers
- https://www.alexchantastic.com/revisiting-password-protecting-next — iron-session v8 App Router pattern with getSession() helper
- npm registry: `iron-session@8.0.4` (published 2024-11-12), `jose@6.2.1` (published 2026-03-09)

### Tertiary (LOW confidence)
- None — all critical claims verified with official Next.js docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed Next.js 16.1.6 docs and npm registry
- Architecture: HIGH — proxy.ts patterns sourced directly from official Next.js 16 docs
- Pitfalls: HIGH — proxy.ts rename, async cookies(), and timingSafeEqual pitfalls all verified via official docs

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (Next.js 16 is stable; unlikely to change within 30 days)
