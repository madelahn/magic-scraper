# Architecture Research

**Domain:** MTG game tracking + stats dashboard integrated into existing Next.js + Prisma + Turso app
**Researched:** 2026-04-09
**Confidence:** HIGH (existing codebase fully inspected; integration points derived from direct file reads)

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Browser (Client)                             │
│  ┌──────────────┐  ┌────────────────────┐  ┌──────────────────────┐  │
│  │  GameForm    │  │  StatsPage         │  │  AdminPage (extended) │  │
│  │  autocomplete│  │  charts / tables   │  │  sync history, edit  │  │
│  └──────┬───────┘  └──────────┬─────────┘  └──────────┬───────────┘  │
└─────────┼────────────────────┼─────────────────────────┼─────────────┘
          │ fetch              │ fetch                   │ fetch
┌─────────┼────────────────────┼─────────────────────────┼─────────────┐
│              Next.js App Router — Route Handlers (Node.js runtime)    │
│  ┌──────▼──────┐  ┌──────────▼───────┐  ┌─────────────▼──────────┐  │
│  │ /api/games  │  │ /api/stats        │  │ /api/admin/*            │  │
│  │ /api/players│  │                   │  │  PATCH users/[id]       │  │
│  └──────┬──────┘  └──────────┬────────┘  │  GET sync-history       │  │
│         │                    │           └─────────────┬────────────┘  │
│  ┌──────┴────────────────────┴─────────────────────────┴────────────┐  │
│  │                       middleware.ts                               │  │
│  │    HMAC cookie verify (existing) + rate limit check (new)        │  │
│  └──────────────────────────────┬────────────────────────────────────┘  │
│                                 │                                    │
│  ┌──────────────────────────────▼───────────────────────────────────┐  │
│  │                src/lib/ — Shared Server Logic                    │  │
│  │  prisma.ts │ auth.ts │ rateLimit.ts (new) │ statsQueries.ts (new)│  │
│  │  games.ts (new) │ updateCollections.ts (modified)                │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────────┼────────────────────────────────────┘
                                  │ Prisma + @prisma/adapter-libsql
┌─────────────────────────────────▼────────────────────────────────────┐
│                    Turso Cloud DB (SQLite / libsql)                   │
│   users  │  collection_cards  │  games  │  game_participants          │
│   sync_log  (new tables)                                              │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `GameForm` | Spreadsheet-style game entry with autocomplete dropdowns | Client component, `useState`, fetch players on mount, local filter |
| `StatsPage` | Win rates, screwed rates, deck rates with charts | Client component, fetch `/api/stats` on mount, Recharts |
| `AdminPage` (extended) | Edit Moxfield ID, view sync history | Extend existing client component |
| `/api/games` | Log a game (POST), list games (GET) | Route handler, thin — calls `lib/games.ts` |
| `/api/players` | Return all known player names for autocomplete | Route handler, queries users + distinct participant names |
| `/api/stats` | Aggregate win/screwed/deck stats | Route handler, calls `lib/statsQueries.ts` |
| `/api/admin/users/[id]` (PATCH) | Edit `moxfieldCollectionId` on existing user | Extend existing dynamic route (currently only DELETE) |
| `/api/admin/sync-history` | Return `SyncLog` rows per user | New route handler |
| `lib/games.ts` | DB logic for creating and listing games | Prisma `$transaction` for Game + GameParticipants |
| `lib/statsQueries.ts` | Aggregation queries for stats endpoint | Prisma `groupBy`, returns typed stats objects |
| `lib/rateLimit.ts` | In-memory rate limiter by IP | `Map<string, { count, resetAt }>` — no external dep |
| `lib/updateCollections.ts` | Modified: write `SyncLog` rows | Add success/failure log writes to existing function |
| `middleware.ts` | Auth check + rate limit | Add rate limit call after existing HMAC verify |

---

## Database Schema — New Tables

This is the most critical design area. Turso is SQLite via libsql with these constraints:
- No native array columns — use join tables
- JSON columns work but are not indexed — avoid for filtered queries
- `prisma db push` (not `migrate deploy`) — Turso's libsql adapter does not support migration files
- `@id @default(cuid())` continues as the ID strategy (consistent with existing schema)

### New Prisma Models

```prisma
// A single game session played by the group
model Game {
  id           String   @id @default(cuid())
  playedAt     DateTime @default(now())
  winnerName   String   // free-text — denormalized, not FK to User
  winnerDeck   String?  // free-text deck name, nullable
  notes        String?

  participants GameParticipant[]

  @@map("games")
}

// Which players participated in a game, and who got mana-screwed
model GameParticipant {
  id         String  @id @default(cuid())
  gameId     String
  playerName String  // free-text — not FK to User (allows non-registered players)
  wasScrewed Boolean @default(false)

  game Game @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@index([gameId])
  @@index([playerName])
  @@map("game_participants")
}

// Append-only log of collection sync attempts per user
model SyncLog {
  id        String   @id @default(cuid())
  userId    String
  syncedAt  DateTime @default(now())
  success   Boolean
  cardCount Int?     // null on failure
  error     String?  // null on success

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([syncedAt])
  @@map("sync_log")
}
```

**User model also needs a new relation added:**

```prisma
model User {
  // ... existing fields unchanged ...
  syncLogs SyncLog[]  // add this relation
}
```

### Design Decisions

**Why `playerName` is free-text (not a FK to `User`):**
- The app explicitly allows ad-hoc new players who have no Moxfield collection
- A separate `Player` table would require its own management UI (add/delete players) with no other value
- Autocomplete is seeded from `User.name` union `distinct GameParticipant.playerName` at query time

**Why `winnerDeck` is on `Game` (not a `Deck` table):**
- The group is not tracking a formal deck registry — just the name someone calls their deck
- A `Deck` table would require CRUD UI and deck-player association management
- Free-text is sufficient for deck win rate stats

**Why `wasScrewed` is Boolean on `GameParticipant` (not a separate table):**
- Exactly one boolean per participant — a separate table adds a join with no benefit

**Why `SyncLog` (not just Vercel logs):**
- Current `updateCollections.ts` logs to `console.error` which requires Vercel dashboard access to view
- Admin users (non-developer friends) cannot see Vercel logs
- `SyncLog` table makes sync history visible in the admin UI

---

## Recommended File Structure

New files only. Modified files noted explicitly.

```
src/
├── app/
│   ├── games/
│   │   └── page.tsx                    # NEW — game input form page
│   ├── stats/
│   │   └── page.tsx                    # NEW — stats dashboard page
│   ├── admin/
│   │   └── page.tsx                    # MODIFIED — add sync history + edit user sections
│   └── api/
│       ├── games/
│       │   └── route.ts                # NEW — GET (list) + POST (log game)
│       ├── stats/
│       │   └── route.ts                # NEW — GET aggregated stats
│       ├── players/
│       │   └── route.ts                # NEW — GET player name list for autocomplete
│       └── admin/
│           ├── users/
│           │   └── [id]/
│           │       └── route.ts        # MODIFIED — add PATCH (edit moxfieldCollectionId)
│           └── sync-history/
│               └── route.ts           # NEW — GET SyncLog entries
├── lib/
│   ├── games.ts                        # NEW — DB logic for game create/list
│   ├── statsQueries.ts                 # NEW — aggregation helpers
│   ├── rateLimit.ts                    # NEW — in-memory IP rate limiter
│   └── updateCollections.ts            # MODIFIED — write SyncLog rows
├── middleware.ts                       # MODIFIED — add rate limit call
└── (all other files unchanged)

prisma/
└── schema.prisma                       # MODIFIED — add Game, GameParticipant, SyncLog
```

### Rationale

- **`/api/players/`** is a separate route from `/api/games` because the player list is a different query concern (union of User + distinct participants). Keeping it separate lets GameForm fetch it once on mount without coupling to game CRUD.
- **`lib/games.ts`** follows the existing pattern: route handlers are thin and call service functions in `lib/`. Compare `updateCollections.ts` and `scrapeMoxfield.ts`.
- **`lib/statsQueries.ts`** centralizes the groupBy aggregations — these are verbose in Prisma and benefit from a dedicated module.
- **`lib/rateLimit.ts`** is imported by `middleware.ts` rather than inlining, keeping middleware readable.

---

## Architectural Patterns

### Pattern 1: Thin Route Handler Delegating to lib/

**What:** Route handlers do: auth check (via middleware), input validation, call lib function, shape response. All DB logic lives in `lib/`.

**When to use:** All new API routes — consistent with existing codebase style.

**Trade-offs:** More files, but each file has a single concern. Route handlers stay under ~40 lines.

```typescript
// src/app/api/games/route.ts
import { logGame, listGames } from '@/lib/games'

export async function POST(request: Request) {
  const body = await request.json()
  // validate required fields
  if (!body.winnerName || !body.participants?.length) {
    return Response.json({ error: 'winnerName and participants required' }, { status: 400 })
  }
  const game = await logGame(body)
  return Response.json(game, { status: 201 })
}

export async function GET() {
  const games = await listGames()
  return Response.json(games)
}
```

### Pattern 2: Denormalized Player Names with Union Autocomplete

**What:** Store player names as free-text strings. Autocomplete data is a union of `User.name` and `distinct GameParticipant.playerName`.

**When to use:** Any autocomplete that sources from both registered users and ad-hoc participants.

```typescript
// src/app/api/players/route.ts
export async function GET() {
  const [users, participants] = await Promise.all([
    prisma.user.findMany({ select: { name: true } }),
    prisma.gameParticipant.findMany({
      select: { playerName: true },
      distinct: ['playerName'],
    }),
  ])
  const names = [...new Set([
    ...users.map(u => u.name),
    ...participants.map(p => p.playerName),
  ])].sort()
  return Response.json(names)
}
```

### Pattern 3: In-Memory Rate Limiter (Edge-Compatible)

**What:** `Map<string, { count: number; resetAt: number }>` keyed by IP. Called in middleware before auth check to short-circuit abusive requests early.

**When to use:** Apply to all `/api/*` routes. The threat model is accidental hammering from a friend, not adversarial attack — per-instance state is sufficient.

**Trade-offs:** State resets on cold start. On Vercel Hobby with a small user group this is acceptable. If Vercel scales to multiple instances (unlikely at this traffic), limits are per-instance, not global.

```typescript
// src/lib/rateLimit.ts
const store = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(
  ip: string,
  limit = 30,
  windowMs = 60_000
): boolean {
  const now = Date.now()
  const entry = store.get(ip)
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}
```

**Middleware integration** — add after the existing HMAC verify, before forwarding the request:

```typescript
// middleware.ts (addition)
import { checkRateLimit } from '@/lib/rateLimit'

// Inside the middleware function, after verifying auth:
if (pathname.startsWith('/api/')) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return new Response('Too Many Requests', { status: 429 })
  }
}
```

### Pattern 4: SyncLog Write in updateCollections — Success Inside tx, Failure in catch

**What:** In `updateCollections.ts`, write a `SyncLog` success row inside the existing Prisma transaction (so log and collection update are atomic). Write a failure row in the catch block (transaction rolled back, so write outside it).

**When to use:** Only in `updateCollections.ts` — this is a surgical modification, not a new pattern.

```typescript
// Inside the $transaction — add at end of existing tx body:
await tx.syncLog.create({
  data: { userId: user.id, success: true, cardCount: cards.length }
})

// In the catch block — write outside tx (tx rolled back):
await prisma.syncLog.create({
  data: { userId: user.id, success: false, error: msg }
})
```

---

## Data Flow

### Game Logging

```
User fills GameForm
  (date, players[], winner, winnerDeck, screwedPlayers[])
    ↓
POST /api/games
    ↓
middleware: rate limit check → HMAC cookie verify
    ↓
route.ts: validate body
    ↓
lib/games.ts → prisma.$transaction([
  games.create({ playedAt, winnerName, winnerDeck }),
  gameParticipants.createMany([{ gameId, playerName, wasScrewed }...])
])
    ↓
Response 201 { id, playedAt }
    ↓
GameForm resets fields / shows success message
```

### Stats Dashboard

```
User navigates to /stats
    ↓
StatsPage mounts → fetch /api/stats
    ↓
statsQueries.ts (all three run in parallel via Promise.all):
  - gameParticipant.groupBy(['playerName'], _count: true, where: { wasScrewed: false })
    → total games per player (for win rate denominator)
  - game.groupBy(['winnerName'], _count: true)
    → wins per player
  - game.groupBy(['winnerDeck'], _count: true, where: { winnerDeck: not null })
    → wins per deck
    ↓
Route computes derived rates (wins / total games per player)
    ↓
Response { winRates[], screwRates[], deckWinRates[], totalGames }
    ↓
StatsPage renders:
  - BarChart: win rate per player
  - BarChart: screwed rate per player
  - PieChart or BarChart: deck win rates
```

### Autocomplete

```
GameForm mounts
    ↓
GET /api/players (single fetch, no debounce — list is ~10-20 names)
    ↓
User types in player field
    ↓
Client-side filter of cached names array
    ↓
Dropdown renders matching names
```

### Admin Sync History

```
Admin opens /admin
    ↓
useEffect → GET /api/admin/sync-history
    ↓
Query: syncLog.findMany({
  include: { user: { select: { name: true } } },
  orderBy: { syncedAt: 'desc' },
  take: 50
})
    ↓
Admin sees table: user | synced at | success | card count | error
```

---

## Integration Points

### Existing Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `Game`, `GameParticipant`, `SyncLog` models; add `syncLogs SyncLog[]` relation on `User` |
| `src/lib/updateCollections.ts` | Write `SyncLog` rows on success (inside tx) and failure (in catch) |
| `src/app/api/admin/users/[id]/route.ts` | Add `PATCH` handler for editing `moxfieldCollectionId` |
| `src/app/admin/page.tsx` | Add sync history table section; add edit-Moxfield-ID UI per user |
| `src/middleware.ts` | Add rate limit check after existing HMAC cookie verify |

### New Files Added

| File | Purpose |
|------|---------|
| `src/app/games/page.tsx` | Game input form UI |
| `src/app/stats/page.tsx` | Stats dashboard UI with Recharts |
| `src/app/api/games/route.ts` | Game CRUD |
| `src/app/api/stats/route.ts` | Aggregated stats |
| `src/app/api/players/route.ts` | Player name autocomplete source |
| `src/app/api/admin/sync-history/route.ts` | Sync log viewer |
| `src/lib/games.ts` | DB logic for games |
| `src/lib/statsQueries.ts` | Aggregation query helpers |
| `src/lib/rateLimit.ts` | In-memory rate limiter |

### External Services (Unchanged)

| Service | Notes |
|---------|-------|
| Turso (libsql) | All new tables use the same Prisma + adapter setup — no config changes |
| Vercel Cron | Unchanged; `updateCollections.ts` is modified internally, not its API contract |
| ScraperAPI / curl fallback | Unchanged — 401 Games fix is isolated to `scrape401.ts` |

---

## Build Order

Ordered by data and code dependencies:

1. **`prisma/schema.prisma`** — Add all three new models, run `prisma db push`. Every subsequent step depends on this.
2. **`lib/rateLimit.ts` + `middleware.ts` update** — No DB dependency. Can be done immediately after schema.
3. **`lib/games.ts` + `/api/games` route** — Core game write path. Depends only on schema.
4. **`/api/players` route** — Trivial query; unblocks GameForm autocomplete.
5. **`src/app/games/page.tsx` (GameForm)** — Depends on `/api/games` and `/api/players`.
6. **`lib/statsQueries.ts` + `/api/stats` route** — Depends on games table having data. Can be built before data exists but only meaningfully tested after.
7. **`src/app/stats/page.tsx` (StatsPage)** — Depends on `/api/stats`.
8. **`lib/updateCollections.ts` modification** — Add `SyncLog` writes. Depends on `SyncLog` table in schema.
9. **`/api/admin/sync-history` route** — Depends on `SyncLog` table having rows.
10. **Admin page extensions** — Edit Moxfield ID (PATCH route + UI), sync history section.

---

## Anti-Patterns

### Anti-Pattern 1: Creating a Separate `Player` Table

**What people do:** Normalize player names into a `Player` model with its own ID and profile fields.

**Why it's wrong:** Requires a dedicated player management UI (add/rename/delete). The friend group allows ad-hoc players with no Moxfield account. Adds a join on every game query.

**Do this instead:** Free-text `playerName` on `GameParticipant`. Autocomplete is a union query — no separate table, no separate UI.

### Anti-Pattern 2: Storing Pre-Computed Stats in a Table

**What people do:** Maintain a `player_stats` table with win counts updated on each game write.

**Why it's wrong:** At 50-200 total games (realistic lifetime for this group), real-time `groupBy` aggregation runs in milliseconds. Pre-computation adds write complexity and a consistency surface (stats can drift from games).

**Do this instead:** Compute stats on-demand in `/api/stats`. Add a short `Cache-Control` header if subjective latency is an issue.

### Anti-Pattern 3: DB Reads in `middleware.ts`

**What people do:** Validate sessions by querying a `sessions` table in middleware.

**Why it's wrong:** The existing HMAC cookie pattern is stateless and cryptographically secure — no DB round-trip needed. The app was specifically built this way (see `src/lib/auth.ts`).

**Do this instead:** Keep the existing HMAC verify. The rate limiter addition is a Map lookup only — zero DB access in middleware.

### Anti-Pattern 4: Using D3.js for Simple Bar/Pie Charts

**What people do:** Reach for D3.js because it's the canonical charting library.

**Why it's wrong:** D3 is SVG/canvas imperative manipulation — it adds ~80KB and requires significant setup for basic bar and pie charts. This app needs ~3 chart instances max.

**Do this instead:** `npm install recharts`. Recharts is React-native (composable JSX), covers bar and pie with ~20 lines each, and is well-maintained. Total addition: ~60KB gzipped.

### Anti-Pattern 5: Debounced API Calls for Autocomplete

**What people do:** Add debounced `fetch` on each keystroke to `/api/players?q=partial`.

**Why it's wrong:** The player list is ~10-20 names. Fetching the full list once on form mount and filtering client-side is faster and simpler.

**Do this instead:** `GET /api/players` returns all names. Filter with `names.filter(n => n.toLowerCase().includes(input.toLowerCase()))` client-side.

---

## Scalability Considerations

This is a private app for ~10 users. Turso free tier limits are the practical ceiling.

| Constraint | Headroom | Risk |
|------------|----------|------|
| Turso 25M row reads/month | Games table: 100 games × 5 players = 500 rows. Stats queries full-scan game_participants. Negligible. | None |
| Turso 9GB storage | Games data: kilobytes per year | None |
| Vercel Hobby 60s default timeout | Stats query: <100ms. Game write: <50ms. | None — only cron/scraper routes need maxDuration |
| In-memory rate limiter resets on cold start | Friend group: low traffic, cold starts rare | Acceptable |

---

## Sources

- Direct inspection of `src/` codebase (all files read at research time)
- `prisma/schema.prisma` — existing models inform new model design
- Prisma groupBy docs: https://www.prisma.io/docs/orm/prisma-client/queries/aggregation-grouping-summarizing
- Turso free tier limits: https://turso.tech/pricing
- Next.js middleware docs: https://nextjs.org/docs/app/building-your-application/routing/middleware
- Recharts: https://recharts.org

---

*Architecture research for: magic-scraper v1.1 — game tracking, stats dashboard, admin improvements*
*Researched: 2026-04-09*
