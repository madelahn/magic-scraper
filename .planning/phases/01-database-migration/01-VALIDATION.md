---
phase: 1
slug: database-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test framework in project |
| **Config file** | none — manual smoke testing only |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run dev` + manual route hits |
| **Estimated runtime** | ~30 seconds (build) + ~2 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` — verifies no native addon errors, Prisma generates correctly
- **After every plan wave:** Start `npm run dev` + manually hit each route (checkDeck, scrapeLGS, admin)
- **Before `/gsd:verify-work`:** All three routes return correct data against Turso URL
- **Max feedback latency:** ~30 seconds (build check)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-T1 | 01 | 1 | DB-01 | smoke | `npm run build` | ✅ | ⬜ pending |
| 1-01-T2 | 01 | 1 | DB-01 | smoke | `npx tsx -e "import('./src/lib/prisma.ts').then(m=>m.prisma.user.count()).then(console.log)"` | ❌ W0 | ⬜ pending |
| 1-01-T3 | 01 | 2 | DB-02 | manual | `turso db shell <db> ".schema"` shows `users` and `collection_cards` | N/A | ⬜ pending |
| 1-01-T4 | 01 | 2 | DB-03 | manual | `turso db shell <db> ".tables"` returns both tables | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.env` file created with `DATABASE_URL=file:./dev.db` and `DATABASE_AUTH_TOKEN=` (empty) before any testing

*No test framework installation needed — manual smoke testing is sufficient for this infrastructure phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All models present in Turso | DB-02 | Turso CLI required, no programmatic check | `turso db shell <db-name> ".schema"` — verify `CREATE TABLE users` and `CREATE TABLE collection_cards` present |
| Schema applied to Turso | DB-03 | Requires Turso CLI and live DB | `turso db shell <db-name> ".tables"` — verify both `users` and `collection_cards` listed |
| Routes return correct data | DB-01 | Requires running server + Turso URL | Start `npm run dev` with Turso `DATABASE_URL`; POST `/api/checkDeck` with a known decklist; verify response |
| Transaction atomicity | DB-02 | Requires deliberate failure injection | Temporarily add `throw new Error()` mid-transaction, trigger update, verify user still has original cards |
| Build passes on Vercel config | SC-4 | Requires build run | `npm run build` — must exit 0 with no `better-sqlite3` or native addon errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
