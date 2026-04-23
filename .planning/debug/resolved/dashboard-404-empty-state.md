---
status: resolved
trigger: 'Dashboard history and tuning pages show 404 error label when data is empty'
created: 2026-04-23T00:00:00Z
updated: 2026-04-23T00:00:00Z
---

## Current Focus

hypothesis: API returns 404 when SQLite databases don't exist, frontend displays error instead of empty state
test: Check API routes for history/tuning and how they handle missing DBs
expecting: Find 404 responses on missing data, no empty-state handling in frontend
next_action: Read API routes and frontend pages for history and tuning

## Symptoms

expected: Dashboard history and tuning pages show a friendly "No data available" empty state message
actual: They show a 404 error label instead
errors: 404 error displayed on the pages
reproduction: Delete all SQLite databases, restart dashboard, navigate to history and tuning pages
started: Likely always been this way

## Eliminated

## Evidence

## Resolution

root*cause: In app.ts, /api/search/* and /api/tuning/\_ routes are only mounted when deps.search is defined (line 92). When Qdrant has no collections (empty DB scenario), searchDeps stays undefined in server.ts, so those routes are never registered. Frontend hits unregistered routes → Hono returns 404 → client.ts get() throws "API error 404" → components show error messages instead of their built-in empty states.
fix: Added fallback route handlers in app.ts that return empty payloads when search infrastructure is unavailable. Three fallback routes: /api/search/history → empty list, /api/search/collections → empty array, /api/tuning/chunks → empty response. The frontend components already have proper empty state rendering — they just needed valid empty responses instead of 404s.
verification: All 78 tests pass (75 existing + 3 new fallback route tests). Build succeeds.
files_changed: [packages/dashboard-api/src/app.ts, packages/dashboard-api/src/app.test.ts]
