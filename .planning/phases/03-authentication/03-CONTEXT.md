# Phase 3: Authentication - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Gate every route behind a shared group password via an httpOnly session cookie. Admin routes (`/admin`, `/api/admin/*`) require a second stronger credential. No individual user accounts — this is shared-secret auth for a closed friend group. Login UI, session management, and logout are all in scope. User management UI is Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Admin auth flow
- Single `/login` page handles both group and admin login — no separate admin login page
- Group password → sets `session` cookie (access to all non-admin routes)
- Admin password → sets both `session` + `admin_session` cookies (full access including admin)
- A group member (has `session`, no `admin_session`) hitting `/admin` is redirected to `/login` with message: "Admin access required — enter the admin password"
- Admin back-navigation after logout must not restore access (cookie cleared = session gone)

### Login page design
- Card/box layout — a contained panel centered on screen (not the full-page bold style of the home page)
- Box header: app name "MTGCardSearch" + subtitle "Enter group password to continue"
- Single password input field + submit button using existing `button` CSS class
- Error feedback on wrong password: Claude's discretion

### Session persistence
- Group session cookie: 30-day persistent httpOnly cookie (friends stay logged in across browser restarts)
- Admin session cookie: 30-day persistent httpOnly cookie (same duration as group)
- Rationale: low threat model for a private friend group tool; convenience wins

### Logout behavior
- Logout link lives in the header nav, visible to all authenticated users (alongside existing nav links)
- Clicking logout clears BOTH `session` and `admin_session` cookies (full logout — no downgrade-to-group option)
- After logout, redirect to `/login`

### Claude's Discretion
- Exact cookie signing/encryption mechanism (iron-session vs jose vs Next.js signed cookies) — no auth library overhead preferred, keep it minimal
- Error feedback animation/style on wrong password
- Exact card/box styling (border, shadow, padding) — should be clean and on-brand with Tailwind v4

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth requirements
- `.planning/REQUIREMENTS.md` §Authentication — AUTH-01 through AUTH-04 define the exact acceptance criteria
- `.planning/ROADMAP.md` §Phase 3 — Success criteria for this phase (4 items)

### No external specs
No external ADRs, design docs, or library specs — requirements are fully captured in decisions above and in REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/components/header.tsx`: Header nav component — needs a "Log out" link added
- `src/app/globals.css` + `button` CSS class: Existing button style to use on login form submit
- Archivo / Archivo_Narrow fonts via `src/app/layout.tsx`: Already configured, use in login page
- `src/app/admin/page.tsx`: Has an existing password-in-body pattern (`{ secret: password }`) — this ad-hoc admin auth will be replaced by the `admin_session` cookie

### Established Patterns
- No `middleware.ts` exists yet — must create at project root for route protection
- No auth library installed — must add (iron-session or similar minimal library, or manual cookie handling)
- API routes use Next.js Route Handlers (`route.ts`) — protect each with cookie check or rely on middleware
- All pages are in `src/app/` directory (App Router)

### Integration Points
- **`middleware.ts` (new)**: Created at project root; checks for `session` cookie on all routes; checks `admin_session` on `/admin` and `/api/admin/*`; redirects to `/login` on missing/invalid cookie
- **`src/app/login/page.tsx` (new)**: Login page with card/box layout
- **`src/app/api/auth/login/route.ts` (new)**: POST endpoint that validates password, sets cookie(s), redirects
- **`src/app/api/auth/logout/route.ts` (new)**: POST/GET endpoint that clears both cookies, redirects to `/login`
- **`src/app/components/header.tsx`**: Add logout link to nav
- **`src/app/admin/page.tsx`**: Remove existing manual password-in-body pattern; admin is now protected by `admin_session` middleware instead

</code_context>

<specifics>
## Specific Ideas

- Login box should look more polished than the rest of the site currently does — this is the first visual improvement toward a future V2 redesign. Keep it clean: card with border/shadow, centered, minimal.
- V2 deferred: the rest of the site should eventually get a visual refresh to match the improved login page aesthetic.

</specifics>

<deferred>
## Deferred Ideas

- **Overall site visual redesign** — User noted the rest of the site should look better too, but this is a V2 concern. Only the login page gets the polished card treatment in Phase 3.

</deferred>

---

*Phase: 03-authentication*
*Context gathered: 2026-03-17*
