# Domain Pitfalls

**Domain:** Next.js + Puppeteer + Prisma + Turso on Vercel (magic-scraper)
**Researched:** 2026-03-16
**Confidence:** MEDIUM-HIGH — Vercel/Next.js limits confirmed from official docs; @sparticuz/chromium and Prisma/Turso details from training knowledge (knowledge cutoff August 2025)

---

## Critical Pitfalls

Mistakes that cause deployment failures, data loss, or complete feature breakage.

---

### Pitfall 1: @sparticuz/chromium + puppeteer Version Mismatch

**What goes wrong:** `@sparticuz/chromium` ships a specific Chromium build number. `puppeteer-core` must be on the matching version or the browser launch fails with a protocol error or silent crash. Using full `puppeteer` (not `puppeteer-core`) will cause a double-download of Chromium — the bundled one that can't run on Lambda and the `@sparticuz/chromium` one.

**Why it happens:** `@sparticuz/chromium` versions map directly to Chromium revision numbers, not to puppeteer semver. Developers install the latest of each independently and get a mismatch.

**Consequences:** Browser launch throws `Error: Failed to launch the browser process` or `Target closed` immediately. No output. No useful error message without verbose logging.

**Prevention — Version Compatibility Matrix (MEDIUM confidence — verify at install time):**

| @sparticuz/chromium | puppeteer-core | Chromium Version |
|---------------------|----------------|-----------------|
| 133.x               | 22.x           | 133             |
| 131.x               | 22.x           | 131             |
| 130.x               | 22.x           | 130             |
| 127.x               | 22.x           | 127             |
| 123.x               | 22.x           | 123             |
| 121.x               | 21.x           | 121             |

**Rule:** `@sparticuz/chromium` major version must equal the Chromium version number. Match it against the `puppeteer-core` entry in https://github.com/puppeteer/puppeteer/blob/main/versions.json. Always pin both packages with exact versions (`"22.x.x"` not `"^22"`).

**Current state:** `package.json` uses `puppeteer: ^24.34.0` (full puppeteer). This must be replaced with `puppeteer-core` at the exact version that matches the chosen `@sparticuz/chromium` release.

**Required install pattern:**
```bash
# Remove full puppeteer — it bundles its own Chromium and will exceed bundle size limits
npm remove puppeteer
npm install puppeteer-core@<version> @sparticuz/chromium@<matching-version>
```

**Detection:** Run `npx @sparticuz/chromium --version` after install to confirm the bundled Chromium version. Cross-check against puppeteer-core's changelog.

**Phase:** Puppeteer migration phase (replace browser.ts).

---

### Pitfall 2: Vercel Bundle Size Limit Exceeded by Chromium

**What goes wrong:** `@sparticuz/chromium` includes a compressed (~50MB) Chromium binary that expands at runtime. The Vercel serverless function bundle limit is **250MB uncompressed** (confirmed from official Vercel docs). If the scraper route is bundled with Next.js's default output tracing, the Chromium binary pushes the function over the limit and deployment fails.

**Why it happens:** Next.js `outputFileTracingIncludes` must explicitly include the Chromium binary. Without it, the binary is either excluded (launch fails) or included in the wrong bundle context.

**Consequences:** Either `FUNCTION_PAYLOAD_TOO_LARGE` at deploy time, or `Error: ENOENT: chromium binary not found` at runtime.

**Prevention:**

1. Never import the scraper from a shared module used by lightweight routes. Isolate the Puppeteer route handler in its own file so Next.js bundles it separately.

2. Add to `next.config.ts`:
```typescript
experimental: {
  outputFileTracingIncludes: {
    '/api/scrape': ['./node_modules/@sparticuz/chromium/**'],
  },
}
```

3. The scraper route must use `export const runtime = 'nodejs'` — never `'edge'`. Chromium cannot run in the edge runtime.

4. Set `executablePath` explicitly at runtime:
```typescript
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
});
```

**Detection:** Check bundle size with `ANALYZE=true next build`. If the scraper function bundle exceeds 200MB, restructure.

**Phase:** Puppeteer migration phase.

---

### Pitfall 3: Browser Singleton Pattern Breaks in Serverless

**What goes wrong:** `browser.ts` currently uses a module-level singleton (`let browserInstance: Browser | null = null`). On Vercel serverless, each function invocation may run in a separate isolate. The singleton is not shared between requests. Worse, if the same isolate is reused (warm start), a previously-crashed browser instance is returned as non-null but is unusable, causing `Target closed` errors on subsequent calls.

**Why it happens:** Serverless function instances are ephemeral and stateless. Module-level singletons persist only within a single warm isolate. There is no guarantee that `closeBrowser()` is called before the isolate reuses the instance reference.

**Consequences:** Every cold start launches a new browser (expected but slow). Warm starts may get a dead browser reference. Unclosed browser processes during exceptions (noted in CONCERNS.md) cause memory exhaustion and function timeouts.

**Prevention:**

1. Replace the singleton with launch-per-request for the scraper route. The cold start penalty (~2-4 seconds) is unavoidable on serverless; accept it.

2. Always wrap browser operations in try/finally that closes the browser:
```typescript
let browser;
try {
  browser = await puppeteer.launch({ ... });
  // scrape
} finally {
  await browser?.close();
}
```

3. Do NOT attempt to keep a browser alive across requests on Vercel — the execution model does not support it.

**Detection:** If the scraper works on first call but hangs or errors on second call in the same deploy, the stale singleton pattern is the cause.

**Phase:** Puppeteer migration phase.

---

### Pitfall 4: Scraper Function Exceeds Vercel Hobby Timeout

**What goes wrong:** The 401 Games scraper polling loop runs up to `20 × 5000ms = 100 seconds`. Vercel Hobby functions have a maximum duration of **60 seconds without fluid compute, or 300 seconds with fluid compute** (confirmed from official Vercel docs). The current polling design will reliably exceed the 60s limit on a cold start.

**Why it happens:** The polling loop was written for local development where wall time is unconstrained. Serverless functions have hard timeouts.

**Consequences:** `504 FUNCTION_INVOCATION_TIMEOUT`. The function is killed mid-execution. Any browser process in that isolate is abandoned (not closed). Subsequent warm-start requests may inherit a broken process table.

**Specific values (official Vercel docs, confirmed):**

| Condition | Default | Maximum |
|-----------|---------|---------|
| Hobby, fluid compute ON | 300s | 300s |
| Hobby, fluid compute OFF | 10s | 60s |
| Pro, fluid compute ON | 300s | 800s |

Fluid compute is enabled by default on new Vercel projects. Confirm it is ON before relying on 300s. Regardless, 100 seconds of polling inside one function invocation is fragile design.

**Prevention:**

1. Set explicit `maxDuration` on the scraper route:
```typescript
export const maxDuration = 60; // or 300 with fluid compute confirmed
```

2. Replace the polling loop with a shorter, smarter wait. See Pitfall 9 (401 Games scraper) for the root cause fix.

3. For the Moxfield cron sync, ensure `updateCollections` completes within the budget. With sequential user processing and Puppeteer launch overhead per user, this can easily run long.

**Detection:** Vercel function logs show `FUNCTION_INVOCATION_TIMEOUT` or the function simply returns 504 without output.

**Phase:** Puppeteer migration phase; Cron sync phase.

---

### Pitfall 5: Prisma + Turso — Wrong Provider or Missing Adapter

**What goes wrong:** Prisma does not have native Turso support. It requires the `@prisma/adapter-libsql` driver adapter plus `@libsql/client`. The `schema.prisma` must switch `provider = "sqlite"` to `provider = "sqlite"` with `previewFeatures = ["driverAdapters"]` and the datasource `url` format changes. Forgetting any step causes either `PrismaClientInitializationError` or a silent fallback to the local SQLite file.

**Why it happens:** The Turso integration is via a driver adapter pattern (not a native Prisma provider), which requires different initialization code than the standard `new PrismaClient()`.

**Consequences:** On Vercel, there is no writable filesystem for SQLite. If `DATABASE_URL` points to a local file and the app deploys, Prisma either fails to initialize or creates an empty ephemeral file that disappears between invocations — all data is lost.

**Prevention — Required schema change:**
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

**Required initialization pattern:**
```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

const libsql = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const adapter = new PrismaLibSQL(libsql);
const prisma = new PrismaClient({ adapter });
```

**Required packages:**
```bash
npm install @prisma/adapter-libsql @libsql/client
npm remove @prisma/adapter-better-sqlite3 better-sqlite3
```

**Environment variables needed (two, not one):**
- `TURSO_DATABASE_URL` — format: `libsql://<db-name>-<org>.turso.io`
- `TURSO_AUTH_TOKEN` — from Turso dashboard

**Detection:** If the app starts without error locally but returns empty results in production, check that `TURSO_DATABASE_URL` is set in Vercel environment variables and is not pointing to a `file:` path.

**Phase:** Database migration phase.

---

### Pitfall 6: `prisma migrate` Does Not Work Against Remote Turso DB Directly

**What goes wrong:** `prisma migrate deploy` expects a writable connection it can use to create a `_prisma_migrations` shadow database. Turso's remote HTTP connection does not support this workflow. Attempting to run `prisma migrate deploy` against a `libsql://` URL will fail.

**Why it happens:** Prisma's migration engine uses features (shadow database, `_prisma_migrations` table management) that require direct, low-latency SQL access that Turso's HTTP API does not fully support in the same way as a local SQLite file.

**Consequences:** Migrations cannot be applied to production Turso DB using the standard `prisma migrate deploy` command. If a developer applies schema changes via the normal flow, they get errors and may attempt workarounds that corrupt the migration history.

**Prevention:**

The correct workflow is `prisma migrate diff` + `turso db shell`:

```bash
# 1. Generate the SQL migration diff
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > migration.sql

# 2. Apply directly to Turso
turso db shell <db-name> < migration.sql

# OR use the Turso CLI for remote execution:
cat migration.sql | turso db shell <db-name>
```

For incremental schema changes after initial setup, use `--from-local-d1` or `--from-schema-datasource` as the `from` argument depending on which state the DB is already at.

**Detection warning sign:** If you see `Error: P1003: Database <x> does not exist at migration.db` or shadow database errors, you are attempting to run Prisma migrations against Turso directly.

**Phase:** Database migration phase.

---

### Pitfall 7: `better-sqlite3` Breaks at Build Time on Vercel

**What goes wrong:** `better-sqlite3` is a native Node.js addon (C++ bindings). Vercel's build environment may not have the correct build tools, or the compiled binary may be for the wrong architecture (x86_64 vs arm64 depending on Vercel's runtime). Additionally, `better-sqlite3` requires a writable filesystem path — which Vercel serverless does not provide.

**Why it happens:** Native addons must be compiled for the target platform. Vercel runs on Amazon Linux (x86_64), and a dev machine may compile for a different target. Even if architecture matches, there is no persistent filesystem to hold the SQLite file.

**Consequences:** Build fails with `Error: Could not locate the bindings file` or deploys successfully but crashes at runtime with `SQLITE_CANTOPEN` when trying to open the DB file.

**Detection:** The deploy log will show native module compilation errors. Check for `.node` file errors in the function bundle.

**Phase:** Database migration phase — resolve before attempting any Vercel deployment.

---

## Moderate Pitfalls

---

### Pitfall 8: Auth Middleware Does Not Protect API Routes

**What goes wrong:** Next.js middleware runs on the edge runtime. If the middleware checks for a session cookie and redirects unauthenticated users, it protects page routes but **does not prevent direct API route access** unless the API route also performs its own check. Middleware redirect on an API route returns a 307 redirect response that some clients (fetch, curl) will follow, but automated clients may just receive the 307 and still see no real protection.

**Specific concern for this project:** The admin routes (`/api/admin/updateCollections`) are currently completely unprotected. Middleware alone is insufficient — the route handler must independently verify the admin password from the cookie.

**Why it happens:** Developers assume middleware is a complete security boundary. It is not — it is only an optimistic pre-filter layer. The Next.js docs explicitly state: "Middleware should not be your only line of defense."

**Prevention:**

1. Every API route handler must perform its own auth check. Do not rely on middleware redirects for API security.

2. For the admin routes, the check pattern should be:
```typescript
// In the route handler
const cookieStore = await cookies();
const session = cookieStore.get('session');
if (!session || !verifyAdminToken(session.value)) {
  return new Response('Unauthorized', { status: 401 });
}
```

3. Middleware should use the `matcher` config to exclude `_next/static`, `_next/image`, and API routes if the API routes do their own checking, OR include them if middleware performs the check. Be explicit — the default `matcher` behavior has confused many developers.

**Detection:** Use `curl -X POST https://your-app.vercel.app/api/admin/updateCollections` without any cookies. If it returns 200 or processes the request, the route is unprotected.

**Phase:** Authentication phase.

---

### Pitfall 9: Plain-Text Password Comparison — Timing Attack

**What goes wrong:** Comparing a submitted password directly against `process.env.GROUP_PASSWORD` using `===` is vulnerable to timing attacks. JavaScript string comparison short-circuits on the first mismatched character, leaking information about how many characters of the password are correct.

**Why it happens:** For a simple shared-password model, developers use `===` as the obvious choice. The attack surface is small for a private friend-group app, but the fix is trivially simple.

**Prevention:** Use `crypto.timingSafeEqual` from Node.js built-ins:
```typescript
import { timingSafeEqual } from 'crypto';

function verifyPassword(submitted: string, expected: string): boolean {
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

**Phase:** Authentication phase.

---

### Pitfall 10: Cookie Without `secure: true` Leaks Over HTTP

**What goes wrong:** If the session cookie is set without `secure: true`, it will be transmitted over HTTP connections. On Vercel, all traffic is HTTPS, but local development uses HTTP. If `secure: true` is hardcoded, cookies break in local dev. If it is omitted, there is a theoretical leak.

**Prevention:** Set `secure` conditionally:
```typescript
secure: process.env.NODE_ENV === 'production'
```

This mirrors the pattern in the official Next.js auth docs. The cookie should also always have `httpOnly: true` and `sameSite: 'lax'`.

**Phase:** Authentication phase.

---

### Pitfall 11: Vercel Cron Does Not Retry on Failure

**What goes wrong:** If the nightly Moxfield sync fails (network error, timeout, exception), Vercel does not retry it. The next invocation is the following day. There is no built-in retry, dead-letter queue, or failure notification.

**Confirmed from official Vercel docs:** "Vercel will not retry an invocation if a cron job fails."

**Why it happens:** Developers assume cron systems retry on failure (many do). Vercel's cron is a simple HTTP GET — fire and forget.

**Consequences:** A single transient Moxfield network failure silently causes the collection to be 24+ hours stale. Users see outdated data with no indication of the problem.

**Prevention:**

1. Make the cron handler idempotent (running it twice should have the same result). Confirmed as good practice in Vercel's own cron documentation.

2. Log structured errors at the start and end of the sync so the Vercel function log shows a clear success/failure state.

3. Return a non-2xx status code on failure so the Vercel cron log records the failure visibly (check the Cron Jobs settings page → View Logs).

4. For resilience, consider accepting a manual trigger (the existing admin panel "update collections" button already exists) as the fallback when cron fails.

**Phase:** Cron sync phase.

---

### Pitfall 12: Vercel Cron Hobby Plan — Timing Precision and Scheduling Limits

**What goes wrong:** The Hobby plan cron has two hard constraints that differ from every other cron system:

1. **Once per day maximum** — any expression that would run more than once per day (e.g., `0 * * * *` for hourly) causes **deployment to fail** with: `Hobby accounts are limited to daily cron jobs`.

2. **±59-minute timing precision** — a cron set for `0 1 * * *` (1:00 AM) will actually fire anywhere between 1:00 AM and 1:59 AM UTC. This is confirmed in official Vercel docs.

**Consequences:** If someone accidentally writes `0 */6 * * *` (every 6 hours) thinking it looks like a daily schedule, the deployment fails. The `±59-minute` window means the sync does not happen at a precise time — acceptable for this use case.

**Prevention:**
- Use exactly `0 0 * * *` (midnight UTC) for the nightly sync
- Never use expressions with multiple values in the hour/minute fields that increase frequency
- Always timezone-convert manually: UTC midnight = appropriate local times for the friend group

**Detection:** Deployment failure with the message about Hobby limits is the warning sign. No silent failures here — the deploy itself will reject the config.

**Phase:** Cron sync phase.

---

### Pitfall 13: Vercel Cron Endpoint Must Not Redirect

**What goes wrong:** If the cron path (`/api/cron/sync`) returns a redirect (3xx), Vercel does NOT follow it. The cron job is considered complete after the redirect response. The actual sync logic never runs.

**Confirmed from official Vercel docs:** "Cron jobs do not follow redirects."

**Common scenario:** The middleware auth check redirects unauthenticated requests to `/login`. If the cron endpoint path matches the middleware matcher, the cron request (which has no cookie) gets redirected to `/login` and the sync silently does nothing.

**Prevention:**

1. Add the cron path to the middleware matcher exclusion list, OR

2. Verify the cron request using the `CRON_SECRET` environment variable (recommended by Vercel docs), which is automatically sent as `Authorization: Bearer <CRON_SECRET>` on cron invocations:
```typescript
export function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // proceed with sync
}
```

3. The middleware should check for this `Authorization` header and pass cron requests through.

**Detection:** The Vercel cron logs show a 3xx response code for the invocation. The sync completes in <1ms (impossible for real work).

**Phase:** Authentication phase (middleware design) + Cron sync phase (cron route handler).

---

### Pitfall 14: `deleteMany` + `createMany` Without a Transaction Loses Cards

**What goes wrong:** `updateCollections.ts` deletes all cards for a user then inserts new ones. If the insert fails (Turso write error, network timeout, rate limit), the user has zero cards in the DB. This is already noted in CONCERNS.md. The bug exists in the current code and will be worse with a remote DB that has network latency.

**Why it happens:** The code was written for local SQLite where failures mid-operation are rare. Remote databases introduce failure modes that local SQLite never has.

**Consequences:** A failed Moxfield sync leaves a user with an empty collection. The next cron run will attempt to fix it, but until then the deck checker returns no ownership data for that user.

**Prevention:** Wrap in a Prisma transaction:
```typescript
await prisma.$transaction(async (tx) => {
  await tx.collectionCard.deleteMany({ where: { userId } });
  await tx.collectionCard.createMany({ data: newCards });
});
```

Prisma's `$transaction` with the libSQL adapter uses SQLite's `BEGIN TRANSACTION / COMMIT / ROLLBACK` semantics over the Turso HTTP API.

**Phase:** Database migration phase (fix the pattern before migrating, not after).

---

## Minor Pitfalls

---

### Pitfall 15: 401 Games Scraper — Why It Fails Silently

**What goes wrong:** The scraper polls for `.product-card` elements for up to 100 seconds. Looking at the scraper code, the site uses `domcontentloaded` as the wait condition — this fires before JavaScript has executed. The `.product-card` elements are rendered by a JavaScript SPA framework (Shopify's search results page uses JavaScript to inject results). `domcontentloaded` completes when the static HTML is parsed, but the product grid is not yet injected.

**Root causes in order of likelihood:**

1. **Bot detection / Cloudflare challenge:** 401 Games (and most large Canadian MTG retailers) uses Cloudflare. A headless Chromium browser that passes a user-agent string but lacks real browser fingerprinting (WebGL, canvas hash, navigator plugins) triggers Cloudflare's JS challenge or CAPTCHA. The challenge page has no `.product-card` elements — the loop times out returning `[]` with no error.

2. **Wrong wait strategy:** Even when Cloudflare is bypassed, `waitForSelector('.product-card', { timeout: 10000 })` is more reliable than polling manually. The polling loop adds up to 102 seconds of wall time; `waitForSelector` can succeed in 200ms.

3. **Selector staleness:** The selector `.product-card` may have changed. Shopify-based stores frequently update their theme CSS classes.

**Warning signs (from the actual code):**
- Console log `'Products never appeared after 20 seconds'` is printed but the function returns `[]` — the caller has no way to distinguish "no results" from "scraper failed"
- All errors are caught and return `[]` — failures are invisible

**Prevention for fixing the scraper:**

1. Test with `networkidle0` instead of `domcontentloaded` to ensure the JS app has loaded
2. Add a `page.waitForSelector('.product-card', { timeout: 15000 })` after navigation
3. Check whether the page HTML contains a Cloudflare challenge (`cf-browser-verification` in the DOM) and throw a specific error rather than timing out silently
4. Consider whether a Vercel serverless environment with `@sparticuz/chromium` will even bypass Cloudflare — the IP range is known and often pre-blocked

**Phase:** 401 Games scraper fix phase.

---

### Pitfall 16: All Scrapers Catch Errors and Return `[]`

**What goes wrong:** `scrapeETB`, `scrapeDCC`, `scrapeFTF`, and `scrape401` all catch any error and return an empty array. A changed CSS selector, a network timeout, a rate limit, or a Cloudflare block all produce the same output as "no results for this card". Users see an empty results section with no indication of failure.

**Prevention:**

1. Return a typed result that distinguishes success from failure:
```typescript
type ScrapeResult =
  | { ok: true; products: Product[] }
  | { ok: false; error: string; products: [] }
```

2. Log the specific error and store scrape metadata (timestamp, success/fail, item count) so admin visibility is possible.

**Phase:** Error visibility should be addressed during the Puppeteer migration phase — the scraper code will be rewritten anyway.

---

### Pitfall 17: `DATABASE_URL` Misconfiguration Creates Empty DB Silently

**What goes wrong:** If `TURSO_DATABASE_URL` is absent or malformed in the Vercel environment, and the initialization code falls back to checking `DATABASE_URL`, Prisma may attempt to open a local SQLite file at `file:./dev.db`. Vercel will create this file in the ephemeral Lambda filesystem. The app appears to work (no crash) but all DB reads return empty and writes are discarded when the instance recycles.

**Prevention:**

1. Validate environment variables at startup:
```typescript
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error('Missing required Turso environment variables');
}
```

2. Name the variables distinctly (`TURSO_DATABASE_URL`, not `DATABASE_URL`) so a missing Vercel env var does not accidentally use the dev SQLite path.

**Phase:** Database migration phase.

---

### Pitfall 18: Prisma Client Not Regenerated After Schema Change

**What goes wrong:** When the `schema.prisma` changes (adding `previewFeatures = ["driverAdapters"]`, changing the datasource), the Prisma client must be regenerated. Vercel's build step runs `next build`, which does not automatically run `prisma generate`. The deployed function uses the old client, which does not have the libSQL adapter support.

**Prevention:** Add `prisma generate` to the build script:
```json
"scripts": {
  "build": "prisma generate && next build"
}
```

**Phase:** Database migration phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Replace `puppeteer` with `puppeteer-core` + `@sparticuz/chromium` | Version mismatch (Pitfall 1), bundle size (Pitfall 2) | Pin exact versions; check Sparticuz README at install time |
| Browser initialization in serverless | Stale singleton (Pitfall 3) | Launch-per-request with try/finally close |
| Function timeout for long scrapes | Timeout exceeded (Pitfall 4) | Add `maxDuration` export; fix 401 Games polling loop |
| Migrate `schema.prisma` from SQLite to Turso | Wrong provider/adapter (Pitfall 5) | Use `@prisma/adapter-libsql` driver adapter pattern |
| Run migrations against Turso | `prisma migrate deploy` fails (Pitfall 6) | Use `prisma migrate diff --script` + `turso db shell` |
| Remove `better-sqlite3` | Build failure on Vercel (Pitfall 7) | Remove before deploying; it has no serverless use |
| Add transaction to collection update | Data loss on failure (Pitfall 14) | `prisma.$transaction` before migrating |
| Implement session cookie auth | Middleware not protecting API routes (Pitfall 8), timing attacks (Pitfall 9) | Check in every route handler; use `timingSafeEqual` |
| Implement Vercel Cron | No retry on failure (Pitfall 11), Hobby once-per-day limit (Pitfall 12), redirect skip (Pitfall 13) | Return non-2xx on failure; use `CRON_SECRET` auth; exclude cron path from middleware redirect |
| Fix 401 Games scraper | Bot detection, wrong wait strategy (Pitfall 15) | Test Cloudflare bypass first; use `waitForSelector`; improve error visibility |
| Environment variable setup | Silent empty DB (Pitfall 17), stale Prisma client (Pitfall 18) | Validate at startup; add `prisma generate` to build script |

---

## Sources

**Confirmed from official Vercel documentation (HIGH confidence):**
- Vercel Function Limits: https://vercel.com/docs/functions/limitations — bundle size 250MB uncompressed, memory 2GB Hobby, max duration 300s (fluid compute) / 60s (no fluid compute)
- Vercel Cron: https://vercel.com/docs/cron-jobs — no redirects, CRON_SECRET pattern
- Vercel Cron Management: https://vercel.com/docs/cron-jobs/manage-cron-jobs — no retry on failure, idempotency guidance
- Vercel Cron Pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing — Hobby = once/day, ±59min precision
- Next.js Authentication Guide: https://nextjs.org/docs/app/guides/authentication — cookie options, stateless session pattern, middleware as optimistic-only check
- Next.js cookies() API: https://nextjs.org/docs/app/api-reference/functions/cookies — async API, set/delete restrictions, streaming interaction

**From training knowledge (MEDIUM confidence — verify current versions):**
- @sparticuz/chromium version compatibility with puppeteer-core: https://github.com/Sparticuz/chromium (README)
- Prisma + Turso adapter pattern: https://www.prisma.io/docs/orm/overview/databases/turso
- `prisma migrate diff` for Turso: Prisma migration docs

**From direct codebase analysis (HIGH confidence — exact file locations):**
- `src/lib/scrapeLGS/browser.ts` — singleton pattern confirmed
- `src/lib/scrapeLGS/scrape401.ts` — polling loop, 100s max runtime, silent error swallowing confirmed
- `prisma/schema.prisma` — `provider = "sqlite"`, no `driverAdapters` preview feature
- `package.json` — `puppeteer: ^24.34.0` (full puppeteer, not puppeteer-core), `@prisma/adapter-better-sqlite3`
- `.planning/codebase/CONCERNS.md` — transaction atomicity gap, browser lifecycle fragility confirmed
