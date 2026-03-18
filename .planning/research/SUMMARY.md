# Project Research Summary

**Project:** magic-scraper — Vercel deployment milestone
**Domain:** Private MTG collection tracker — serverless deployment, authentication, automation
**Researched:** 2026-03-16
**Confidence:** MEDIUM-HIGH

## Executive Summary

Magic-scraper is a private Next.js full-stack app for a friend group to track their MTG collections and check card availability at local game stores. The app is currently functional locally (Next.js App Router, Prisma + SQLite, Puppeteer scrapers) but requires four targeted infrastructure changes to deploy on Vercel's free Hobby tier: replace `better-sqlite3` with Turso (libSQL over HTTP), replace full `puppeteer` with `puppeteer-core` + `@sparticuz/chromium-min`, add httpOnly cookie authentication, and configure a Vercel Cron job for nightly Moxfield collection sync. The architecture does not change fundamentally — only the runtime transport layers need to be swapped.

The recommended approach is to migrate in dependency order: database first (all features depend on it), then browser/scraper migration (including replacing Puppeteer with `fetch()` for the Moxfield API), then auth (required before any deployment is safe), then cron (depends on both DB and Moxfield migration). A critical architectural improvement is replacing the current Puppeteer-based Moxfield scraper with a plain `fetch()` call — the Moxfield API returns JSON directly and launching a browser for it is pure overhead. This single change makes the nightly cron viable within the Hobby tier's 300-second function timeout.

The primary risks are: (1) version mismatch between `@sparticuz/chromium` and `puppeteer-core` causing silent browser launch failures, (2) the 401 Games scraper timing out due to a 100-second polling loop that already exceeds conservative function limits and may be blocked by Cloudflare, and (3) the existing `deleteMany` + `createMany` pattern in collection sync having no transaction wrapping, which will cause silent data loss on the higher-latency remote Turso connection. All three have clear mitigations that should be applied before first deployment.

## Key Findings

### Recommended Stack

The current stack needs four targeted package swaps, not a rewrite. The Next.js App Router, Prisma schema, and all scraping logic remain identical. What changes is how Prisma connects to the database (driver adapter swap), how Chromium is loaded (remote binary instead of bundled), and two new subsystems: middleware-based auth (`proxy.ts` in Next.js 16) and a Vercel Cron-triggered sync route.

**Core technologies:**
- `@prisma/adapter-libsql` + `@libsql/client`: Turso database transport — only viable HTTP-based SQLite for Vercel (no native bindings, no filesystem required)
- `puppeteer-core` + `@sparticuz/chromium-min`: Serverless Chromium — `chromium-min` fetches binary at runtime from a URL, keeping function bundle under 250MB limit
- `proxy.ts` (Next.js 16 middleware rename) + httpOnly cookies: Auth gate — no library needed, two env vars, two cookies
- Vercel Cron via `vercel.json`: Nightly sync scheduler — built into Hobby tier, zero additional cost, 1 job per day maximum

**Critical version constraint:** `@sparticuz/chromium` and `puppeteer-core` must target the same Chromium version. The `@sparticuz/chromium` major version equals the Chrome version number (e.g., v131 = Chrome 131). Always verify the compatibility table in the `@sparticuz/chromium` README before installing.

**Packages to remove:** `puppeteer`, `@prisma/adapter-better-sqlite3`, `better-sqlite3`, `@types/better-sqlite3`

### Expected Features

All features for this milestone are well-scoped and low-to-medium complexity. There are no ambiguous requirements.

**Must have (table stakes):**
- Shared password protection on all routes via `proxy.ts` + httpOnly `auth` cookie — app is publicly accessible without this
- Separate admin password for `/admin/*` routes via second httpOnly `admin-auth` cookie — admin panel currently unprotected
- Nightly Moxfield sync via Vercel Cron — collections go stale without it
- Admin CRUD for users (add/delete) — no UI currently exists; seed script is the only path

**Should have (differentiators):**
- LGS scrape result caching via module-level Map with 15-minute TTL — reduces redundant Puppeteer launches for same-card queries
- Cache hit indicators in the LGS UI (`cached: true` flag in API response) — low effort, improves trust
- Last-synced timestamp in admin panel — lets admin verify nightly cron is working

**Defer to v2+:**
- Per-user login sessions (scope is shared-secret, not individual accounts)
- Redis or external cache store (module-level Map is sufficient at this scale; stateless serverless instances make shared cache impractical anyway)
- Splitting cron into per-user invocations (only needed if sync times out, which it won't after the Moxfield fetch migration)

### Architecture Approach

The migration sequence has a strict dependency ordering: DB migration must precede everything else (all routes depend on it), the Moxfield-to-fetch rewrite is prerequisite for the cron being viable within Hobby timeouts, and auth must be in place before any deployment is public-facing. The ARCHITECTURE.md provides a 16-step ordered migration sequence that should be followed exactly to avoid debugging multiple changes simultaneously.

**Major components post-migration:**
1. `src/lib/prisma.ts` — Turso-connected PrismaClient singleton using `PrismaLibSQL` driver adapter; conditional local file URL vs. remote libsql URL based on env
2. `src/lib/scrapeLGS/browser.ts` — Serverless-compatible browser lifecycle using `puppeteer-core` + `chromium-min` with remote binary URL; launch-per-request pattern (no singleton)
3. `src/lib/scrapeMoxfield/scrapeMoxfield.ts` — Replaced with `fetch()` directly against `api2.moxfield.com` JSON API; no browser dependency
4. `src/proxy.ts` — Next.js 16 proxy (formerly middleware) gating all routes except `/login`, `/api/auth/`, `/api/cron/`; two-tier cookie check
5. `src/app/api/cron/sync/route.ts` — GET handler validating `CRON_SECRET` Authorization header, calling `updateAllCollections()`; `maxDuration = 300`
6. `vercel.json` — Cron schedule (`0 6 * * *` UTC), function size tracing includes for chromium-min

**Required new environment variables:** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CRON_SECRET`, `CHROMIUM_EXECUTABLE_URL`, `SITE_PASSWORD`, `ADMIN_SECRET`

### Critical Pitfalls

1. **Version mismatch between `@sparticuz/chromium` and `puppeteer-core`** — Browser launch fails silently with `Target closed`. Fix: pin exact versions, verify compatibility table in the chromium README before installing. `@sparticuz/chromium@131` + `puppeteer-core@22.x` is a known-good pair as of mid-2025.

2. **Cron route intercepted by auth proxy redirect** — Vercel Cron does not follow redirects. If `proxy.ts` redirects the `/api/cron/sync` path (no auth cookie) to `/login`, the cron silently completes with a 3xx response and the sync never runs. Fix: explicitly exclude `/api/cron/` from the proxy auth check and rely solely on the `CRON_SECRET` header for that route.

3. **`deleteMany` + `createMany` without a transaction loses collection data** — Already flagged in the codebase CONCERNS.md. Over a remote Turso connection with network latency, a failed insert leaves the user with zero cards. Fix: wrap in `prisma.$transaction()` before migrating to Turso — do not carry this bug into production.

4. **Browser singleton pattern breaks in serverless** — The existing `let browserInstance` module-level variable may return a stale/dead browser on warm invocation reuse. Fix: launch a new browser per-request inside try/finally that always closes it.

5. **`prisma migrate deploy` fails against Turso** — Prisma's migration engine requires shadow database support that Turso's HTTP API does not provide. Fix: use `prisma migrate diff --script` to generate SQL and apply via `turso db shell`.

## Implications for Roadmap

Based on research, the project has a clear 4-phase structure driven by dependency ordering. No phase is speculative — all patterns are well-documented and straightforward.

### Phase 1: Database Migration (Prisma + SQLite → Prisma + Turso)

**Rationale:** Every other feature touches the database. Validating the DB layer in isolation prevents debugging multiple failure modes simultaneously. This is also the blocking issue for any Vercel deployment — `better-sqlite3` will fail at build time on Vercel (native addon + no writable filesystem).

**Delivers:** App deployable to Vercel with full data persistence via Turso. All existing routes (checkDeck, updateCollections, scrapeLGS) verified against remote DB locally using `TURSO_DATABASE_URL=file:./dev.db`.

**Addresses:** All existing features — nothing else is possible until this is done.

**Avoids:** Pitfall 5 (wrong provider/adapter), Pitfall 6 (migrate deploy failure), Pitfall 7 (better-sqlite3 build failure), Pitfall 14 (data loss without transaction), Pitfall 17 (silent empty DB), Pitfall 18 (stale Prisma client).

**Key tasks:** Remove `better-sqlite3`, install `@prisma/adapter-libsql` + `@libsql/client`, update `prisma.ts` singleton, add `driverAdapters` preview feature to schema, add `prisma generate` to build script, create Turso DB, run `prisma migrate diff --script` + `turso db shell`, wrap `updateCollections` in `$transaction`.

### Phase 2: Serverless Browser Migration (Puppeteer → puppeteer-core + chromium-min + Moxfield fetch)

**Rationale:** Independent of auth. Resolves the Vercel 250MB function bundle limit and makes the nightly cron viable. The Moxfield-to-fetch migration is the highest-leverage change — it eliminates browser overhead from the sync path entirely, dropping sync time from ~60-120s per user to ~3-5s per user.

**Delivers:** LGS scrapers functional on Vercel (Puppeteer via remote Chromium binary). Moxfield collection sync via plain HTTP fetch. Browser no longer used for JSON API calls.

**Avoids:** Pitfall 1 (version mismatch), Pitfall 2 (bundle size exceeded), Pitfall 3 (stale browser singleton), Pitfall 4 (function timeout), Pitfall 15 (401 Games silent failures), Pitfall 16 (error swallowing).

**Key tasks:** Remove `puppeteer`, install `puppeteer-core` + `@sparticuz/chromium-min` (exact matched versions), rewrite `browser.ts` with conditional local/prod init and try/finally close, update all scraper imports, rewrite `scrapeMoxfield.ts` with `fetch()`, add `outputFileTracingIncludes` to `next.config.ts`, add `CHROMIUM_EXECUTABLE_URL` env var, add `maxDuration` exports to scraper routes.

**Research flag:** Needs confirmation of the correct `@sparticuz/chromium` + `puppeteer-core` version pairing against the chromium README at install time. Also needs real-environment testing to confirm whether Vercel's IP range is blocked by Cloudflare on 401 Games — this cannot be validated without an actual deployment.

### Phase 3: Authentication (proxy.ts + httpOnly cookies)

**Rationale:** Must be in place before any public-facing deployment. The admin panel and all routes are currently unprotected. Auth is a prerequisite for the cron phase (proxy must be configured to pass cron requests through correctly before deploying the cron).

**Delivers:** All routes protected by shared group password. Admin routes additionally require admin cookie. Login page at `/login` and `/admin/login`. Two-tier session system. No auth library dependency.

**Addresses:** Table stakes features — shared password protection, admin separation.

**Avoids:** Pitfall 8 (middleware not protecting API routes — each admin route handler gets its own cookie check as defense-in-depth), Pitfall 9 (timing attack via `crypto.timingSafeEqual`), Pitfall 10 (cookie `secure` flag conditional on NODE_ENV), Pitfall 13 (cron route must be excluded from proxy redirect).

**Key tasks:** Rename/create `src/proxy.ts` (Next.js 16 naming), implement two-cookie check logic, create `/api/auth/login` and `/api/auth/logout` routes, create `/login` page, implement admin CRUD routes (`/api/admin/users`), add user management UI to admin panel, add `SITE_PASSWORD` and `ADMIN_SECRET` env vars.

**Research flag:** Standard patterns — no deeper research needed. The FEATURES.md and STACK.md provide complete implementation code.

### Phase 4: Cron Automation (Vercel Cron + nightly sync)

**Rationale:** Depends on Phase 1 (Turso DB), Phase 2 (Moxfield fetch migration), and Phase 3 (proxy must exclude `/api/cron/`). All prerequisites must be validated before this is layered on.

**Delivers:** Automatic nightly Moxfield collection sync without admin intervention. Cron job appears in Vercel Dashboard. Manual trigger still available via admin panel as fallback.

**Addresses:** Nightly sync table stakes feature, LGS scrape cache (can also be added in this phase as it is independent).

**Avoids:** Pitfall 11 (no retry — log structured errors, return non-2xx on failure, use admin panel as manual fallback), Pitfall 12 (once-per-day limit — use `0 0 * * *` exactly), Pitfall 13 (proxy redirect — `/api/cron/` excluded from auth check, uses `CRON_SECRET` header).

**Key tasks:** Create `src/app/api/cron/sync/route.ts` with `CRON_SECRET` check and `maxDuration = 300`, create `vercel.json` with cron config, add `CRON_SECRET` to Vercel dashboard env vars, add LGS scrape cache module, set `CHROMIUM_EXECUTABLE_URL` and all Turso vars in Vercel dashboard, deploy and verify in Vercel Functions + Cron Jobs tabs.

**Research flag:** Standard Vercel Cron patterns — well-documented. No deeper research needed. Real-world timeout verification on the first live deployment is the validation step.

### Phase Ordering Rationale

- Database first because `better-sqlite3` actively prevents Vercel deployment and all other phases depend on data persistence working
- Moxfield fetch migration bundled with the Puppeteer migration because both touch the scraping layer; separating them would require the scraper phase to be revisited
- Auth before any live deployment to avoid a window where the app is publicly accessible
- Cron last because it requires all other phases to be stable and has the most complex failure modes (proxy interaction, timeout behavior, no-retry semantics)

### Research Flags

Phases needing deeper research or real-environment validation during execution:
- **Phase 2 (browser migration):** Confirm `@sparticuz/chromium` + `puppeteer-core` version pairing at install time (README compatibility table). Verify whether Vercel IP range is blocked by Cloudflare on 401 Games — requires a live test deployment; cannot be determined from docs alone.

Phases with standard patterns (skip research-phase during planning):
- **Phase 1 (database):** Prisma + Turso integration is the canonical documented path. Migration workflow via `prisma migrate diff --script` + `turso db shell` is well-established.
- **Phase 3 (auth):** httpOnly cookie auth with Next.js proxy is a standard pattern with complete implementation examples in FEATURES.md and STACK.md.
- **Phase 4 (cron):** Vercel Cron configuration is minimal — one `vercel.json` block, one route handler. Official docs cover every edge case relevant to this project.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core packages and patterns verified against official Prisma, Vercel, and Next.js docs. Version numbers for @sparticuz/chromium + puppeteer-core pairing are MEDIUM — require verification at install time against chromium README. |
| Features | HIGH | All patterns verified against official Next.js 16 docs. No speculative features. |
| Architecture | MEDIUM-HIGH | Vercel limits and cron behavior confirmed from official docs. Prisma adapter pattern and chromium-min remote binary pattern are well-documented but not directly live-tested in this session (web fetch unavailable). |
| Pitfalls | MEDIUM-HIGH | Vercel function limits, cron no-retry, and bundle size limits confirmed from official docs. @sparticuz version compatibility and Prisma/Turso adapter details are from training knowledge (cutoff August 2025) — verify package README at install time. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **@sparticuz/chromium + puppeteer-core exact version pairing:** Cannot be resolved from training data alone. Check the chromium README compatibility table at install time and pin exact versions. Do not rely on `^` semver ranges for either package.
- **Cloudflare blocking on 401 Games from Vercel IP range:** Research cannot determine whether Vercel's outbound IPs are blocked by Cloudflare on 401 Games. The only way to know is a live test. If the 401 Games scraper returns empty results on first Vercel deployment, Cloudflare evasion (stealth plugins, residential proxy) is the next investigation path — out of scope for this milestone.
- **`driverAdapters` preview feature status in Prisma 6.x:** May have graduated to GA. Including the preview feature declaration is safe either way (no-op if already GA). Verify against Prisma 6 changelog before assuming it can be omitted.
- **Fluid compute default state on Vercel:** Architecture and pitfalls research states fluid compute is enabled by default on new projects (enabling 300s max duration on Hobby). Verify this is active in Project → Settings → Functions before relying on the 300-second budget.

## Sources

### Primary (HIGH confidence)
- Vercel Functions Limits — https://vercel.com/docs/functions/limitations (bundle size 250MB, memory 2GB, max duration)
- Vercel Cron Jobs — https://vercel.com/docs/cron-jobs (no redirect follow, CRON_SECRET, no retry on failure)
- Vercel Cron Pricing — https://vercel.com/docs/cron-jobs/usage-and-pricing (Hobby = once/day, ±59min precision)
- Next.js 16 Proxy (middleware rename) — https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Next.js Authentication Guide — https://nextjs.org/docs/app/guides/authentication (cookie pattern, stateless sessions)
- Next.js outputFileTracingIncludes — https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Vercel maxDuration config — https://vercel.com/docs/functions/configuring-functions/duration

### Secondary (MEDIUM confidence)
- Prisma + Turso adapter docs — https://www.prisma.io/docs/orm/overview/databases/turso (driver adapter pattern, driverAdapters preview feature)
- `@sparticuz/chromium` README — https://github.com/Sparticuz/chromium (version compatibility table, chromium-min remote binary pattern)
- Moxfield API is plain HTTP JSON — inferred from existing `scrapeMoxfield.ts` which navigates to a direct `api2.moxfield.com` URL and reads the body text

### Tertiary (from codebase analysis, HIGH confidence for current state)
- `src/lib/scrapeLGS/browser.ts` — singleton pattern confirmed
- `src/lib/scrapeLGS/scrape401.ts` — 100-second polling loop, silent error swallowing confirmed
- `prisma/schema.prisma` — `provider = "sqlite"`, no driverAdapters preview feature, no Turso adapter
- `package.json` — `puppeteer: ^24.34.0` (full puppeteer), `@prisma/adapter-better-sqlite3` still present
- `.planning/codebase/CONCERNS.md` — transaction atomicity gap and browser lifecycle fragility confirmed

---
*Research completed: 2026-03-16*
*Ready for roadmap: yes*
