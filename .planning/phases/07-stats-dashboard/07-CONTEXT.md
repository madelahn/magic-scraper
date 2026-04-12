# Phase 7: Stats Dashboard - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a new `/stats` route — a Recharts-based visual stats dashboard that reads Phase 6 game data via the existing `GET /api/games` and computes eight stats (STAT-01 through STAT-08) client-side. A single new page (`src/app/stats/page.tsx`), a new header nav link, and pure-function stat helpers in `src/lib/stats.ts`. No new API route, no new DB queries, no filter toolbar, no custom empty-state page. Layout is responsive: full-width charts on desktop, compact summary cards with tap-to-expand on mobile. STAT-07 ("stats update immediately after a new game is submitted without a full page reload") is satisfied by client-side route navigation back to `/stats` plus a window-focus refetch listener.

The dashboard consumes — and does not change — everything from Phase 5 (schema), Phase 6 (game CRUD, `/api/games` endpoint), and Phase 6.1 (`isImported` flag semantics). It integrates exclusively on the read side.

Out of phase: any change to Phase 6 CRUD behavior, any new API route, any filter toolbar on the dashboard, date-range scoping, CSV export, per-player persistent colors, head-to-head matchups, Elo ratings, and real-time WebSocket updates (all deferred or v2).

</domain>

<decisions>
## Implementation Decisions

### Page Location & Navigation

- **D-01:** **New top-level `/stats` route.** New client component at `src/app/stats/page.tsx`. Matches the existing top-level routing pattern (`/games`, `/checkDeck`, `/SearchLGS`). Keeps `/games` focused on CRUD and `/stats` focused on viewing; no tab-state complexity inside `/games`.
- **D-02:** **Add a "Stats" link to the header nav.** Edit `src/app/components/header.tsx` `navLinks` array to insert `{ href: "/stats", label: "Stats" }`. Placement: after "Games" and before "LGS Search" to preserve the existing left-to-right order. Both desktop and mobile nav consume the same `navLinks` array, so one edit covers both.
- **D-03:** **Shared-password middleware covers `/stats` automatically.** The existing auth middleware matcher already protects all non-login routes; no middleware change required. Verify the matcher path pattern during planning.

### Page Layout (Responsive)

- **D-04:** **Single vertical scroll page with section headings.** Top-down order: **Player Overview** (radar chart) → **Win Rates** (player win rate bar + deck win rate bar) → **Breakdowns** (two pie charts) → **Frequency** (weekly frequency line + most-likely-to-play bump chart). No tabs, no collapsible panels, no side navigation. Print-friendly and matches the existing `/games` single-page flow.
- **D-05:** **Desktop: full-width charts, one per row.** Each chart occupies the page container's full width on `sm:` and up. Prioritizes label legibility over density — the user has ~15 players and long deck names, so squashing charts into side-by-side columns on desktop would compromise readability.
- **D-06:** **Mobile: compact summary cards with tap-to-expand chart view.** On narrow viewports, each stat renders as a small card showing a one-line summary (e.g., "Player win rate — top: Amirali 62%, 4 players ranked") with a tap/click affordance that expands the full Recharts chart inline. Collapsed by default to prevent unreadable tiny-chart mobile rendering. Implementation: `useState<Set<string>>` tracking which stat IDs are expanded, with `md:block` unconditional rendering on desktop.
- **D-07:** **Breakpoint: Tailwind `md:` or `sm:` — planner picks whichever matches the existing codebase convention** (`src/app/games/page.tsx` uses `sm:` for grid, `src/app/components/header.tsx` uses `sm:` for the nav — `sm:` is the established pattern, use it).

### Data Fetching & Compute

- **D-08:** **Reuse existing `GET /api/games`.** No new endpoint. The stats page fetches on mount using the same pattern as `src/app/games/page.tsx`: `useEffect` → `fetch('/api/games')` → `setGames(data.games)`. Phase 6 D-12 established load-all as sufficient for ≤ a few thousand rows; Phase 7 inherits this without change.
- **D-09:** **All stats computed client-side via pure helpers in `src/lib/stats.ts`.** New file. Exports one pure function per stat group, each taking `games: Game[]` (the response shape from `/api/games`) and returning a plain object or array ready for a Recharts component. Functions are unit-testable without React.
- **D-10:** **Stats helper function names and signatures (planner may adjust exact names):**
  - `computePlayerWinRate(games): { player: string; wins: number; played: number; rate: number }[]` — STAT-01
  - `computeDeckWinRate(games): { deck: string; wins: number; played: number; rate: number }[]` — STAT-02 (imported-excluded)
  - `computeScrewedRate(games): { player: string; screwed: number; played: number; rate: number }[]` — STAT-03 (subsumed by radar, still exported for reuse)
  - `computeWeeklyFrequency(games): { weekStart: string; gameCount: number }[]` — STAT-04
  - `computeMostLikelyToPlay(games): { player: string; participations: number; rate: number }[]` — STAT-05 (lifetime snapshot)
  - `computeMostLikelyToPlayBump(games): { weekStart: string; ranks: { player: string; rank: number }[] }[]` — STAT-05 (bump over time)
  - `computeWinsByPlayerPie(games): { player: string; wins: number }[]` — STAT-06a
  - `computeGamesByDeckPie(games): { deck: string; games: number }[]` — STAT-06b (imported-excluded)
  - `computePlayerRadar(games): { player: string; played: number; wins: number; screwed: number; wonByCombo: number }[]` — radar source (D-22); wonByCombo counts imported-excluded
- **D-11:** **Page component memoizes every stat.** `const playerWinRate = useMemo(() => computePlayerWinRate(games), [games]);` repeated for each stat. Zero re-computation on renders that don't change the underlying games array.

### STAT-07 Reactive Updates

- **D-12:** **Mount-time fetch + window-focus refetch.** The stats page fetches on mount (standard pattern). Additionally, the effect registers a `window.addEventListener('focus', refetch)` listener and cleans it up on unmount. When the user submits a new game via `/games/new` and is routed back to `/stats` (or switches tabs and returns), the focus event triggers a fresh fetch.
- **D-13:** **Router navigation naturally triggers a fresh fetch.** When `/games/new` calls `router.push('/stats')` after a successful POST, Next.js client-side navigation unmounts the `/games/new` page and mounts `/stats` fresh — the `useEffect` fires and data refetches. This alone satisfies STAT-07 for the happy path.
- **D-14:** **No polling, no BroadcastChannel, no manual refresh button.** Polling costs Turso reads with zero benefit for a ≤10-user private app; BroadcastChannel complexity is unjustified; a manual refresh button would violate the "immediate" spirit of STAT-07.
- **D-15:** **Loading and error states follow existing pattern.** `isLoading`, `error`, and the `{error && <p>}` / `{isLoading && <p>Loading...</p>}` pattern from `src/app/games/page.tsx` are reused verbatim.

### Imported-Game Semantics (Inherited from Phase 6.1)

- **D-16:** **Phase 6.1 D-06 applies: deck-based and combo-related stats EXCLUDE imported games.**
  - `computeDeckWinRate` filters `games` to `!g.isImported` before computing (STAT-02)
  - `computeGamesByDeckPie` filters to `!g.isImported` (STAT-06b)
  - The radar chart's "Won by Combo" axis (D-22) counts combo wins from `!g.isImported` games only, even though other axes on the same radar include imported games
- **D-17:** **Phase 6.1 D-07 applies: player-level stats INCLUDE imported games.**
  - `computePlayerWinRate` uses all games (STAT-01)
  - `computeScrewedRate` uses all games (STAT-03)
  - `computeWeeklyFrequency` uses all games (STAT-04)
  - `computeMostLikelyToPlay` (both lifetime and bump) use all games (STAT-05)
  - `computeWinsByPlayerPie` uses all games (STAT-06a)
  - Radar axes "Played", "Wins", "Screwed" include imported games; only the "Won by Combo" axis is imported-excluded
- **D-18:** **Import-aware filtering is a per-chart (and per-axis on the radar) concern, not a global toggle.** Do NOT add a "show imported" switch to the dashboard. 06.1 D-02 established the flag is hidden from all UI surfaces; Phase 7 honors that.

### STAT-08 Zero-Data Rule

- **D-19:** **Strict per-chart 0-exclusion.** Each chart's pure helper filters out entries with zero entries in that chart's denominator:
  - `computePlayerWinRate` omits players with `played === 0`
  - `computeDeckWinRate` omits decks with `played === 0` (after imported-exclusion)
  - `computeScrewedRate` omits players with `played === 0`
  - `computeMostLikelyToPlay` omits players with `participations === 0`
  - Pie charts omit zero-value slices
  - Radar omits players with `played === 0`
  - Weekly frequency is time-indexed, not player/deck-indexed — STAT-08 doesn't apply directly (see D-21)
- **D-20:** **No global minimum threshold, no user-facing "min games" input.** STAT-08 is strict 0-exclusion. If a low-sample chart ever becomes visually noisy, a later phase can add a minimum-games filter.

### STAT-04 Weekly Frequency

- **D-21:** **Bucket by ISO week starting Monday, using UTC day of `game.date`.** Matches the existing `formatDate` convention in `src/app/games/page.tsx` which explicitly renders game dates in UTC to avoid timezone day-shift. Week key format: ISO 8601 week start (e.g., `2026-W14` or the Monday date `2026-03-30`) — planner picks whichever Recharts handles cleaner.
- **D-22a:** **Show all weeks between the earliest and latest game date, including empty weeks (value = 0), if the LineChart renders them cleanly.** If the visual result is too noisy (many dry spells across a long history), fall back to skipping empty weeks entirely. User's guidance: "depending on the type of display. If it can show all weeks between first and last, do that. Otherwise skip weeks without any games." Planner makes the final call during implementation.
- **D-22b:** **Rendered as a Recharts `LineChart` with a single data line.** One value per week (game count).

### STAT-05 Most-Likely-to-Play

- **D-23:** **Formula: (games a player participated in) / (total games in dataset).** Rendered as a percentage. Imported games are counted in both numerator and denominator (D-17). Ties are allowed — no tie-breaking.
- **D-24:** **Primary render: bump chart over time, placed beside or just below the weekly-frequency LineChart in the Frequency section.** Each player is one line. Y-axis is rank (1 = highest cumulative participation rate up through that week). The bump chart uses Recharts `LineChart` with rank-as-Y and an inverted Y-axis, or equivalent. Bucket granularity matches STAT-04 (ISO week).
- **D-25:** **Rank ties:** if two players have identical participation rate through a given week, they share the same rank. Planner decides visual handling (stacked marker, tiny offset, or identical lines overlapping).

### STAT-03 Screwed Rate & Player Overview Radar

- **D-26:** **A single Recharts `RadarChart` visualizes four axes per player: `Played`, `Wins`, `Screwed`, `Won by Combo`.** One polygon per player. This is the "Player Overview" section at the top of the dashboard (D-04).
- **D-27:** **Radar axis semantics:**
  - **Played**: total games participated in (imported INCLUDED)
  - **Wins**: total wins (imported INCLUDED)
  - **Screwed**: total times marked screwed (imported INCLUDED)
  - **Won by Combo**: total wins where `wonByCombo === true` AND `!g.isImported` (imported EXCLUDED per D-16)
- **D-28:** **Normalization:** each axis is normalized to its own 0..1 range (per-axis max). Prevents axes with large values from dominating the shape. Exact normalization (per-axis max vs shared max) is Claude's Discretion during planning.
- **D-29:** **The radar does NOT replace STAT-01's bar chart.** STAT-01 explicitly requires "a bar chart of win rate per player" — the bar chart stays (D-32). The radar is additive and sits in a separate section. The radar's "Screwed" axis is the primary visualization for STAT-03 (the requirement text says "a chart" — type not specified).

### Chart-Type Mapping

- **D-30:** **Recharts stays the primary chart library (locked in STATE.md).** All charts below are implementable via native Recharts components.
- **D-31:** **If during implementation the planner decides a Recharts workaround looks genuinely bad** (e.g., the rank-based bump chart is ugly with inverted Y, or the radar axis scaling is unreadable), adding a second chart library (e.g., visx or nivo) is acceptable, provided any new chart component is still dynamically imported with `{ ssr: false }`. The user explicitly delegated this call to Claude: *"I think you decide if rechart constraint workarounds would be able to display as nicely as we want. If not, feel free to add a second lib, if not, feel free to just stay on recharts."* Preference: stay on Recharts unless forced off.
- **D-32:** **STAT-01 player win rate → Recharts `BarChart`, horizontal orientation.** One bar per player, ranked by win rate (highest first). Horizontal avoids label rotation for long player names.
- **D-33:** **STAT-02 deck win rate → Recharts `BarChart`, horizontal orientation, one bar per deck, ranked by win rate.** Flat per-deck view. Explicitly NOT a player-grouped stacked breakdown: user raised the scale concern "each player may have up to like 10 decks, which would be really hard to show with that 12 players × 10 decks" — a 15×10 matrix would be unreadable. If the deck count grows past ~20, the planner may cap at top N or add a "show all decks" expand affordance (Claude's Discretion).
- **D-34:** **STAT-03 screwed rate → the Radar chart (D-26) is the primary visualization.** The `computeScrewedRate` helper is still exported so a future chart can reuse it without rebuilding the math, but there is no separate screwed-rate bar chart on the dashboard.
- **D-35:** **STAT-04 weekly frequency → Recharts `LineChart`** (D-22b).
- **D-36:** **STAT-05 most-likely-to-play → bump chart via Recharts `LineChart` with rank-on-Y** (D-24). Placed in the Frequency section.
- **D-37:** **STAT-06 pie breakdowns → two Recharts `PieChart` components — "Wins by player" and "Games by deck".** Placement within the Breakdowns section (paired side-by-side or one per row on desktop) is Claude's Discretion. Mobile: both collapse into the standard summary-card pattern (D-06).
- **D-38:** **All charts imported via `dynamic(() => import('recharts'), { ssr: false })` or equivalent per-chart dynamic imports.** Never import Recharts in a Server Component. Stats page has `"use client"` at the top.

### Color Scheme

- **D-39:** **Palette of 15+ visually distinct colors.** Required to cover both radar polygons and pie slices without color collision — the friend group has "somewhere upwards of 15 players". Planner picks a palette (e.g., Tailwind's extended palette at 500/600 weights, d3-scale-chromatic `schemeTableau20`, or a hand-tuned 20-color ramp).
- **D-40:** **No duplicate colors across the palette.** Visually distinct colors only.
- **D-41:** **Colors do NOT change between light and dark mode.** User explicit: *"colors in the graphs don't necessarily have to change so try to choose colors that work either way"*. Picked colors must have sufficient contrast on both the light `bg-surface` and the dark `bg-surface` Tailwind tokens.
- **D-42:** **Non-data chart elements DO adapt to light/dark mode** — axis lines, tick labels, tooltip backgrounds, grid lines, and legend text use Tailwind CSS variables (`text-foreground`, `text-muted`, `border-border`, `bg-surface`). The existing `ThemeToggle` infrastructure in `src/app/components/theme-toggle.tsx` already toggles these variables globally; chart elements inherit via Tailwind utility classes.
- **D-43:** **Per-player consistent color across charts is NOT in Phase 7 scope.** User explicitly deferred: *"we could tie colors to each player at the top that would adjust that, but that's a lot of overhead. Do not worry about that right now, write it for deferred"*. A later phase can add a player→color map.

### Empty State

- **D-44:** **No dedicated empty-state page for the dashboard.** If 0 games exist, the stats page renders each chart's own empty slot (a short "No data yet" label per chart, or Recharts' default empty rendering — planner's discretion). No full-page overlay, no "log your first game" CTA — that CTA already lives on `/games` and doesn't need duplication here.
- **D-45:** **Partial-data handling:** if only 1 game exists, or only imported games exist, charts render whatever they can (e.g., the radar shows one polygon, deck charts may be empty if only imported games). No special messaging.

### No Dashboard Filters

- **D-46:** **Dashboard shows LIFETIME stats only.** No date-range filter, no player-subset filter, no player-count filter. No reuse of the 06.1 `/games` filter toolbar. User explicit: *"Ignore dashboard filters, stats will always show lifetime stats (minus fields that are missing from imported data...)"*.
- **D-47:** **The `isImported` filtering encoded in D-16 / D-17 is the only "filter" logic on the dashboard** — and it's per-chart, not a user-facing toggle.

### Claude's Discretion

- Exact Tailwind spacing, typography, and border/shadow classes for section headings and chart cards (follow existing `/games` page patterns: `container mx-auto px-4 py-6`, `text-2xl font-bold text-foreground` for headings, `border-border bg-surface` for cards)
- Recharts `Tooltip` styling to match light/dark mode tokens
- Radar axis normalization strategy (per-axis max vs shared max) and visual tick treatment
- Bump chart rank-tie visual handling
- Pie chart placement on desktop (paired side-by-side vs stacked full-width)
- Chart container heights (must remain readable when mobile-expanded and desktop full-width)
- Mobile summary-card content: just a number, a sparkline, or a short textual top-N string (planner decides per chart)
- Exact wording of per-chart "No data yet" labels
- Treatment of very long player / deck names in axis labels (truncate + ellipsis vs rotate vs word-wrap)
- Whether to display a tiny "last fetched at" timestamp on the page
- Deck chart cap / top-N strategy if deck list grows large — no cap for initial implementation unless renderable count actually exceeds ~20
- Which nav position the "Stats" link takes (suggested: between Games and LGS Search)
- Exact color palette (must satisfy D-39 through D-42); planner picks from options like Tableau 20, Observable Plot's categorical schemes, or a custom Tailwind-derived ramp
- Whether STAT-05 also shows a secondary lifetime "snapshot" bar alongside the bump chart or relies on the bump chart alone
- Exact file split: one `src/app/stats/page.tsx` with inline chart components, or one file per chart under `src/app/stats/charts/` — planner chooses based on size after writing
- Unit test coverage depth for `src/lib/stats.ts` helpers (the `.planning/codebase/TESTING.md` conventions apply; Phase 6 `06-02-combobox-component-PLAN.md` and similar established the pattern of pure-helper unit tests)

### Folded Todos

None — no backlog todos were surfaced for Phase 7.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level Specs
- `.planning/PROJECT.md` — Vision, v1.1 milestone scope, no-new-dependencies ethos (the Recharts exception is already locked in STATE.md), "upwards of 15 players" group size implied by the color palette requirement
- `.planning/REQUIREMENTS.md` — STAT-01 through STAT-08 (this phase's requirements), v2 deferred items (STAT-09 Elo, STAT-10 head-to-head, STAT-11 CSV export, STAT-12 real-time) so the planner doesn't accidentally build them
- `.planning/ROADMAP.md` §"Phase 7: Stats Dashboard" — phase goal, success criteria, dependency on Phase 6
- `.planning/STATE.md` §"Decisions" — **the locked decision `Charts: Recharts with dynamic(() => import(...), { ssr: false }) — never import in Server Component`** (this is a Phase 7 pre-requisite, not something to re-decide)

### Phase 5 Foundation (schema)
- `.planning/phases/05-schema-migration-foundation/05-CONTEXT.md` — Schema decisions for `Game`, `GameParticipant` (no separate Player table, free-text `playerName`, cascade delete on `gameId`)
- `.planning/codebase/SCHEMA.md` — Live schema design rationale and index justifications
- `prisma/schema.prisma` — `Game`, `GameParticipant`, `User` models; `isImported Boolean @default(false)` column landed in Phase 6.1

### Phase 6 Decisions (directly consumed)
- `.planning/phases/06-game-tracking-core/06-CONTEXT.md` — Especially:
  - **D-09:** seed-once client-side filter (same pattern applied here for stats helpers)
  - **D-12:** load all games, client-side sort/filter (the foundation of Phase 7's compute strategy)
  - **D-16:** `GET /api/games` response shape (`{ games: (Game & { participants: GameParticipant[] })[] }`) — stats helpers consume this
  - **D-18:** JSON-only responses, `NextResponse.json(...)` pattern (no change in Phase 7, just reference)

### Phase 6.1 Decisions (directly consumed — critical for imported-game semantics)
- `.planning/phases/06.1-game-differentiation-and-sanitization/06.1-CONTEXT.md` — Especially:
  - **D-01:** `isImported Boolean @default(false)` column on `Game`
  - **D-02:** flag is hidden from every UI surface (Phase 7 continues this — no badge, no filter chip)
  - **D-06:** combo-rate and deck-based stats EXCLUDE imported games → drives D-16 here
  - **D-07:** player / screwed / frequency / participation stats INCLUDE imported games → drives D-17 here
  - **D-08:** imported games remain fully visible in the `/games` list (not relevant to stats, but establishes the "uniform on the list, filtered in stats" pattern)

### Live Schema & Validators (read-only reference)
- `prisma/schema.prisma` — Game, GameParticipant field types; planner does NOT modify this phase
- `src/lib/validators.ts` — `gameSchema`, `GameInput` type (not consumed by stats directly but the `Game` response shape mirrors it)

### Existing Code Phase 7 Touches or Mirrors
- `src/app/games/page.tsx` — **Reference pattern.** Client component, `useEffect` fetch, `useState` + `useMemo`, loading/error states, Tailwind utility classes. Stats page mirrors this shell. The `deriveWinnerOptions` / `derivePlayerOptions` / `matchesAllFilters` helpers in this file show the "pure helper + `useMemo` in page" pattern Phase 7 extends.
- `src/app/games/game-form.tsx` — The form that POSTs to `/api/games` and then `router.push`es. Phase 7's STAT-07 refetch depends on this navigation triggering a fresh mount of `/stats`; no change to this file.
- `src/app/components/header.tsx` — **Nav edit target (D-02).** Add one entry to the `navLinks` array.
- `src/app/components/theme-toggle.tsx` — Reference for how light/dark mode is toggled; Phase 7 color decisions rely on this infrastructure.
- `src/app/api/games/route.ts` — **Unchanged in Phase 7.** Reference for the exact response shape stats helpers consume.
- `src/app/checkDeck/page.tsx` — Canonical non-games client component pattern; secondary reference if `/games/page.tsx` is insufficient.

### Codebase Conventions
- `.planning/codebase/CONVENTIONS.md` — Client component pattern, Tailwind inline utility classes, error handling style (`console.error` + `NextResponse.json({ error }, { status })`). All Phase 7 code follows these.
- `.planning/codebase/ARCHITECTURE.md` — App Router layout, middleware auth flow. `/stats` inherits middleware protection for free.
- `.planning/codebase/STRUCTURE.md` — File locations: `src/app/stats/page.tsx`, `src/lib/stats.ts`, optional `src/app/stats/charts/*.tsx` per-chart component files.
- `.planning/codebase/STACK.md` — Next.js 16 / React 19 / Tailwind v4 / Prisma + libsql / Recharts versions. Planner verifies Recharts is already a dependency (it is — locked in STATE.md).
- `.planning/codebase/TESTING.md` — Existing test approach; `src/lib/stats.ts` pure helpers should get unit tests following the same pattern as Phase 6's combobox helpers and rate-limit helper tests.

### Recharts Documentation (external)
- https://recharts.org/en-US/api — primary API reference. Planner / executor MUST read the current docs for `BarChart`, `LineChart`, `PieChart`, `RadarChart`, `ResponsiveContainer`, `Tooltip`, `Legend`, `dynamic import usage`. Recharts API changes between versions; do NOT rely on memorized signatures.
- https://recharts.org/en-US/examples — working examples for each chart type; start from these rather than composing from scratch.

### No New External ADRs
Phase 7 introduces no new external specs. All decisions are captured in this file plus the Phase 5/6/6.1 context files, the codebase map, and the Recharts docs linked above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/app/games/page.tsx`** — Full reference for the client-side fetch + `useMemo`-derived stats pattern. The Phase 6.1 `deriveWinnerOptions`, `derivePlayerOptions`, and `matchesAllFilters` pure helpers are the exact shape Phase 7's stats helpers mirror (pure function of `games: Game[]` → derived array). Stats page imports `Game` and `Participant` types from this module so the shape stays in sync.
- **`GET /api/games` (`src/app/api/games/route.ts`)** — Returns every game with nested participants ordered newest-first. Phase 7 consumes this response unchanged. Already rate-limited (Phase 6 D-24 established the 30/60s threshold for game routes — the stats page's single mount fetch and focus-refetch stay well under this).
- **`src/app/components/header.tsx`** — `navLinks` array is the single integration point. One insert, both desktop and mobile menu pick up the new link automatically.
- **`src/app/components/theme-toggle.tsx`** — Light/dark mode infrastructure. Chart axis/label/tooltip colors use the same Tailwind CSS variables this toggle already manages; no additional theme plumbing needed.
- **Tailwind v4 theme tokens** used throughout the app: `bg-surface`, `bg-surface-hover`, `text-foreground`, `text-muted`, `text-accent`, `border-border`, `bg-accent`, `bg-accent-muted`. Charts inherit these via Tailwind utility classes on the wrapper divs.
- **Phase 6 D-12 fetch-once-and-filter pattern** — Already proven in `/games`. Phase 7 is a direct reuse: fetch once, compute everything in memory.

### Established Patterns
- **Client component with local state** — No SWR / React Query / Zustand / Redux anywhere in the codebase. Stats page manages `games`, `isLoading`, `error`, and expanded-card `Set<string>` (mobile) as `useState`. Matches Phase 6 exactly.
- **Module-level pure helpers** — Phase 6.1 landed `deriveWinnerOptions` / `matchesAllFilters` as pure exports from `src/app/games/page.tsx`. Phase 7 goes one step further: helpers live in their own file (`src/lib/stats.ts`) because they're reused across multiple chart components and unit-tested.
- **`useMemo` for derived state** — Phase 6.1 D-22 established this pattern; Phase 7 uses it for every stat computation.
- **Tailwind inline utility classes** — No CSS modules, no styled-components. Chart container styling uses `className="..."` strings.
- **Error handling** — `try/catch` in the fetch effect, `setError(...)` on failure, `{error && <p className="text-red-600">...}` render.
- **Dynamic imports for heavy client-only libs** — Phase 7 is the first enforcement of this pattern (Recharts is the first bundle-bloat concern). All chart components are imported via `dynamic(() => import('./RadarCard'), { ssr: false })` or `dynamic(() => import('recharts').then((m) => m.RadarChart), { ssr: false })` depending on the chosen extraction strategy.

### Integration Points
- **New file: `src/app/stats/page.tsx`** — Client component. `"use client"` at top. Imports stats helpers from `@/lib/stats` and chart components (either inline `dynamic` imports of Recharts primitives or wrapper components from `src/app/stats/charts/*.tsx`).
- **New file: `src/lib/stats.ts`** — Pure helper functions. No React imports. Consumes `Game[]` type (imported from `src/app/games/page.tsx` or a new shared type file — planner picks).
- **Edited file: `src/app/components/header.tsx`** — Add `{ href: '/stats', label: 'Stats' }` to `navLinks`. One-line edit.
- **Optional new files: `src/app/stats/charts/PlayerRadarCard.tsx`, `PlayerWinRateBar.tsx`, `DeckWinRateBar.tsx`, `WeeklyFrequencyLine.tsx`, `MostLikelyBump.tsx`, `WinsByPlayerPie.tsx`, `GamesByDeckPie.tsx`** — Per-chart components if the planner chooses to split for readability. Alternative: all inline in `page.tsx`. Planner decides after scaffolding.
- **Tests: `src/lib/stats.test.ts`** — Unit tests for every stats helper. Follows the existing Phase 6 test file pattern (`src/lib/rateLimit.test.ts`, `src/app/components/combobox.test.tsx`).
- **No changes to**: `src/app/api/games/route.ts`, `prisma/schema.prisma`, `src/lib/validators.ts`, `src/lib/prisma.ts`, or any middleware file.

</code_context>

<specifics>
## Specific Ideas

- **Radar chart with 4 axes is the user's explicit vision.** *"Radar chart that encapsulates everything would be awesome. Played, Wins, Screwed, and Won by Combo (for each win that player has with a combo)."* Implement this as the primary "Player Overview" visualization at the top of the dashboard. Do not replace it with a simpler screwed-rate bar chart — STAT-03 is specifically the Screwed axis of this radar.
- **Bump chart for STAT-05, placed beside weekly frequency.** User explicit: *"Alternative for most likely to play is a bump chart showing who is most likely to play over time (should go near or be beside weekly frequency since they will follow a similar timeline)."* Both live in the Frequency section.
- **Deck scale concern is real.** *"each player may have up to like 10 decks, which would be really hard to show with that 12 players × 10 decks"* — do NOT build a grouped/stacked deck-per-player chart. Flat per-deck bar chart (D-33) is the decision.
- **Color count: 15+ distinct, no duplicates.** *"somewhere upwards of 15 players, and for stuff like radar we'd need a lot of colors. Try to dodge duplicate colors."* Plan color selection deliberately — Tableau 20, d3-scale-chromatic `schemeCategory20`, or an equivalent palette.
- **Light/dark mode color policy.** *"colors in the graphs don't necessarily have to change so try to choose colors that work either way."* Pick once, use everywhere. Only axis/tick/tooltip chrome adapts to theme.
- **Lifetime stats only, no filters.** *"Ignore dashboard filters, stats will always show lifetime stats (minus fields that are missing from imported data like those don't show up for won by combo or deck data)."* No filter toolbar, no date range, no player subset — the inherited Phase 6.1 `isImported` filtering is the only "filter" logic, and it's not user-facing.
- **Empty is fine.** *"Ignore empty state, if all of them are empty just show empty until they fill up."* No empty-page overlay; Recharts renders an empty chart and the user sees that directly.
- **STAT-07 navigation flow.** User submits game at `/games/new` → POST succeeds → `router.push('/stats')` → stats page mounts → fetches → charts render with the new data. No extra wiring needed; Phase 6 already does the navigation after a successful POST.
- **Mobile tap-to-expand is user-requested behavior** — "mobile and desktop will have to work different". Implementation: collapsed summary card by default on mobile; full chart on desktop; `useState<Set<string>>` tracks which cards are expanded on mobile.
- **Recharts-first with escape hatch.** *"I think you decide if rechart constraint workarounds would be able to display as nicely as we want. If not, feel free to add a second lib, if not, feel free to just stay on recharts."* Recharts is the default; a second library is allowed but must be justified in the plan. Avoid unless Recharts produces genuinely unreadable output for the radar or bump chart.

</specifics>

<deferred>
## Deferred Ideas

- **Per-player consistent color map.** User deferred: *"we could tie colors to each player at the top that would adjust that, but that's a lot of overhead. Do not worry about that right now, write it for deferred."* A later phase can add a `playerColors` map (keyed on player name or a user-managed color picker) that every chart reads from so Alice is always blue, Bob is always green, etc.
- **Dashboard filter toolbar.** Date range, player subset, player-count, winner-only, wonByCombo-only filters. Deferred explicitly. The underlying `computeX(games, filter?)` helpers can be extended with optional filter args when a later phase needs them.
- **"Hide low-sample" minimum-games filter.** STAT-08 uses strict 0-exclusion (D-19, D-20); a user-configurable "hide players with fewer than N games" slider is deferred.
- **Rose chart / sunburst / second charting library.** Contingency only (D-31). Not planned unless Recharts workarounds produce unreadable output.
- **CSV export of stats** — STAT-11 (v2, deferred to post-v1.1).
- **Elo rating system** — STAT-09 (v2, deferred).
- **Head-to-head player matchup records** — STAT-10 (v2, deferred).
- **Real-time chart updates via WebSocket** — STAT-12 (v2, deferred). Phase 7 uses mount-and-focus refetch instead.
- **Dashboard empty-state CTA ("Log your first game →")** — rejected. The `/games` page already owns that CTA; duplicating it on `/stats` adds no value.
- **Deck top-N / "show all decks" toggle.** Deferred unless the deck list actually grows unreadably long during Phase 7 implementation.
- **Stats page tabs or section navigation anchors.** Deferred — single scroll is sufficient.
- **Live "last updated" timestamp on the dashboard.** Claude's Discretion; if not added in Phase 7, deferred.
- **Per-chart export buttons (save as PNG/SVG).** Not requested; not planned.
- **Sparkline summaries on mobile cards instead of numeric summary.** Claude's Discretion during implementation; if not added initially, deferred.
- **Dedicated `GET /api/stats` endpoint with Prisma/SQL aggregation.** Explicitly rejected for Phase 7 (D-08). Revisit only if client-side compute becomes measurably slow on production data.
- **Phase 8 admin stats integration** — e.g., cron-failure rate chart, scraper health chart. Belongs in Phase 8, not 7.

</deferred>

---

*Phase: 07-stats-dashboard*
*Context gathered: 2026-04-11*
