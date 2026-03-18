---
phase: 3
slug: authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (via ts-jest) |
| **Config file** | `jest.config.ts` — none yet, Wave 0 installs |
| **Quick run command** | `npx jest --passWithNoTests` |
| **Full suite command** | `npx jest --passWithNoTests` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --passWithNoTests`
- **After every plan wave:** Run `npx jest --passWithNoTests`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| AUTH-01-proxy-redirect | TBD | 1+ | AUTH-01 | unit | `npx jest tests/proxy.test.ts -t "redirects unauthenticated"` | ❌ W0 | ⬜ pending |
| AUTH-01-proxy-pass | TBD | 1+ | AUTH-01 | unit | `npx jest tests/proxy.test.ts -t "allows valid session"` | ❌ W0 | ⬜ pending |
| AUTH-02-login-sets-cookie | TBD | 1+ | AUTH-02 | unit | `npx jest tests/auth-login.test.ts -t "sets session cookie"` | ❌ W0 | ⬜ pending |
| AUTH-02-login-wrong-pw | TBD | 1+ | AUTH-02 | unit | `npx jest tests/auth-login.test.ts -t "rejects wrong password"` | ❌ W0 | ⬜ pending |
| AUTH-03-admin-redirect | TBD | 1+ | AUTH-03 | unit | `npx jest tests/proxy.test.ts -t "redirects group user from admin"` | ❌ W0 | ⬜ pending |
| AUTH-03-admin-both-cookies | TBD | 1+ | AUTH-03 | unit | `npx jest tests/auth-login.test.ts -t "sets both cookies for admin"` | ❌ W0 | ⬜ pending |
| AUTH-04-logout-clears | TBD | 1+ | AUTH-04 | unit | `npx jest tests/auth-logout.test.ts -t "clears cookies"` | ❌ W0 | ⬜ pending |
| AUTH-04-post-logout-redirect | TBD | 1+ | AUTH-04 | unit | `npx jest tests/proxy.test.ts -t "redirects after logout"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `jest.config.ts` — jest config with ts-jest transform
- [ ] `jest.setup.ts` — shared setup/teardown
- [ ] `tests/proxy.test.ts` — stubs for AUTH-01, AUTH-03, AUTH-04 (proxy redirect logic)
- [ ] `tests/auth-login.test.ts` — stubs for AUTH-02, AUTH-03 (login route handler)
- [ ] `tests/auth-logout.test.ts` — stubs for AUTH-04 (logout route handler)
- [ ] `src/lib/auth.ts` — shared HMAC helpers (required by all test targets before they can import)
- [ ] Install: `npm install --save-dev jest @types/jest ts-jest`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 30-day cookie persists across browser restart | AUTH-02 | Requires real browser session close/reopen | 1. Log in. 2. Close browser completely. 3. Reopen and navigate to app. 4. Confirm no redirect to login. |
| Back-nav after logout blocked | AUTH-04 | Requires real browser history/cache behavior | 1. Log in. 2. Navigate to /checkDeck. 3. Log out. 4. Press browser back button. 5. Confirm redirect to login, not cached page. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
