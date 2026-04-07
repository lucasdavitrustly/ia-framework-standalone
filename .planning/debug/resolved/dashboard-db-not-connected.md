---
status: resolved
trigger: "Dashboard UI shows 'database not connected' despite the system being operational (CLI works, Qdrant is connected, 3209 chunks indexed)"
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — db.ts route passes frameworkDir (a directory) to loadDbConfig() which expects a file path. loadDbConfig() tries readFile(directory) which throws EISDIR, caught as DbConfigNotFoundError, returns configured:false.
test: Fix db.ts to pass join(deps.frameworkDir, 'db.json') to loadDbConfigFn
expecting: API returns configured:false (no db.json exists) or connected:true if db.json is present
next_action: Apply fix in packages/dashboard-api/src/routes/db.ts

## Symptoms

expected: Dashboard should show database as connected and display metrics/status
actual: Dashboard shows "database not connected" (UI shows "Not configured" state)
errors: No visible error — the EISDIR error is silently caught and converted to DbConfigNotFoundError
reproduction: Open the dashboard UI → Overview page → Database section shows grey dot "Not configured"
started: Unknown — likely always broken since db route was implemented

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-06T00:01:00Z
  checked: packages/db-context/src/loader.ts
  found: loadDbConfig(configPath: string) calls readFile(configPath, 'utf-8') directly — expects a FILE path
  implication: Passing a directory path causes EISDIR error, caught as DbConfigNotFoundError

- timestamp: 2026-04-06T00:01:00Z
  checked: packages/dashboard-api/src/routes/db.ts line 19
  found: config = await loadDbConfigFn(deps.frameworkDir) — passes the DIRECTORY, not a file path
  implication: This is the bug. Every call to /api/db/status returns {configured:false, connected:false}

- timestamp: 2026-04-06T00:01:00Z
  checked: packages/mcp-server/src/bin.ts line 70, packages/cli/src/commands/db.command.ts line 18
  found: Correct usage throughout codebase: join(frameworkDir, 'db.json')
  implication: The db.ts route was written incorrectly — should use join(deps.frameworkDir, 'db.json')

- timestamp: 2026-04-06T00:01:00Z
  checked: packages/dashboard-api/src/routes/db.test.ts
  found: Tests use a mocked loadDbConfigFn — they never exercise the real path construction, so the bug was not caught by tests
  implication: Test coverage gap — the real loadDbConfig call with the actual path is not integration-tested

## Resolution

root_cause: packages/dashboard-api/src/routes/db.ts line 19 passes deps.frameworkDir (a directory) to loadDbConfig() which expects a full file path. This causes readFile() to throw EISDIR, which is caught and re-thrown as DbConfigNotFoundError, resulting in the API returning {configured:false} every time.
fix: Change line 19 to use join(deps.frameworkDir, 'db.json') matching the established convention in the rest of the codebase. Also add join import from 'node:path'.
verification: All 29 dashboard-api tests pass. TypeScript compiles cleanly with no errors.
files_changed: [packages/dashboard-api/src/routes/db.ts]
