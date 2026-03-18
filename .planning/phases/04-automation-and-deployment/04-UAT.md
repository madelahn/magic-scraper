---
status: testing
phase: 04-automation-and-deployment
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md]
started: 2026-03-17T21:00:00Z
updated: 2026-03-17T21:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Admin panel user list
expected: |
  Navigate to /admin while logged in as an admin. A "Users" section should appear above the "Update All Collections" button, listing existing users with their names and Moxfield Collection IDs. Each user row has a Delete button.
awaiting: user response

## Tests

### 1. Admin panel user list
expected: Navigate to /admin while logged in as an admin. A "Users" section should appear above the "Update All Collections" button, listing existing users with their names and Moxfield Collection IDs. Each user row has a Delete button.
result: [pending]

### 2. Add user
expected: In the admin panel, fill in a name and a Moxfield Collection ID in the Add User form and submit. The new user should appear in the user list immediately (no page refresh) with a green success message.
result: [pending]

### 3. Delete user (two-step confirm)
expected: Click "Delete" next to a user. An inline "Are you sure?" confirmation appears in that row. Clicking the confirm button removes the user from the list immediately and shows a success message.
result: [pending]

### 4. Duplicate user rejected
expected: Try adding a user with a Moxfield Collection ID that already exists in the list. A red error message appears (no page reload) indicating the user already exists or the collection ID is taken. The list remains unchanged.
result: [pending]

### 5. Cron endpoint rejects unauthorized requests
expected: Make a GET request to /api/cron/sync-collections without an Authorization header (e.g., open in browser or use curl without a header). The response should be 401 Unauthorized — not 200, 404, or 500.
result: [pending]

### 6. Deployment guide completeness
expected: Open DEPLOYMENT.md at the project root. It should contain all of these sections: Prerequisites, Local Dev quickstart, Turso database setup, Vercel project setup, an Environment Variables table listing all 7 env vars with descriptions and examples, Cron Job setup notes, Fluid Compute instructions, and a post-deploy verification checklist.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
