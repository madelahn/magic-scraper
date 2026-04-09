# magic-scraper

## What This Is

A private web app for a friend group to share their Magic: The Gathering collections and check local game store card prices. Friends can paste a decklist to see who owns which cards across the group's combined Moxfield collections, and search which local stores (ETB, DCC, FTF) currently stock specific cards. Access is restricted behind a shared group password.

## Core Value

Friends can instantly see who in the group owns any card from a decklist, and check which local stores have it in stock.

## Requirements

### Validated

- ✓ LGS card price scraping (ETB, DCC, FTF) via Puppeteer — existing
- ✓ Moxfield collection scraping and storage in SQLite — existing
- ✓ Deck checker: paste a decklist, see which friends own which cards — existing
- ✓ Admin panel to manually trigger full collection refresh — existing
- ✓ Next.js UI with header navigation and Tailwind styling — existing
- ✓ Database migration to Turso cloud DB — v1.0
- ✓ Prisma schema preserved with libsql adapter — v1.0
- ✓ LGS scrapers on Vercel serverless via chromium-min + puppeteer-core — v1.0
- ✓ Moxfield collection scraper replaced with pure fetch — v1.0
- ✓ LGS scrape result caching with TTL — v1.0
- ✓ Collection update wrapped in Prisma transaction — v1.0
- ✓ Shared password authentication on all routes — v1.0
- ✓ Separate admin password for admin routes — v1.0
- ✓ Session/logout with httpOnly cookie — v1.0
- ✓ Nightly automated Moxfield sync via Vercel Cron — v1.0
- ✓ Cron route Bearer token authentication — v1.0
- ✓ Admin user management (add/delete) via UI — v1.0
- ✓ Deployment guide (DEPLOYMENT.md) — v1.0

### Active

- [ ] Fix 401 Games scraper — currently disabled; likely Cloudflare-blocked from Vercel IPs
- [ ] Rate limiting on API routes — protect against abuse
- [ ] Admin can edit existing user's Moxfield collection ID
- [ ] Admin can view sync history / last-updated timestamps per user
- [ ] Error alerting when nightly cron sync fails
- [ ] Scraper health dashboard showing which stores return results vs fail

### Out of Scope

- Individual user accounts/logins — shared password is sufficient for a closed friend group
- Public access or sign-up flow — invite-only by design
- Mobile app — web-only is fine
- Real-time price updates — nightly sync is sufficient
- Price history tracking — not needed for this use case
- OAuth / social login — unnecessary complexity for a private tool

## Context

- **Stack**: Next.js 16, React 19, TypeScript, Prisma + Turso (libsql), chromium-min + puppeteer-core, Tailwind v4
- **Deployment**: Vercel free tier + Turso free tier, deployed and operational
- **Users**: Small closed friend group (~5-10 people), one admin (the developer)
- **Codebase**: ~2,100 LOC TypeScript across src/
- **Known issues**: 401 Games scraper disabled (Cloudflare blocks Vercel IPs), no rate limiting, no error alerting on cron failures

## Constraints

- **Budget**: Free tier only — Vercel Hobby + Turso free tier
- **Auth complexity**: No user accounts needed — shared secret is sufficient
- **DB**: Turso cloud DB (SQLite-compatible via libsql)
- **Scraping**: chromium-min for LGS stores, fetch for Moxfield API
- **Cron**: Vercel Cron (free tier allows 1 cron job, daily frequency, ~59 min variance)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Shared password (not individual accounts) | Small closed group, no need for per-user identity | ✓ Good — simple and effective |
| Turso for DB | SQLite-compatible = minimal Prisma changes, generous free tier | ✓ Good — seamless migration |
| chromium-min for serverless scraping | Keeps existing scraper logic, works in Vercel serverless | ✓ Good — runtime binary fetch avoids 250MB bundle limit |
| Vercel Cron for nightly sync | Free tier supports daily cron, no external service needed | ✓ Good — zero-config automation |
| HMAC cookie for auth | Simple stateless auth with httpOnly cookie, no auth library overhead | ✓ Good — lightweight and secure |
| Moxfield fetch instead of browser | Moxfield API accessible without browser, eliminates heavy dependency | ✓ Good — faster and more reliable |
| prisma db push (not migrate deploy) | Turso incompatible with migrate deploy | ⚠️ Revisit — track Prisma/Turso support |
| Collection update in Prisma transaction | Prevents partial data loss during deleteMany + createMany | ✓ Good — atomic operations |
| maxDuration=300 on cron route | Fluid Compute budget for multi-user sync | ✓ Good — sufficient for current user count |

---
*Last updated: 2026-04-08 after v1.0 milestone*
