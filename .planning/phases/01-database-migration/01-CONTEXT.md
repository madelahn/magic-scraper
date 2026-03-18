# Phase 1: Database Migration - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace local SQLite (`better-sqlite3`) with Turso cloud DB (`@libsql/client` + Prisma libsql adapter). No schema changes, no new features. Every existing route (checkDeck, scrapeLGS, updateCollections) keeps working — only the data layer changes. Wrap the collection update in a Prisma transaction to achieve atomicity (Phase 1 success criteria #3).

</domain>

<decisions>
## Implementation Decisions

### Local dev workflow
- Use `@libsql/client` file mode for local development — `DATABASE_URL=file:./dev.db` continues to work as-is
- `DATABASE_AUTH_TOKEN` is left empty/unset for local dev (no cloud auth needed)
- Production uses the Turso cloud URL (`libsql://<db>.turso.io`) + `DATABASE_AUTH_TOKEN`
- No Docker, no local Turso server, no separate dev cloud DB — same file-based SQLite experience with zero extra setup

### Existing data
- Do NOT migrate existing local SQLite data to Turso
- Start fresh: apply schema to Turso, then re-seed via the existing seed script
- No export/import step needed

### Transaction failure behavior
- Wrap each user's `deleteMany` + `createMany` in a Prisma interactive transaction (`$transaction`)
- On failure: rollback automatically (no partial state), then throw a descriptive error that includes:
  - Which user's collection failed
  - What operation was in progress
  - That the user's cards were left intact (not partially deleted)
  - How to fix it (re-run the collection update for that user)
- Log the full error server-side
- Return a clear, non-silent error response from the API so the admin UI can display it — no swallowing errors with a generic "something went wrong"

### Claude's Discretion
- Exact Prisma adapter initialization pattern (follows official `@prisma/adapter-libsql` docs)
- Schema apply workflow: `prisma migrate diff --script` output piped into Turso shell (`turso db shell`) — already documented as the correct approach for Turso
- Whether to use `$transaction` array form or interactive callback form (choose whichever Turso's libsql driver fully supports)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database schema
- `prisma/schema.prisma` — Current schema (provider must change from `sqlite` to `turso`; models stay unchanged)
- `prisma/migrations/20260117202652_init/migration.sql` — Existing migration SQL to apply to Turso via `turso db shell`

### Collection update (transaction target)
- `src/lib/updateCollections.ts` — Contains the `deleteMany` + `createMany` pattern that needs transaction wrapping
- `src/lib/prisma.ts` — Prisma client singleton; needs adapter injection

### Requirements
- `.planning/REQUIREMENTS.md` §Database — DB-01, DB-02, DB-03 define what must be true after this phase
- `.planning/ROADMAP.md` §Phase 1 — Success criteria 1–4 are the acceptance bar

No external specs — requirements fully captured in decisions above and the referenced planning docs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `prisma/schema.prisma`: Schema is unchanged (User, CollectionCard models stay as-is); only `datasource db` block changes
- `src/lib/prisma.ts`: Singleton pattern stays; adapter instantiation added before `PrismaClient()`
- `prisma/migrations/20260117202652_init/migration.sql`: Existing migration SQL can be applied directly to Turso via shell

### Established Patterns
- Global Prisma singleton in `src/lib/prisma.ts` — prevents connection pooling issues; keep pattern, add adapter
- `deleteMany` + `createMany` per user in `updateCollections.ts` — wrap in `$transaction`, don't restructure the logic
- `DATABASE_URL` env var already used by Prisma; add `DATABASE_AUTH_TOKEN` as second env var for Turso

### Integration Points
- `src/lib/prisma.ts` — single change point for the adapter; all other files import from here and are unaffected
- `prisma/schema.prisma` datasource block — change `provider` and `url`/`authToken` fields
- `src/lib/updateCollections.ts` — wrap existing delete+create calls in `$transaction`
- `package.json` — remove `@prisma/adapter-better-sqlite3` + `better-sqlite3` + `@types/better-sqlite3`, add `@prisma/adapter-libsql` + `@libsql/client`

</code_context>

<specifics>
## Specific Ideas

- Local dev continues to feel exactly like before — `DATABASE_URL=file:./dev.db`, run `npm run dev`, done
- Error message on transaction failure should be actionable: tell the admin exactly which user failed and that they can re-trigger the update to fix it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-database-migration*
*Context gathered: 2026-03-16*
