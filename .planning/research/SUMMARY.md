# Project Research Summary

**Project:** magic-scraper v1.1 — Game Tracking & Stats Dashboard
**Domain:** Private MTG friend-group app — game logging, stats charts, scraper hardening, admin tooling
**Researched:** 2026-04-09
**Confidence:** MEDIUM-HIGH

## Executive Summary

This milestone adds game tracking and a stats dashboard to an existing Next.js 16 + React 19 + Prisma + Turso app. The existing stack handles all new features without any new services beyond two npm packages (`recharts` and `cmdk`). The recommended approach is a normalized two-table schema (`games` + `game_participants`) with free-text player names, server-side stat aggregation, and client-side filtered autocomplete from a full list fetched once at form mount.

The highest-risk decisions are schema design and rate limiting. Schema mistakes (denormalized columns, JSON blobs) are expensive to fix once data is inserted and Turso has no `prisma migrate deploy` support. Rate limiting with an in-memory Map is architecturally limited on Vercel serverless (state does not survive across Lambda instances), but for a private 10-person app the practical risk is low. The Cloudflare bypass for 401 Games requires `render=true` mode in ScraperAPI.

---

## Key Findings

### Recommended Stack

Only two new packages needed:
- `recharts@^3.7.0`: SVG bar/pie charts — React 19 compatible since v3.0, tree-shakeable, theme via CSS custom properties
- `cmdk@^1.0.0`: Filterable autocomplete primitive — unstyled, keyboard accessible, works with Tailwind v4
- Discord webhook via `fetch`: Zero-dependency cron failure alerting
- In-memory Map rate limiter: 15-line module, sufficient for ~10-user private Hobby-tier app

**Do NOT add:** `@tremor/react` (clobbers design tokens), `@upstash/ratelimit` + Redis (overkill for private app), `resend` (Discord webhook is simpler), full shadcn/ui install (rewrites `globals.css`).

### Expected Features

**Must have (v1.1 table stakes):**
- Game entry form: date, multi-select players, single-select winner, winner deck (autocomplete + new), multi-select screwed
- Player list seeded from Moxfield User records, ability to add non-Moxfield players
- Deck list persisted across sessions via distinct names from DB
- Game history list (newest-first table)
- Win rate per player bar chart, win rate per deck bar chart, screwed rate per player chart
- Weekly game regularity, "most likely to play" metric, pie charts
- Admin: `lastUpdated` timestamp per user, inline edit of Moxfield collection ID
- Rate limiting on `/api/scrapeLGS` routes
- Scraper error handling hardening

**Should have (v1.x post-launch):**
- Cron failure alerting via `SyncLog` table + Discord webhook
- Scraper health dashboard
- 401 Games scraper fix (contingent on ScraperAPI `render=true` working)
- Win streak display

**Defer to v2+:**
- Commander tracking, venues, CSV export, Elo rating, real-time charts

### Architecture Approach

New routes (`/api/games`, `/api/stats`, `/api/players`, `/api/admin/sync-history`) follow the existing thin-route-handler-delegates-to-lib pattern. DB schema uses two normalized tables — `Game` (one row per session with `winnerName` and `winnerDeck` as free-text strings) and `GameParticipant` (one row per player-game with `playerName` string and `wasScrewed` boolean) — plus a `SyncLog` table. Player autocomplete is a union of `User.name` and `distinct GameParticipant.playerName`, fetched once at form mount and filtered client-side.

**Build order:** Schema → rate limiter → game CRUD → player autocomplete → GameForm → stats queries → StatsPage → SyncLog writes → sync-history route → admin UI extensions.

### Critical Pitfalls

1. **Denormalized game schema** — fixed player columns or JSON blobs make GROUP BY aggregations impossible. Use normalized `games` + `game_participants` from day one. Recovery cost: HIGH.
2. **Schema drift to production Turso** — `prisma db push` in dev does not apply to production. Workflow: `prisma migrate diff` → `turso db shell` → verify.
3. **In-memory rate limiting is per-Lambda-instance** — accepted risk for private 10-user app; switch to Upstash if app becomes public.
4. **Recharts SSR hydration errors** — must use `dynamic(() => import(...), { ssr: false })`. Never import chart components directly in a Server Component.
5. **ScraperAPI without `render=true` for Cloudflare** — plain proxied request returns JS challenge HTML, not product listings.

---

## Implications for Roadmap

### Suggested Phases (5)

1. **Schema Migration & Foundation** — `Game`, `GameParticipant`, `SyncLog` tables in both local and production Turso. Prerequisite for everything.
2. **Game Tracking Core** — form + CRUD + rate limiting + autocomplete; the milestone's foundation feature.
3. **Stats Dashboard** — Recharts charts with dynamic import; depends on game data existing.
4. **Admin Improvements** — sync visibility + collection ID edit + cron alerting; independent quality-of-life.
5. **Scraper Hardening & 401 Games Fix** — retry logic, Cloudflare bypass attempt; last because uncertain and isolated.

### Phase Ordering Rationale

- Schema before all game code — inserting data into wrong schema is HIGH-cost recovery on Turso (no rollback)
- Game CRUD before stats — stats page meaningless without data
- Stats before admin — admin is quality-of-life; game tracking + stats are core milestone value
- Scraper last — isolated files, doesn't block any other feature, has uncertain outcome
- Rate limiter embedded in Phase 2 — a 15-line middleware addition

### Research Flags

- **Phase 5:** Needs validation — test ScraperAPI `render=true` against 401 Games with standalone script before planning
- **Phases 1-4:** Standard patterns, skip research-phase

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Recharts React 19 compat verified; cmdk confirmed as shadcn primitive |
| Features | HIGH | Cross-validated against BG Stats and NemeStats patterns |
| Architecture | HIGH | Based on direct codebase inspection; follows established patterns |
| Pitfalls | MEDIUM-HIGH | Turso limits from official docs; Cloudflare bypass from ScraperAPI docs |

**Overall:** HIGH (Phases 1-4) / MEDIUM (Phase 5 scraper fix)

### Gaps to Address

- **401 Games Cloudflare challenge type:** Unknown whether JS challenge (bypassable) or IP-based blocking (not bypassable). Test with standalone script before Phase 5.
- **Rate limiting accepted risk:** In-memory Map is per-instance; accepted for private 10-user app.
- **Schema field resolution:** Use `wasScrewed: Boolean` on `GameParticipant` with free-text `playerName`. No separate Player table needed.

---
*Research completed: 2026-04-09*
*Ready for roadmap: yes*
