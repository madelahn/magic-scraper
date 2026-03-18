# magic-scraper

## What This Is

A private web app for a friend group to share their Magic: The Gathering collections and check local game store card prices. Friends can paste a decklist to see who owns which cards across the group's combined Moxfield collections, and search which local stores (ETB, DCC, FTF) currently stock specific cards. Access is restricted to anyone with the shared link and password.

## Core Value

Friends can instantly see who in the group owns any card from a decklist, and check which local stores have it in stock.

## Requirements

### Validated

- ✓ LGS card price scraping (ETB, DCC, FTF) via Puppeteer — existing
- ✓ Moxfield collection scraping and storage in SQLite — existing
- ✓ Deck checker: paste a decklist, see which friends own which cards — existing
- ✓ Admin panel to manually trigger full collection refresh — existing
- ✓ Next.js UI with header navigation and Tailwind styling — existing

### Active

- [ ] Shared password authentication — all routes require a single group password
- [ ] Separate secure admin password — admin routes require a stronger second password
- [ ] Nightly automated Moxfield sync — Vercel Cron job refreshes all collections at midnight
- [ ] Admin user management — admin can add/remove users via the admin panel (not just seeded)
- [ ] Database migration to Turso — replace local SQLite with Turso cloud DB for Vercel deployment
- [ ] Puppeteer → @sparticuz/chromium — make LGS scrapers run on Vercel's serverless functions
- [ ] Fix 401 Games scraper — currently disabled/broken, investigate and restore
- [ ] LGS scraper result caching — cache scrape results to avoid redundant browser launches
- [ ] Rate limiting on API routes — protect against abuse on public-facing endpoints
- [ ] Deployment guide — step-by-step instructions to deploy free on Vercel with Turso

### Out of Scope

- Individual user accounts/logins — shared password is sufficient for a closed friend group
- Public access or sign-up flow — this is invite-only by design
- Mobile app — web-only is fine
- Real-time price updates — nightly sync is sufficient
- Price history tracking — not needed for this use case

## Context

- **Stack**: Next.js 16, React 19, TypeScript, Prisma + SQLite (migrating to Turso), Puppeteer, Tailwind v4
- **Deployment target**: Vercel free tier + Turso free tier
- **Users**: Small closed friend group (~5-10 people), one admin (the developer)
- **Known issues**: 401 Games scraper is disabled (broken), no auth on any route, no cron sync, Puppeteer incompatible with Vercel serverless as-is, collection update has no transaction safety
- **Auth model**: Single shared password via HTTP session/cookie for friends; separate env-var-based admin password for admin routes

## Constraints

- **Budget**: Free tier only — Vercel Hobby + Turso free tier
- **Auth complexity**: No user accounts needed — shared secret is sufficient
- **DB**: Must migrate off local SQLite to cloud DB for Vercel (Turso chosen — SQLite-compatible)
- **Puppeteer**: Must use @sparticuz/chromium or equivalent for Vercel serverless compatibility
- **Cron**: Vercel Cron (free tier allows 1 cron job, daily frequency)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Shared password (not individual accounts) | Small closed group, no need for per-user identity | — Pending |
| Turso for DB | SQLite-compatible = minimal Prisma changes, generous free tier | — Pending |
| @sparticuz/chromium for Puppeteer | Keeps existing scraper logic, works in Vercel serverless | — Pending |
| Vercel Cron for nightly sync | Free tier supports daily cron, no external service needed | — Pending |
| Session/cookie for auth | Simple stateless auth with httpOnly cookie, no auth library overhead | — Pending |

---
*Last updated: 2026-03-16 after initialization*
