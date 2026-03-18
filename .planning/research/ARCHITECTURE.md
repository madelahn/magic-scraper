# Architecture Patterns

**Domain:** Next.js full-stack app — Vercel free tier deployment with Turso DB and serverless Puppeteer
**Researched:** 2026-03-16

---

## Recommended Architecture

The app stays architecturally the same (Next.js App Router, API routes, service layer) but three subsystems require adaptation for Vercel serverless:

1. **Database**: Replace Prisma + better-sqlite3 (local file) → Prisma + @prisma/adapter-libsql (Turso HTTP)
2. **LGS scraper browser**: Replace `puppeteer` full package → `puppeteer-core` + `@sparticuz/chromium-min` (remote binary)
3. **Moxfield scraper**: Replace Puppeteer browser navigation → native `fetch()` (Moxfield API is HTTP JSON, no JS rendering required)
4. **Nightly sync**: New GET route at `/api/cron/sync` wired to a Vercel Cron job

### Component Boundaries (Post-Migration)

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `src/lib/prisma.ts` | Turso-connected PrismaClient singleton | All service functions |
| `src/lib/scrapeLGS/browser.ts` | Serverless-compatible browser lifecycle | scrapeETB, scrapeDCC, scrapeFTF |
| `src/lib/scrapeMoxfield/scrapeMoxfield.ts` | Moxfield API fetch (no browser) | updateCollections |
| `src/app/api/cron/sync/route.ts` | GET handler, validates CRON_SECRET, calls updateAllCollections | Vercel Cron scheduler |
| `vercel.json` | Cron schedule, function maxDuration config | Vercel platform |

---

## Migration Path

**Order matters**: database first, then browser (independent), then cron (depends on both).

### Phase 1 — Database: Prisma + SQLite → Prisma + Turso

**Why first:** Every other feature depends on the DB. Validating this in isolation prevents debugging two changes at once.

**Step 1: Install packages**

```bash
npm install @libsql/client @prisma/adapter-libsql
npm uninstall @prisma/adapter-better-sqlite3 better-sqlite3
npm uninstall -D @types/better-sqlite3
```

**Step 2: Update `prisma/schema.prisma`**

Add `driverAdapters` preview feature to the generator block. The provider stays `"sqlite"` — Turso is libSQL (SQLite-compatible), so the schema models do not change.

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

**Step 3: Update `src/lib/prisma.ts`**

The client must be constructed with the libsql adapter. The global singleton pattern is preserved.

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

function makePrismaClient() {
  const libsql = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const adapter = new PrismaLibSQL(libsql);
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? makePrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

**Step 4: Regenerate the Prisma client**

```bash
npx prisma generate
```

**Step 5: Create the Turso database and push schema**

```bash
# Install Turso CLI
turso auth login
turso db create magic-scraper

# Get connection URL and auth token
turso db show magic-scraper --url
turso db tokens create magic-scraper

# Push schema to Turso (no migration files needed for initial push)
npx prisma db push
```

**Step 6: Seed data**

Run the existing seed script after verifying TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set in `.env`.

**Local dev note**: For local development, set `TURSO_DATABASE_URL=file:./dev.db` and omit `TURSO_AUTH_TOKEN`. The libsql client supports local file URLs — this avoids needing a real Turso connection while developing.

**Confidence:** MEDIUM — package names and adapter pattern verified via Prisma docs summary; `driverAdapters` preview feature is required as of Prisma 5.x for driver adapters.

---

### Phase 2 — Browser: Puppeteer → puppeteer-core + @sparticuz/chromium-min

**Why second:** Independent of DB migration. The LGS scrapers need a real browser (they scrape rendered HTML). The Moxfield scraper does NOT need a browser (see Phase 2b).

#### Phase 2a — LGS scrapers: swap to serverless-compatible browser

**Step 1: Install packages**

```bash
npm install puppeteer-core @sparticuz/chromium-min
npm uninstall puppeteer
```

Use `chromium-min` (not `chromium`) — `chromium-min` omits the bundled Chromium binary and instead fetches it at runtime from a URL. This is the correct approach for Vercel because the full `@sparticuz/chromium` package (~170-180MB uncompressed) risks hitting Vercel's 250MB function bundle limit when combined with Next.js and other dependencies.

**Step 2: Host the Chromium binary**

`@sparticuz/chromium-min` downloads the binary at cold-start from a URL you specify. Options:

- Use the pre-built GitHub Releases URL from `@sparticuz/chromium`: `https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar` (pin to a specific version matching your `chromium-min` version)
- Host it yourself in an S3 bucket or Cloudflare R2 for reliability

Set the URL in an environment variable: `CHROMIUM_EXECUTABLE_URL`.

**Step 3: Update `src/lib/scrapeLGS/browser.ts`**

```typescript
import puppeteer, { Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    const isLocal = process.env.NODE_ENV === 'development';

    browserInstance = await puppeteer.launch({
      args: isLocal ? [] : chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: isLocal
        ? undefined                          // uses system Chrome in local dev
        : await chromium.executablePath(process.env.CHROMIUM_EXECUTABLE_URL!),
      headless: true,
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
```

**Local dev caveat**: When `NODE_ENV=development`, `executablePath: undefined` uses the system's installed Chrome/Chromium. Developers must have Chrome installed locally. An alternative is to set `PUPPETEER_EXECUTABLE_PATH` to the local Chrome binary path.

**Individual scraper files** (`scrapeETB.ts`, `scrapeDCC.ts`, `scrapeFTF.ts`): Only the import of `Browser` from `puppeteer` needs to change to `puppeteer-core`. The scraping logic (page.goto, page.evaluate, etc.) is identical.

**Step 4: Configure `next.config.js` to include Chromium files**

Next.js file tracing may not automatically include the `@sparticuz/chromium-min` native files. Add:

```javascript
// next.config.js
module.exports = {
  outputFileTracingIncludes: {
    '/api/scrapeLGS': ['./node_modules/@sparticuz/chromium-min/**/*'],
  },
};
```

**Step 5: Set `maxDuration` on the scrapeLGS route**

```typescript
// src/app/api/scrapeLGS/route.ts
export const maxDuration = 60; // seconds — fits within Hobby 300s limit
```

#### Phase 2b — Moxfield scraper: eliminate browser entirely

**Current problem**: `scrapeMoxfield.ts` launches a full Puppeteer browser just to call a JSON API (`api2.moxfield.com/v1/collections/search/...`) and parse the response body. This is unnecessary overhead.

**Solution**: Replace the Puppeteer navigation with `fetch()`. The Moxfield API returns JSON directly. The existing pagination logic, card filtering, and data mapping remain unchanged — only the HTTP transport changes.

```typescript
// Replace puppeteer.launch() + page.goto() + page.evaluate()
// with:
const response = await fetch(apiUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
  },
});
const apiData = await response.json();
```

This eliminates the browser dependency from the collection sync path entirely. The nightly cron job never needs to launch Chromium.

**Confidence:** HIGH for replacing Puppeteer with fetch in Moxfield (the API URL is plain HTTP JSON). MEDIUM for `chromium-min` + remote binary pattern (standard documented approach for Vercel serverless).

---

### Phase 3 — Nightly Cron: New sync route + vercel.json

**Why last:** Depends on DB (Phase 1) and Moxfield-without-browser (Phase 2b).

**Step 1: Create `src/app/api/cron/sync/route.ts`**

```typescript
export const maxDuration = 300; // Hobby plan max (fluid compute enabled)

export async function GET(request: Request) {
  // Validate that the request comes from Vercel Cron (not public)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    await updateAllCollections();
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Cron sync failed:', error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
```

**Step 2: Configure `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 6 * * *"
    }
  ]
}
```

`0 6 * * *` = daily at 6:00 AM UTC. Hobby plan precision is ±59 minutes, so it fires sometime between 6:00 and 6:59 AM. The exact time doesn't matter for this use case.

**Step 3: Set `CRON_SECRET` in Vercel dashboard**

Vercel automatically passes `Authorization: Bearer <CRON_SECRET>` when invoking cron jobs from its infrastructure. The route checks this header to reject any external GET requests.

**Timeout analysis for Hobby plan (with fluid compute, which is enabled by default):**

| Operation | Estimated duration | Within 300s? |
|-----------|-------------------|--------------|
| Moxfield API fetch per user (5 users, 5000 cards each) | ~3-5s per user | Yes |
| DB delete + insert per user | ~1-2s per user | Yes |
| Total for 5 users | ~25-35s | Yes, comfortably |

The switch to `fetch()` for Moxfield (Phase 2b) is what makes this feasible. A browser-based sync would be ~60-120s per user and risk timeout.

**Confidence:** HIGH — Vercel Cron docs directly confirm Hobby = once per day, 300s max with fluid compute.

---

## Vercel Function Configuration

### `maxDuration` per route (set in the route file)

| Route | Recommended `maxDuration` | Reason |
|-------|--------------------------|--------|
| `/api/scrapeLGS` | `60` | Browser cold start ~10s + 3 parallel scrapers ~30s |
| `/api/cron/sync` | `300` | Max for Hobby with fluid compute |
| `/api/admin/updateCollections` | `300` | Same operation as cron |
| `/api/checkDeck` | `10` (default) | DB query only, fast |

### Memory

Hobby plan provides 2 GB / 1 vCPU. No configuration needed — Chromium typically uses ~300-500MB of the available 2GB.

---

## Environment Variables

### Required in Vercel Dashboard (and local `.env`)

| Variable | Where to get it | Example |
|----------|----------------|---------|
| `TURSO_DATABASE_URL` | `turso db show magic-scraper --url` | `libsql://magic-scraper-abc123.turso.io` |
| `TURSO_AUTH_TOKEN` | `turso db tokens create magic-scraper` | `eyJhb...` |
| `CRON_SECRET` | Generate a random string | `openssl rand -base64 32` |
| `CHROMIUM_EXECUTABLE_URL` | GitHub Releases URL for @sparticuz/chromium | `https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar` |
| `ADMIN_SECRET` | Already exists — keep it | Your chosen admin password |
| `AUTH_SECRET` | New — for shared group password auth | `openssl rand -base64 32` |

### Local `.env` only (not in Vercel)

| Variable | Value | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | `file:./dev.db` | Used only if keeping local SQLite for dev (optional) |
| `NODE_ENV` | `development` | Disables chromium-min remote binary fetch in browser.ts |

### `.env` vs Vercel Dashboard

- **All secrets go in Vercel Dashboard** under Project → Settings → Environment Variables
- **Never commit secrets to git** — `.env` is `.gitignore`d
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` must be set for all environments (Production, Preview, Development) in the dashboard if you want `vercel dev` to use Turso

---

## Patterns to Follow

### Pattern 1: Driver Adapter Singleton with Environment Guard

**What:** Construct PrismaClient with the libsql adapter in a singleton factory. Guard local vs. production connection config via env vars.

**When:** Required whenever PrismaClient is initialized in a serverless/edge context with Turso.

```typescript
// Local dev: TURSO_DATABASE_URL=file:./dev.db (no authToken needed)
// Production: TURSO_DATABASE_URL=libsql://... + TURSO_AUTH_TOKEN=...
const libsql = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN, // undefined is OK for file:// URLs
});
```

### Pattern 2: Conditional Browser Initialization

**What:** Check `NODE_ENV` to use system Chrome locally and the remote `chromium-min` binary in production.

**When:** Any serverless function that needs Puppeteer.

### Pattern 3: Cron Route Authorization via CRON_SECRET

**What:** All cron routes check `Authorization: Bearer <CRON_SECRET>` header. Vercel sets this automatically when invoking cron jobs.

**When:** Any route that should only be called by the scheduler, not publicly.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using `puppeteer` (full) in Vercel functions

**What:** Importing from `puppeteer` instead of `puppeteer-core`.

**Why bad:** The `puppeteer` package bundles a full Chromium binary (~170MB). Combined with Next.js dependencies, this will exceed Vercel's 250MB uncompressed function size limit.

**Instead:** Use `puppeteer-core` + `@sparticuz/chromium-min` with a remote binary URL.

### Anti-Pattern 2: Using Puppeteer to call JSON APIs

**What:** Launching a browser, navigating to a URL, and calling `page.evaluate(() => document.body.innerText)` to get JSON — which is what `scrapeMoxfield.ts` currently does.

**Why bad:** Browser cold starts add 5-15 seconds of overhead. Memory usage is ~300-500MB per browser. On Vercel, this consumes most of the available function memory for no benefit.

**Instead:** Use `fetch()` directly. The Moxfield `api2.moxfield.com` endpoint returns plain JSON with no JS rendering required.

### Anti-Pattern 3: Browser singleton across serverless invocations

**What:** The current `browser.ts` module-level `browserInstance` variable works locally but is unreliable in serverless. Each Vercel function invocation may run in a different container; the singleton may be stale or reference a closed browser.

**Instead:** In serverless, create a new browser per request and close it in a `finally` block. The `closeBrowser()` call in `scrapeAllSites.ts` already does this correctly — just ensure the try/finally pattern is enforced.

### Anti-Pattern 4: Setting `maxDuration` higher than the plan allows

**What:** Setting `export const maxDuration = 300` on Hobby without fluid compute enabled.

**Why bad:** Without fluid compute, Hobby max is 60s. The function will be killed.

**Instead:** Fluid compute is enabled by default on all new Vercel projects. Verify it's enabled in Project → Settings → Functions. With fluid compute, Hobby max is 300s.

---

## Migration Sequence (Ordered)

This is the correct order to implement changes without breaking the app mid-migration:

```
1. Install @libsql/client + @prisma/adapter-libsql
   Remove better-sqlite3 + @prisma/adapter-better-sqlite3

2. Update prisma/schema.prisma
   → Add driverAdapters previewFeature

3. Update src/lib/prisma.ts
   → Use PrismaLibSQL adapter with createClient()

4. npx prisma generate

5. Create Turso DB, run turso db push, seed data

6. Test all existing routes against Turso locally (file:// URL)
   → checkDeck, admin/updateCollections, scrapeLGS

7. Install puppeteer-core + @sparticuz/chromium-min
   Uninstall puppeteer

8. Update src/lib/scrapeLGS/browser.ts
   → Conditional chromium-min vs local Chrome

9. Update scrapeETB.ts, scrapeDCC.ts, scrapeFTF.ts
   → Change import from 'puppeteer' to 'puppeteer-core'

10. Rewrite src/lib/scrapeMoxfield/scrapeMoxfield.ts
    → Replace Puppeteer browser with fetch()

11. Add outputFileTracingIncludes to next.config.js
    → Include chromium-min files

12. Add maxDuration exports to scrapeLGS and admin routes

13. Create src/app/api/cron/sync/route.ts

14. Create vercel.json with cron config

15. Set all env vars in Vercel Dashboard

16. Deploy to Vercel, verify each route, verify cron fires
```

---

## Deployment Checklist

**Pre-deploy:**

- [ ] `prisma/schema.prisma` has `previewFeatures = ["driverAdapters"]`
- [ ] `src/lib/prisma.ts` uses `PrismaLibSQL` adapter
- [ ] `scrapeMoxfield.ts` uses `fetch()` not Puppeteer
- [ ] `browser.ts` uses `puppeteer-core` + `chromium-min`
- [ ] `next.config.js` has `outputFileTracingIncludes` for chromium-min
- [ ] All LGS scraper files import from `puppeteer-core`
- [ ] `/api/scrapeLGS/route.ts` has `export const maxDuration = 60`
- [ ] `/api/cron/sync/route.ts` exists with `CRON_SECRET` check and `maxDuration = 300`
- [ ] `vercel.json` has cron config with once-per-day schedule

**Vercel Dashboard env vars (all required):**

- [ ] `TURSO_DATABASE_URL` set for Production
- [ ] `TURSO_AUTH_TOKEN` set for Production
- [ ] `CRON_SECRET` set for Production
- [ ] `CHROMIUM_EXECUTABLE_URL` set for Production
- [ ] `ADMIN_SECRET` set for Production
- [ ] `AUTH_SECRET` set for Production (for shared group password, when auth is built)

**Post-deploy verification:**

- [ ] `GET /api/cron/sync` returns 401 without Authorization header
- [ ] `POST /api/scrapeLGS` returns product results within 60s
- [ ] `POST /api/admin/updateCollections` completes without timeout
- [ ] Vercel Functions tab shows no size limit violations
- [ ] Cron job appears in Vercel Dashboard → Cron Jobs tab

---

## Vercel Plan Limits Reference

| Limit | Hobby (free) | Notes |
|-------|-------------|-------|
| Function max duration (fluid compute on) | 300s | Default and max |
| Function max duration (fluid compute off) | 60s | Avoid this — keep fluid compute on |
| Function bundle size (uncompressed) | 250 MB | Includes all imported files |
| Function memory | 2 GB / 1 vCPU | Non-configurable on Hobby |
| Cron jobs per project | 100 | More than enough |
| Cron minimum interval | Once per day | Cannot do hourly on Hobby |
| Cron timing precision | ±59 minutes | Midnight cron fires between midnight-1am |

**Chromium bundle size risk:** The full `@sparticuz/chromium` package is ~170-180MB uncompressed. With Next.js + Prisma + other deps, this can breach the 250MB limit. `@sparticuz/chromium-min` (remote binary) avoids this entirely — the package itself is ~2MB; only the runtime fetch adds the binary.

---

## Scalability Considerations

This is a private app for 5-10 users. Scaling is not a concern. Notes for context:

| Concern | At current scale (~5 users) | Notes |
|---------|----------------------------|-------|
| DB connections | Fine — libsql HTTP is stateless | No connection pooling needed |
| Cron sync duration | ~25-35s total | Well within 300s limit |
| LGS scraper concurrency | Sequential users, parallel scrapers per user | Sufficient |
| Turso free tier | 500 DBs, 1 GB storage, 1 billion row reads/month | Vastly exceeds this app's needs |

---

## Sources

- Vercel Functions Limits (official): https://vercel.com/docs/functions/limitations — HIGH confidence
- Vercel maxDuration config (official): https://vercel.com/docs/functions/configuring-functions/duration — HIGH confidence
- Vercel Cron Jobs (official): https://vercel.com/docs/cron-jobs — HIGH confidence
- Vercel Cron Usage & Pricing (official): https://vercel.com/docs/cron-jobs/usage-and-pricing — HIGH confidence
- Next.js outputFileTracingIncludes (official): https://nextjs.org/docs/app/api-reference/config/next-config-js/output — HIGH confidence
- Prisma + Turso adapter pattern (docs summary): https://prisma.io/docs/orm/overview/databases/turso — MEDIUM confidence (docs confirmed driverAdapters preview feature required; package names @prisma/adapter-libsql and @libsql/client confirmed)
- Moxfield API is plain HTTP JSON: MEDIUM confidence (observed in existing scrapeMoxfield.ts — the URL is a direct API endpoint returning JSON body text)
- @sparticuz/chromium-min remote binary pattern: MEDIUM confidence (well-known community pattern; chromium-min vs chromium distinction is standard advice for Vercel deployments; direct source access was blocked)
