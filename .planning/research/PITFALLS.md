# Pitfalls Research

**Domain:** Game tracking, stats dashboard, charting, rate limiting, admin tooling on Next.js + Turso (v1.1)
**Researched:** 2026-04-09
**Confidence:** MEDIUM-HIGH — Turso limits confirmed from official sources; charting/rate limiting patterns from multiple credible sources; autocomplete patterns from community consensus.

---

## Critical Pitfalls

---

### Pitfall 1: Stats Queries Burn Turso Row Reads Without Indexes

**What goes wrong:**
Aggregation queries for the stats dashboard (win rates per player, deck win rates, screwed rates) will do full table scans on the `games` table. Turso's row-read billing counts every row examined by the query engine — not just rows returned. A `SELECT player, COUNT(*) FROM game_players GROUP BY player` on a 1,000-row table reads 1,000 rows. Running this query on every dashboard page load across 10 users will burn through quota faster than expected.

**Why it happens:**
SQLite (and Turso by extension) counts row reads at the storage engine level. Developers assume "it's just a small table" and skip indexing. As game history grows, query cost grows linearly with no warning until the monthly quota is hit.

**Consequences:**
Turso free tier: 500M row reads/month. A stats dashboard with 5 unindexed aggregation queries × 10 users × 100 page loads/day = millions of unnecessary reads/month. At 10k games this becomes meaningful. Hitting the limit disables the database until the next billing cycle.

**How to avoid:**
1. Add indexes on all columns used in WHERE, GROUP BY, and ORDER BY clauses at schema creation time:
   ```sql
   CREATE INDEX idx_game_players_player ON game_players(player_name);
   CREATE INDEX idx_game_players_winner ON game_players(is_winner);
   CREATE INDEX idx_games_date ON games(played_at);
   ```
2. Consider maintaining pre-computed aggregate columns (running win/loss counters) updated via application logic on each game insert, rather than computing from raw data on each page load.
3. Cache stats query results in memory or via a simple `lastComputed` timestamp column — recompute at most once per hour rather than per page load.

**Warning signs:**
Turso dashboard showing row reads climbing disproportionately to game count. Stats page noticeably slower than other pages. Check with `EXPLAIN QUERY PLAN` during development.

**Phase to address:** Game Tracking + Stats Dashboard phase — design schema with indexes before inserting any data. Adding indexes retroactively on Turso requires running the DDL via `turso db shell`.

---

### Pitfall 2: Rate Limiting on Vercel Serverless Has No Persistent State

**What goes wrong:**
In-memory rate limiting (`const requestCounts = new Map()` at module level) does not work on Vercel serverless. Each function invocation may run in a different Lambda instance. The counter is not shared across instances. A client can exceed any in-memory rate limit simply by having requests land on different instances.

**Why it happens:**
Developers test rate limiting locally (single Node.js process, shared memory) and it works perfectly. In production, Vercel scales out to multiple concurrent function instances with no shared state.

**Consequences:**
The rate limiter provides zero protection in production. Bad actors or accidental loops can hammer scraper routes, burn Vercel function execution time, and trigger Turso write limits.

**How to avoid:**
Two viable free-tier options:

**Option A — Upstash Redis + `@upstash/ratelimit` (recommended):**
Upstash Redis free tier (10,000 requests/day, 256MB) is sufficient for a 5-10 person friend group app. The `@upstash/ratelimit` library provides sliding window and fixed window algorithms designed for serverless:
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'),
});

const { success } = await ratelimit.limit(ip);
if (!success) return new Response('Too Many Requests', { status: 429 });
```
Requires two env vars: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

**Option B — Turso-based rate limiting:**
Store request counts in a Turso table with timestamps. Works but adds latency and burns row reads/writes for every rate-limited request. Not recommended for scraper routes where latency matters.

**Option C — Vercel WAF (NOT on Hobby tier):**
Vercel's built-in WAF rate limiting is a Pro/Enterprise feature. Not available on Hobby.

**Warning signs:**
If you test rate limiting locally and it works but in production requests always succeed regardless of volume, the in-memory approach is being used. Check with concurrent requests from two different browser tabs hitting the same endpoint simultaneously.

**Phase to address:** Rate Limiting phase — set up Upstash before implementing any rate limit logic. Do not attempt in-memory rate limiting and "fix it later."

---

### Pitfall 3: Charting Library Bundle Size Blocks Page Load

**What goes wrong:**
Adding a full charting library (Recharts ~230KB minified+gzip, Chart.js ~170KB) to the stats page bundles it into the initial JavaScript payload for all pages. Next.js shares the app bundle across routes unless you explicitly code-split.

**Why it happens:**
Importing a chart component at the top of a page file causes Next.js to include the entire charting library in that page's bundle. If the stats page is linked from the main nav, the chart bundle is pre-fetched even when users are on other pages.

**Consequences:**
First load performance degrades. On a slow connection the stats dashboard feels broken while the large JS bundle parses. Lighthouse score drops. On mobile this is noticeable.

**How to avoid:**
Always load chart components with Next.js dynamic import and `ssr: false`:
```typescript
import dynamic from 'next/dynamic';

const WinRateChart = dynamic(() => import('@/components/WinRateChart'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-gray-100 rounded" />,
});
```

This keeps the charting code out of the initial bundle and loads it only when the stats page is actually visited.

**Library recommendation:** Recharts is the right choice for this app — ~230KB minified (but splits well with dynamic import), React-native, declarative API, good TypeScript support. Avoid Chart.js (imperative, requires refs), Victory (large), or D3 directly (requires significant custom code for simple bar/pie charts).

**Warning signs:**
Run `next build` and check the build output. If the stats page bundle is >200KB, charting code is leaking into a shared chunk. Use `ANALYZE=true next build` with `@next/bundle-analyzer` to diagnose.

**Phase to address:** Stats Dashboard phase — use dynamic import from the first component created, not as a retrofit.

---

### Pitfall 4: Autocomplete Dropdowns Making API Calls on Every Keystroke

**What goes wrong:**
The game tracking form has autocomplete dropdowns for player names and deck names. Without debouncing, each keystroke fires an API request. For a local list of ~10 players this might seem fine, but it creates unnecessary Turso reads and Vercel function invocations, and causes flickering UI as results arrive out of order.

**Why it happens:**
The `onChange` handler calls `fetch('/api/players?q=...')` directly. No debounce, no caching. With 5 players in the system, 5 keystrokes = 5 API calls.

**Consequences:**
For this app's scale (10 players, ~50 decks), the performance impact is minor but the UX suffers from UI flicker and wasted round-trips. If autocomplete is used on every game log entry row in a spreadsheet-style interface, 10 rows × 5 keystrokes = 50 API calls per game entry session.

**How to avoid:**
For a list this small (10 players, 50 decks), the correct approach is to load the full list once at page mount and filter client-side:
```typescript
// Fetch once on mount
const [players, setPlayers] = useState<string[]>([]);
useEffect(() => {
  fetch('/api/players').then(r => r.json()).then(setPlayers);
}, []);

// Filter client-side on input
const filtered = players.filter(p => p.toLowerCase().includes(query.toLowerCase()));
```

This eliminates per-keystroke API calls entirely. Only rebuild to server-search if the player list grows beyond ~500 entries (it won't for this use case).

**Warning signs:**
Network tab in DevTools showing a new XHR request on every keypress in the autocomplete field. Each request visible as a separate row.

**Phase to address:** Game Tracking phase — design the autocomplete as client-side filtered from the start.

---

### Pitfall 5: Schema Design for Game Tracking Gets Normalization Wrong

**What goes wrong:**
Storing game results in a denormalized single row (`date, player1, player2, player3, player4, winner, screwed`) creates rigid structure that breaks for variable player counts and makes aggregation queries awkward. Storing everything in a JSON blob column avoids schema design but makes SQLite aggregation impossible without application-level processing.

**Why it happens:**
The "spreadsheet feel" of the UI makes developers model the DB like a spreadsheet: one row per game with fixed columns per player. This works until you have 3-player games, 5-player games, or want to ask "what is each player's win rate across all games they participated in."

**Consequences:**
A denormalized schema requires rewriting both the schema and all queries the moment the number of players per game varies. A JSON blob requires loading all game data into memory to compute stats, burning Turso row reads on every stats request.

**How to avoid:**
Use a normalized two-table design from the start:
```sql
-- One row per game session
games (id, played_at, notes)

-- One row per player-game participation
game_players (id, game_id, player_name, deck_name, is_winner, was_screwed)
```

This structure handles any number of players per game, supports efficient `GROUP BY player_name` aggregations with proper indexes, and allows querying win rates, screwed rates, and deck performance without application-level aggregation.

**Warning signs:**
If the schema has columns like `player1`, `player2`, `player3` — stop and redesign before any data is inserted.

**Phase to address:** Game Tracking phase — critical to get right before the first INSERT. Schema changes on Turso require manual SQL via `turso db shell` (no `prisma migrate deploy`).

---

### Pitfall 6: Cloudflare Bypass via Proxy Is Unreliable If Not Using Render Mode

**What goes wrong:**
Sending a plain HTTP request through ScraperAPI (or similar proxy) bypasses IP-based blocks but does NOT bypass Cloudflare's JavaScript challenge. Cloudflare's bot protection requires JavaScript execution — it presents a challenge page that must run JS to generate a valid cookie. A proxy that just routes traffic without rendering JS will receive the challenge page HTML, not the product listings.

**Why it happens:**
ScraperAPI's default `render=false` mode just proxies the HTTP request with rotating IPs. Developers assume "proxy = bypass Cloudflare" but Cloudflare's JS challenge is not IP-based — it's JS execution-based.

**Consequences:**
The 401 Games scraper returns the Cloudflare challenge HTML instead of products. The HTML parser finds no `.product-card` elements and returns `[]`. The failure is identical to the current bug — just with an expensive proxy API call added.

**How to avoid:**
1. Use ScraperAPI with `render=true` (JavaScript rendering mode). This spins up a real headless browser in ScraperAPI's infrastructure, bypasses the JS challenge, and returns the rendered HTML. Costs more API credits but actually works.
2. Alternatively, use `@sparticuz/chromium` with proper browser fingerprinting — but Vercel's IP ranges are known to Cloudflare and may be pre-blocked regardless.
3. Add explicit Cloudflare challenge detection: check if the response HTML contains `cf-browser-verification` or `Just a moment` before returning empty results, and throw a typed error.

**Warning signs:**
The fetched HTML from 401 Games contains "Just a moment" or "Checking your browser" text. Response time is very fast (<200ms) for a product search that should take >1 second to render.

**Phase to address:** Scraper Fix phase — verify Cloudflare bypass actually works with a test script before integrating into the Next.js route.

---

## Moderate Pitfalls

---

### Pitfall 7: `prisma db push` Schema Drift on New Tables

**What goes wrong:**
The project uses `prisma db push` (not `prisma migrate deploy`) because Turso's HTTP protocol is incompatible with Prisma's migration engine. `prisma db push` applies schema changes directly without recording a migration history. Adding new tables (games, game_players) via `db push` in development creates them locally but provides no documented path to apply the same change to the production Turso database.

**Why it happens:**
`prisma db push` is convenient for iteration but does not generate SQL migration files. There is no artifact to apply to production. Developers end up manually diffing the schema or forgetting to apply changes to the production DB.

**Consequences:**
The app deploys with code that references a `games` table that does not exist in the production Turso database. Every game insert returns a Prisma error. The feature is broken in production but works in local dev.

**How to avoid:**
Establish a consistent workflow for this project:
1. Modify `schema.prisma` with new models.
2. Generate the SQL: `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > migration.sql`
3. Review the generated SQL.
4. Apply to production Turso: `turso db shell <db-name> < migration.sql`
5. Apply locally: `npx prisma db push` (or apply the same SQL to the local dev SQLite file).

This creates a documented, repeatable path to production without needing `prisma migrate deploy` support.

**Warning signs:**
"Table not found" or `PrismaClientKnownRequestError` with code `P2021` in production logs after adding new models.

**Phase to address:** Game Tracking phase — generate and apply the migration SQL before writing any game insertion code.

---

### Pitfall 8: Vercel Hobby Function Timeout on Scraper Routes (10s Without Fluid Compute)

**What goes wrong:**
Vercel Hobby default function timeout is 10 seconds when Fluid Compute is off. With Fluid Compute enabled (the new default for new projects), it extends to 300 seconds. The scraper routes need `export const maxDuration = 60` (or higher) set explicitly. If this is missing and Fluid Compute is somehow disabled, scraper routes time out at 10 seconds — not enough to launch Chromium, navigate, and render a page.

**Why it happens:**
Fluid Compute is enabled by default for new projects created after April 2025, but it can be disabled at the project level. Developers assume the 300s limit and never set `maxDuration` explicitly.

**Consequences:**
504 FUNCTION_INVOCATION_TIMEOUT on scraper routes in production. Works in development (no timeout). Chromium-based scrapers need 5-15 seconds minimum per request.

**How to avoid:**
Set explicit `maxDuration` on all scraper route handlers:
```typescript
export const maxDuration = 60; // seconds — safe for Hobby with Fluid Compute
```
Verify Fluid Compute is enabled in the Vercel project dashboard (Settings → Functions → Fluid Compute).

**Warning signs:**
Scraper returns 504 in production but works locally. Vercel function logs show "FUNCTION_INVOCATION_TIMEOUT."

**Phase to address:** Scraper Fix phase.

---

### Pitfall 9: Admin Sync History Stored in DB Grows Unboundedly

**What goes wrong:**
A sync history log table (for "last-updated per user" and "error log per sync") without a pruning strategy accumulates rows forever. With a nightly cron, 1 year = 365 sync log entries. This is trivially small, but if error details are stored as text blobs and the Turso free tier's 5GB storage limit is considered, unbounded growth is still bad practice.

**Why it happens:**
Developers add a logging table, ship it, and never add pruning logic because "it's only 365 rows a year."

**Consequences:**
The admin sync history UI shows years of history with no way to clear it. Storage grows. Query performance on the log table degrades (though trivially for this scale).

**How to avoid:**
Design the sync log table with a retention policy from the start:
- Store only the last N (e.g., 30) sync results per user.
- Add a `DELETE FROM sync_log WHERE created_at < datetime('now', '-30 days')` at the start of each sync.
- Or use a fixed-size ring buffer pattern: upsert to a table keyed by `(user_id, run_number % 30)`.

**Warning signs:**
Sync log table row count climbing linearly with no bound. Admin history UI shows 2 years of entries.

**Phase to address:** Admin Tooling phase.

---

### Pitfall 10: Error Alerting on Cron Failure Requires Explicit Implementation

**What goes wrong:**
Vercel does NOT send notifications when a cron job's function invocation fails or returns a non-2xx status. The Vercel dashboard "Cron Jobs" page shows invocation history and status, but there is no built-in alert to email or Slack. The nightly sync can silently fail for days without anyone noticing.

**Why it happens:**
Developers assume cron systems alert on failure (many managed cron services do). Vercel cron is a simple HTTP scheduler — it fires the request but does not monitor the outcome beyond logging the HTTP status.

**How to avoid:**
Two approaches that work on the free tier:

**Option A — Self-alert via email from the cron handler:**
On failure, POST to a free transactional email service (Resend free tier: 3,000 emails/month, or a simple Gmail SMTP call). The cron handler catches exceptions and sends an email before returning a 500.

**Option B — External uptime monitoring:**
Use a free uptime monitor (UptimeRobot free, Better Uptime free) to make a GET request to a health check endpoint immediately after the expected cron window. If the health check returns stale data, the monitor alerts.

Vercel does have an Alerts feature (Observability → Alerts) that can notify on function error spikes via email, Slack, or webhook. This is available on Hobby tier — configure it to alert on failed function invocations for the cron route path.

**Warning signs:**
Checking the Vercel Cron logs days after deployment and discovering multiple red (non-2xx) entries that went unnoticed.

**Phase to address:** Admin Tooling phase — set up alerting before relying on nightly cron in production.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing all game stats in a denormalized single table | Simpler initial queries | Can't efficiently query player/deck win rates; requires rewrite | Never — design normalized from the start |
| In-memory rate limiting | Zero dependencies, works locally | Provides no protection in production (multi-instance) | Never for production |
| Importing chart components without dynamic import | Simpler code | Chart library in initial bundle, slows all page loads | Never |
| Fetching player list on every autocomplete keystroke | Simpler implementation | Unnecessary API calls, flickering UI | Never for small static lists |
| No retention policy on sync log table | Faster to implement | Unbounded growth, admin UI becomes unusable | Only if log table will be pruned manually by the developer |
| ScraperAPI without render=true for Cloudflare sites | Cheaper API credits | Returns Cloudflare challenge page, not content | Never for Cloudflare-protected sites |
| Hardcoding player names in stats logic | Faster to build initial demo | Breaks when players are added; requires code change | Never |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Turso + new schema tables | Running `prisma db push` in dev, forgetting to apply changes to production Turso | Generate SQL with `prisma migrate diff`, apply via `turso db shell` |
| Upstash Redis for rate limiting | Using connection string format instead of REST URL | Upstash Redis on edge/serverless requires REST URL (`UPSTASH_REDIS_REST_URL`), not a redis:// connection string |
| ScraperAPI for Cloudflare bypass | Using default mode (no JS rendering) | Add `&render=true` parameter to ScraperAPI requests for Cloudflare-protected sites |
| Recharts in Next.js | SSR rendering chart components that use `window` | Always use `dynamic(() => import(...), { ssr: false })` for chart components |
| Vercel Cron alerting | Assuming Vercel notifies on failure | Vercel Cron does not alert on failure — implement self-alerting in the cron handler or use Vercel's Observability Alerts |
| Upstash free tier limits | Not accounting for rate limiter overhead | Each rate limit check costs 1-2 Redis operations; at 10,000/day free limit, a 10-user app has ample headroom |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unindexed GROUP BY on game_players | Stats page slow, Turso row reads spike | Index player_name, is_winner columns before inserting data | ~500 games (noticeable), ~5,000 games (slow) |
| Full stats recompute on every page load | Dashboard slow for multiple concurrent users | Cache computed stats with a TTL or trigger recompute on game insert | ~100 games × 5 concurrent users |
| Loading entire game history for client-side chart rendering | Large JSON payload sent to browser | Aggregate server-side, send only summary data to charts | ~1,000 games |
| Fetching all decks for autocomplete via API on each form row | Many API calls per game entry session | Load player/deck lists once at page mount, filter client-side | Immediate, even at 10 players |
| Sync log table with no pruning | Admin history page loads slowly | Add DELETE pruning at start of each sync | ~10,000 rows (noticeable), ~100,000 rows (slow) |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Rate limiting only on scraper routes, not on auth routes | Password brute-force on the login endpoint | Apply rate limiting to `/api/auth/*` routes as a priority — this is the highest-value target |
| Logging full player/deck names in function logs | Vercel function logs are visible to anyone with Vercel dashboard access (just the developer for this app, but worth noting) | Acceptable for a private friend-group app; no PII involved |
| Admin endpoints returning full sync error messages | Error messages may expose internal structure (DB schema, API keys in stack traces) | Sanitize error responses: log full error server-side, return generic message to client |
| Game data queryable without auth | Any game history is visible without login | Apply the same auth check (cookie verification) to all `/api/games/*` routes — same pattern as existing routes |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Requiring exact player name spelling in game entry | Typos create ghost players ("Alice" vs "alice" vs "Aliice") in stats | Autocomplete from the canonical player list; normalize to lowercase on insert |
| Showing raw win counts instead of win rates on stats dashboard | "Alice has 50 wins" is meaningless without knowing how many games she played | Always show win rate (wins / games played) as the primary metric; show raw counts as secondary |
| Stats dashboard with no "minimum games" filter | A player who played 1 game and won appears to have a 100% win rate | Filter out players/decks with fewer than N games (e.g., 3) from win rate charts, or show a confidence indicator |
| Spreadsheet-style game entry with no confirmation step | Accidental game submissions with wrong data are hard to undo | Add a simple review step or allow editing the most recent game |
| Showing "No data yet" on stats dashboard before first game | Users don't know if the feature is working or broken | Show a clear "Log your first game to see stats" empty state with a link to the game logging form |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Rate limiting:** Works in local dev (single instance) — verify it actually blocks requests when tested with concurrent calls against the deployed Vercel URL
- [ ] **Cloudflare bypass:** ScraperAPI call returns 200 — verify the response HTML actually contains product listings, not a Cloudflare challenge page
- [ ] **Game tracking schema:** Schema looks right in local dev — verify `turso db shell` shows the tables exist in the production database before merging
- [ ] **Stats charts:** Charts render with seed data — verify they handle zero-game state, single-game state, and all-tied state gracefully
- [ ] **Autocomplete:** Player dropdown works — verify it correctly handles players whose names are substrings of other player names
- [ ] **Sync history:** Last-updated timestamps display — verify they update correctly after a cron run (check actual Turso data, not just the UI)
- [ ] **Error alerting:** Alert email/webhook configured — verify by triggering a deliberate cron failure and confirming the alert fires
- [ ] **Admin Moxfield ID edit:** Edit form saves — verify the saved ID is actually used on the next sync, not the cached old value

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stats queries burning Turso row reads | LOW | Add indexes via `turso db shell`, add result caching; no data loss |
| Game schema designed wrong (denormalized) | HIGH | Requires schema migration, data migration script, rewrite of all query logic; do it before any real data is entered |
| Rate limiting not working in production | LOW | Remove in-memory code, add Upstash Redis; no data loss |
| Cloudflare bypass not working (proxy without render) | LOW | Switch ScraperAPI to `render=true` mode or add FlareSolverr; scraper was already broken |
| Chart bundle in initial payload | LOW | Add dynamic import wrapper around chart components; no data loss |
| Schema not applied to production Turso DB | LOW | Run `turso db shell < migration.sql`; takes minutes |
| Sync log table unbounded growth | LOW | Add `DELETE FROM sync_log WHERE ...` and run it manually once to clear old entries |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Unindexed stats aggregation burning Turso reads | Game Tracking (schema design) | Run `EXPLAIN QUERY PLAN` on all stats queries; check Turso dashboard row reads after 10 test games |
| In-memory rate limiting (no-op in production) | Rate Limiting phase | Test with two concurrent requests to the deployed URL; both should be limited |
| Chart library in initial bundle | Stats Dashboard phase | Check `next build` output; stats page bundle should be under 50KB without the chart library |
| Autocomplete making per-keystroke API calls | Game Tracking phase | Open Network tab during game entry; no requests should fire on typing if list is small |
| Denormalized game schema | Game Tracking phase (day 1) | Query `SELECT player_name, COUNT(*) FROM game_players GROUP BY player_name` — must work without app-level aggregation |
| Cloudflare bypass via non-rendering proxy | Scraper Fix phase | Log raw response HTML from ScraperAPI; must contain product listings, not "Just a moment" |
| `prisma db push` schema drift to production | Game Tracking phase | Check production Turso via `turso db shell` before deploying game tracking code |
| Cron failure with no alerting | Admin Tooling phase | Deliberately return a 500 from the cron route and verify an alert is received |
| Admin sync log growing unboundedly | Admin Tooling phase | Verify DELETE/pruning logic runs on each cron invocation |

---

## Sources

**Turso free tier limits (MEDIUM confidence — confirmed from multiple sources, March 2025 pricing update):**
- Turso pricing: https://turso.tech/pricing — 500M row reads/month, 10M row writes/month, 5GB storage on free tier
- Turso billing tips: https://turso.tech/blog/tips-for-maximizing-your-turso-billing-allowances-48a0fca163e9
- Turso billing docs: https://docs.turso.tech/help/usage-and-billing

**Vercel serverless rate limiting (HIGH confidence — multiple official and authoritative sources):**
- Vercel knowledge base on rate limiting: https://vercel.com/kb/guide/add-rate-limiting-vercel
- Upstash ratelimit guide: https://upstash.com/blog/edge-rate-limiting
- Upstash ratelimit library: https://github.com/upstash/ratelimit-js

**Vercel function limits (HIGH confidence — official Vercel docs):**
- Function limitations: https://vercel.com/docs/functions/limitations
- Fluid compute: https://vercel.com/docs/fluid-compute

**Vercel cron alerting (MEDIUM confidence — confirmed from Vercel docs):**
- Vercel alerts: https://vercel.com/docs/alerts
- Vercel cron troubleshooting: https://vercel.com/kb/guide/troubleshooting-vercel-cron-jobs

**Charting library bundle size (MEDIUM confidence — bundlephobia data + multiple community sources):**
- Recharts bundlephobia: https://bundlephobia.com/package/recharts
- Recharts GitHub (bundle size issue thread): https://github.com/recharts/recharts/issues/1417

**Cloudflare bypass (MEDIUM confidence — from ScraperAPI docs and community research):**
- ScraperAPI Cloudflare bypass: https://www.scraperapi.com/solutions/bypass-cloudflare/
- ScrapeOps Cloudflare bypass guide: https://scrapeops.io/web-scraping-playbook/how-to-bypass-cloudflare/

**Prisma + Turso migration workflow (MEDIUM confidence — from official Prisma docs and community):**
- Prisma Turso docs: https://www.prisma.io/docs/orm/overview/databases/turso
- Running migrations with Turso: https://www.unwrapdesign.com/blog/turso-prisma-migrations

---
*Pitfalls research for: v1.1 game tracking, stats dashboard, rate limiting, admin tooling on Next.js + Turso*
*Researched: 2026-04-09*
