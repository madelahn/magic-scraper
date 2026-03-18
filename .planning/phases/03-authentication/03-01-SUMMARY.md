---
phase: 03-authentication
plan: 01
subsystem: auth
tags: [hmac, crypto, cookie, proxy, next.js, jest, httponly]

# Dependency graph
requires:
  - phase: 02-serverless-browser-migration
    provides: working Next.js 16 app with route handlers and API routes
provides:
  - HMAC cookie signing/verification library (src/lib/auth.ts)
  - proxy.ts route protection — all routes gated behind session cookie
  - login API route — sets httpOnly cookies for group and admin passwords
  - logout API route — clears both cookies with maxAge 0
  - admin updateCollections route — body-secret removed, proxy enforces auth
  - jest test infrastructure (jest.config.js, tests/)
affects: [03-authentication-ui, future phases using cookie auth]

# Tech tracking
tech-stack:
  added: [jest@30.2.0, @types/jest, ts-jest, Node.js crypto (built-in)]
  patterns: [HMAC cookie signing with timingSafeEqual, proxy.ts route protection (Next.js 16), async cookies() in route handlers]

key-files:
  created:
    - src/lib/auth.ts
    - proxy.ts
    - src/app/api/auth/login/route.ts
    - src/app/api/auth/logout/route.ts
    - jest.config.js
    - tests/proxy.test.ts
    - tests/auth-login.test.ts
    - tests/auth-logout.test.ts
  modified:
    - src/app/api/admin/updateCollections/route.ts
    - .gitignore

key-decisions:
  - "Admin password checked first in login route so admin users get both cookies"
  - "Login route returns JSON redirect field (not NextResponse.redirect) — client fetch must not follow server-side 307"
  - ".gitignore /auth pattern scoped to project root (/auth) to avoid blocking src/app/api/auth/"
  - "jest.config.js used (not .ts) to avoid ts-node peer dependency"

patterns-established:
  - "Pattern: proxy.ts at project root with export function proxy() — NOT middleware.ts"
  - "Pattern: request.cookies.get() in proxy (not cookies() from next/headers)"
  - "Pattern: await cookies() in route handlers (Next.js 16 mandatory)"
  - "Pattern: timingSafeEqual wrapping with try/catch for malformed cookie defense"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

# Metrics
duration: 12min
completed: 2026-03-17
---

# Phase 3 Plan 01: Authentication Backend Summary

**HMAC-signed httpOnly cookie auth with proxy.ts route protection using Node.js built-in crypto — no auth library dependencies**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-17T18:56:16Z
- **Completed:** 2026-03-17T19:08:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Built zero-dependency HMAC cookie auth library using Node.js `crypto` (signCookie/verifyHmac + timingSafeEqual)
- Created proxy.ts at project root protecting all routes; skips /login and /api/auth to prevent redirect loops
- Login route sets session cookie for group password, both cookies for admin password; returns JSON redirect URL
- Logout route clears both cookies with maxAge 0; admin updateCollections route stripped of body-secret check
- Set up complete Jest test infrastructure (15 tests passing: 7 proxy, 5 login, 3 logout)

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth library and proxy route protection** - `cb68583` (feat)
2. **Task 2: Login/logout route handlers, clean admin route** - `f03a49c` (feat)

**Plan metadata:** (docs commit, follows)

## Files Created/Modified
- `src/lib/auth.ts` - HMAC sign/verify, COOKIE_NAMES, COOKIE_OPTIONS
- `proxy.ts` - Route protection with session + admin_session checks, matcher for all non-static paths
- `src/app/api/auth/login/route.ts` - POST: validates passwords, sets httpOnly cookies, returns JSON redirect
- `src/app/api/auth/logout/route.ts` - POST: clears both cookies with maxAge 0
- `src/app/api/admin/updateCollections/route.ts` - Removed body-secret check (proxy handles auth now)
- `jest.config.js` - Jest + ts-jest config with @/ path alias
- `tests/proxy.test.ts` - 7 proxy redirect/passthrough unit tests
- `tests/auth-login.test.ts` - 5 login handler tests (cookie setting, 401, redirect URL)
- `tests/auth-logout.test.ts` - 3 logout handler tests (cookie clearing, redirect)
- `.gitignore` - Scoped /auth pattern to project root

## Decisions Made
- Admin password is checked first in the login route so admin users get both the session and admin_session cookies
- Login route returns `{ success, redirect }` JSON instead of `NextResponse.redirect()` — a server-side 307 from a fetch() call would be followed silently by the browser instead of letting the client navigate
- `jest.config.js` (not `.ts`) avoids needing `ts-node` as an additional peer dependency
- `.gitignore` `auth` entries scoped to `/auth` and `/auth-wal` (rooted) so they don't match `src/app/api/auth/`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wave 0 test infrastructure missing**
- **Found during:** Task 1 setup
- **Issue:** Plan assumed `03-00` had created `jest.config.ts`, `tests/` directory, and test stub files. None existed.
- **Fix:** Installed jest@30.2.0, @types/jest, ts-jest; created `jest.config.js` and `tests/` directory; wrote real test implementations directly (no stubs to convert)
- **Files modified:** jest.config.js, package.json, package-lock.json, tests/ (created)
- **Verification:** `npx jest --passWithNoTests` → 15 tests pass
- **Committed in:** cb68583 (Task 1 commit)

**2. [Rule 1 - Bug] .gitignore blocking src/app/api/auth/**
- **Found during:** Task 2 commit
- **Issue:** `.gitignore` had bare `auth` pattern which matched any path component named `auth`, including `src/app/api/auth/`
- **Fix:** Changed `auth` to `/auth` and `auth-wal` to `/auth-wal` in .gitignore — scoped to project root only
- **Files modified:** .gitignore
- **Verification:** `git add src/app/api/auth/...` succeeds without ignored-file warning
- **Committed in:** f03a49c (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for test execution and source control. No scope creep.

## Issues Encountered
- None beyond the deviations documented above

## User Setup Required

The following environment variables must be set before the app will authenticate users:

| Variable | Where | How |
|----------|-------|-----|
| `COOKIE_SECRET` | `.env.local` + Vercel env vars | `openssl rand -hex 32` |
| `GROUP_PASSWORD` | `.env.local` + Vercel env vars | Choose a shared group password |
| `ADMIN_PASSWORD` | `.env.local` + Vercel env vars | Choose a stronger admin password |

## Next Phase Readiness
- Auth backend is complete and tested — all 15 unit tests pass
- proxy.ts is protecting all routes; any HTTP client will be redirected to /login without a valid cookie
- Ready for Phase 3 Plan 02: Login page UI (client-side form POSTing to /api/auth/login)
- No blockers; env vars setup is straightforward

---
*Phase: 03-authentication*
*Completed: 2026-03-17*
