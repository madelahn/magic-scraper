---
plan: 01-01
phase: 01-database-migration
status: complete
completed: 2026-03-17
---

# Plan 01-01 Summary: Database Driver Swap + Turso Migration

## What Was Built

Replaced the local `better-sqlite3` SQLite driver with the Turso-compatible `@libsql/client` + `@prisma/adapter-libsql` stack. The Prisma client singleton now initializes via `PrismaLibSQL` adapter, enabling the app to connect to either a local SQLite file (dev) or a Turso cloud database (production) using the same code path. The initial schema was applied to the Turso cloud database via a migration script.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Swap dependencies, update Prisma schema with `previewFeatures = ["driverAdapters"]` | c413052 |
| 2 | Rewrite `src/lib/prisma.ts` with `PrismaLibSQL` adapter, create `.env` for local dev | b2bc274 |
| 3 | Apply migration SQL to Turso cloud database, verify tables exist | 8a90fa3 |

## Key Files Modified

- `package.json` — removed `@prisma/adapter-better-sqlite3`, `better-sqlite3`, `@types/better-sqlite3`; added `@prisma/adapter-libsql@6.15.0`, `@libsql/client@0.8.1` (pinned, no caret)
- `prisma/schema.prisma` — added `previewFeatures = ["driverAdapters"]` to generator block
- `src/lib/prisma.ts` — rewritten to use `PrismaLibSQL({ url, authToken })` adapter
- `.env` — `DATABASE_URL=file:./dev.db`, `DATABASE_AUTH_TOKEN=` (empty for local dev)
- `.gitignore` — added `auth` and `auth-wal` (Turso CLI installer artifacts)

## Deviations from Plan

**Pre-existing TypeScript compile errors fixed (Task 2):**
- Created `src/types/product.ts` and `src/types/moxfield.ts` — these were referenced throughout the codebase but missing, causing build failure
- Deleted stale auto-generated `types/validator.ts` and `types/routes.d.ts` at project root — caused TS compile errors

**Turso CLI not available on Windows:**
- `turso db shell` CLI workflow was not applicable (Turso management CLI has no Windows build)
- Applied migration via a one-time Node.js script using `@libsql/client` instead — equivalent outcome
- Turso credentials stored as `turso_url`/`turso_token` in `.env` (user-set); `DATABASE_AUTH_TOKEN` added as empty for local dev

**Production setup required:**
- In Vercel: set `DATABASE_URL=libsql://magic-scraper-avltg.aws-us-east-2.turso.io` and `DATABASE_AUTH_TOKEN=<token>` as environment variables

## Must-Haves Verified

- ✓ PrismaClient uses `PrismaLibSQL` adapter (not `better-sqlite3`)
- ✓ `prisma generate` succeeds with `driverAdapters` preview feature
- ✓ Local dev uses `file:./dev.db` with no auth token required
- ✓ Schema models (User, CollectionCard) unchanged
- ✓ `npm run build` passes with no native addon errors
- ✓ Turso cloud DB has `users` and `collection_cards` tables

## Issues / Notes for Next Plans

- Plan 01-02 (transaction wrapping) can proceed — Prisma client is operational
- `DATABASE_AUTH_TOKEN` env var must be set in Vercel deployment for production DB connectivity
- The `turso_url` and `turso_token` variables in `.env` are for reference only — the app reads `DATABASE_URL` and `DATABASE_AUTH_TOKEN`
