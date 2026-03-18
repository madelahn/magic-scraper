# Feature Landscape

**Domain:** Private friend-group MTG collection app — auth, admin, and automation milestone
**Researched:** 2026-03-16
**Overall confidence:** HIGH (all patterns verified against official Next.js 16 and Vercel docs)

---

## Table Stakes

Features the friend group requires for this milestone to be usable. Missing any of these = the deployment is not production-ready.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Shared password protection on all routes | App is private; without this anyone with the URL can access it | Low | httpOnly cookie + proxy.ts (see below) |
| Separate admin password for /admin/* | Admin actions (nightly sync trigger, user CRUD) need stronger protection | Low | Second env var, second cookie check in proxy |
| Nightly Moxfield sync via cron | Collections go stale; manual refresh is a chore | Low-Med | Vercel Cron + GET route handler |
| Admin CRUD for users | Admin needs to add/remove friends without touching the DB directly | Medium | Prisma User create/delete behind admin auth |
| LGS scrape result caching | Each scrape launches Puppeteer and takes several seconds; repeat queries for same card are wasteful | Medium | Module-level Map with TTL |

## Differentiators

Features that improve the experience beyond the minimum but are not blocking.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Login page with friendly error messages | Better UX than a raw 401 page | Low | Simple form at /login, redirected to by proxy |
| Cache hit indicators in LGS UI | Let users know they're seeing cached prices, not live | Low | Return `cached: true` flag in API response |
| Cron run log / last-synced timestamp | Admin can verify nightly sync is working | Low | Store lastUpdated on User, display in admin panel |

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| NextAuth / any auth library | Overkill for a shared-secret model; adds dependency weight and complexity | Raw httpOnly cookie, env var secrets |
| Per-user login sessions | The project scope is a shared password for friends, not individual accounts | Single `auth` cookie for all users |
| Redis or external cache store | Free-tier Vercel serverless is stateless between invocations anyway; module-level Map is simpler and sufficient | Module-level Map with TTL (sufficient for same-instance cache) |
| JWT tokens | Not needed; a signed or hashed cookie value is sufficient for this trust model | Hash the password before storing in cookie |
| Database-backed sessions | Turso adds latency and cost per auth check; stateless cookies are faster | Verify cookie value against env var in proxy |

---

## Feature Details and Implementation Patterns

### Feature 1: Shared Password Protection (httpOnly Cookie + Proxy)

**What it does:** All routes (except `/login` and `/_next/*` static assets) require a valid `auth` cookie. Users who lack the cookie are redirected to `/login`. On login form submission, the password is compared against `SITE_PASSWORD` env var and an httpOnly cookie is set on success.

**IMPORTANT — Next.js 16 naming change:** Next.js 16 renamed `middleware.ts` to `proxy.ts`. The exported function is also renamed from `middleware` to `proxy`. A codemod exists: `npx @next/codemod@canary middleware-to-proxy .`. All examples below use the current `proxy.ts` convention.

Confidence: HIGH — verified against official Next.js 16 docs at nextjs.org/docs/app/api-reference/file-conventions/proxy

**proxy.ts (src/proxy.ts)**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow static assets, Next.js internals, and the login page itself
  const isPublic =
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/login' ||
    pathname.startsWith('/api/auth/'); // login submit endpoint

  if (isPublic) return NextResponse.next();

  const authCookie = request.cookies.get('auth')?.value;
  const adminCookie = request.cookies.get('admin-auth')?.value;

  // Admin routes: require BOTH auth cookie AND admin-auth cookie
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) {
    if (
      authCookie !== process.env.SITE_PASSWORD_HASH ||
      adminCookie !== process.env.ADMIN_PASSWORD_HASH
    ) {
      return NextResponse.redirect(new URL('/login?next=' + pathname, request.url));
    }
    return NextResponse.next();
  }

  // All other routes: require auth cookie
  if (authCookie !== process.env.SITE_PASSWORD_HASH) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except static files, images, and favicon
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
```

**Login API route (src/app/api/auth/login/route.ts)**

```typescript
import { NextResponse } from 'next/server';

// Using a constant-time comparison helper to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function POST(request: Request) {
  const { password, type } = await request.json();

  if (type === 'admin') {
    if (!safeCompare(password, process.env.ADMIN_SECRET ?? '')) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set('admin-auth', process.env.ADMIN_SECRET ?? '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return res;
  }

  // Regular site password
  if (!safeCompare(password, process.env.SITE_PASSWORD ?? '')) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('auth', process.env.SITE_PASSWORD ?? '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
```

**Security considerations:**
- `httpOnly: true` — JavaScript cannot read the cookie; XSS cannot steal it
- `secure: true` in production — cookie only sent over HTTPS
- `sameSite: 'lax'` — mitigates CSRF for state-changing requests; use `'strict'` if all links are same-origin
- Constant-time comparison (`safeCompare`) prevents timing attacks on password check
- Storing the raw password value as the cookie token is acceptable for this trust model (closed friend group). For higher security, hash `SITE_PASSWORD` and store the hash (e.g. using `crypto.subtle` or the `bcryptjs` package)
- Never put the actual passwords in code — use Vercel environment variables for `SITE_PASSWORD` and `ADMIN_SECRET`

---

### Feature 2: Two-Tier Auth (Regular vs Admin)

The proxy.ts example above implements this directly. The key points:

- Two separate cookies: `auth` (site access) and `admin-auth` (admin access)
- Two separate env vars: `SITE_PASSWORD` and `ADMIN_SECRET`
- Admin routes require both cookies to be valid
- Regular routes require only the `auth` cookie
- The existing `src/app/api/admin/updateCollections/route.ts` currently validates `ADMIN_SECRET` from the request body. After adding proxy-level protection, that body-based check can remain as a defense-in-depth layer, but the primary gate moves to the proxy

**Login page UX:** The `/login` page can render a single form with a password field. A second "admin login" section or a separate `/admin/login` page handles the admin cookie. Keep them separate to avoid confusing regular users with admin prompts.

**Cookie vs. re-checking env var:** The proxy compares the cookie value directly to the env var. An alternative is to store an HMAC or bcrypt hash. For this app's trust model (5-10 friends, no PII at risk), direct comparison of the cookie to the env var is acceptable and avoids adding a crypto dependency.

---

### Feature 3: Admin CRUD Panel (Add/Delete Users) with Prisma

**Current state:** Users are seeded via `src/lib/scripts/seed.ts`. The admin panel only has the "Update All Collections" button. No UI exists to add or remove users.

**Pattern:** Add two API routes under `/api/admin/users/` and a new section in the admin page.

**API routes:**

```typescript
// src/app/api/admin/users/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/admin/users — list all users
export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, moxfieldUsername: true, lastUpdated: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(users);
}

// POST /api/admin/users — create a new user
export async function POST(request: Request) {
  const { name, moxfieldUsername } = await request.json();
  if (!name || !moxfieldUsername) {
    return NextResponse.json({ error: 'name and moxfieldUsername required' }, { status: 400 });
  }
  const user = await prisma.user.create({ data: { name, moxfieldUsername } });
  return NextResponse.json(user, { status: 201 });
}
```

```typescript
// src/app/api/admin/users/[id]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// DELETE /api/admin/users/[id] — delete user and all their cards
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  // CollectionCards are cascade-deleted if schema has onDelete: Cascade,
  // otherwise delete them first
  await prisma.collectionCard.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

**Admin page UI additions (client component):**
- A table listing all users with a "Delete" button per row
- An "Add User" form with two fields: display name and Moxfield username
- Loading and error states per operation

**Security:** These routes are already protected by the proxy's admin-auth gate. No extra secret check is needed in the route body unless you want defense-in-depth.

**Prisma schema consideration:** The `User` model needs a `moxfieldUsername` field that maps to the Moxfield collection ID used by `scrapeMoxfield`. Confirm the existing field names before wiring the form. Adjust `data: { ... }` to match the actual schema column names.

---

### Feature 4: Vercel Cron for Nightly Moxfield Sync

**How it works:** Vercel makes an HTTP GET to your production URL on schedule. The route handler performs the sync. Vercel sends a `CRON_SECRET` as a `Bearer` token in the `Authorization` header — check this to prevent unauthorized manual triggers.

**Hobby tier limits (verified):** Maximum 1 invocation per day per cron job. Timing precision is ±59 minutes (not exact). For a nightly sync at midnight UTC, this is fine.

**vercel.json (project root):**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/sync-collections",
      "schedule": "0 0 * * *"
    }
  ]
}
```

`0 0 * * *` = midnight UTC daily. On Hobby, it will fire sometime between 00:00 and 00:59 UTC.

**Route handler (src/app/api/cron/sync-collections/route.ts):**

```typescript
import type { NextRequest } from 'next/server';
import { updateAllCollections } from '@/lib/updateCollections';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    await updateAllCollections();
    return Response.json({ ok: true, synced: new Date().toISOString() });
  } catch (error) {
    console.error('Cron sync failed:', error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
```

**Environment variables required:**
- `CRON_SECRET` — set in Vercel project settings. Vercel automatically sends this as the `Authorization: Bearer <value>` header when invoking the cron. Generate with a password manager or `openssl rand -base64 32`.

**Proxy exclusion:** The cron route hits `/api/cron/sync-collections`. The proxy currently protects `/api/admin/*` with admin auth. The cron route uses its own `CRON_SECRET` header check, so it must be excluded from the site-password proxy gate. Update the proxy's public/excluded path list to include `/api/cron/`.

**Execution time warning:** `updateAllCollections` launches Puppeteer to scrape Moxfield. Vercel Functions on Hobby have a default 10-second timeout. The Moxfield scrape for 5-10 users likely exceeds this. Set `maxDuration` in the route segment config:

```typescript
// At top of route.ts:
export const maxDuration = 300; // 5 minutes (max for Hobby is 60s; Pro allows up to 900s)
```

Note: Hobby plan serverless function max duration is 60 seconds. If `updateAllCollections` for your friend group takes longer, this will time out. Pro plan allows up to 300 seconds. If the sync is too slow for Hobby, consider splitting it (one user per cron invocation) or upgrading.

**Idempotency:** The existing `updateAllCollections` does `deleteMany` + `createMany` per user, which is inherently idempotent. If the cron fires twice (rare but possible per Vercel docs), the second run overwrites the first with fresh data — acceptable behavior.

**Local testing:** Run `curl http://localhost:3000/api/cron/sync-collections -H "Authorization: Bearer <your-CRON_SECRET>"` to test locally without waiting for Vercel to invoke it.

---

### Feature 5: LGS Scrape Result Caching

**Problem:** Each call to `/api/scrapeLGS` launches a Puppeteer browser, navigates three store sites, and takes several seconds. If two friends search for the same card within a few minutes, the second request wastes the same time and resources.

**Constraint:** Vercel serverless functions are stateless — a new function instance is spun up per request (roughly). In-memory module-level variables persist only within a single warm instance. This means the cache works for repeated requests hitting the same warm instance, but is not shared across cold starts. For this app's scale (5-10 friends, low traffic), this is acceptable — the cache reduces redundant scrapes within a burst of requests.

**Pattern — module-level Map with TTL:**

```typescript
// src/lib/scrapeLGS/cache.ts

interface CacheEntry {
  data: Product[];
  timestamp: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const scrapeCache = new Map<string, CacheEntry>();

export function getCached(query: string): Product[] | null {
  const entry = scrapeCache.get(query.toLowerCase().trim());
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    scrapeCache.delete(query.toLowerCase().trim());
    return null;
  }
  return entry.data;
}

export function setCache(query: string, data: Product[]): void {
  scrapeCache.set(query.toLowerCase().trim(), {
    data,
    timestamp: Date.now(),
  });
}
```

**Route handler update (src/app/api/scrapeLGS/route.ts):**

```typescript
import { getCached, setCache } from '@/lib/scrapeLGS/cache';

export async function POST(request: Request) {
  const { query } = await request.json();

  const cached = getCached(query);
  if (cached) {
    return NextResponse.json({ results: cached, cached: true });
  }

  const results = await scrapeAllSites({ query });
  setCache(query, results);
  return NextResponse.json({ results, cached: false });
}
```

**TTL choice:** 15 minutes is a reasonable default for card prices — store inventory changes slowly. Adjust based on how frequently the friends are checking prices. A longer TTL (e.g. 1 hour) is fine for this use case.

**Alternative — Next.js Data Cache with `unstable_cache`:** The `unstable_cache` API wraps any async function and stores the result in Next.js's persistent Data Cache. This survives across serverless instances on Vercel and is a better option than the module-level Map if the scrape is called from a Server Component context. However, for a POST route handler, `unstable_cache` is less natural. The module-level Map is simpler and sufficient here.

**Security:** No additional security concerns specific to caching. The cache is keyed by the card query string (lowercased and trimmed) and is only accessible server-side.

---

## Feature Dependencies

```
Proxy (auth gate) must exist before any other feature ships
  ↓
Login page (must exist for proxy redirect target)
  ↓
Admin CRUD (requires admin cookie gate from proxy)
  ↓
Nightly cron (requires updateAllCollections to be reliable, proxy must exclude /api/cron/)
  ↓
LGS cache (independent, can be added at any point)
```

---

## MVP Recommendation for This Milestone

Build in this order:

1. **Proxy (proxy.ts) + login page + auth API route** — blocks everything else; the app is publicly accessible until this ships
2. **LGS scrape cache** — quick win, reduces user-visible latency immediately
3. **Vercel Cron** — configure vercel.json, add the GET route handler, set CRON_SECRET; straightforward once proxy is in place
4. **Admin user CRUD** — most UI work; build after auth is confirmed working

Defer for a later milestone:
- Cache hit indicators in the UI (nice-to-have, not functional)
- Splitting the cron into per-user invocations (only needed if sync times out on Hobby)

---

## Security Considerations Summary

| Feature | Risk | Mitigation |
|---------|------|-----------|
| Site password cookie | Password value stored in cookie | Use `httpOnly`, `secure`, `sameSite: 'lax'`; acceptable for this trust model |
| Admin password | Body-based check currently in route | Move primary gate to proxy; keep body check as defense-in-depth |
| Timing attack on password compare | `===` comparison leaks timing info | Use constant-time `safeCompare` helper |
| Cron route unauthorized access | Anyone can hit `/api/cron/sync-collections` | Check `Authorization: Bearer <CRON_SECRET>` header; exclude from site-password gate |
| Admin CRUD routes | User deletion without confirmation | Confirm in UI before sending DELETE; proxy gate handles auth |
| In-memory cache | Stale data served to users | 15-minute TTL; return `cached: true` flag so UI can display freshness |
| Env var exposure | Secrets in client bundle | All secrets accessed only in server-side code (API routes, proxy); never in `"use client"` components |

---

## Required Environment Variables for This Milestone

| Variable | Used By | Notes |
|----------|---------|-------|
| `SITE_PASSWORD` | Login API, proxy | Shared password for all friends |
| `ADMIN_SECRET` | Login API, proxy, updateCollections route | Stronger admin password |
| `CRON_SECRET` | Cron route handler | Set in Vercel project settings; Vercel sends it automatically |

---

## Sources

- Next.js 16 Proxy (formerly Middleware) — https://nextjs.org/docs/app/api-reference/file-conventions/proxy (HIGH confidence, official docs, version 16.1.7)
- Next.js Caching — https://nextjs.org/docs/app/guides/caching (HIGH confidence, official docs, version 16.1.7)
- Vercel Cron Jobs — https://vercel.com/docs/cron-jobs (HIGH confidence, official Vercel docs)
- Vercel Cron Quickstart — https://vercel.com/docs/cron-jobs/quickstart (HIGH confidence, official Vercel docs)
- Vercel Cron Security (CRON_SECRET) — https://vercel.com/docs/cron-jobs/manage-cron-jobs (HIGH confidence, official Vercel docs)
- Vercel Cron Usage and Pricing — https://vercel.com/docs/cron-jobs/usage-and-pricing (HIGH confidence, official Vercel docs)
- Existing codebase: `src/app/api/admin/updateCollections/route.ts`, `src/app/admin/page.tsx`, `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`
