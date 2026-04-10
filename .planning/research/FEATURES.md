# Feature Research

**Domain:** Private MTG friend-group app — game tracking, stats dashboard, scraper hardening, admin improvements
**Researched:** 2026-04-09
**Confidence:** HIGH (patterns verified against board game tracker apps, React ecosystem docs, Next.js patterns)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the friend group requires for v1.1 to be useful. Missing any of these = the milestone is incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Game log entry form | Core purpose of game tracking; without it nothing else works | MEDIUM | Spreadsheet-style row input; see detail below |
| Player autocomplete from shared list | Users don't want to type full names each time; avoids name inconsistency in stats | LOW | Combobox pattern; shared list seeded from Moxfield users |
| Winner picker from same player list | Must be consistent with player names to produce accurate win stats | LOW | Same combobox component, single-select |
| "Screwed" multi-select from player list | Screwed rate is a key stat; must capture zero or more players per game | LOW-MEDIUM | Multi-select combobox — distinct from single-select winner field |
| Deck name entry per winner | Win rate by deck is a primary stat; needs structured input, not free text | LOW-MEDIUM | Separate deck list; autocomplete + allow new entries |
| Win rate per player bar chart | First thing users will ask for; the primary stat in any game tracker | MEDIUM | Recharts BarChart, client component with "use client" |
| Win rate per deck bar chart | Deck power ranking among the friend group is high-value | MEDIUM | Same chart pattern as player win rate |
| Screwed rate per player chart | Specifically called out in requirements; a fun/memorable stat | MEDIUM | Bar or pie chart |
| Game history list | Users need to review and verify logged games | LOW | Sortable table, newest-first default |
| Admin sync history / last-updated timestamps | Admin must be able to verify nightly cron is working | LOW | Display `lastUpdated` per user in admin panel |
| Admin can edit Moxfield collection ID | Collection IDs change; admin must fix without deleting/re-adding user | LOW | Inline edit or modal; PATCH endpoint |

### Differentiators (Competitive Advantage)

Features that improve the experience but are not launch-blockers.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Seed player list from Moxfield users | Avoids re-entering the same names; feels connected to the existing app | LOW | On app load or admin action, pull users from DB, prepopulate player list |
| Deck list persisted across sessions | Decks don't change often; re-entering deck names each game is friction | LOW | Store distinct deck names in DB or localStorage; autocomplete from history |
| Date picker defaulting to today | Most games are logged same-day; saves a click | LOW | HTML date input default = today in JS |
| Win streak / current streak display | Fun social stat; encourages tracking | LOW-MEDIUM | Compute from ordered game log |
| Scraper health dashboard | Admin can diagnose failures without reading Vercel logs | MEDIUM | Table of recent scrape attempts with status, timestamp, error message |
| Error alerting on cron failure | Admin doesn't notice when nightly sync silently fails | MEDIUM | On catch in cron route, write failure to DB; admin panel shows last-N cron runs with status |
| Rate limiting on scraper API routes | Protects against accidental or malicious hammering of Puppeteer routes | LOW-MEDIUM | In-memory token bucket per IP; sufficient for 5-10 friend group without Redis |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time chart updates (WebSocket/SSE) | "Live" dashboard feels modern | Massive complexity for no real benefit; games are logged manually, not in real-time | Static fetch on page load or simple refresh button |
| Elo/rating system | BGStats and competitive trackers do this | Complex formula; misleading for a casual 5-10 person group with limited games | Simple win count / win rate percentage is more honest and readable |
| Global leaderboard with public sharing | Competitive social feature | The app is private by design; adding public endpoints contradicts the shared-password model | Keep it private; share screenshots instead |
| Redis for rate limiting | "Production-grade" rate limiting | Free tier constraint; Vercel Hobby serverless is stateless across instances anyway; adds a new paid service | In-memory Map with sliding window; sufficient for the actual user count |
| Per-deck commander tracking | MTG-specific deep stat | Adds significant schema complexity; commander data not in existing data model | Deck name is enough for v1.1; commander tracking is a v2 feature |
| External error alerting service (PagerDuty, Sentry) | "Real" alerting infrastructure | Overkill for a friend group; adds cost and setup time | Write cron failure status to Turso; admin panel reads it |
| Full game replay / notes field per game | Journaling feature | Scope creep; the app is a tracker not a journal | Keep it out of v1.1; add a plain text notes field in v2 if requested |

---

## Feature Details

### Game Tracking Input — Spreadsheet-Style Form

The core input pattern for game tracking in board game apps (BG Stats, NemeStats, Scored) is a single-screen form that captures one game session. For this group:

**Required fields per game:**
- Date (date picker, default today)
- Players (multi-select combobox — who played; the "pool" everyone else is drawn from)
- Winner (single-select combobox — must be one of the Players selected above)
- Winner's Deck (single-select combobox with free text — pick from existing decks or type new one)
- Screwed (multi-select combobox — zero or more from Players list; distinct from Winner)

**Key UX constraints:**
- The Players field is the source of truth for the session. Winner and Screwed dropdowns should filter to only show players selected in the Players field.
- The Screwed field is separate from Winner — a player can technically be both (screwed early but somehow won), though in practice this won't happen. Do not enforce mutual exclusion; keep it simple.
- New player names entered in the Players combobox should be saveable to the persistent player list so they appear in future sessions. This is distinct from Moxfield users — the player list includes anyone who plays, even if they don't have a Moxfield account.
- The deck list is separate from the player list. Deck names persist across games. A player can win with a new deck not previously seen.
- Seed the player list from existing Moxfield `User` records on first load. Allow adding new players outside Moxfield users.

**Implementation pattern:**

Use a controlled combobox component (shadcn/ui Combobox or a lightweight custom implementation over a `<datalist>` or `<input>` + filtered dropdown). For multi-select (Players, Screwed), display selected items as dismissible chips/tags inside or above the input field.

A `<datalist>` element is the simplest no-dependency approach: browser-native autocomplete, no JS dropdown management. However it has limited styling control and no multi-select support. For multi-select fields (Players, Screwed), a custom chip-input or a lightweight combobox component is required.

**Do not use react-select** — it is 80KB+ gzipped and brings in heavy dependencies for a feature that can be built with 50 lines of React state.

---

### Stats Dashboard — Chart Patterns

**Recommended library: Recharts** (MEDIUM confidence — verified against multiple sources).

Recharts reasons:
- SVG-based, composable React components — natural fit for the existing React/Next.js stack
- No canvas API means no server/client hydration mismatches
- Bundle: ~150KB minified, ~45KB gzipped. For a private app with 5-10 users, this is acceptable.
- `ResponsiveContainer` does not render server-side (needs DOM dimensions). Wrap chart components in a `"use client"` component. The page itself can remain a Server Component.
- Alternatives (Chart.js, ApexCharts) are canvas-based and require additional wrappers to work in Next.js App Router. Not worth the complexity.

**Chart types for this app:**

| Stat | Chart Type | Notes |
|------|-----------|-------|
| Win rate per player | Horizontal BarChart | Sort by win count descending; show game count as secondary label |
| Win rate per deck | Horizontal BarChart | Same pattern; decks with 1 win still show |
| Screwed rate per player | Horizontal BarChart or PieChart | Pie works if ≤6 players; bar scales better |
| Games per player (participation) | Horizontal BarChart | Shows who plays most often |
| Win rate over time | LineChart | Optional; needs enough data points to be meaningful |

**Stat computation:** All stats should be computed server-side in the API route or Server Component, not in the browser. Return pre-aggregated JSON to the client. The client only renders the chart.

---

### Rate Limiting — In-Memory for Serverless

**Context:** The scraper routes (`/api/scrapeLGS`) launch Puppeteer and consume significant CPU/memory. They should not be hammerable.

**Pattern:** In-memory sliding window per IP address, implemented as a module-level Map in the route file or a shared lib. This works within a warm serverless instance.

**Limitation:** In-memory state does not persist across cold starts or concurrent instances. On Vercel Hobby with 5-10 friends, this is acceptable — the risk of abuse is low and the cost of a Redis service is not justified.

**Implementation sketch:**
```typescript
const rateMap = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;  // 1 minute
const MAX_REQUESTS = 5;    // 5 scrapes per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_REQUESTS) return false;
  entry.count++;
  return true;
}
```

Apply this in the POST handler of `/api/scrapeLGS`. Return 429 with a `Retry-After` header on limit exceeded.

**Do not add rate limiting to non-scraper routes** (game log API, stats API) — these are fast DB queries and limiting them adds friction without meaningful protection.

---

### Cron Failure Alerting — DB-Backed Status Log

**Context:** The nightly cron runs without any admin visibility. If it fails, no one knows until they notice stale data.

**Pattern:** On each cron invocation (success or failure), write a row to a `CronLog` table with:
- `runAt` (DateTime)
- `status` ('success' | 'error')
- `message` (error string or null)
- `durationMs` (optional)

The admin panel reads the last N cron log entries and displays them in a table. No external service needed.

**Alert mechanism:** Since there's no email/push infrastructure, the "alert" is visual — the admin panel shows the last cron run status prominently. A red badge or banner when the last run was an error is sufficient.

**No external alerting services** (Sentry, PagerDuty) — overkill for this scale.

---

### Admin: Edit Moxfield Collection ID

**Pattern:** Inline edit on the existing user row in the admin panel. Click "Edit" next to a user's collection ID, an input replaces the display text, save triggers a PATCH to `/api/admin/users/[id]`.

**Schema change:** Add a PATCH handler to the existing `/api/admin/users/[id]/route.ts`. Update `moxfieldCollectionId` field. No new table needed.

---

### 401 Games Scraper Fix

This is a scraper hardening task. The root cause is Cloudflare blocking Vercel IPs. Options:

1. **ScraperAPI proxy** — already used for Moxfield based on commit history (`9b0e775`). Apply the same proxy to the 401 Games scraper. MEDIUM confidence this will work.
2. **curl fallback** — already implemented as a fallback pattern (same commit). Can be adapted.
3. **Disable permanently** — if proxy doesn't work, remove 401 Games from the UI rather than showing a broken scraper.

This feature is a fix, not new functionality. The implementation depends on the specific Cloudflare challenge type 401 Games uses.

---

## Feature Dependencies

```
Game tracking form
    └──requires──> Player list (shared across Players, Winner, Screwed fields)
    └──requires──> Deck list (separate from player list)
    └──requires──> Game model in DB (new Prisma model: Game)
    └──requires──> Player model in DB (new Prisma model: Player, separate from User)

Stats dashboard
    └──requires──> Game model with at least a few entries
    └──requires──> Recharts as client dependency
    └──enhances──> with more game history

Seed player list from Moxfield users
    └──requires──> existing User model (already exists)
    └──enhances──> game tracking form (pre-populates player dropdown)

Admin sync history
    └──requires──> lastUpdated field on User (already exists per schema)
    └──no new tables needed for basic version

Cron failure alerting
    └──requires──> new CronLog table in DB

Admin edit Moxfield ID
    └──requires──> PATCH endpoint on existing /api/admin/users/[id]
    └──no new tables needed

Rate limiting
    └──independent──> can be added to scraper routes at any point
    └──no DB or new dependencies needed

401 Games scraper fix
    └──independent──> self-contained in src/lib/scrapeLGS/scrape401.ts
```

### Dependency Notes

- **Player model vs User model:** The game tracking player list is NOT the same as the Moxfield User model. A player is anyone who participates in games — including friends without Moxfield. The User model is specifically tied to a Moxfield collection ID. A new `Player` table avoids polluting the User model with non-collection data. Players can optionally be linked to a User (`userId` nullable FK).
- **Game model:** New Prisma model with fields: `id`, `playedAt`, `winnerId` (FK to Player), `winnerDeckId` (FK to Deck), `players` (many-to-many join to Player), `screwedPlayers` (many-to-many join to Player).
- **Deck model:** New Prisma model: `id`, `name`. Stores unique deck names. Referenced from Game.
- **Stats require data:** The stats dashboard will be empty or meaningless until several games are logged. This is expected — show empty state charts gracefully.

---

## MVP Definition

### Launch With (v1.1)

Minimum needed for the milestone to be considered complete.

- [ ] Game entry form with date, players (multi-select), winner (single-select), winner deck (single-select + new), screwed (multi-select) — core feature
- [ ] Player list seeded from Moxfield users, with ability to add new names — makes game entry fast
- [ ] Deck list persisted across sessions — avoids re-typing deck names
- [ ] Game history list (newest-first table) — needed to verify logged data
- [ ] Win rate per player bar chart — first stat users will check
- [ ] Win rate per deck bar chart — second most important stat
- [ ] Screwed rate per player chart — specifically requested
- [ ] Admin: display `lastUpdated` per user in sync panel — closes the "is it working?" question
- [ ] Admin: edit Moxfield collection ID — unblocks admin workflow when IDs change
- [ ] Rate limiting on `/api/scrapeLGS` — basic protection before hardening
- [ ] Scraper error handling hardening (retry logic, better failure messages) — stability

### Add After Validation (v1.x)

- [ ] Cron failure alerting via DB-backed CronLog — add once core game tracking is working
- [ ] Scraper health dashboard with logging — admin quality-of-life; not blocking
- [ ] 401 Games scraper fix — investigate after core work ships; may not be fixable without paid proxy
- [ ] Win streak display — fun but needs game history to be meaningful
- [ ] Participation rate per player chart — nice-to-have

### Future Consideration (v2+)

- [ ] Games per location / venue tracking — group plays in different places
- [ ] Commander/deck commander field — MTG-specific depth; significant schema complexity
- [ ] Export game log to CSV — data portability, low demand for small group
- [ ] Notes field per game — journaling; may never be needed

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Game entry form (date/players/winner/deck/screwed) | HIGH | MEDIUM | P1 |
| Player list (shared, seeded from Moxfield users) | HIGH | LOW | P1 |
| Deck list (persistent, autocomplete) | HIGH | LOW | P1 |
| Win rate per player bar chart | HIGH | LOW-MEDIUM | P1 |
| Win rate per deck bar chart | HIGH | LOW-MEDIUM | P1 |
| Screwed rate per player | HIGH | LOW | P1 |
| Game history list | MEDIUM | LOW | P1 |
| Admin: edit Moxfield collection ID | MEDIUM | LOW | P1 |
| Admin: sync history / last-updated per user | MEDIUM | LOW | P1 |
| Rate limiting on scraper routes | MEDIUM | LOW | P1 |
| Scraper error handling hardening | MEDIUM | MEDIUM | P1 |
| Cron failure alerting (DB-backed) | MEDIUM | LOW-MEDIUM | P2 |
| Scraper health dashboard | MEDIUM | MEDIUM | P2 |
| 401 Games scraper fix | MEDIUM | HIGH (uncertain) | P2 |
| Win streak display | LOW | LOW | P3 |
| Participation rate chart | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for v1.1 launch
- P2: Should have, add when possible within the milestone
- P3: Nice to have, future milestone

---

## Competitor / Reference Analysis

These are not competitors but reference points for UX patterns in the game tracking space.

| Feature | BG Stats App | NemeStats | Our Approach |
|---------|--------------|-----------|--------------|
| Player list | Global persistent, linked to BGG accounts | Group-based, invite players | Seeded from Moxfield users + allow new; stored in DB |
| Game entry | Full-screen wizard, one step per field | Single-page form | Single-page form; spreadsheet-style row |
| Win tracking | Win, loss, cooperative win, cooperative loss | Win/Nemesis model | Win / screwed / played |
| Stats | Deep: Elo, H-index, streaks, play time | Win%, Nemesis stats, engagement | Win rate, deck win rate, screwed rate — simple and honest |
| Chart types | Bar, pie, line, spider | Bar, pie | Bar (primary), pie (secondary for ≤6 players) |
| Deck tracking | Per-game, links to BGG | Not deck-focused | Per-game with persistent deck list |

**Insight from BG Stats:** The app works best when the player list is curated and consistent. The biggest source of bad data is name inconsistency ("Alex" vs "Alexander" vs "Al"). Autocomplete-enforced names from a shared list is the most important UX decision in game tracking.

---

## Sources

- BG Stats App — https://www.bgstatsapp.com/ (reference for game tracking patterns)
- NemeStats — https://nemestats.com/ (reference for win/stat patterns)
- Recharts — https://recharts.org/ (charting library, MEDIUM confidence)
- shadcn/ui Combobox — https://ui.shadcn.com/docs/components/radix/combobox (autocomplete pattern)
- Baymard Autocomplete UX — https://baymard.com/blog/autocomplete-design (autocomplete best practices)
- LogRocket React Chart Libraries 2025 — https://blog.logrocket.com/best-react-chart-libraries-2025/ (library comparison)
- In-memory rate limiter pattern — https://www.javacodegeeks.com/building-an-in-memory-rate-limiter-in-next-js.html (rate limiting without Redis)
- Vercel Cron Jobs — https://vercel.com/docs/cron-jobs (cron behavior on Hobby tier)

---
*Feature research for: MTG friend-group app — v1.1 game tracking & polish milestone*
*Researched: 2026-04-09*
