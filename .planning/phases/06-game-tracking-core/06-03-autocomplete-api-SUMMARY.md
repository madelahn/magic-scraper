---
phase: 06-game-tracking-core
plan: 03
subsystem: autocomplete-api
tags: [api, routes, autocomplete, rate-limiting]
requirements: [GAME-04, GAME-05, OPT-01]
dependency_graph:
  requires:
    - "06-01-foundation-rate-limit::checkRateLimit"
    - "06-01-foundation-rate-limit::getIpKey"
    - "src/lib/prisma.ts::prisma"
  provides:
    - "GET /api/players → { players: string[] }"
    - "GET /api/decks → { decks: string[] }"
  affects:
    - "06-06-game-form (consumer: seed Combobox items on mount)"
tech_stack:
  added: []
  patterns:
    - "Next.js App Router route handler: export async function GET(request: Request)"
    - "checkRateLimit top-of-handler short-circuit with 429 + Retry-After header"
    - "Promise.all for parallel prisma calls in players route (Option B per RESEARCH.md — no $queryRaw UNION)"
    - "Set-based dedup + Array.sort with localeCompare for stable alphabetic ordering"
    - "TDD red-green: RED commit 5d56945, GREEN commit 3c08fb8"
key_files:
  created:
    - "src/app/api/players/route.ts"
    - "src/app/api/decks/route.ts"
    - "tests/autocomplete-api.test.ts"
  modified: []
decisions:
  - "Two separate prisma.findMany calls merged via Set (D-10, RESEARCH.md Option B) — avoids $queryRaw and keeps typed schema"
  - "Rate limit threshold 30/60s per D-24 (game routes class, not scraper class)"
  - "Dedup is case-sensitive (Set equality), sort is localeCompare — matches D-10 truth contract"
  - "deckName nullability handled via both prisma where clause AND a TypeScript filter narrowing predicate for belt-and-suspenders"
metrics:
  completed: "2026-04-11"
  duration: "~15 minutes"
  tasks: 1
  commits: 2
  tests_added: 12
  tests_total: 57
---

# Phase 06 Plan 03: Autocomplete API Summary

Two GET-only route handlers that seed the game form's player and deck Combobox components. Both routes apply the 30/60s sliding-window rate limit from 06-01 and return the response shapes the Plan 06-06 game form will consume.

## What Was Built

### `src/app/api/players/route.ts`

Exports `GET(request: Request)`:

1. Rate-limit check: `checkRateLimit(getIpKey(request), 30, 60000)`. If denied, returns `NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })`.
2. Parallel `Promise.all` of two `prisma.findMany` calls:
   - `prisma.gameParticipant.findMany({ select: { playerName: true }, distinct: ['playerName'] })`
   - `prisma.user.findMany({ select: { name: true }, distinct: ['name'] })`
3. Merges the two arrays into a `Set<string>` (case-sensitive dedup), converts to array, sorts via `localeCompare`.
4. Returns `NextResponse.json({ players })` where `players: string[]`.
5. On any thrown error: `console.error('GET /api/players error:', error)` + `NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })`.

**Response shape:** `{ players: ['Alice', 'Bob', 'Carol'] }`

### `src/app/api/decks/route.ts`

Exports `GET(request: Request)`:

1. Same rate-limit check as players.
2. Single `prisma.gameParticipant.findMany({ select: { deckName: true }, distinct: ['deckName'], where: { deckName: { not: null } } })`.
3. Maps to `deckName`, narrows with `.filter((d): d is string => d !== null)` (belt-and-suspenders, even though the where clause already excludes nulls), Set-dedups, sorts via `localeCompare`.
4. Returns `NextResponse.json({ decks })` where `decks: string[]`.
5. On error: `console.error('GET /api/decks error:', error)` + 500 with `{ error: 'Failed to fetch decks' }`.

**Response shape:** `{ decks: ['Atraxa', 'Edric', 'Prosper'] }`

### `tests/autocomplete-api.test.ts` (12 tests)

Mock setup: mocks `@/lib/prisma`, `@/lib/rateLimit`, and `next/server` so route handlers can be imported and called in pure-node jest. Mock signatures are typed with explicit arg types to satisfy `ts-jest` strict mode (first iteration used `...args: unknown[]` spread, which failed under `tsc --noEmit` because the real exports have overloaded signatures; Rule 1 auto-fix switched to explicit `(key, limit, windowMs)` params).

**`GET /api/players` tests (6):**

1. Returns union of `users.name` and `participants.playerName`, sorted and deduped (Alice, Bob, Carol case).
2. Returns `{ players: [] }` when both tables are empty.
3. Returns 429 with `Retry-After: '42'` when rate limited.
4. Calls `checkRateLimit('test-ip', 30, 60000)` — verifies the threshold matches D-24 game-class routes.
5. Returns 500 with `{ error: 'Failed to fetch players' }` when prisma throws.
6. Case-sensitive dedup: `'Alice'` and `'alice'` are preserved as distinct entries, `'Alice'` appears exactly once even when both the users table and participants table contain it.

**`GET /api/decks` tests (6):**

1. Returns distinct non-null deckNames sorted (Edric, Atraxa, Edric → `['Atraxa', 'Edric']`).
2. Filters null deckNames out (null, 'Edric' → `['Edric']`).
3. Returns `{ decks: [] }` when no games exist.
4. Returns 429 with `Retry-After: '10'` when rate limited.
5. Calls `checkRateLimit('test-ip', 30, 60000)`.
6. Returns 500 with `{ error: 'Failed to fetch decks' }` on prisma error.

## Contract Consumed by Plan 06-06 (Game Form)

```typescript
// On form mount, in src/app/games/new/page.tsx or src/app/games/game-form.tsx:
const [players, decks] = await Promise.all([
  fetch('/api/players').then((r) => r.json() as Promise<{ players: string[] }>),
  fetch('/api/decks').then((r) => r.json() as Promise<{ decks: string[] }>),
]);
// Pass players.players and decks.decks as `items` to the two Combobox components (from Plan 06-02).
// Filter client-side on every keystroke (D-09 "seed once on mount, filter client-side").
```

Both endpoints return 200 with the promised shape under the 30/60s rate limit. If abuse pushes a client past the limit, it receives a 429 with `Retry-After` — the form should display a banner-level error in that case.

## Verification Results

| Check | Result |
|-------|--------|
| `npx jest tests/autocomplete-api.test.ts` | 12/12 pass, 853ms |
| `npx jest` (full suite) | 57/57 pass, 1.16s |
| `npx tsc --noEmit` | Clean, no errors |
| Grep `POST` in players/route.ts and decks/route.ts | No matches (GET-only) |
| Grep `$queryRaw` in players/route.ts | No matches (Option B, not raw SQL) |
| `import { checkRateLimit, getIpKey } from '@/lib/rateLimit'` | Present in both routes |
| `checkRateLimit(getIpKey(request), 30, 60000)` | Present in both routes |
| `status: 429` + `'Retry-After'` headers | Present in both routes |
| `distinct: ['deckName']` + `where: { deckName: { not: null } }` | Present in decks route |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript spread-args mismatch on rateLimit mock**

- **Found during:** Task 1 GREEN verification (`npx tsc --noEmit` after routes compiled cleanly and 12 tests passed).
- **Issue:** The plan's test template mocked `@/lib/rateLimit` with `checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args)`. Under `ts-jest` strict mode this fails with TS2556 (`A spread argument must either have a tuple type or be passed to a rest parameter`) because the real `checkRateLimit` export has a concrete overloaded signature `(key: string, limit: number, windowMs: number)`, not a rest parameter.
- **Fix:** Changed the mock to explicit param types: `checkRateLimit: (key: string, limit: number, windowMs: number) => mockCheckRateLimit(key, limit, windowMs)` and `getIpKey: (request: Request) => mockGetIpKey(request)`. Also annotated the `jest.fn()` vars as `jest.Mock` so the typed 0-arg `getIpKey` signature accepts the forwarded `request` argument.
- **Files modified:** `tests/autocomplete-api.test.ts`
- **Commit:** Folded into GREEN commit `3c08fb8` (the type error was on the test file only and did not affect route behavior — all 12 test assertions pass unchanged).

**2. [Rule 2 - Missing critical test] Added 12th test for case-sensitive dedup**

- **Found during:** Task 1 acceptance-criteria check (plan requires "at least 12 `it(` blocks", template provided 11).
- **Issue:** Plan template was slightly under the acceptance-criteria count (11 vs 12 required) and also did not directly verify the case-sensitive dedup truth from `must_haves.truths` (`"deduped case-sensitively"`).
- **Fix:** Added `it('dedupes case-sensitively (alice and Alice are distinct entries)', ...)` which exercises the Set-based dedup with `'Alice'` appearing in both tables plus `'alice'` as a separate participant. Assertion verifies both cases are preserved and `'Alice'` appears exactly once.
- **Files modified:** `tests/autocomplete-api.test.ts`
- **Commit:** Folded into GREEN commit `3c08fb8`.

No architectural deviations (Rule 4). Both fixes were within the test file only; the route implementations match the plan's GREEN code blocks verbatim.

## Key Decisions Made

- Honored D-10 (two endpoints, UNION via merged findMany — not `$queryRaw`), D-17 (try/catch + NextResponse.json pattern), D-22/D-24 (30/60s for game-class routes), D-26 (429 response shape with `Retry-After` header).
- Kept the redundant TypeScript `.filter((d): d is string => d !== null)` in the decks route alongside the prisma `where` clause — belt-and-suspenders against any future schema change that makes deckName non-null, and it gives the downstream array a narrowed `string[]` type without an assertion.
- Did NOT add POST handlers (rejected per plan's explicit DO NOT list — new names are persisted implicitly via `POST /api/games` in Plan 06-04).
- Did NOT add pagination or query-param search — D-09 mandates seed-once client-side filter.
- Did NOT add cache directives, `'use cache'`, or `revalidate = 0` — the shared-password middleware already gates these routes, and the data changes on every POST /api/games so any caching would be stale.

## Threat Model Coverage

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-06-01 (unauth access) | **mitigated (inherited)** | Existing `proxy.ts` HMAC cookie middleware covers `/api/players` and `/api/decks` via the blocklist matcher. No per-route auth code added. |
| T-06-02 (SQL injection) | **mitigated** | Both routes use `prisma.findMany` with typed `select`, `distinct`, and `where` options. No `$queryRaw`, no string concat. Verified by acceptance criterion grep. |
| T-06-04 (DoS via GET abuse) | **mitigated** | `checkRateLimit(getIpKey(request), 30, 60000)` runs at handler top before DB work. Verified by tests 4 (`calls checkRateLimit with (ip, 30, 60000)`) in both describe blocks. |
| T-06-05 (response info disclosure) | **mitigated** | Response shapes are explicitly `{ players: string[] }` / `{ decks: string[] }`. `select` clauses list only `playerName`/`name`/`deckName`. No user IDs, timestamps, or metadata leak through. |

## Threat Flags

None — this plan only adds two read-only autocomplete endpoints whose network surface was already documented in the plan's `<threat_model>`. No new auth paths, no schema changes, no file access.

## Commits

| Commit | Type | Message |
|--------|------|---------|
| `5d56945` | test | add failing tests for autocomplete API routes (RED) |
| `3c08fb8` | feat | implement /api/players and /api/decks autocomplete routes (GREEN) |

## Self-Check: PASSED

- `src/app/api/players/route.ts` exists (verified by `Write` tool and `git status`)
- `src/app/api/decks/route.ts` exists (verified)
- `tests/autocomplete-api.test.ts` exists with 12 `it(` blocks (verified by jest output `Tests: 12 passed, 12 total`)
- Commit `5d56945` present in `git log --oneline -5`
- Commit `3c08fb8` present in `git log --oneline -5`
- 57/57 full jest suite green
- `tsc --noEmit` clean
- No POST handlers in either route (grep clean)
- No `$queryRaw` in players route (grep clean)
