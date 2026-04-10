# Phase 6: Game Tracking Core - Research

**Researched:** 2026-04-10
**Domain:** Next.js 16 App Router CRUD, Prisma 6 with libsql adapter, headless combobox, IP rate limiting
**Confidence:** HIGH (all critical unknowns verified against installed packages and source files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Single form with 4 fixed participant rows. Empty rows filtered before POST.
- D-02: Per-row Winner (radio) + Screwed (checkbox). Winner AND screwed simultaneously is allowed.
- D-03: Winner required at submit time. No draft state.
- D-04: Inline per-field errors + top-of-form banner for cross-field errors.
- D-05: wonByCombo toggle at top of form, beside date field.
- D-06: No add/remove/reorder buttons. Clear the playerName field to "remove" a row.
- D-07: Headless custom combobox in src/app/components/. ~100-150 lines. No new dependencies. Props: { items, value, onChange, placeholder }.
- D-08: Explicit "Add 'xyz' as new player/deck" row at bottom of dropdown when typed value has no exact match.
- D-09: Seed once on mount, filter client-side. No debounce, no loading spinners on keystroke.
- D-10: GET /api/players (DISTINCT playerName UNION users.name) and GET /api/decks (DISTINCT deckName).
- D-11: Collapsed row + click-to-expand participant detail.
- D-12: Load all games, newest-first, no pagination.
- D-13: Edit via /games/[id]/edit page, same form component, pre-populated.
- D-14: Delete confirmation via custom modal component.
- D-15: No undo toast. Optimistic delete only (no optimistic create/edit).
- D-16: POST/GET/GET[id]/PATCH[id]/DELETE[id] under /api/games. prisma.$transaction for POST and PATCH.
- D-17: GET /api/players and GET /api/decks. Both with try/catch.
- D-18: All new routes return JSON only. Follow NextResponse.json pattern.
- D-19: Three pages: /games, /games/new, /games/[id]/edit.
- D-20: Shared form at src/app/games/game-form.tsx. Optional initial prop for edit mode.
- D-21: Header nav gains "Games" link.
- D-22: Rate limit scope: all /api/* except /api/cron and /api/auth.
- D-23: Key by client IP from x-forwarded-for header. Fallback to 'unknown'.
- D-24: Scraper routes 10/60s, game routes 30/60s. Helper accepts (limit, windowMs).
- D-25: Sliding-window algorithm. Map<string, number[]> of timestamps.
- D-26: 429 shape: { error: 'Rate limit exceeded' } + Retry-After header.
- D-27: src/lib/rateLimit.ts. Module-level const buckets. Returns { allowed: true } | { allowed: false; retryAfterSeconds: number }.
- D-28: Per-instance memory is acceptable for ~10-user private app.
- D-29: All sanitization in gameSchema. Route just calls .parse(body).

### Claude's Discretion
- Combobox keyboard navigation semantics (Home/End, Tab on "Add new" row, whether Esc clears input).
- Combobox dropdown styling (match existing Tailwind patterns).
- History table column widths / responsive behavior.
- Modal overlay implementation (native dialog vs positioned div + backdrop).
- Whether PATCH accepts full body or partial — lean toward full-replace per D-16.
- Date input: native input[type="date"].
- Timestamp display format in history table.
- Empty-state copy for /games when 0 games exist.
- Nav link order/placement in header.

### Deferred Ideas (OUT OF SCOPE)
- Cursor pagination on /api/games
- Debounced server-side autocomplete search
- Combobox library dependency (Radix/Headless UI/Downshift)
- Optimistic delete with undo toast
- Rate limiting via Upstash Redis / Vercel KV
- Rate limiting on /api/auth
- Game draft state
- Dynamic add/remove participant rows
- Per-participant notes
- Mobile-first responsive layout (desktop-first fine)
- Full WAI-ARIA audit (basic focus management only)
- Audit log of edits/deletes
- Bulk delete/edit
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GAME-01 | User can submit a new game with date, players (1-4), winner, screwed players, and winner deck | D-01/D-02/D-16: 4-row form + POST /api/games in $transaction |
| GAME-02 | User can select players from autocomplete dropdown | D-07/D-09: Custom combobox seeded on mount |
| GAME-03 | User can type to filter dropdown or add a new player/deck | D-07/D-08: client-side filter + "Add xyz" row |
| GAME-04 | Player autocomplete seeded from Moxfield users + all previous player names | D-10: /api/players UNION query |
| GAME-05 | Deck autocomplete separate from players, persisted from previous entries | D-10: /api/decks DISTINCT query |
| GAME-06 | Screwed field supports multi-select | D-02: independent checkbox per row |
| GAME-07 | User can view game history as a newest-first scrollable table | D-11/D-12: history page with GET /api/games |
| GAME-08 | User can edit or delete previously entered games | D-13/D-14/D-16: /games/[id]/edit + DELETE endpoint |
| GAME-09 | All game input is sanitized before storage | D-29: gameSchema.parse(body) at route boundary |
| OPT-01 | API scraper routes are rate limited to prevent abuse | D-22..D-28: rateLimit.ts singleton |
</phase_requirements>

---

## Summary

Phase 6 builds entirely on top of the Phase 5 foundation (schema, validators, Prisma client) without adding dependencies. All seven research unknowns were resolved through direct inspection of the installed packages and source files.

The two highest-risk items — Prisma `$transaction` support with the libsql adapter, and the Next.js 16 async `params` shape — are both confirmed. The adapter implements `startTransaction()` [VERIFIED: node_modules/@prisma/adapter-libsql/dist/index-node.js], and Next.js 16 passes `params` as `Promise<Record<string, string | string[] | undefined>>` to route handlers [VERIFIED: node_modules/next/dist/server/route-modules/app-route/module.d.ts]. The UNION query must use `prisma.$queryRaw` because the libsql adapter does not expose a TypeScript-native UNION surface. A Jest+ts-jest test harness already exists with 27 passing tests — Phase 6 tests drop into the same `tests/` directory with the same mock patterns.

**Primary recommendation:** Follow the locked decisions precisely. The only code-level judgment calls are the combobox keyboard spec, modal implementation, and Tailwind styling — all of which have clear existing-codebase patterns to follow.

---

## Standard Stack

All packages are already installed. No new dependencies required.

### Core (already in package.json)
| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| next | 16.1.6 | App Router, route handlers, pages | [VERIFIED: package.json] |
| react | 19.2.3 | Client components, hooks | [VERIFIED: package.json] |
| prisma / @prisma/client | 6.19.2 (runtime), 6.15.0 (adapter) | ORM, $transaction, $queryRaw | [VERIFIED: npx prisma --version] |
| @prisma/adapter-libsql | 6.15.0 | Turso/libsql driver adapter | [VERIFIED: package.json] |
| @libsql/client | 0.8.1 | Turso connection + transaction support | [VERIFIED: package.json] |
| zod | 4.3.6 | gameSchema already written in validators.ts | [VERIFIED: node_modules/zod/package.json] |
| lucide-react | ^0.562.0 | Icons (ChevronDown, X, etc.) | [VERIFIED: package.json] |
| tailwindcss | ^4 | Inline utility classes | [VERIFIED: package.json] |

### Test Infrastructure (already installed)
| Library | Version | Purpose |
|---------|---------|---------|
| jest | ^30.3.0 | Test runner | [VERIFIED: package.json + jest.config.js] |
| ts-jest | ^29.4.6 | TypeScript transformation | [VERIFIED: package.json] |
| @types/jest | ^30.0.0 | Type definitions | [VERIFIED: package.json] |

**No installation needed.** Everything is present.

**IMPORTANT — Zod v4 note:** `zod@4.3.6` is installed. The API is nearly identical to v3 for the patterns used in `validators.ts` (z.object, z.string, z.boolean, z.array, z.coerce.date, .parse, ZodError). The validators already exist and work — new routes just import and call them. [VERIFIED: node_modules/zod/package.json]

---

## Architecture Patterns

### Recommended Project Structure for Phase 6

```
src/
├── app/
│   ├── api/
│   │   ├── games/
│   │   │   ├── route.ts          # POST (create), GET (list)
│   │   │   └── [id]/
│   │   │       └── route.ts      # GET (one), PATCH (update), DELETE
│   │   ├── players/
│   │   │   └── route.ts          # GET /api/players
│   │   └── decks/
│   │       └── route.ts          # GET /api/decks
│   ├── games/
│   │   ├── page.tsx              # /games — history table
│   │   ├── game-form.tsx         # Shared form component
│   │   ├── new/
│   │   │   └── page.tsx          # /games/new
│   │   └── [id]/
│   │       └── edit/
│   │           └── page.tsx      # /games/[id]/edit
│   └── components/
│       ├── header.tsx            # EDIT: add Games link
│       └── combobox.tsx          # New: headless combobox
└── lib/
    └── rateLimit.ts              # New: sliding-window rate limiter
```

### Pattern 1: Prisma $transaction for POST /api/games

`prisma.$transaction` with an array of operations is confirmed supported by the installed `@prisma/adapter-libsql@6.15.0`. The adapter's `startTransaction()` method is implemented and delegates to the libsql hrana protocol's `Transaction` interface. [VERIFIED: node_modules/@prisma/adapter-libsql/dist/index-node.js]

**Sequential array form (preferred — avoids interactive transaction complexity):**

```typescript
// Source: Prisma docs pattern + verified adapter support
const { date, wonByCombo, notes, participants } = gameSchema.parse(body);

const game = await prisma.$transaction(async (tx) => {
  const created = await tx.game.create({
    data: {
      date,
      wonByCombo,
      notes,
    },
  });
  await tx.gameParticipant.createMany({
    data: participants.map((p) => ({
      gameId: created.id,
      playerName: p.playerName,
      isWinner: p.isWinner,
      isScrewed: p.isScrewed,
      deckName: p.deckName,
    })),
  });
  return created;
});
```

**PATCH /api/games/[id] — delete-old-recreate pattern:**

```typescript
// Full-replace: delete existing participants + recreate + update game fields
const updated = await prisma.$transaction(async (tx) => {
  await tx.gameParticipant.deleteMany({ where: { gameId: id } });
  const g = await tx.game.update({
    where: { id },
    data: { date, wonByCombo, notes },
  });
  await tx.gameParticipant.createMany({
    data: participants.map((p) => ({
      gameId: g.id,
      playerName: p.playerName,
      isWinner: p.isWinner,
      isScrewed: p.isScrewed,
      deckName: p.deckName,
    })),
  });
  return g;
});
```

**DELETE /api/games/[id] — single operation (cascade handles participants):**

```typescript
// No transaction needed — onDelete: Cascade is set on GameParticipant.gameId
await prisma.game.delete({ where: { id } });
```

**Confirmed:** `createMany` works with the libsql adapter in the same way as with direct SQLite — it batches inserts. [ASSUMED: based on libsql batch API + Prisma adapter source; no negative evidence found]

### Pattern 2: UNION Query for /api/players

Prisma has no native UNION support. The decision (D-10) is: `SELECT DISTINCT playerName FROM game_participants UNION SELECT DISTINCT name FROM users`. Two approaches are viable:

**Option A — `prisma.$queryRaw` (SQL, full type safety via cast):**

```typescript
// Source: Prisma docs $queryRaw tagged template
const rows = await prisma.$queryRaw<{ name: string }[]>`
  SELECT DISTINCT playerName AS name FROM game_participants
  WHERE playerName IS NOT NULL
  UNION
  SELECT DISTINCT name FROM users
  ORDER BY name ASC
`;
const players: string[] = rows.map((r) => r.name);
```

**Option B — two `findMany` calls merged in JS:**

```typescript
const [participants, users] = await Promise.all([
  prisma.gameParticipant.findMany({
    select: { playerName: true },
    distinct: ['playerName'],
  }),
  prisma.user.findMany({
    select: { name: true },
    distinct: ['name'],
  }),
]);
const players = Array.from(
  new Set([
    ...participants.map((p) => p.playerName),
    ...users.map((u) => u.name),
  ])
).sort();
```

**Recommendation: Use Option B** (two `findMany` calls). Reasons:
1. Full TypeScript type safety — no cast required.
2. Avoids raw SQL string maintenance.
3. The two queries are small (indexed columns); the JS Set merge is negligible.
4. Option A works, but `$queryRaw` with the libsql adapter returns rows as plain objects — column aliases like `AS name` are required and easy to miss during maintenance.
[ASSUMED: $queryRaw works with libsql adapter; no test was run. Option B is safer.]

**For /api/decks** — single distinct query:

```typescript
const rows = await prisma.gameParticipant.findMany({
  select: { deckName: true },
  distinct: ['deckName'],
  where: { deckName: { not: null } },
  orderBy: { deckName: 'asc' },
});
const decks: string[] = rows
  .map((r) => r.deckName)
  .filter((d): d is string => d !== null);
```

### Pattern 3: Next.js 16 Dynamic Route Params (CONFIRMED ASYNC)

Confirmed via `node_modules/next/dist/server/route-modules/app-route/module.d.ts`:

```
params?: Promise<Record<string, string | string[] | undefined>>
```

**Route handler signature for `/api/games/[id]/route.ts`:**

```typescript
// Source: [VERIFIED: node_modules/next/dist/server/route-modules/app-route/module.d.ts]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ...
}
```

**Page component signature for `/games/[id]/edit/page.tsx`:**

```typescript
// Source: [VERIFIED: same module.d.ts pattern applies to page props]
export default async function EditGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // ...
}
```

**CRITICAL:** Forgetting `await params` will cause a TypeScript error or runtime failure. The old sync signature `{ params: { id: string } }` no longer works in Next.js 15+. [VERIFIED: node_modules/next/dist/server/route-modules/app-route/module.d.ts]

### Pattern 4: Rate Limit Helper (src/lib/rateLimit.ts)

```typescript
// Source: D-25, D-26, D-27 (CONTEXT.md) + mirrors src/lib/prisma.ts singleton pattern
const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const timestamps = buckets.get(key) ?? [];
  // Prune entries outside the sliding window
  const windowStart = now - windowMs;
  const recent = timestamps.filter((t) => t > windowStart);
  if (recent.length >= limit) {
    const oldestInWindow = recent[0]; // array is chronological after filter+push
    const retryAfterSeconds = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    buckets.set(key, recent);
    return { allowed: false, retryAfterSeconds };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { allowed: true };
}

export function getIpKey(request: Request): string {
  const forwarded = (request as any).headers?.get?.('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? 'unknown';
}
```

**Singleton behavior:** Module-level `const buckets` is initialized once per Node.js module load. In Next.js dev with Fast Refresh, the module can be re-evaluated on hot reload — this resets the Map. This is acceptable for dev and inconsequential for a private app (D-28). In production on Vercel, each serverless instance has its own Map; multiple warm instances means a user could get 2× the limit across instances. Project decision accepts this tradeoff.

**Usage pattern in route handlers:**

```typescript
// Near top of handler, before any DB work
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
const rl = checkRateLimit(ip, 30, 60_000); // game routes: 30/60s
if (!rl.allowed) {
  return NextResponse.json(
    { error: 'Rate limit exceeded' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
  );
}
```

### Pattern 5: Headless Combobox Keyboard Navigation Spec

The combobox handles two distinct item types: regular items and an "Add 'xyz'" synthetic item. The keyboard spec for a ~150-line implementation:

**State:**
- `isOpen: boolean` — dropdown visibility
- `highlightedIndex: number` — -1 means no highlight; 0..items.length-1 for regular items; items.length for "Add new" row

**Key bindings:**

| Key | Action |
|-----|--------|
| `ArrowDown` | If closed: open + highlight index 0. If open: move highlight to next item (wraps to 0 after last, including "Add new"). |
| `ArrowUp` | If closed: open + highlight last item. If open: move highlight to previous item (wraps to "Add new" after index 0). |
| `Enter` | If highlighted item is a regular item: select it, close, call onChange(item). If "Add new" row: call onChange(inputValue), close. If nothing highlighted: no-op (form does not submit — e.preventDefault() on keydown). |
| `Escape` | Close dropdown. Do NOT clear input — user may want to keep their typed value. |
| `Tab` | Close dropdown, do not select. Allow natural tab focus movement. |
| `Home` | Highlight first item (index 0). |
| `End` | Highlight last item (including "Add new" if visible). |
| Click item | Select item, close, call onChange(item). |
| Click "Add new" | Call onChange(inputValue), close. |
| Click outside | Close dropdown, no selection change. |

**"Add new" row visibility rule:** Show when `inputValue.length > 0` AND no item in the filtered list exactly matches `inputValue` (case-insensitive comparison). The row text: `+ Add "${inputValue}" as new ${label}` where label is "player" or "deck" (passed as prop or derived from placeholder).

**Focus management:** The input element retains focus throughout. The dropdown list renders as a `<ul>` with `role="listbox"` and `aria-activedescendant` pointing to the highlighted `<li id>`. Do not move focus to list items — keyboard navigation is input-driven. This avoids the tab-trap problem inherent in focus-moving combobox implementations.

**Click-outside:** `useEffect` with a `mousedown` listener on `document`; check `containerRef.current.contains(e.target)`.

### Pattern 6: IP Extraction on Vercel

```typescript
// Source: D-23 (CONTEXT.md) + [VERIFIED: proxy.ts uses request.headers pattern]
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
```

**Confirmed correct for Next.js 16 App Router Route Handlers:** The existing `proxy.ts` uses `request.headers.get(...)` via `NextRequest` — the same pattern applies to `Request` in Route Handlers. There is no `request.ip` shortcut in Next.js 16's standard `Request` (it exists on `NextRequest` in some versions but is unreliable on Vercel). Use the `x-forwarded-for` header directly. [VERIFIED: proxy.ts line 22 uses request.cookies/headers API; consistent with App Router request model]

### Pattern 7: Middleware Coverage

The middleware is at `middleware.ts` → re-exports `proxy` from `proxy.ts`. The matcher in both files is:

```typescript
matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
```

**This is a BLOCKLIST pattern** (everything except static assets), not an allowlist. It means **every new route is automatically covered** — including `/games/**`, `/games/new`, `/games/[id]/edit`, `/api/games/**`, `/api/players`, and `/api/decks`. [VERIFIED: middleware.ts + proxy.ts]

**No middleware changes required for Phase 6.** The proxy skips `/api/auth` and `/api/cron` explicitly; game routes are covered by default.

### Pattern 8: GET /api/games Response Shape

```typescript
// GET /api/games — list all games with participants
const games = await prisma.game.findMany({
  include: { participants: true },
  orderBy: { date: 'desc' },
});
return NextResponse.json({ games });
```

The response type is `{ games: (Game & { participants: GameParticipant[] })[] }`. Client pages can import Prisma-generated types for typing the state variable:

```typescript
import type { Game, GameParticipant } from '@prisma/client';
type GameWithParticipants = Game & { participants: GameParticipant[] };
```

### Anti-Patterns to Avoid

- **Await params incorrectly:** `{ params: { id: string } }` is the old sync shape — Next.js 16 requires `{ params: Promise<{ id: string }> }` with `await params`. TypeScript will catch this.
- **Duplicate validation:** Do not add manual string-trimming or length checks inside route handlers. `gameSchema.parse(body)` covers all of it.
- **$queryRaw with untagged template:** Always use tagged template literals: `prisma.$queryRaw\`...\`` not `prisma.$queryRaw("...")` — the tagged form handles SQL injection prevention automatically.
- **Forgetting to filter empty rows on client before POST:** The form has 4 rows but sends only non-empty ones. Filter `rows.filter(r => r.playerName.trim() !== '')` before building the POST body.
- **Rate limit before auth check:** Middleware runs before route handlers, so by the time the handler fires, the session is validated. Rate limiting runs at the top of the handler after the middleware pass — this is correct order.
- **Map mutation race conditions:** The `buckets` Map is synchronous; there are no race conditions within a single-threaded Node.js instance. No locking needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input validation / sanitization | Custom length checks, trim logic | `gameSchema.parse()` from validators.ts | Already implemented in Phase 5; covers all GAME-09 requirements |
| Database cascade delete | Manual DELETE FROM game_participants | `prisma.game.delete()` | `onDelete: Cascade` on GameParticipant.gameId handles it |
| HMAC cookie auth | Any auth code in route handlers | Middleware (proxy.ts) | Runs automatically — no per-route auth needed |
| CUID generation | UUID libraries | `@default(cuid())` in schema | Prisma generates IDs automatically on create |

**Key insight:** The Phase 5 foundation eliminated the hardest parts of Phase 6. The validators, schema, and Prisma client are complete. Phase 6 is plumbing and UI, not infrastructure.

---

## Common Pitfalls

### Pitfall 1: Async Params in Next.js 16
**What goes wrong:** Route handler or page crashes at runtime with a type error or "params is not an object" if the old sync signature is used.
**Why it happens:** Next.js 15+ made `params` async (a Promise) to support deferred rendering. The type definition confirms: `params?: Promise<Record<string, string | string[] | undefined>>`.
**How to avoid:** Always destructure params as a Promise: `{ params }: { params: Promise<{ id: string }> }` and immediately `await params`.
**Warning signs:** TypeScript error "Property 'id' does not exist on type 'Promise<...>'" or runtime undefined id.

### Pitfall 2: $transaction Interactive Form with libsql
**What goes wrong:** Prisma's `$transaction([op1, op2])` array form (sequential) is safe. The interactive callback form `$transaction(async (tx) => { ... })` also works with the libsql adapter because `startTransaction()` is implemented. However, if you attempt nested transactions, libsql will error.
**Why it happens:** libsql does not support SAVEPOINT-based nested transactions.
**How to avoid:** Flat transaction structure only — no `tx.doSomething()` that itself calls `$transaction`. POST and PATCH as written above are flat and safe.
**Warning signs:** "SAVEPOINT" or "nested transaction" error from libsql at runtime.

### Pitfall 3: "Add new" Row Causes Duplicate Entry
**What goes wrong:** User types "Alice" (which already exists), highlights the "Add new Alice" row, and presses Enter — creating a duplicate entry "Alice" in the participants instead of selecting the existing one.
**Why it happens:** "Add new" row is shown whenever the input doesn't *exactly* match an item — but the comparison must be case-insensitive.
**How to avoid:** Use `items.some(i => i.toLowerCase() === inputValue.toLowerCase())` to gate the "Add new" row. Exact match (case-insensitive) hides it.

### Pitfall 4: Winner Validation — Empty Rows Count
**What goes wrong:** User has only rows 1 and 2 filled. Row 3 is empty but has the winner radio selected (because radios in a group always have one selected). POST body would include a "winner" with empty playerName.
**Why it happens:** HTML radio buttons within a `name="winner"` group — the browser doesn't know which rows are "active."
**How to avoid:** Filter empty rows first (rows where `playerName.trim() === ''`), then check that exactly one of the remaining rows has `isWinner: true`. Do this in the `handleSubmit` before building the POST body, not in zod (the validator only sees the already-filtered list).

### Pitfall 5: Rate Limit Map Grows Unboundedly
**What goes wrong:** The `buckets` Map accumulates entries for every IP ever seen. For a private app this is fine, but the timestamp arrays also need pruning on each call.
**Why it happens:** `timestamps.filter(t => t > windowStart)` prunes the array correctly on every call, but the IP key itself stays in the Map forever.
**How to avoid:** The timestamp pruning (filter) already handles this: arrays shrink to empty after the window passes. The Map key remains but holds `[]` — negligible memory. For a ~10-user private app this is a non-issue. No cleanup needed.

### Pitfall 6: Zod v4 vs v3 API Differences
**What goes wrong:** Code written assuming Zod v3 API (e.g., `.parse()` error shape, `.safeParse()`, `.ZodError`) works identically in Zod v4 — but some refinement/transform patterns changed.
**Why it happens:** `zod@4.3.6` is installed, not zod v3.
**How to avoid:** The validators in `src/lib/validators.ts` are already written for the installed zod version and they compile. New Phase 6 code does not need to write new zod schemas — only import and call `gameSchema.parse(body)`. Catching `ZodError` uses the same `err instanceof z.ZodError` pattern.
**Warning signs:** TypeScript errors on zod method calls that don't exist in v4.

---

## Code Examples

### Full POST /api/games Route Handler

```typescript
// src/app/api/games/route.ts
// Source: canonical pattern from src/app/api/checkDeck/route.ts + verified Prisma transaction
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { gameSchema } from '@/lib/validators';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(ip, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const body = await request.json();
    const { date, wonByCombo, notes, participants } = gameSchema.parse(body);
    const game = await prisma.$transaction(async (tx) => {
      const created = await tx.game.create({ data: { date, wonByCombo, notes } });
      await tx.gameParticipant.createMany({
        data: participants.map((p) => ({
          gameId: created.id,
          playerName: p.playerName,
          isWinner: p.isWinner,
          isScrewed: p.isScrewed,
          deckName: p.deckName,
        })),
      });
      return created;
    });
    return NextResponse.json({ game }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error('POST /api/games error:', err);
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(ip, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const games = await prisma.game.findMany({
      include: { participants: true },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json({ games });
  } catch (err) {
    console.error('GET /api/games error:', err);
    return NextResponse.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}
```

### Dynamic Route Handler /api/games/[id]/route.ts

```typescript
// Source: [VERIFIED async params shape from module.d.ts]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(ip, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const game = await prisma.game.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ game });
  } catch (err) {
    console.error('GET /api/games/[id] error:', err);
    return NextResponse.json({ error: 'Failed to fetch game' }, { status: 500 });
  }
}
```

### Header Edit for Games Link

```typescript
// src/app/components/header.tsx — add Games to navLinks array
const navLinks = [
  { href: "/checkDeck", label: "Friend Collections" },
  { href: "/games", label: "Games" },            // ADD THIS
  { href: "/SearchLGS", label: "LGS Search" },
]
```

Alphabetical order: Friend Collections → Games → LGS Search. [VERIFIED: existing header.tsx navLinks pattern]

### Combobox Component Skeleton

```typescript
// src/app/components/combobox.tsx — ~150 lines
'use client';
import { useState, useRef, useEffect, useId } from 'react';

interface ComboboxProps {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  addLabel?: string; // "player" or "deck" — for "Add xyz as new player"
}

export function Combobox({ items, value, onChange, placeholder, addLabel = 'item' }: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const filtered = items.filter((i) =>
    i.toLowerCase().includes(inputValue.toLowerCase())
  );
  const showAddNew =
    inputValue.trim().length > 0 &&
    !filtered.some((i) => i.toLowerCase() === inputValue.trim().toLowerCase());
  const totalItems = filtered.length + (showAddNew ? 1 : 0);
  const addNewIndex = filtered.length; // index of the "Add new" row

  // ... keyboard handler, click-outside effect, render ...
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Sync `params` in route handlers | Async `params: Promise<{ id: string }>` + await | BREAKING — must await params in Next.js 15+ |
| `prisma migrate deploy` for Turso | `prisma db push` (dev) + `turso db shell` (prod) | Already established in Phase 5 — no change needed |
| Zod v3 `.parse()` + `.safeParse()` | Zod v4 (same API for basic patterns) | No impact — existing validators already use v4 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `prisma.$transaction` interactive callback form works with libsql adapter (beyond just startTransaction existing) | Prisma $transaction pattern | Transaction fails at runtime; fallback is sequential queries without atomicity |
| A2 | `prisma.gameParticipant.createMany` works within a libsql transaction | POST /api/games pattern | createMany may need to be replaced with multiple `tx.gameParticipant.create()` calls |
| A3 | `prisma.$queryRaw` tagged template works with the libsql adapter (alternative to findMany merge) | UNION query section | If needed, fall back to Option B (two findMany calls) which has no such risk |

**A1 and A2 are LOW risk** because `startTransaction()` is implemented in the adapter source, and `createMany` is a standard batch operation that the libsql batch API supports. A3 is irrelevant since Option B (two findMany) is the recommendation.

---

## Open Questions

1. **Does `prisma.$transaction` callback form need any special handling for libsql connection pooling?**
   - What we know: The adapter implements `startTransaction()`. The libsql hrana client supports Transaction objects with commit/rollback.
   - What's unclear: Whether Prisma uses a new connection or the same connection per transaction with libsql — relevant for Turso's HTTP-based connection model.
   - Recommendation: Use the callback form (`prisma.$transaction(async (tx) => { ... })`) as shown. If a runtime error appears mentioning "transactions not supported" over HTTP, fall back to sequential non-atomic operations and add a warning comment. For the private ~10-user app, partial-failure risk is low.

2. **Is there a `test` script missing from package.json?**
   - What we know: `jest` and `ts-jest` are installed; `jest.config.js` exists; 27 tests pass when run with `npx jest`. But there is no `"test"` script in `package.json`.
   - What's unclear: Whether this was intentional or an oversight.
   - Recommendation: Wave 0 should add `"test": "jest"` to `package.json scripts`. This is a 1-line change that makes the test harness accessible as `npm test`.

---

## Environment Availability

All dependencies are already installed. No external services required beyond what Phase 5 established.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | v22.17.1 | — |
| Prisma CLI | prisma generate | ✓ | 6.19.2 | — |
| @prisma/adapter-libsql | DB transactions | ✓ | 6.15.0 | — |
| @libsql/client | Turso connection | ✓ | 0.8.1 | — |
| jest + ts-jest | Tests | ✓ | 30.3.0 + 29.4.6 | — |
| Turso DB (local) | Dev/test DB queries | ✓ (DATABASE_URL in .env.local) | — | Use SQLite file URL |

**No missing dependencies. No blockers.**

---

## Validation Architecture

`nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.6 |
| Config file | `jest.config.js` (exists, configured) |
| Module alias | `@/*` → `src/*` via moduleNameMapper |
| Test roots | `tests/` directory |
| Quick run command | `npx jest --testPathPattern=rateLimit` |
| Full suite command | `npx jest` |
| Existing tests | 27 tests across 5 files (all passing) |

**Pattern to follow:** See `tests/auth-login.test.ts` — mocks `next/server` and `next/headers`, imports route handler directly, creates fake `Request` objects. New game route tests follow the same pattern.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Test File | Automated Command |
|--------|----------|-----------|-----------|-------------------|
| GAME-01 | POST /api/games creates game + participants atomically | integration | `tests/games-api.test.ts` | `npx jest --testPathPattern=games-api` |
| GAME-01 | Form filters empty rows before submit | unit | `tests/game-form.test.ts` | `npx jest --testPathPattern=game-form` |
| GAME-02 | Combobox filters items as user types | unit | `tests/combobox.test.ts` | `npx jest --testPathPattern=combobox` |
| GAME-03 | "Add new" row appears when no exact match | unit | `tests/combobox.test.ts` | `npx jest --testPathPattern=combobox` |
| GAME-03 | "Add new" row hidden when exact match exists | unit | `tests/combobox.test.ts` | `npx jest --testPathPattern=combobox` |
| GAME-04 | GET /api/players returns union of users + participants | integration | `tests/autocomplete-api.test.ts` | `npx jest --testPathPattern=autocomplete` |
| GAME-05 | GET /api/decks returns distinct deckNames | integration | `tests/autocomplete-api.test.ts` | `npx jest --testPathPattern=autocomplete` |
| GAME-06 | Multiple participants can have isScrewed=true | integration | `tests/games-api.test.ts` | `npx jest --testPathPattern=games-api` |
| GAME-07 | GET /api/games returns games newest-first with participants | integration | `tests/games-api.test.ts` | `npx jest --testPathPattern=games-api` |
| GAME-08 | PATCH /api/games/[id] replaces participants atomically | integration | `tests/games-api.test.ts` | `npx jest --testPathPattern=games-api` |
| GAME-08 | DELETE /api/games/[id] removes game (participants cascade) | integration | `tests/games-api.test.ts` | `npx jest --testPathPattern=games-api` |
| GAME-09 | Route returns 400 on ZodError (invalid body) | integration | `tests/games-api.test.ts` | `npx jest --testPathPattern=games-api` |
| OPT-01 | checkRateLimit returns allowed=false after limit+1 calls | unit | `tests/rate-limit.test.ts` | `npx jest --testPathPattern=rate-limit` |
| OPT-01 | checkRateLimit resets after window expires | unit | `tests/rate-limit.test.ts` | `npx jest --testPathPattern=rate-limit` |
| OPT-01 | Route returns 429 with Retry-After header when limited | integration | `tests/games-api.test.ts` | `npx jest --testPathPattern=games-api` |

### Reconstruction Assertions (Phase Acceptance Criteria)

The following assertions, if passing, prove Phase 6 is complete:

1. `POST /api/games` with valid 2-player body → 201 + `{ game: { id, date, participants: [2 rows] } }`
2. `GET /api/games` after the above POST → `{ games: [{ id, participants: [2 rows] }] }` sorted newest-first
3. `GET /api/games/:id` → 200 with participants; unknown id → 404
4. `PATCH /api/games/:id` with 3-player body → 200; subsequent GET → 3 participants (old 2 are gone)
5. `DELETE /api/games/:id` → 200; subsequent GET → game absent from list
6. `POST /api/games` with body missing `participants` → 400 ZodError
7. `checkRateLimit('ip', 2, 60000)` called 3 times → 3rd call returns `{ allowed: false, retryAfterSeconds > 0 }`
8. `checkRateLimit` after `windowMs` ms → returns `{ allowed: true }` again (timestamps pruned)
9. Combobox: `items=['Alice','Bob'], inputValue='al'` → filtered=['Alice'], no "Add new" shown for 'alice' (case insensitive)
10. Combobox: `items=['Alice'], inputValue='zara'` → filtered=[], "Add 'zara'" row visible
11. GET /api/players after seeding users + game_participants → returns merged deduped sorted list

### Sampling Rate

- **Per task commit:** `npx jest --testPathPattern=rate-limit` (unit tests, ~0.5s)
- **Per wave merge:** `npx jest` (full suite including new tests, ~5s)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps (Files that must be created before implementation)

- [ ] `tests/rate-limit.test.ts` — covers OPT-01, GAME-07 ordering (pure unit, no DB mock needed)
- [ ] `tests/games-api.test.ts` — covers GAME-01, GAME-06, GAME-07, GAME-08, GAME-09, OPT-01 (mocks prisma + next/server like auth-login.test.ts)
- [ ] `tests/autocomplete-api.test.ts` — covers GAME-04, GAME-05 (mocks prisma)
- [ ] `tests/combobox.test.ts` — covers GAME-02, GAME-03 (pure logic tests, no DOM — test the filter/showAddNew functions exported from combobox.tsx)
- [ ] `tests/game-form.test.ts` — covers GAME-01 empty-row filter logic (test the helper function, not the React component)
- [ ] Add `"test": "jest"` to `package.json scripts` (1-line change; currently missing — `npm test` errors)

---

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json` — section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Shared-password HMAC cookie via middleware/proxy.ts — already in place, no Phase 6 changes |
| V3 Session Management | Yes | Same as V2 — middleware handles session validation before route handlers execute |
| V4 Access Control | Partial | Middleware enforces auth for all /games/* and /api/games/* automatically via blocklist matcher |
| V5 Input Validation | Yes | zod gameSchema.parse() at route entry — covers all GAME-09 requirements |
| V6 Cryptography | No | No new crypto. Rate limiter uses plain timestamps, no hashing needed |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Excessive requests / DoS | Denial of Service | checkRateLimit(ip, 30, 60000) before DB work |
| Input injection via playerName/deckName | Tampering | Prisma parameterized queries (never raw string concat); zod trims + length-caps |
| Forged session to access game routes | Spoofing | HMAC-verified session cookie in proxy.ts — existing control |
| Mass create via POST /api/games | Denial of Service | Rate limit at 30/60s covers bulk game creation |
| 429 response leaks IP info | Info Disclosure | 429 body only contains `{ error, retryAfterSeconds }` — no IP echoed back |

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@prisma/adapter-libsql/dist/index-node.js` — `startTransaction()` implementation verified
- `node_modules/next/dist/server/route-modules/app-route/module.d.ts` — `params?: Promise<...>` confirmed async
- `node_modules/@libsql/client/lib-esm/hrana.d.ts` — `Transaction` interface with commit/rollback confirmed
- `middleware.ts` + `proxy.ts` — blocklist matcher confirmed, no allowlist, no changes needed
- `src/lib/validators.ts` — gameSchema confirmed present, zod v4 API
- `src/lib/prisma.ts` — singleton pattern confirmed for rateLimit.ts to mirror
- `src/app/api/checkDeck/route.ts` — canonical route pattern confirmed
- `src/app/components/header.tsx` — navLinks array pattern confirmed for Games link insertion
- `jest.config.js` + `tests/auth-login.test.ts` — test harness pattern confirmed
- `package.json` — all deps confirmed installed; no `"test"` script (confirmed missing)

### Secondary (MEDIUM confidence)
- Prisma $transaction callback form with libsql adapter — `startTransaction()` exists but end-to-end callback form not tested in this session [ASSUMED: works based on adapter source]
- `createMany` inside libsql transaction — standard Prisma API, adapter batch support evident from libsql batch types [ASSUMED: works; fallback is N individual creates]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from node_modules + package.json
- Architecture patterns: HIGH — route handler types verified from Next.js dist; rate limit and transaction patterns verified from adapter source
- Pitfalls: HIGH — async params pitfall verified from type definitions; others from first-principles analysis of the codebase
- Test infrastructure: HIGH — jest.config.js, setup.ts, and 27 passing tests verified directly

**Research date:** 2026-04-10
**Valid until:** 2026-07-10 (stable stack; Next.js 16 and Prisma 6 APIs unlikely to break in 90 days)
