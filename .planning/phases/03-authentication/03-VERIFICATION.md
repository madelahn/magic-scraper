---
phase: 03-authentication
verified: 2026-03-17T00:00:00Z
status: gaps_found
score: 13/14 must-haves verified
re_verification: false
gaps:
  - truth: "Visitor sees a centered login card with app name, subtitle, password field, and Sign in button"
    status: partial
    reason: "Login page component is fully implemented but uses useSearchParams() without a Suspense boundary. Next.js build crashes with: 'useSearchParams() should be wrapped in a suspense boundary at page /login'. Production build exits with code 1 — the login page cannot be served in production."
    artifacts:
      - path: "src/app/login/page.tsx"
        issue: "useSearchParams() called directly in LoginPage component body — no Suspense wrapper. Build fails at static page generation step."
    missing:
      - "Wrap the useSearchParams() usage in a <Suspense> boundary. Standard fix: extract a LoginContent inner component that calls useSearchParams(), then wrap it in <Suspense fallback={null}> inside the default export LoginPage."
human_verification:
  - test: "Full auth flow end-to-end after build fix"
    expected: "Navigate to any route without cookie → redirect to /login. Enter group password → access home. Enter admin password → access /admin. Navigate to /admin with only group session → see admin-required notice on login page. Click Log out → redirect to /login, back-navigation does not restore access."
    why_human: "Browser session, cookie persistence, and back-navigation behavior cannot be verified programmatically."
---

# Phase 03: Authentication Verification Report

**Phase Goal:** Every route requires a valid session cookie — unauthenticated visitors see only the login page, and admin routes require a second stronger credential
**Verified:** 2026-03-17
**Status:** gaps_found — 1 blocker (production build failure on login page)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria + Plan must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Visitor without session cookie is redirected to /login | VERIFIED | proxy.ts lines 15-21: checks COOKIE_NAMES.session via verifyHmac, returns NextResponse.redirect('/login') on failure |
| 2 | Visitor with correct group password can access non-admin routes; session persists | VERIFIED | login/route.ts lines 17-19: sets 30-day httpOnly session cookie when GROUP_PASSWORD matches |
| 3 | Authenticated user without admin_session hitting /admin is blocked | VERIFIED | proxy.ts lines 24-33: ADMIN_PATHS check with message=admin-required redirect |
| 4 | Logout clears session cookie, back-navigation does not restore access | VERIFIED | logout/route.ts lines 7-8: sets maxAge:0 on both cookies; proxy re-checks cookie on every request |
| 5 | Login page renders centered card with app name, subtitle, password field, Sign in button | PARTIAL | Component code is complete but build crashes — useSearchParams() missing Suspense boundary causes next build to exit 1 |
| 6 | Entering correct group password redirects to / | VERIFIED | login/route.ts returns JSON {redirect:'/'} for GROUP_PASSWORD; login page line 29: router.push(data.redirect) |
| 7 | Entering correct admin password redirects to /admin | VERIFIED | login/route.ts lines 10-13: returns {redirect:'/admin'} for ADMIN_PASSWORD |
| 8 | Wrong password shows "Incorrect password. Try again." error | VERIFIED | login/page.tsx lines 30-31: sets error on 401 response |
| 9 | /admin without admin session shows "Admin access required" notice | VERIFIED | proxy.ts sets message=admin-required; login/page.tsx lines 45-51 renders notice when searchParams.get("message")==="admin-required" |
| 10 | Header shows Log out link for authenticated users | VERIFIED | header.tsx lines 25-30: renders <button>Log out</button> with handleLogout POST handler |
| 11 | Clicking Log out clears cookies and redirects to /login | VERIFIED | header.tsx POSTs to /api/auth/logout; logout/route.ts clears both cookies with maxAge:0 |
| 12 | Admin page has no password input field | VERIFIED | admin/page.tsx contains no <input>, no password state, no secret, no JSON.stringify |
| 13 | Admin updateCollections route no longer checks body secret | VERIFIED | updateCollections/route.ts: no secret, no ADMIN_SECRET, no request.json() — plain POST() |
| 14 | npx jest passes with 15 tests covering all AUTH requirements | VERIFIED | All 15 tests pass: 7 proxy, 5 login, 3 logout |

**Score:** 13/14 truths verified (1 partial — build-blocking)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/auth.ts` | HMAC sign/verify, COOKIE_NAMES, COOKIE_OPTIONS | VERIFIED | Exports signCookie, verifyHmac, COOKIE_NAMES, COOKIE_OPTIONS with timingSafeEqual and 30-day maxAge |
| `proxy.ts` | Route protection — redirect unauthenticated to /login, admin paths require admin_session | VERIFIED | export function proxy() at project root; Next.js 16 PROXY_FILENAME convention confirmed in dist/build |
| `src/app/api/auth/login/route.ts` | POST handler — validates password, sets cookies, returns JSON redirect | VERIFIED | Checks ADMIN_PASSWORD first (both cookies), then GROUP_PASSWORD (session only), 401 on wrong |
| `src/app/api/auth/logout/route.ts` | POST handler — clears cookies, returns JSON redirect | VERIFIED | Sets maxAge:0 on both session and admin_session |
| `src/app/login/page.tsx` | Login card UI, password form, error handling | PARTIAL (build-broken) | Component logic is complete; build fails: useSearchParams() not wrapped in Suspense |
| `src/app/components/header.tsx` | Header with Log out button | VERIFIED | "use client", handleLogout POSTs to /api/auth/logout, button with "Log out" text |
| `src/app/components/conditional-header.tsx` | Suppresses header on /login | VERIFIED | usePathname check, returns null on "/login" |
| `src/app/layout.tsx` | Uses ConditionalHeader, not direct Header | VERIFIED | Imports ConditionalHeader, renders <ConditionalHeader /> |
| `src/app/admin/page.tsx` | Admin page without password field | VERIFIED | No password state, no <input>, no secret, no JSON.stringify — plain action panel |
| `jest.config.js` | Jest with ts-jest, @/ alias, setupFiles | VERIFIED | ts-jest preset, moduleNameMapper @/->src/, setupFiles jest.setup.ts, testMatch tests/**/*.test.ts |
| `jest.setup.ts` | Env var stubs for all three auth vars | VERIFIED | Stubs COOKIE_SECRET, GROUP_PASSWORD, ADMIN_PASSWORD |
| `tests/proxy.test.ts` | 7 proxy redirect/passthrough tests | VERIFIED | Full implementations (not todos): 7 tests all passing |
| `tests/auth-login.test.ts` | 5 login handler tests | VERIFIED | Full implementations: 5 tests all passing |
| `tests/auth-logout.test.ts` | 3 logout handler tests | VERIFIED | Full implementations: 3 tests all passing |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `proxy.ts` | `src/lib/auth.ts` | import verifyHmac, COOKIE_NAMES | WIRED | Line 3: `import { verifyHmac, COOKIE_NAMES } from '@/lib/auth'`; used at lines 17, 27 |
| `src/app/api/auth/login/route.ts` | `src/lib/auth.ts` | import signCookie, COOKIE_OPTIONS, COOKIE_NAMES | WIRED | Line 3: `import { signCookie, COOKIE_OPTIONS, COOKIE_NAMES } from '@/lib/auth'`; signCookie called lines 11-12 |
| `src/app/api/auth/logout/route.ts` | `src/lib/auth.ts` | import COOKIE_NAMES | WIRED | Line 3: `import { COOKIE_NAMES } from '@/lib/auth'`; COOKIE_NAMES.session and .adminSession used lines 7-8 |
| `src/app/login/page.tsx` | `/api/auth/login` | fetch POST on form submit | WIRED | Line 21: `fetch("/api/auth/login", { method: "POST", ... })`; response handled lines 27-36 |
| `src/app/components/header.tsx` | `/api/auth/logout` | fetch POST on logout click | WIRED | Line 10: `fetch("/api/auth/logout", { method: "POST" })`; response used line 12 |
| `src/app/layout.tsx` | `conditional-header.tsx` | import ConditionalHeader | WIRED | Line 4: `import ConditionalHeader from "./components/conditional-header"`; rendered line 31 |
| `proxy.ts` (Next.js 16 build) | Next.js request pipeline | PROXY_FILENAME convention | WIRED | Confirmed: `node_modules/next/dist/build/index.js` line 574 detects proxy.ts by PROXY_FILENAME constant; export function proxy() matches expected named export |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 03-00, 03-01, 03-02 | Any visitor is redirected to a login page before accessing any route | SATISFIED | proxy.ts checks session cookie on all paths except /login and /api/auth; redirects to /login on failure |
| AUTH-02 | 03-00, 03-01, 03-02 | Visitor can log in with shared group password and gain access via httpOnly cookie | SATISFIED | login route.ts validates GROUP_PASSWORD env var, sets httpOnly 30-day session cookie via COOKIE_OPTIONS |
| AUTH-03 | 03-00, 03-01, 03-02 | Admin routes (/admin, /api/admin/*) require a separate stronger admin password | SATISFIED | proxy.ts ADMIN_PATHS check; login route sets admin_session only for ADMIN_PASSWORD; admin page has no manual check |
| AUTH-04 | 03-00, 03-01, 03-02 | User can log out, which clears the session cookie and redirects to login | SATISFIED | logout route.ts sets maxAge:0 on both cookies; proxy re-validates on every request so no stale access |

All four requirements are mapped to Phase 3 in REQUIREMENTS.md traceability table and marked complete. No orphaned requirements detected.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/login/page.tsx` | 8 | `useSearchParams()` called outside Suspense boundary | BLOCKER | `next build` exits with code 1 — login page cannot be served in production. Error: "useSearchParams() should be wrapped in a suspense boundary at page /login" |

No other anti-patterns found. No TODO/FIXME/placeholder comments in any phase-03 file. No empty return stubs (the `return null` in conditional-header.tsx is intentional and correct). No console.log-only implementations.

---

## Human Verification Required

### 1. Full Authentication Flow End-to-End

**Test:** After fixing the Suspense issue and running `npm run dev`, walk through the complete auth flow:
1. Navigate to http://localhost:3000 — should redirect to /login
2. Enter wrong password — should see "Incorrect password. Try again." below Sign in button in red
3. Enter GROUP_PASSWORD — should redirect to home page
4. Click Log out in header — should redirect to /login
5. Navigate to /admin — should redirect to /login with "Admin access required" notice above the card
6. Enter ADMIN_PASSWORD — should redirect to /admin and see the admin panel with no password field
7. After logout, press browser Back — page should redirect back to /login (cookie is gone, proxy re-checks)

**Expected:** All 7 steps pass without errors.

**Why human:** Cookie persistence, browser redirect behavior, visual card layout, back-navigation behavior with browser cache, and real-time session state cannot be verified programmatically.

---

## Gaps Summary

One blocker prevents the phase goal from being fully deployable:

**Missing Suspense boundary in login/page.tsx:** The component calls `useSearchParams()` directly in the component body. Next.js App Router requires `useSearchParams()` to be inside a `<Suspense>` boundary because it opts the entire page out of static prerendering. Without this, `next build` crashes during static page generation with exit code 1.

The fix is small and mechanical:
1. Extract a `LoginContent` component containing all the current JSX and hook calls (including `useSearchParams`)
2. Wrap it in `<Suspense fallback={null}>` inside the default `LoginPage` export

All backend auth logic (proxy, HMAC library, login/logout routes) is complete, substantive, and correctly wired. All 15 unit tests pass. The admin updateCollections route is clean of body-secret checks. The header has a working logout button. The admin page has no password field. The conditional header correctly suppresses the site header on /login.

The single gap is in the UI layer only and is a one-function refactor.

---

_Verified: 2026-03-17_
_Verifier: Claude (gsd-verifier)_
