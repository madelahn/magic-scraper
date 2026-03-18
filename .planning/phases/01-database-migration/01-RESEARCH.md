# Phase 1: Database Migration - Research

**Researched:** 2026-03-16
**Domain:** Prisma driver adapter swap — better-sqlite3 to @prisma/adapter-libsql + @libsql/client (Turso)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Local dev:** `@libsql/client` file mode — `DATABASE_URL=file:./dev.db` continues to work as-is
- **Local dev:** `DATABASE_AUTH_TOKEN` left empty/unset — no cloud auth needed locally
- **Production:** Turso cloud URL (`libsql://<db>.turso.io`) + `DATABASE_AUTH_TOKEN`
- **No Docker, no local Turso server, no separate dev cloud DB** — same file-based SQLite experience
- **Existing data:** Do NOT migrate — start fresh: apply schema to Turso, re-seed via existing seed script
- **Transaction:** Wrap each user's `deleteMany` + `createMany` in a Prisma interactive transaction (`$transaction`)
- **Transaction failure behavior:** Rollback automatically on failure, throw descriptive error with which user failed, what operation was in progress, that cards were left intact, how to fix. Log full error server-side. Return clear non-silent error response from API.

### Claude's Discretion

- Exact Prisma adapter initialization pattern (follows official `@prisma/adapter-libsql` docs)
- Schema apply workflow: `prisma migrate diff --script` output piped into Turso shell (`turso db shell`) — already documented as correct approach
- Whether to use `$transaction` array form or interactive callback form (choose whichever Turso's libsql driver fully supports)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DB-01 | App connects to Turso cloud SQLite DB (replacing local `better-sqlite3`) | Adapter swap: remove `@prisma/adapter-better-sqlite3` + `better-sqlite3`, add `@prisma/adapter-libsql@6.15.0` + `@libsql/client@0.8.1`. Schema provider stays `sqlite`. Preview feature required at Prisma 6.15.x. |
| DB-02 | All existing data models (User, CollectionCard) preserved with no schema changes | Only the `datasource db` block changes. Models, indexes, relations are untouched. Existing migration SQL is directly applicable to Turso via shell. |
| DB-03 | Initial database schema applied to Turso at deploy time via Prisma | `prisma migrate deploy` does not work with libsql. Correct workflow: `prisma migrate diff --script` + `turso db shell < migration.sql`. Existing `prisma/migrations/20260117202652_init/migration.sql` is the SQL to apply. |
</phase_requirements>

---

## Summary

This phase replaces the local `better-sqlite3` native addon with Turso's libSQL driver via `@prisma/adapter-libsql`. The schema models are unchanged — only the `datasource db` block and the `PrismaClient` singleton initialization change. Locally, `DATABASE_URL=file:./dev.db` continues to work because `@libsql/client` supports a file-mode URL with no auth token; production uses `libsql://...turso.io` + `DATABASE_AUTH_TOKEN`. The existing migration SQL in `prisma/migrations/20260117202652_init/migration.sql` is applied to Turso via `turso db shell`, bypassing `prisma migrate deploy` (which is incompatible with libsql's HTTP transport).

The most important version constraint discovered during research: `@prisma/adapter-libsql` version must match the Prisma version exactly. For Prisma 6.15.0, use `@prisma/adapter-libsql@6.15.0`, which in turn pins `@libsql/client` to `^0.8.x` — the latest compatible version is `0.8.1`. Using `@libsql/client@0.17.0` (current npm latest) will break because it is outside the peer dependency range for the 6.15.x adapter.

A second key finding: at Prisma 6.15.0, the `driverAdapters` preview feature flag IS still required in `schema.prisma`. It was moved to GA in Prisma 6.16.0. Since `package.json` uses `^6.15.0`, it may resolve to 6.16.0+ on fresh install — but code should include the preview feature defensively, as it is ignored (not rejected) when GA. The adapter initialization API changed in Prisma 6.6.0: `PrismaLibSQL` now accepts options `{ url, authToken }` directly, without pre-creating a `createClient()` instance.

**Primary recommendation:** Pin `@prisma/adapter-libsql@6.15.0` and `@libsql/client@0.8.1` explicitly (no caret). Update `schema.prisma` generator block. Rewrite `src/lib/prisma.ts` with the new adapter pattern. Wrap `updateCollections.ts` delete+create per-user in `$transaction`. Apply existing migration SQL to Turso via shell.

---

## Standard Stack

### Core Changes

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/adapter-libsql` | `6.15.0` | Turso/libSQL Prisma driver adapter | Must match Prisma version exactly |
| `@libsql/client` | `0.8.1` | libSQL HTTP client used by the adapter | Highest version in `adapter-libsql@6.15.0` peer range (`^0.8.0`) |

### Packages to Remove

| Library | Reason |
|---------|--------|
| `@prisma/adapter-better-sqlite3` | Replaced by libsql adapter |
| `better-sqlite3` | Native addon — won't build on Vercel |
| `@types/better-sqlite3` | No longer needed |

### Version Verification

Versions verified against npm registry on 2026-03-16:

```
npm view @prisma/adapter-libsql@6.15.0 dependencies
# @libsql/client: "^0.3.5 || ^0.4.0 || ^0.5.0 || ^0.6.0 || ^0.7.0 || ^0.8.0"

npm view @libsql/client version
# 0.17.0  (NOT compatible with adapter 6.15.0)

npm view @libsql/client@"^0.8.0" version
# 0.8.0, 0.8.1
```

`@libsql/client@0.17.0` is outside the peer range. Use `0.8.1`.

### Installation

```bash
# Remove native addon
npm uninstall @prisma/adapter-better-sqlite3 better-sqlite3 @types/better-sqlite3

# Add libsql stack — pin versions, no caret
npm install @prisma/adapter-libsql@6.15.0 @libsql/client@0.8.1
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@prisma/adapter-libsql@6.15.0` | Upgrade Prisma to 7.x + adapter 7.x | Would allow `@libsql/client@0.17.0` and removes preview feature flag need, but is a major version change with unknown breaking changes — out of scope for this phase |

---

## Architecture Patterns

### Schema Change — datasource block only

The models are unchanged. Only the generator and datasource blocks change:

```prisma
// Source: docs.turso.tech/sdk/ts/orm/prisma + prisma.io/docs/guides/database/turso
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]  // Required at Prisma 6.15.x; harmless at 6.16.x+
}

datasource db {
  provider = "sqlite"     // stays "sqlite" — NOT "turso", NOT "libsql"
  url      = env("DATABASE_URL")
  // authToken is NOT in the datasource block — it's passed to PrismaLibSQL constructor
}
```

### Pattern 1: PrismaClient Singleton with libsql Adapter (Prisma 6.6.0+ API)

The adapter initialization API changed in Prisma 6.6.0: pass options directly to `PrismaLibSQL`, do not call `createClient()` separately.

```typescript
// src/lib/prisma.ts
// Source: prisma.io/docs (Prisma 6.6.0+ adapter API)
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaLibSQL({
    url: process.env.DATABASE_URL ?? '',
    authToken: process.env.DATABASE_AUTH_TOKEN,  // undefined locally = no auth (file mode)
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

**Key details:**
- `authToken` being `undefined` is safe for local file-mode URLs — `@libsql/client` ignores it
- `DATABASE_URL=file:./dev.db` works locally; `libsql://<db>.turso.io` works in production
- The global singleton pattern is preserved to prevent connection pool exhaustion in Next.js dev

### Pattern 2: Transaction Wrapping in updateCollections.ts

The CONTEXT.md locks the interactive callback form (`$transaction(async (tx) => {...})`). Research found no documented prohibition on this form with libsql — the Turso adapter implements standard SQLite transactions. Use the callback form as decided:

```typescript
// src/lib/updateCollections.ts — per-user block, inside the for loop
// Source: Prisma interactive transaction docs + CONTEXT.md decision
try {
  await prisma.$transaction(async (tx) => {
    await tx.collectionCard.deleteMany({ where: { userId: user.id } });
    await tx.collectionCard.createMany({
      data: cards.map(card => ({
        userId: user.id,
        cardName: card.name,
        scryfallId: card.scryfall_id,
        set: card.set,
        setName: card.set_name,
        quantity: card.quantity,
        condition: card.condition,
        isFoil: card.isFoil,
        typeLine: card.type_line,
      }))
    });
    await tx.user.update({
      where: { id: user.id },
      data: { lastUpdated: new Date() }
    });
  });
} catch (error) {
  // Cards are intact — transaction rolled back
  const message = `Collection update failed for user "${user.name}" (id: ${user.id}). ` +
    `No changes were made — the user's cards are intact. ` +
    `To fix: re-trigger the collection update for this user. ` +
    `Original error: ${error instanceof Error ? error.message : String(error)}`;
  console.error(message, error);
  throw new Error(message);  // Propagate so API route returns a non-200
}
```

**Note:** `user.update` (lastUpdated) is moved inside the transaction so it only commits if the card operations succeed.

### Pattern 3: Schema Apply Workflow for Turso

`prisma migrate deploy` does NOT work with Turso (libsql uses HTTP, which is incompatible with the migration engine's connection requirements).

```bash
# Step 1: Apply existing migration SQL directly to Turso
turso db shell <your-db-name> < prisma/migrations/20260117202652_init/migration.sql

# Step 2: Verify schema was applied
turso db shell <your-db-name> ".tables"

# Step 3: Re-seed users
npx tsx src/scripts/seed.ts
```

If a future schema change is needed (not in this phase):
```bash
# Generate diff as SQL, then apply manually
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  --output migration.sql
turso db shell <your-db-name> < migration.sql
```

### Pattern 4: Environment Variables

```bash
# .env (local — file-based SQLite, no Turso cloud needed)
DATABASE_URL="file:./dev.db"
# DATABASE_AUTH_TOKEN intentionally omitted for local dev

# Vercel environment variables (production)
DATABASE_URL="libsql://<your-db-name>-<org>.turso.io"
DATABASE_AUTH_TOKEN="<your-turso-auth-token>"
```

**Variable naming:** The project keeps `DATABASE_URL` (already used) and adds `DATABASE_AUTH_TOKEN`. The Turso docs use `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` as examples — these are not required names.

### Recommended Project Structure (No Changes)

```
prisma/
├── schema.prisma              # datasource + generator blocks change only
├── migrations/
│   └── 20260117202652_init/
│       └── migration.sql      # Apply to Turso via shell — do not re-run prisma migrate
src/lib/
├── prisma.ts                  # Adapter injection added here
├── updateCollections.ts       # $transaction wrapping added here
src/scripts/
└── seed.ts                    # Unchanged — run after applying schema to Turso
```

### Anti-Patterns to Avoid

- **Running `prisma migrate deploy` against Turso:** Will fail. Use `turso db shell < migration.sql` instead.
- **Using `@libsql/client@^0.17.0` with `@prisma/adapter-libsql@6.15.0`:** Incompatible — out of peer dep range.
- **Using the old `createClient()` pre-6.6.0 API:** `const libsql = createClient({...}); new PrismaLibSQL(libsql)` — works but is deprecated. Use `new PrismaLibSQL({ url, authToken })` directly.
- **Setting `authToken: ''` (empty string) for local dev:** Pass `undefined` or omit the key — some versions of `@libsql/client` treat an empty string auth token as an error on remote URLs.
- **Omitting `previewFeatures = ["driverAdapters"]` at Prisma 6.15.x:** The adapter will not be recognized without it. Include until confirmed that the resolved Prisma version is 6.16.0+.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic delete+create | Manual "backup and restore on failure" | `prisma.$transaction(async tx => {...})` | Transaction handles rollback automatically; manual backup is error-prone and slower |
| libSQL HTTP connection | Custom fetch-based SQL client | `@libsql/client` via `@prisma/adapter-libsql` | libSQL protocol is binary + HTTP/2 with specific auth headers — not trivial to implement |
| SQLite migration apply | Custom migration runner script | `turso db shell < file.sql` | The Turso CLI handles connection, auth, and SQL execution correctly |
| Env-conditional adapter | if/else to pick `better-sqlite3` vs libsql | `@libsql/client` file mode (`file:./dev.db`) | `@libsql/client` natively supports file-based SQLite — no need to maintain two adapters |

**Key insight:** `@libsql/client` handles both local file-based SQLite and remote Turso cloud URLs through the same API — the URL scheme (`file:` vs `libsql:`) drives the connection mode. There is no need to conditionally swap adapters between dev and production.

---

## Common Pitfalls

### Pitfall 1: Adapter version mismatch with @libsql/client

**What goes wrong:** Installing `@prisma/adapter-libsql@6.15.0` alongside `@libsql/client@0.9+` (or the current npm latest `0.17.0`) causes type errors at compile time and runtime failures.

**Why it happens:** The adapter's peer dependency for `6.15.0` is `^0.3.5 || ^0.4.0 || ^0.5.0 || ^0.6.0 || ^0.7.0 || ^0.8.0` — versions 0.9+ are excluded. npm may auto-upgrade `@libsql/client` if specified with a caret (`^0.8.1`).

**How to avoid:** Pin both packages without caret: `@prisma/adapter-libsql@6.15.0` and `@libsql/client@0.8.1`. Verify after install with `npm list @libsql/client`.

**Warning signs:** TypeScript error `Type 'Client' is not assignable to parameter` or runtime `TypeError` on PrismaClient construction.

### Pitfall 2: Missing `previewFeatures = ["driverAdapters"]` at Prisma 6.15.x

**What goes wrong:** PrismaClient is constructed with `{ adapter }` but the adapter is silently ignored — it connects to the default SQLite file without the libsql adapter.

**Why it happens:** At Prisma 6.15.x, driver adapters are still a preview feature. Without the flag, Prisma treats the adapter option as unknown.

**How to avoid:** Add `previewFeatures = ["driverAdapters"]` to the generator block, run `prisma generate`. The flag is safe to include on 6.16.0+ (ignored, not rejected).

**Warning signs:** App works locally but ignores `DATABASE_URL=libsql://...` in production, writing to a local file instead.

### Pitfall 3: `prisma migrate deploy` run against Turso

**What goes wrong:** `prisma migrate deploy` errors out or hangs because libsql uses HTTP transport, which is incompatible with Prisma's migration engine connection protocol.

**Why it happens:** Prisma Migrate uses a direct database connection; the libsql HTTP client does not support this.

**How to avoid:** Apply schema via `turso db shell <db-name> < migration.sql`. Never add `prisma migrate deploy` to CI/CD scripts for Turso.

**Warning signs:** `Error: P3014` or connection timeout errors when running migrate commands against a `libsql://` URL.

### Pitfall 4: Transaction fails silently on collection update

**What goes wrong:** `deleteMany` succeeds but `createMany` fails — the user's collection is left empty. The error is caught by the outer `catch` block without rolling back the delete.

**Why it happens:** Without `$transaction`, `deleteMany` and `createMany` are independent operations. The current code in `updateCollections.ts` has this exact pattern.

**How to avoid:** Wrap both operations in `prisma.$transaction(async (tx) => {...})`. The CONTEXT.md locks this decision. Use `tx.collectionCard.deleteMany` and `tx.collectionCard.createMany` — not `prisma.*` — inside the callback.

**Warning signs:** Users report empty collections after a failed sync; logs show "Deleted N old cards" but no "Inserted M new cards" line.

### Pitfall 5: Empty string auth token for local dev

**What goes wrong:** Setting `DATABASE_AUTH_TOKEN=""` in `.env` and passing it to `PrismaLibSQL` may cause `@libsql/client` to attempt token-authenticated connections with an empty bearer token.

**Why it happens:** Some versions of `@libsql/client` treat `authToken: ""` differently from `authToken: undefined`.

**How to avoid:** Omit `DATABASE_AUTH_TOKEN` from `.env` entirely for local dev — `process.env.DATABASE_AUTH_TOKEN` will be `undefined`, which is the correct signal for file-mode connections.

---

## Code Examples

### Complete src/lib/prisma.ts (post-migration)

```typescript
// Source: Turso docs + Prisma 6.6.0+ adapter API
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaLibSQL({
    url: process.env.DATABASE_URL ?? '',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

### schema.prisma generator + datasource (post-migration)

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

### Seed script invocation (unchanged — for reference)

```bash
# After applying schema to Turso, re-seed users
npx tsx src/scripts/seed.ts
```

The seed script at `src/scripts/seed.ts` calls `seedUsers()` from `src/lib/seedUsers.ts`, which uses `prisma.user.upsert` — idempotent and safe to run multiple times.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createClient()` from `@libsql/client`, pass instance to `PrismaLibSQL(libsql)` | `new PrismaLibSQL({ url, authToken })` — options passed directly | Prisma 6.6.0 | Removes need to import `@libsql/client` directly in `prisma.ts` |
| `previewFeatures = ["driverAdapters"]` required | Flag optional (GA) | Prisma 6.16.0 | Safe to include at 6.15.x — include it |
| `prisma migrate deploy` for schema apply | `turso db shell < file.sql` | Since Turso support added (5.4.2) | No migration engine involvement at deploy time |

**Deprecated/outdated:**
- Old adapter init (`new PrismaLibSQL(createClient({...}))`): Still functional but deprecated in 6.6.0; avoid for new code
- `better-sqlite3` in serverless/Vercel contexts: Native addon; build fails on Vercel without extra webpack config; libsql replaces it cleanly

---

## Open Questions

1. **Does Prisma interactive `$transaction` callback work with `@libsql/client@0.8.1`?**
   - What we know: No documented prohibition found in official Prisma or Turso docs. A regression was reported in Prisma 6.6.0 and later fixed. The Turso docs do not explicitly state this form is unsupported.
   - What's unclear: Confirmation that the callback form works correctly at Prisma 6.15.0 + libsql 0.8.1.
   - Recommendation: Proceed with the callback form as locked in CONTEXT.md. If it fails at runtime, fall back to the sequential array form `prisma.$transaction([...])`. The array form is definitely supported (it maps to libsql batch).

2. **Does `package.json`'s `^6.15.0` resolve to 6.16.0+ after npm install?**
   - What we know: Prisma 6.16.0 was released recently; `^6.15.0` would accept it.
   - What's unclear: Whether Vercel's install will resolve to 6.16.0+.
   - Recommendation: Include `previewFeatures = ["driverAdapters"]` regardless — it is ignored at 6.16.0+, not rejected. Alternatively, pin Prisma to `6.15.0` exactly in package.json.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected in project |
| Config file | None — see Wave 0 |
| Quick run command | `npx tsx src/scripts/seed.ts` (smoke: seed succeeds) |
| Full suite command | Manual: start dev server, hit each route, verify responses |

**No automated test infrastructure exists in this project.** This phase's validation is primarily manual/smoke-based.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DB-01 | App connects to Turso cloud DB | smoke | `npx tsx -e "import('./src/lib/prisma.ts').then(m=>m.prisma.user.count()).then(console.log)"` | ❌ Wave 0 |
| DB-02 | All models present, no schema changes | manual | Verify `turso db shell <db> ".schema"` shows `users` and `collection_cards` tables | N/A — Turso CLI |
| DB-03 | Schema applied to Turso | manual | `turso db shell <db> ".tables"` returns `collection_cards` and `users` | N/A — Turso CLI |

### Sampling Rate

- **Per task commit:** `npm run build` — verifies no native addon errors, Prisma generates correctly
- **Per wave merge:** `npm run dev` + manual route hit on each endpoint (checkDeck, updateCollections, scrapeLGS)
- **Phase gate:** All three routes return correct data against Turso URL before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] No test framework installed — this phase does not require one; manual smoke testing is sufficient
- [ ] `.env` file does not exist — must be created with `DATABASE_URL=file:./dev.db` before any testing

---

## Sources

### Primary (HIGH confidence)

- npm registry — `npm view @prisma/adapter-libsql@6.15.0 dependencies` (peer dep range for @libsql/client verified 2026-03-16)
- npm registry — `npm view @libsql/client version` (latest: 0.17.0; highest compatible: 0.8.1 verified 2026-03-16)
- [docs.turso.tech/sdk/ts/orm/prisma](https://docs.turso.tech/sdk/ts/orm/prisma) — datasource provider value (`"sqlite"`), auth token not in datasource block, migration apply via `turso db shell`, PrismaLibSQL init pattern
- [prisma.io/docs/guides/database/turso](https://www.prisma.io/docs/guides/database/turso) — `previewFeatures = ["driverAdapters"]` requirement, package names

### Secondary (MEDIUM confidence)

- WebSearch + GitHub issue #26888 + GitClear release notes — Prisma 6.6.0 changed `PrismaLibSQL` to accept options directly; 6.16.0 moved `driverAdapters` to GA (verified by multiple sources)
- WebSearch + WebSearch cross-reference — `@libsql/client@0.15.15+` incompatible with adapter `6.15.0` (reported in GitHub issues, consistent with npm peer dep range)

### Tertiary (LOW confidence)

- WebSearch only (unverified via official docs) — Interactive `$transaction` callback form works with libsql. No documentation explicitly confirms or denies this for Prisma 6.15.x + @libsql/client@0.8.x.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions verified directly against npm registry
- Architecture: HIGH — schema changes and adapter patterns verified against official Turso + Prisma docs
- Transaction support: MEDIUM — callback form assumed supported; no official confirmation or denial found; fallback identified
- Pitfalls: HIGH — version mismatch and migrate deploy pitfalls verified; auth token pitfall is empirical best practice

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable ecosystem; adapter version pinned so no drift expected)
