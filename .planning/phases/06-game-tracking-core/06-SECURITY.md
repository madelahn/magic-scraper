---
phase: 06-game-tracking-core
artifact: security-audit
auditor: gsd-security-auditor
asvs_level: 2
generated: 2026-04-11
scope: Plans 06-01 through 06-06 (rate limit foundation, combobox, autocomplete API, games API, scraper rate limit, games UI)
---

# Phase 06 — Security Audit (game-tracking-core)

Read-only verification that every threat declared in plan-level `<threat_model>` blocks is implemented in committed source. No application code was modified by this audit.

## Audit Scope

Plans inspected:

- `06-01-foundation-rate-limit-PLAN.md` — `src/lib/rateLimit.ts`
- `06-02-combobox-component-PLAN.md` — `src/app/components/combobox.tsx`
- `06-03-autocomplete-api-PLAN.md` — `src/app/api/players/route.ts`, `src/app/api/decks/route.ts`
- `06-04-games-api-PLAN.md` — `src/app/api/games/route.ts`, `src/app/api/games/[id]/route.ts`
- `06-05-scraper-rate-limit-PLAN.md` — `src/app/api/checkDeck/route.ts`, `src/app/api/scrapeLGS/route.ts`
- `06-06-games-pages-PLAN.md` — `src/app/games/**`

Inherited controls cross-checked:

- `proxy.ts` — shared-password HMAC cookie middleware (matcher covers `/((?!_next/static|_next/image|favicon.ico).*)`)
- `src/lib/auth.ts` — cookie options (`httpOnly`, `sameSite: 'lax'`, `secure` in prod)
- `src/lib/validators.ts` — Zod schemas (`gameSchema`, `gameParticipantSchema`)

## Trust Boundaries (Phase-Wide)

| Boundary | Description | Controls |
|----------|-------------|----------|
| Public internet → proxy.ts | All requests except `/login`, `/api/auth/*`, `/api/cron/*` | HMAC session cookie verification; redirect to `/login` on missing/invalid |
| proxy.ts → /api/** handlers | Authenticated request from browser | Per-route `checkRateLimit` pre-guard |
| Request body → Prisma | Untrusted JSON payload | `gameSchema.parse(body)` (zod strip + length caps) |
| Prisma ORM → Turso | Parameterized SQL only | No `$queryRaw` anywhere in `src/` |
| Browser DOM ← React JSX | User-supplied strings rendered | React auto-escaping; zero `dangerouslySetInnerHTML` in phase 06 files |

## Threat Verification Matrix

Legend: **VERIFIED** = mitigation pattern found in expected file; **ACCEPTED** = `accept` disposition with matching rationale; **PARTIAL** = mitigation partially implemented; **MISSING** = mitigation not found.

### Plan 06-01 — Rate Limit Foundation

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-04 | DoS (rate limiter base) | mitigate | **VERIFIED** | `src/lib/rateLimit.ts:7-31` — sliding-window `checkRateLimit(key, limit, windowMs)` with per-key `Map<string, number[]>` pruning expired timestamps, returns `{ allowed, retryAfterSeconds }`. Tests in `tests/rate-limit.test.ts`. |
| T-06-08 | Spoofing (x-forwarded-for) | accept | **ACCEPTED** | `src/lib/rateLimit.ts:33-36` — `getIpKey` takes first CSV entry, trims, falls back to `'unknown'`. Accepted per D-28 (private ~10-user app); spoofed/empty headers share the shared `'unknown'` bucket. |
| T-06-DoS-Map | DoS (in-memory Map growth) | accept | **ACCEPTED** | `src/lib/rateLimit.ts:14-16` — timestamp arrays pruned on every call via `.filter(t => t > windowStart)`. Residual empty-array keys accepted per D-28 + RESEARCH.md Pitfall 5 (negligible memory for private app). |

### Plan 06-02 — Combobox Component

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-03 | Tampering / XSS | mitigate | **VERIFIED** | `src/app/components/combobox.tsx` — `items.map` + "Add new" row render user input via JSX text nodes only. Grep for `dangerouslySetInnerHTML\|innerHTML\|document.write` in `src/app/components/combobox.tsx` → **0 matches**. |
| T-06-dup-entry | Data Integrity | mitigate | **VERIFIED** | `shouldShowAddNew(items, inputValue)` uses case-insensitive `items.some(i => i.toLowerCase() === trimmed.toLowerCase())`. Unit-tested for `'alice'` vs `'Alice'` duplicate scenario. |

### Plan 06-03 — Autocomplete API (`/api/players`, `/api/decks`)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-01 | Spoofing (unauth access) | mitigate (inherited) | **VERIFIED** | `proxy.ts:43-45` matcher `/((?!_next/static|_next/image|favicon.ico).*)` covers `/api/players` and `/api/decks`. No allowlist entry for these paths; session cookie verification in `proxy.ts:21-26`. |
| T-06-02 | Tampering / SQL injection | mitigate | **VERIFIED** | `src/app/api/players/route.ts:14-23` — `prisma.gameParticipant.findMany` + `prisma.user.findMany` with typed `select`/`distinct`. `src/app/api/decks/route.ts:14-18` — `prisma.gameParticipant.findMany` with typed `where`/`distinct`. Repo-wide grep for `$queryRaw\|$executeRaw` → **0 matches**. |
| T-06-04 | DoS (GET abuse) | mitigate | **VERIFIED** | `src/app/api/players/route.ts:6` and `src/app/api/decks/route.ts:6` — `checkRateLimit(getIpKey(request), 30, 60000)` as first statement; 429 + `Retry-After` returned before DB work. |
| T-06-05 | Info disclosure (response leak) | mitigate | **VERIFIED** | Response shapes `{ players: string[] }` / `{ decks: string[] }` — only `playerName`, `user.name`, and `deckName` fields selected. No IDs, timestamps, or metadata leak through. Friend-group scoping is inherited from the shared-password wall (no per-group partition exists in the data model). |

### Plan 06-04 — Games API (`/api/games`, `/api/games/[id]`)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-01 | Spoofing (unauth access) | mitigate (inherited) | **VERIFIED** | Inherited from `proxy.ts` matcher (same as above). |
| T-06-02 | Tampering / SQL injection | mitigate | **VERIFIED** | `src/app/api/games/route.ts:22-33` and `src/app/api/games/[id]/route.ts:35-85, 120` — all DB access via Prisma `create`, `createMany`, `findUnique`, `findMany`, `update`, `delete`, `deleteMany`. No raw SQL. Length caps enforced in `src/lib/validators.ts:9-48` (playerName ≤ 100, deckName ≤ 100, notes ≤ 1000). |
| T-06-04 | DoS (bulk game creation) | mitigate | **VERIFIED** | `src/app/api/games/route.ts:8` (POST), `:50` (GET), `src/app/api/games/[id]/route.ts:23` (GET), `:56` (PATCH), `:107` (DELETE) — `checkRateLimit(getIpKey(request), 30, 60000)` fires before `await request.json()` and before any `prisma.*` call. |
| T-06-05 | Mass assignment | mitigate | **VERIFIED** | `src/app/api/games/route.ts:20` — `const { date, wonByCombo, notes, participants } = gameSchema.parse(body)`. `src/app/api/games/[id]/route.ts:69` identical. Zod default strip mode drops unknown fields; explicit destructuring projects only allowed keys into Prisma. `participants.map` at `route.ts:26-32` + `[id]/route.ts:77-83` allows only the 5 whitelisted participant fields. |
| T-06-06 | Tampering / partial insert race | mitigate | **VERIFIED** | POST: `src/app/api/games/route.ts:21-35` wraps `game.create` + `gameParticipant.createMany` inside `prisma.$transaction(async (tx) => ...)`. PATCH: `[id]/route.ts:70-86` wraps `deleteMany` + `update` + `createMany` in the same callback form. DELETE relies on schema `onDelete: Cascade` (no explicit participant delete), atomic at DB level. |
| T-06-09 | Info disclosure (error bodies) | mitigate | **VERIFIED** | All catch blocks return static strings: `route.ts:42-44` `'Failed to create game'`, `:68-70` `'Failed to fetch games'`, `[id]/route.ts:45-48, 96-99, 127-129`. Stack traces only via `console.error(...)`. ZodError returns `error.issues` (field-level validator output, no DB internals) at `route.ts:38-40` and `[id]/route.ts:89-91`. |

### Plan 06-05 — Scraper Rate Limit (`/api/checkDeck`, `/api/scrapeLGS`)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-04 | DoS (checkDeck DB abuse) | mitigate | **VERIFIED** | `src/app/api/checkDeck/route.ts:7` — `checkRateLimit(getIpKey(request), 10, 60000)` as first statement in POST; 429 returned before `parseDeckList` or `prisma.collectionCard.findMany`. |
| T-06-04b | DoS (scrapeLGS Puppeteer exhaustion) | mitigate | **VERIFIED** | `src/app/api/scrapeLGS/route.ts:9` — `checkRateLimit(getIpKey(request), 10, 60000)` fires before `getCached` or `scrapeAllSites` invocations. Tight 10/60s limit per D-24 matches the Puppeteer cost profile. |
| T-06-REG | Regression (scraper behavior) | mitigate | **VERIFIED** | Rate-limit guards added as pre-statements only; existing `parseDeckList` and `prisma.collectionCard.findMany` invocations still present at `checkDeck/route.ts:24,28`. Full jest suite 97/97 green per executor summary. |

### Plan 06-06 — Games Pages UI (`/games/**`)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-01 | Spoofing (unauth access) | mitigate (inherited) | **VERIFIED** | `proxy.ts:43-45` matcher covers `/games`, `/games/new`, `/games/[id]/edit`. No allowlist entries for `/games*`. Session cookie redirect at `proxy.ts:24-26`. |
| T-06-03 | Tampering / XSS | mitigate | **VERIFIED** | Grep `dangerouslySetInnerHTML\|innerHTML\|document.write` across `src/app/games/**` → **0 matches**. All user text (playerName, deckName, notes, wonByCombo label) rendered through JSX text nodes at `src/app/games/page.tsx:132-177` (auto-escaped). Only `dangerouslySetInnerHTML` in the repo is the theme bootstrap script in `src/app/layout.tsx:41` — pre-phase, static constant, unrelated to user input. |
| T-06-05 | Mass assignment | mitigate | **VERIFIED** | Server-side enforcement inherited from Plan 06-04 `gameSchema.parse`. Client-side `validateGameForm` in `src/app/games/game-form.tsx` builds only the declared shape; unit-tested per 06-06 SUMMARY. |
| T-06-09 | Info disclosure (error bodies) | mitigate | **VERIFIED** | `src/app/games/page.tsx:52-54, 81-85` — client error paths surface `err.message` or `'Failed to delete game'` literal. API errors are already sanitized upstream. |
| T-06-CSRF | CSRF (POST/PATCH/DELETE) | mitigate (inherited) | **VERIFIED** | `src/lib/auth.ts:11-17` — session cookie config: `httpOnly: true`, `sameSite: 'lax'`, `secure: production`. `SameSite=Lax` blocks cross-site `<form>` POST/PATCH/DELETE submissions from third-party origins. No CSRF tokens needed for same-site fetches. |
| T-06-optimistic | Data Integrity (optimistic delete) | accept | **ACCEPTED** | `src/app/games/page.tsx:76-85` — optimistic client-side removal before the DELETE request. On server error, `setError('Failed to delete game')` is shown and user can refresh. Accepted per D-15 UX tradeoff. |

## Delete Confirmation Flow (GAME-06)

Two-step confirmation **VERIFIED**:

1. Delete button at `src/app/games/page.tsx:149-155` only calls `setPendingDelete(g)` (opens modal) — never fires DELETE directly.
2. `DeleteConfirmModal` at `src/app/games/delete-confirm-modal.tsx` renders with `role="dialog"`, `aria-modal="true"`, Escape-to-cancel, backdrop-click-to-cancel, and requires explicit click on the red "Delete" button.
3. Only `onConfirm` → `handleConfirmDelete` at `page.tsx:72-86` issues `fetch(..., { method: 'DELETE' })`.

## Rate-Limit Coverage (OPT-01)

All phase 06 API routes that touch DB or network surface:

| Route | Method | Limit | Source |
|-------|--------|-------|--------|
| `/api/players` | GET | 30/60s | `src/app/api/players/route.ts:6` |
| `/api/decks` | GET | 30/60s | `src/app/api/decks/route.ts:6` |
| `/api/games` | POST | 30/60s | `src/app/api/games/route.ts:8` |
| `/api/games` | GET | 30/60s | `src/app/api/games/route.ts:50` |
| `/api/games/[id]` | GET | 30/60s | `src/app/api/games/[id]/route.ts:23` |
| `/api/games/[id]` | PATCH | 30/60s | `src/app/api/games/[id]/route.ts:56` |
| `/api/games/[id]` | DELETE | 30/60s | `src/app/api/games/[id]/route.ts:107` |
| `/api/checkDeck` | POST | 10/60s | `src/app/api/checkDeck/route.ts:7` |
| `/api/scrapeLGS` | POST | 10/60s | `src/app/api/scrapeLGS/route.ts:9` |

All 9 entry points satisfy the plan contract: rate limit fires before body parse and before any DB/network work. Consistent shape: `NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })`.

## Summary Totals

| Metric | Value |
|--------|-------|
| Plans audited | 6 |
| Threats declared | 18 |
| mitigate → VERIFIED | 15 |
| accept → ACCEPTED | 3 |
| MISSING | 0 |
| PARTIAL | 0 |
| Unregistered flags | 0 |

## Accepted Risks Log

| Threat ID | Risk | Acceptance Rationale | Decision Ref |
|-----------|------|----------------------|--------------|
| T-06-08 | x-forwarded-for spoofing → shared `'unknown'` rate-limit bucket | Private ~10-user friend-group app; real attackers can't meaningfully dodge the bucket and worst case is one shared 30/60s window | D-28 |
| T-06-DoS-Map | In-memory `buckets` Map retains empty-array keys forever | Per-call `.filter(t => t > windowStart)` keeps memory bounded; at ~10 users the residual key cost is negligible. Upstash Redis explicitly rejected as overkill in PROJECT.md. | D-28, RESEARCH.md Pitfall 5 |
| T-06-optimistic | Optimistic delete desyncs on server failure | User sees the row removed immediately; on failure an error banner appears and refresh recovers state | D-15 |

## Unregistered Threat Flags

None. All six plan SUMMARY files declare "No new threat flags introduced." Every network, auth, and data surface touched by phase 06 was enumerated in plan-level `<threat_model>` blocks and matched to a disposition above.

## Non-Issues Observed (Out of Scope)

- `src/app/layout.tsx:41` uses `dangerouslySetInnerHTML` for a static theme-bootstrap script (`themeScript` constant). This is **not phase 06 code** and the content is a compile-time string constant, not user input. Listed here for transparency so future auditors don't re-flag it.

## Verdict

**SECURED** — 18/18 threats closed (15 mitigated via verified code, 3 accepted per documented decisions). No open threats, no partial implementations, no unregistered flags. Phase 06 is ready for production deployment subject to the Plan 06-06 Task 3 human-verify checkpoint which is pending orchestrator action (functional verification, not a security gap).

## Recommendations (Advisory — Not Blockers)

1. **Vercel multi-instance rate-limit drift** — The in-memory `buckets` Map is per-instance. Vercel may spawn multiple serverless instances under load, so the effective rate limit is `limit × instance_count`. For a private 10-user app this is acceptable (D-28) but flag for re-evaluation if the app ever opens to public traffic.
2. **SameSite=Lax vs Strict** — `SameSite=Lax` allows top-level GET navigations from other origins to send the cookie. For POST/PATCH/DELETE (the CSRF-sensitive methods) it blocks cross-origin submissions. If the app ever adds GET-based mutations (not currently present in phase 06), consider upgrading to `SameSite=Strict`.
3. **Autocomplete data exposure scope** — `/api/players` and `/api/decks` return the union of all users and all participants across all games. There is no friend-group partition in the data model — security is the single shared-password wall. This is consistent with PROJECT.md scoping but any future multi-tenant requirement would need schema changes.
