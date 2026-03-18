# Technology Stack

**Project:** magic-scraper — Vercel deployment milestone
**Researched:** 2026-03-16
**Confidence note:** Web search and WebFetch were unavailable in this session. All findings are from
training data (cutoff August 2025) cross-checked against known package release histories and official
API surfaces. Confidence levels are assigned honestly. Verify pinned versions against npm before
installing.

---

## Recommended Stack

### Changes From Current Stack

The current stack uses `better-sqlite3` + `@prisma/adapter-better-sqlite3` against a local SQLite
file. The deployment milestone requires four targeted changes:

| Current | Replacement | Reason |
|---------|-------------|--------|
| `better-sqlite3` | `@libsql/client` + `@prisma/adapter-libsql` | Turso is libSQL over HTTP — better-sqlite3 is a native binding that requires a local file and won't work on Vercel |
| `puppeteer` (full) | `puppeteer-core` + `@sparticuz/chromium` | Full Puppeteer bundles a Chromium binary (~170 MB) that exceeds Vercel's 50 MB function limit; @sparticuz/chromium is a stripped Chromium built for AWS Lambda / Vercel |
| No auth | httpOnly cookie (hand-rolled) | Simple shared-password gate for a closed friend group; no auth library needed |
| No cron | Vercel Cron via `vercel.json` | Free Hobby tier supports 1 daily cron job |

---

## 1. Prisma + Turso (libSQL)

### How It Works

Prisma connects to Turso via the `@prisma/adapter-libsql` driver adapter, which wraps `@libsql/client`.
The client speaks the libSQL protocol over HTTPS (or WebSocket), so no local file access is needed.
This is an officially supported Prisma driver adapter as of Prisma 5.4.2+.

The current project is on Prisma 6.15.0, which fully supports this adapter.

### Packages to Install

```bash
# Add
npm install @prisma/adapter-libsql @libsql/client

# Remove (no longer needed on Vercel — keep locally if you want local dev with SQLite)
npm uninstall @prisma/adapter-better-sqlite3 better-sqlite3
```

| Package | Version | Purpose |
|---------|---------|---------|
| `@prisma/adapter-libsql` | `^6.15.0` | Prisma driver adapter for libSQL/Turso — match your Prisma version |
| `@libsql/client` | `^0.14.0` | libSQL HTTP/WebSocket client (underlying transport) |

**Confidence:** HIGH — this adapter has been the canonical Prisma/Turso integration path since Prisma 5.4.2. The `@prisma/adapter-libsql` package version should track your `prisma` and `@prisma/client` versions.

### Prisma Schema Changes

Two changes required: generator config (add `previewFeatures`) and datasource provider.

**Before (`prisma/schema.prisma`):**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

**After:**
```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "sqlite"
  url      = env("TURSO_DATABASE_URL")
  relationMode = "prisma"
}
```

**Note on `relationMode = "prisma"`:** Turso does not enforce foreign keys at the database level by
default. Setting `relationMode = "prisma"` makes Prisma enforce referential integrity in application
code instead of relying on DB constraints. This is the documented recommendation for Turso. Your
existing schema uses `onDelete: Cascade` on `CollectionCard → User`; with `relationMode = "prisma"`
Prisma handles the cascade in code.

**Note on `previewFeatures`:** As of Prisma 6.x, driver adapters may have graduated out of preview.
Check the Prisma 6 changelog — if `driverAdapters` is GA, this line can be omitted. Including it is
safe either way (it is a no-op if already GA).

### Prisma Client Instantiation Change

The client initialization must change to pass the adapter.

**Before:**
```typescript
// src/lib/prisma.ts (approximate current pattern)
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
export default prisma
```

**After:**
```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const libsql = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const adapter = new PrismaLibSQL(libsql)

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

The global singleton pattern prevents multiple client instances during Next.js hot reload in dev.

### Required Environment Variables

```bash
# .env (local dev — point at your Turso database)
TURSO_DATABASE_URL="libsql://your-db-name.turso.io"
TURSO_AUTH_TOKEN="your-turso-auth-token"

# For local dev using an embedded replica (optional, faster local dev):
# TURSO_DATABASE_URL="file:./dev.db"
# TURSO_AUTH_TOKEN=""  # empty token works for local file
```

Turso free tier provides 500 databases, 9 GB storage, and 1 billion row reads/month — well within
the needs of a small friend-group app.

### Migration Strategy

Turso does not run Prisma migrations the same way as SQLite files. Recommended approach:

1. Run `npx prisma migrate dev` locally against the Turso remote URL to apply the initial schema.
2. On subsequent deploys, run `npx prisma migrate deploy` in the Vercel build step.
3. Add to `package.json` scripts:
   ```json
   "postbuild": "prisma generate"
   ```
   Or run `prisma generate` as part of the Vercel build command.

---

## 2. Puppeteer on Vercel (@sparticuz/chromium)

### Why Full Puppeteer Fails on Vercel

Vercel serverless functions have a **50 MB compressed bundle limit**. `puppeteer` (full package)
downloads a full Chromium binary (~170 MB uncompressed, ~100+ MB compressed) during `npm install`
and references it at runtime. This exceeds the bundle limit and also violates Vercel's read-only
filesystem constraint for writing Chrome's runtime files.

`@sparticuz/chromium` is a Chromium build specifically stripped and compressed for AWS Lambda and
Vercel-like environments. It decompresses at runtime into `/tmp` (which is writable in serverless).
The uncompressed binary is ~170 MB but fits because it lives in `/tmp`, not the function bundle.

### Packages

```bash
# Remove full puppeteer
npm uninstall puppeteer

# Add serverless-compatible pair
npm install puppeteer-core @sparticuz/chromium
```

| Package | Version | Purpose |
|---------|---------|---------|
| `puppeteer-core` | `^22.x` or `^23.x` | Puppeteer without the bundled Chromium download — use this to control the @sparticuz/chromium binary |
| `@sparticuz/chromium` | `^131.0.0` or latest | Stripped Chromium binary for serverless environments |

**CRITICAL VERSION CONSTRAINT:** `puppeteer-core` and `@sparticuz/chromium` must target the same
Chrome version. `@sparticuz/chromium` releases follow Chrome version numbers (e.g., v131.0.0 =
Chrome 131). Check the `@sparticuz/chromium` README on GitHub for the compatible `puppeteer-core`
version for your chosen chromium version.

As of mid-2025, `@sparticuz/chromium@131` paired with `puppeteer-core@22.x` was the well-tested
combination. **Verify on npm before pinning.**

**Confidence:** MEDIUM — the package pairing pattern is stable and well-documented, but exact minor
versions should be confirmed against the @sparticuz/chromium compatibility table before installing.

### Code Change Pattern

Existing scraper files use `puppeteer.launch(...)`. Change to:

```typescript
// Before (src/lib/scrapeLGS/browser.ts)
import puppeteer from 'puppeteer'
const browser = await puppeteer.launch({ headless: true })

// After
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
})
```

The import changes from `puppeteer` to `puppeteer-core` and from `puppeteer-core` to `@sparticuz/chromium`.
All existing `page.*` API calls remain identical — only the launch configuration changes.

### Next.js Configuration

Vercel/webpack needs to know not to try to bundle the Chromium binary. Add to `next.config.ts`:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent webpack from bundling chromium — it loads at runtime from /tmp
      config.externals = [...(config.externals || []), '@sparticuz/chromium']
    }
    return config
  },
  // Required: tell Next.js these routes use Node.js runtime, not Edge runtime
  // (Edge runtime does not support spawning processes)
  experimental: {
    // No special flag needed — App Router API routes default to Node.js runtime
  },
}

export default nextConfig
```

**Important:** Vercel serverless functions that use Puppeteer must explicitly declare Node.js runtime
in the route file, not Edge runtime:

```typescript
// src/app/api/scrapeLGS/route.ts — add this at the top
export const runtime = 'nodejs'

// Also set max duration (Vercel Hobby allows up to 60s on Pro, 10s on Hobby for standard)
export const maxDuration = 60 // seconds — verify against your Vercel plan
```

**Hobby tier timeout:** Vercel Hobby plan serverless functions have a **10-second execution timeout**
for standard functions. Puppeteer scraping a page often takes longer than 10 seconds. This is a
hard constraint on the free tier.

Mitigation options:
1. Use `export const maxDuration = 60` — this requires Vercel Pro (not free).
2. Optimize scrapers to be faster (e.g., block images/CSS in Puppeteer to reduce load time).
3. Accept that the free tier constraint limits scraping to fast-loading pages only.

This is a **critical constraint** that should be surfaced in the roadmap.

### Vercel Function Size Limit

The Vercel 50 MB limit applies to the deployed function bundle (your code + node_modules). The
`@sparticuz/chromium` package itself adds roughly 50–60 MB to the bundle. This may push the
`/api/scrapeLGS` route close to or over the limit.

To address this, use Vercel's `functions` config to isolate the scraper routes:

```json
// vercel.json
{
  "functions": {
    "src/app/api/scrapeLGS/route.ts": {
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

If bundle size is an issue, the `@sparticuz/chromium-min` package variant downloads the binary from
an S3 URL at cold start instead of bundling it, keeping the function bundle under 50 MB. This adds
~3-5s cold start latency but solves the size constraint:

```typescript
// chromium-min usage
import chromium from '@sparticuz/chromium-min'

const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(
    'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'
  ),
  headless: chromium.headless,
})
```

**Recommendation:** Start with `@sparticuz/chromium` (no S3 dependency). If builds fail due to
size, switch to `@sparticuz/chromium-min`.

---

## 3. Vercel Cron Jobs

### Setup

Vercel Cron is configured entirely in `vercel.json` at the project root. No packages required.

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync-collections",
      "schedule": "0 6 * * *"
    }
  ]
}
```

- `schedule` uses standard cron syntax in UTC. `0 6 * * *` = 6:00 AM UTC daily (midnight EST /
  1 AM EDT — adjust to taste).
- The `path` must be a valid GET-able API route in your Next.js app.
- Vercel Hobby plan: **1 cron job**, minimum frequency = daily (cannot run more than once per day
  on free tier). This project only needs one daily sync, so the free tier is sufficient.

**Confidence:** HIGH — Vercel Cron `vercel.json` syntax is stable and well-documented.

### API Route

Create a new route for the cron trigger. Cron jobs call the endpoint with a GET request and pass
a `Authorization: Bearer <CRON_SECRET>` header that Vercel sets automatically.

```typescript
// src/app/api/cron/sync-collections/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { updateAllCollections } from '@/lib/updateCollections'

export const runtime = 'nodejs'
export const maxDuration = 60 // needs Pro, or reduce to 10 for Hobby

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await updateAllCollections()
    return NextResponse.json({ success: true, message: 'Collections synced' })
  } catch (error) {
    console.error('Cron sync failed:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
```

Add to environment variables:
```bash
CRON_SECRET="a-long-random-secret-string"
```

Vercel automatically injects `CRON_SECRET` into cron requests. Set this variable in the Vercel
dashboard and locally in `.env`.

**Important:** The cron route triggers `updateAllCollections()` which internally uses Puppeteer
(for Moxfield scraping). The same 10-second timeout constraint from Section 2 applies. If
collection sync takes more than 10 seconds (it likely does — it scrapes multiple Moxfield pages),
this will time out on Hobby tier. Consider decoupling the cron trigger from the actual sync by
having the cron set a flag and a separate long-running process handle the sync, or upgrade to Pro
for the 60-second limit.

---

## 4. Simple httpOnly Cookie Auth (App Router, No Library)

### Design

Two passwords, two cookies:
- `auth_session` — presence means user has entered the group password
- `admin_session` — presence means user has entered the admin password

Both are httpOnly, Secure, SameSite=Lax cookies. No JWT, no database, no library.

**Confidence:** HIGH — this is standard Next.js App Router cookie handling with the built-in
`next/headers` cookies API.

### Environment Variables

```bash
AUTH_PASSWORD="shared-group-password"
ADMIN_PASSWORD="separate-admin-password"
AUTH_SECRET="random-string-used-to-sign-cookies"  # optional if not signing
```

### Login API Route

```typescript
// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const { password, type } = await request.json()

  if (type === 'admin') {
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
    }
    const response = NextResponse.json({ success: true })
    response.cookies.set('admin_session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    return response
  }

  if (password !== process.env.AUTH_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set('auth_session', 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return response
}
```

### Logout Route

```typescript
// src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('auth_session')
  response.cookies.delete('admin_session')
  return response
}
```

### Middleware (Protecting All Routes)

Use Next.js middleware to gate every page and API route. This runs at the edge before any route
handler, so unauthorized requests never reach application code.

```typescript
// middleware.ts (project root, next to package.json)
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow the auth login routes through (otherwise users can never log in)
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const authCookie = request.cookies.get('auth_session')

  // No auth cookie — redirect to login page
  if (!authCookie || authCookie.value !== 'authenticated') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // For admin routes, additionally check the admin cookie
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    const adminCookie = request.cookies.get('admin_session')
    if (!adminCookie || adminCookie.value !== 'authenticated') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  // Match all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### Login Page (Minimal)

```typescript
// src/app/login/page.tsx — client component
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, type: 'user' }),
    })
    if (res.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError('Wrong password')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Group password"
      />
      <button type="submit">Enter</button>
      {error && <p>{error}</p>}
    </form>
  )
}
```

**Security note:** Cookie value is `'authenticated'` (a static string). This is sufficient for a
closed friend group behind a shared password — it is not a signed JWT. If the cookie value is
guessed or spoofed, the gate is bypassed. For this use case (private friend group, not financial
or sensitive data), this risk is acceptable. If stricter security is needed, sign the cookie value
with `AUTH_SECRET` using the Web Crypto API.

---

## Complete Package Change Summary

### Packages to Remove

```bash
npm uninstall puppeteer @prisma/adapter-better-sqlite3 better-sqlite3 @types/better-sqlite3
```

### Packages to Add

```bash
# Prisma + Turso
npm install @prisma/adapter-libsql @libsql/client

# Puppeteer serverless
npm install puppeteer-core @sparticuz/chromium
```

### Resulting `dependencies` section (approximate)

```json
{
  "dependencies": {
    "@libsql/client": "^0.14.0",
    "@prisma/adapter-libsql": "^6.15.0",
    "@sparticuz/chromium": "^131.0.0",
    "lucide-react": "^0.562.0",
    "next": "^16.1.6",
    "puppeteer-core": "^22.0.0",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@prisma/client": "^6.15.0",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.1",
    "prisma": "^6.15.0",
    "tailwindcss": "^4",
    "tsx": "^4.21.0",
    "typescript": "^5"
  }
}
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Cloud DB | Turso (libSQL) | PlanetScale, Neon (Postgres) | Schema is SQLite; Turso = zero schema changes, just driver swap |
| Serverless Chromium | `@sparticuz/chromium` | `chrome-aws-lambda` | `chrome-aws-lambda` is unmaintained (last release 2022); `@sparticuz/chromium` is the active fork |
| Serverless Chromium | `@sparticuz/chromium` | `playwright` + `@playwright/browser-chromium` | Same bundle size problem, no advantage for this use case |
| Auth | Hand-rolled httpOnly cookie | `next-auth`, `lucia`, `better-auth` | Auth libraries are overkill for a single shared password; they add complexity and require a User model |
| Cron | Vercel Cron | Upstash QStash, GitHub Actions schedule | Vercel Cron is built-in, zero config, free on Hobby for daily jobs |

---

## Known Constraints (Hard Limits on Free Tier)

| Constraint | Limit | Impact |
|------------|-------|--------|
| Vercel Hobby function timeout | 10 seconds | Puppeteer scraping may time out; Moxfield sync almost certainly will |
| Vercel Hobby cron jobs | 1 per project, daily minimum | Sufficient — only one nightly sync needed |
| Vercel function bundle size | 50 MB compressed | `@sparticuz/chromium` is ~50 MB; may require `chromium-min` variant |
| Turso free tier | 500 DBs, 9 GB storage, 1B row reads/month | Well within bounds for this use case |
| Vercel serverless filesystem | `/tmp` only, 512 MB | Chromium decompresses to `/tmp` — within limits |

---

## Sources

All findings are from training data (cutoff August 2025). No live web fetches were possible in this
session (WebSearch and WebFetch were blocked). The following official sources were used as the basis
for recommendations and should be verified before implementation:

- Prisma Turso docs: https://www.prisma.io/docs/orm/overview/databases/turso
- `@sparticuz/chromium` README: https://github.com/Sparticuz/chromium
- Vercel Cron docs: https://vercel.com/docs/cron-jobs
- Next.js App Router cookies docs: https://nextjs.org/docs/app/api-reference/functions/cookies
- Next.js Middleware docs: https://nextjs.org/docs/app/building-your-application/routing/middleware
- Vercel function size limits: https://vercel.com/docs/functions/limitations

**Version verification required before installing:**
- `@sparticuz/chromium` + `puppeteer-core` version pairing (check chromium README compatibility table)
- `@prisma/adapter-libsql` version (should match installed `prisma` version — 6.15.0)
- `@libsql/client` latest stable release
