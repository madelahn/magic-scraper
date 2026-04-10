# Stack Research

**Domain:** MTG game tracking / stats dashboard additions to existing Next.js 16 + React 19 + Tailwind v4 app
**Researched:** 2026-04-09
**Confidence:** MEDIUM-HIGH (all charting/combobox claims verified via web search against npm and GitHub; rate limiting approach verified against multiple sources)

---

## Context: What Already Exists (Do Not Re-Research)

| Technology | Version | Status |
|------------|---------|--------|
| Next.js | ^16.1.6 | Installed, deployed |
| React | 19.2.3 | Installed |
| Tailwind CSS | ^4 | Installed |
| Prisma + @prisma/adapter-libsql | ^6.15.0 | Installed, Turso-connected |
| @libsql/client | 0.8.1 | Installed |
| lucide-react | ^0.562.0 | Installed (icons) |
| HMAC cookie auth | — | Hand-rolled, working |
| Vercel Cron | — | Configured, daily sync running |

shadcn/ui is NOT currently installed. The project uses custom Tailwind classes (`bg-surface`, `bg-background`, `border-border`, `text-muted`, `text-accent`) defined in globals.css — the project has its own design token system. This matters for charting and combobox choices.

---

## New Capabilities Required

### 1. Charting / Stats Dashboard

**Recommendation: Recharts v3 (direct install, no wrapper)**

Recharts 3.0 was released June 2025 and reached v3.7+ by early 2026. It has full React 19 support as of v3.0 (resolved the prior peer dependency conflicts in v2.x alpha). It renders SVG via React components — no canvas, no separate renderer.

**Why Recharts over alternatives:**

- **vs Tremor:** Tremor is a Tailwind dashboard component kit built on top of Recharts. It adds Tailwind v3 design tokens, Radix UI, and opinionated styling. This project already has its own Tailwind design token system — Tremor would clash with existing `bg-surface`/`border-border` CSS custom properties. Recharts directly gives full control over styling. Tremor is ideal for greenfield dashboards, not additions to existing design systems.
- **vs Chart.js / react-chartjs-2:** Canvas-based. SVG-based libraries (Recharts) give finer React control, better accessibility, and composable tooltip/legend customization without fighting the imperative Chart.js API from inside React.
- **vs Victory / Nivo:** Heavier, less maintained momentum. Recharts has 9.5M+ weekly downloads vs Nivo's ~600K.

**Charts needed for this project:** Bar (win rates by player), Pie/Donut (overall win distribution), Bar (deck win rates). All are first-class Recharts component types (`BarChart`, `PieChart`). No D3 or custom renderers needed.

**Bundle size:** Recharts v3 supports tree-shaking via ESM. Import only the components used (`BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `PieChart`, `Pie`, `Cell`) — the per-route bundle impact is significantly less than the full library. Raw gzip for the full package is approximately 190 KB minified / 52 KB gzipped (per Bundlephobia for v3.8.x), but with tree-shaking on a stats-only page, real impact is well under that. For a Vercel Hobby app with ~10 users, this is acceptable.

| Package | Version | Purpose |
|---------|---------|---------|
| `recharts` | `^3.7.0` | Bar, Pie, Line charts for stats dashboard |

```bash
npm install recharts
```

**Tailwind v4 integration note:** Recharts renders inline SVG styles — it does not use Tailwind classes internally. Chart colors are passed as props (`fill`, `stroke`). Use CSS custom properties from the existing design token system (e.g., `var(--color-accent)`) as fill values to stay consistent with the app theme.

---

### 2. Autocomplete / Combobox Dropdowns

**Recommendation: Build with cmdk + Popover (same primitives shadcn uses), OR a minimal custom combobox using native HTML datalist**

The game tracking form needs:
- Player name autocomplete (from existing `User` records)
- Deck name autocomplete (free-text + suggestions)
- Winner selection (from players in that game)

**Option A — cmdk (recommended for full keyboard nav + search filtering):**

`cmdk` is the command palette library that powers shadcn's `Command` component. It provides a filterable list with keyboard navigation, accessible ARIA roles, and a composable API. It does NOT impose design — all styling is via className. Works directly with Tailwind v4 custom classes.

| Package | Version | Purpose |
|---------|---------|---------|
| `cmdk` | `^1.0.0` | Filterable command/autocomplete primitive |

```bash
npm install cmdk
```

Use it with a `<Popover>`-style wrapper (position an absolutely-positioned div below the input, toggle on focus). No Radix UI required — the existing UI already handles popovers via plain CSS positioning if needed, or implement a minimal one.

**Why not full shadcn/ui:** shadcn/ui is a copy-paste component system. Installing it via CLI rewrites `globals.css` with its own CSS variable tokens, which would clobber the existing `--color-accent`, `--color-surface`, etc. design tokens. The right approach for this project is to copy only the `Command` component source into the project (shadcn's model) — but that pulls in Radix UI primitives (`@radix-ui/react-dialog`), adding ~15 KB gzipped. For three comboboxes in a game form, cmdk directly is simpler.

**Option B — native `<datalist>` (no dependency):**

HTML5 `<datalist>` provides browser-native autocomplete for text inputs. Zero JS, zero dependency. Limitations: no custom styling of the dropdown (browser-rendered), no keyboard arrow-key filtering in all browsers, no multi-select. Acceptable for "winner deck" where the list is short and filtering is less critical.

**Recommendation:** Use `cmdk` for the player picker (needs reliable selection from a defined list), and `<datalist>` for the deck name field (free-text with suggestions, list may be long/dynamic).

---

### 3. Rate Limiting

**Recommendation: In-process Map-based rate limiter (zero dependencies)**

**Context:** This is a private app for ~10 friends. Rate limiting is abuse protection, not DDoS mitigation. The threat model is accidental hammering (buggy client) or someone sharing the group password externally.

**Serverless reality:** Vercel serverless functions are stateless — each cold start gets a fresh in-memory store. On Vercel Hobby with ~10 users and light traffic, function instances stay warm between requests. An in-memory Map-based limiter works well enough: it resets on cold starts, but that's fine for this use case. The alternative (Upstash Redis) requires a free Upstash account, an API key, and adds network latency to every request.

**Verdict: A 15-line in-memory sliding window Map is the right tool for this project. Do NOT add Upstash.**

The pattern: declare a `Map<string, { count: number; resetAt: number }>` at module scope (survives warm invocations), keyed by IP from `x-forwarded-for`. Apply to LGS scrape routes and the game tracking write endpoints.

```typescript
// src/lib/rateLimit.ts — zero dependencies
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string, maxRequests = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (record.count >= maxRequests) return false; // blocked

  record.count++;
  return true; // allowed
}
```

**IP extraction from Next.js App Router:**
```typescript
// In a Route Handler:
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
```

**When to use Upstash instead:** If this app ever becomes multi-tenant, public-facing, or gets significant traffic. The `@upstash/ratelimit` package with Upstash Redis free tier (10K requests/day free) is the next step. For now, the in-memory approach is correct.

---

### 4. DB Schema Additions (Prisma + Turso/libSQL)

**Game tracking needs two new models.**

Turso uses SQLite under the hood — no JSON column type (SQLite stores JSON as TEXT). Prisma's `String` type is the correct mapping for any serialized data. Relation arrays (players in a game) should be a junction table, not a JSON array — this enables proper querying for per-player stats.

**Proposed schema additions:**

```prisma
model Game {
  id          String       @id @default(cuid())
  playedAt    DateTime
  winnerId    String?
  notes       String?
  createdAt   DateTime     @default(now())
  
  winner      Player?      @relation("GameWinner", fields: [winnerId], references: [id])
  players     GamePlayer[]
  
  @@map("games")
}

model Player {
  id          String       @id @default(cuid())
  name        String       @unique
  // Optional link to a User (Moxfield user) — nullable
  userId      String?
  
  gamesPlayed GamePlayer[]
  gamesWon    Game[]       @relation("GameWinner")
  
  @@map("players")
}

model GamePlayer {
  id          String   @id @default(cuid())
  gameId      String
  playerId    String
  deckName    String
  wasScrew    Boolean  @default(false)
  
  game        Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  player      Player   @relation(fields: [playerId], references: [id])
  
  @@unique([gameId, playerId])
  @@index([gameId])
  @@index([playerId])
  @@map("game_players")
}
```

**Key decisions:**
- `Player` is separate from `User` — not all game players will have Moxfield accounts. The optional `userId` field allows seeding from existing Users without requiring it.
- `wasScrew` is a boolean per `GamePlayer` — "screwed" is a per-player-per-game state, not a property of the game itself.
- `deckName` is a `String` on `GamePlayer` (not a separate Deck model) — deck names are free-text, and a full Deck model adds complexity not yet needed. Distinct deck names can be queried with `SELECT DISTINCT deckName` for autocomplete suggestions.
- `winner` is nullable — supports recording games where no winner is declared.

**Migration:** Continue using `prisma db push` (already established for Turso compatibility). `prisma migrate deploy` remains incompatible with the libsql adapter.

---

### 5. Admin Improvements: Sync History & Error Alerting

**Sync history:** Add a `SyncLog` model to record cron run outcomes.

```prisma
model SyncLog {
  id        String   @id @default(cuid())
  startedAt DateTime @default(now())
  finishedAt DateTime?
  status    String   // "success" | "partial" | "failed"
  details   String?  // JSON stringified per-user results
  
  @@map("sync_logs")
}
```

**Error alerting on cron failure:** The project is Hobby tier — no budget for external alerting services (PagerDuty, etc.). Options in order of simplicity:

1. **Email via Resend free tier (100 emails/day):** Add `resend` package, send to the developer's email on cron failure. Resend free tier is permanent, no credit card required.
2. **Discord webhook:** POST to a Discord channel webhook URL on failure. Zero dependencies — pure `fetch`. Ideal for a friend group that likely already uses Discord.
3. **Log to SyncLog and poll from admin dashboard:** No external dependency. Admin panel shows last sync status and timestamp. Failure is visible on next admin visit.

**Recommendation:** Discord webhook (Option 2) — it is zero-dependency, free forever, and maps naturally to a friend group context. Store the webhook URL in an environment variable.

```typescript
// Zero-dependency Discord alert in cron route
await fetch(process.env.DISCORD_WEBHOOK_URL!, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: `❌ Nightly sync failed: ${error.message}` }),
});
```

No package needed — plain `fetch` works in Next.js App Router serverless functions.

---

## Complete Package Change Summary

### Add

```bash
npm install recharts cmdk
```

### Do NOT Add

| Package | Why Not |
|---------|---------|
| `@upstash/ratelimit` + `@upstash/redis` | Overkill for 10-user private app; adds external dependency and API key management |
| `@tremor/react` | Clobbers existing design tokens; wraps Recharts with opinions that fight the existing UI |
| `chart.js` / `react-chartjs-2` | Canvas-based; worse React integration than Recharts |
| `@radix-ui/react-popover` (full shadcn install) | Rewrites globals.css; disrupts existing design token system |
| `resend` | Discord webhook solves error alerting for zero dependencies and zero cost |

---

## Alternatives Considered

| Category | Recommended | Alternative | When Alternative Makes Sense |
|----------|-------------|-------------|------------------------------|
| Charts | `recharts` direct | Tremor | Greenfield dashboard with no existing design system |
| Charts | `recharts` direct | Chart.js | Non-React projects or when canvas rendering is required |
| Combobox | `cmdk` | Native `<datalist>` | Short static lists where custom styling is not needed |
| Combobox | `cmdk` | Full shadcn combobox | Projects not already invested in a custom design token system |
| Rate limiting | In-memory Map | `@upstash/ratelimit` | Public-facing app, >100 concurrent users, or multi-instance deployment |
| Error alerting | Discord webhook | `resend` email | Projects without an existing Discord server |

---

## Version Compatibility

| Package | React Peer | Tailwind Notes |
|---------|-----------|----------------|
| `recharts@^3.7.0` | React 18 + 19 (verified, GA since v3.0) | SVG-based, no Tailwind dependency; use CSS custom properties for theme colors |
| `cmdk@^1.0.0` | React 18 + 19 (shadcn ships it with React 19) | Unstyled; works with any className including Tailwind v4 |

---

## Sources

- recharts npm page + GitHub releases: https://github.com/recharts/recharts/releases — v3.7.0 confirmed React 19 support
- recharts React 19 issue thread: https://github.com/recharts/recharts/issues/4558 — confirmed resolved in v3.0
- shadcn/ui Tailwind v4 docs: https://ui.shadcn.com/docs/tailwind-v4 — confirmed shadcn updated all components for Tailwind v4 + React 19
- shadcn combobox docs: https://ui.shadcn.com/docs/components/radix/combobox — cmdk is the underlying primitive
- Next.js rate limiting discussion: https://github.com/vercel/next.js/discussions/12134 — in-memory Map pattern documented
- In-memory rate limiter for Next.js: https://www.javacodegeeks.com/building-an-in-memory-rate-limiter-in-next-js.html — pattern verified
- Upstash ratelimit docs: https://github.com/upstash/ratelimit-js — cited for when to use distributed approach
- Prisma Turso docs: https://www.prisma.io/docs/orm/overview/databases/turso — libsql adapter constraints confirmed

---

*Stack research for: magic-scraper v1.1 game tracking milestone additions*
*Researched: 2026-04-09*
