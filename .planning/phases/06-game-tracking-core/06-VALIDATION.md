---
phase: 6
slug: game-tracking-core
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x with ts-jest |
| **Config file** | `jest.config.js` + `jest.setup.ts` (existing) |
| **Quick run command** | `npx jest --testPathPattern={affected}` |
| **Full suite command** | `npx jest` |
| **Estimated runtime** | ~10 seconds (27 existing tests baseline) |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern={affected}`
- **After every plan wave:** Run `npx jest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD — populated by gsd-planner from RESEARCH.md `## Validation Architecture` section |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add `"test": "jest"` script to `package.json` (currently missing)
- [ ] Any stub test files referenced by later waves (to be filled in by planner)

*Existing jest infrastructure covers framework needs — no new dependencies required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Combobox keyboard navigation feel (↑↓ Enter Esc) | GAME-04, GAME-05 | Real keyboard UX hard to assert in JSDOM beyond a smoke test | Open /games/new, focus player input, type partial name, press ↓↓ Enter — value should commit |
| Visual expand-row animation on history table | GAME-06 | Pure CSS transition | Click a row, confirm smooth expand and correct participant list |
| Modal focus trap + Esc-to-close | GAME-07 | A11y behavior easier to validate manually than via unit test | Open delete modal, Tab through, press Esc, confirm close |
| 429 Retry-After header on real scraper burst | OPT-01 | Rate-limit window is per-instance in-memory; E2E with dev server is the most reliable check | Burst 11 requests to /api/checkDeck in <60s; expect 429 with `Retry-After` header |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
