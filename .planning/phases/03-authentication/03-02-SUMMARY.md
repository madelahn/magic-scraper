---
phase: 03-authentication
plan: 02
subsystem: auth
tags: [next.js, cookies, client-components, login-page, logout]

# Dependency graph
requires:
  - phase: 03-authentication/03-01
    provides: auth API routes (login, logout), session cookie logic, middleware redirect
provides:
  - Login page with centered card UI, password form, error handling, admin-required notice
  - ConditionalHeader that suppresses the site header on /login
  - Header with Log out button (POSTs to /api/auth/logout)
  - Cleaned admin page with no manual password field
affects: [04-deployment, any future phase touching header or admin UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ConditionalHeader wrapper pattern for route-specific layout exclusions (usePathname check)
    - Client component form with isLoading/error state and router.push on success redirect
    - De-emphasized logout button style (text-foreground/60 hover:text-foreground)

key-files:
  created:
    - src/app/login/page.tsx
    - src/app/components/conditional-header.tsx
  modified:
    - src/app/layout.tsx
    - src/app/components/header.tsx
    - src/app/admin/page.tsx

key-decisions:
  - "ConditionalHeader uses usePathname('/login') check — avoids per-page layout logic, single wrapper in root layout"
  - "Logout is a <button> (not <Link>) because it fires a POST fetch before navigating — semantic correctness"
  - "Admin page no longer holds password state — proxy cookie (admin_session) is the sole auth gate"

patterns-established:
  - "ConditionalHeader pattern: wrap layout-level components in a client component that reads pathname to opt out specific routes"
  - "Auth form pattern: isLoading + error state, POST fetch, read response.redirect, router.push"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]

# Metrics
duration: ~20min
completed: 2026-03-17
---

# Phase 03 Plan 02: Authentication UI Summary

**Login card UI with conditional header, logout button, and admin page cleanup completing the full cookie-based auth flow**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-17
- **Completed:** 2026-03-17
- **Tasks:** 3 (2 code tasks + 1 human verification)
- **Files modified:** 5

## Accomplishments

- Login page renders a centered card (matching UI-SPEC) with app name, subtitle, password field, Sign in button, loading state, and per-error messages
- Admin-required notice displays above the card when redirected from /admin with `?message=admin-required`
- Header converted to client component with a Log out button that POSTs to /api/auth/logout and redirects to /login
- ConditionalHeader suppresses the header on /login without adding per-page layout logic
- Admin page stripped of all password state and input — protected solely by admin_session cookie via middleware

## Task Commits

Each task was committed atomically:

1. **Task 1: Create login page and update layout for login route** - `6462df9` (feat)
2. **Task 2: Add logout to header and clean up admin page** - `74dfdcb` (feat)
3. **Task 3: Verify complete authentication flow** - human verification, approved — no code commit

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/app/login/page.tsx` - Client component, centered card, form with isLoading/error/redirect logic, admin-required notice
- `src/app/components/conditional-header.tsx` - usePathname check, returns null on /login, renders Header elsewhere
- `src/app/layout.tsx` - Replaced direct Header import with ConditionalHeader
- `src/app/components/header.tsx` - Converted to client component, added Log out button with POST logout fetch
- `src/app/admin/page.tsx` - Removed password state/input/JSON.stringify; now a clean action panel

## Decisions Made

- ConditionalHeader uses usePathname('/login') — a simple string check in a single wrapper is easier to maintain than per-page layout files or group routes
- Logout uses a `<button>` not a `<Link>` — it triggers a POST fetch first; navigation follows the API response redirect field
- Admin page has zero auth logic — the Next.js middleware (from Plan 01) and the admin_session cookie handle all protection before the page renders

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Env vars (COOKIE_SECRET, GROUP_PASSWORD, ADMIN_PASSWORD) were set up in Plan 01.

## Next Phase Readiness

- Full auth flow verified end-to-end: login, wrong-password error, group access, admin access, logout, back-navigation protection
- All 4 AUTH requirements (AUTH-01 through AUTH-04) verified by human walkthrough
- Phase 03 authentication is complete — ready for Phase 04 (deployment / production hardening)

---
*Phase: 03-authentication*
*Completed: 2026-03-17*
