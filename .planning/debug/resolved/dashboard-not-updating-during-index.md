---
status: awaiting_human_verify
trigger: 'Dashboard at localhost:3000 stays blank/zero (no live updates, no final state) while ia-framework index --force is running. No errors visible in browser or terminal.'
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T18:45:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED — CLI process and dashboard API process had completely separate IndexingStateManager instances with no shared state bridge
test: Verified: wrote test indexing-progress.json to frameworkDir and confirmed dashboard API returns it via /api/indexing/status
expecting: Next CLI indexing run will write progress to file; dashboard frontend will show live updates
next_action: User confirms fix by running `node packages/cli/dist/bin.js index --force` and checking localhost:3000

## Symptoms

expected: Dashboard shows live progress (file count, chunk count) during indexing AND reflects final state after indexing completes
actual: Dashboard stays blank/zero the entire time — no updates during indexing, no final state after
errors: No errors visible in browser console or CLI output
reproduction: Run `node packages/cli/dist/bin.js index --force` — dashboard consistently stays at 0/blank
started: Unknown if ever worked

## Eliminated

- hypothesis: Dashboard API status endpoint is broken or doesn't exist
  evidence: curl http://localhost:3000/api/indexing/status returns valid JSON with the correct schema
  timestamp: 2026-04-06T18:10:00Z

- hypothesis: Dashboard frontend doesn't poll the API
  evidence: IndexingPanel.tsx has a 2-second polling interval via setInterval, and DashboardClient.getIndexingStatus() calls the correct endpoint
  timestamp: 2026-04-06T18:10:00Z

- hypothesis: Dashboard API trigger works and shows progress
  evidence: POST to /api/indexing/trigger starts indexing within the API process and returns status 202. Status endpoint updates. Confirmed working for dashboard-triggered indexing.
  timestamp: 2026-04-06T18:12:00Z

## Evidence

- timestamp: 2026-04-06T18:10:00Z
  checked: packages/cli/src/commands/index.command.ts — progress callback
  found: Progress callback is a closure that ONLY calls `process.stdout.write(...)`. No HTTP calls, no file writes, no IPC. The CLI has zero mechanism to share progress with any other process.
  implication: The dashboard API's IndexingStateManager (in-memory) is NEVER updated by CLI-triggered indexing

- timestamp: 2026-04-06T18:10:00Z
  checked: packages/dashboard-api/src/routes/indexing.ts + indexing-state.ts
  found: GET /api/indexing/status returns IndexingStateManager.getState() — pure in-memory state. Only updated when POST /api/indexing/trigger is used (dashboard-triggered indexing). No file-reading fallback.
  implication: API always returns zeros when indexing is triggered via CLI

- timestamp: 2026-04-06T18:10:00Z
  checked: packages/dashboard-api/src/server.ts — how the server starts
  found: Server is confirmed running inside a Lima VM (port 3000 is an SSH tunnel, `lsof -nP` shows `ssh 2880` owns port 3000). CLI runs on host machine (PID 28864 is `node packages/cli/dist/bin.js index --force` running on host).
  implication: Completely separate processes, in separate environments. Only shared state is the filesystem (Lima auto-mounts /Users into the VM).

- timestamp: 2026-04-06T18:12:00Z
  checked: .ia-framework/project.json (frameworkDir)
  found: frameworkDir = `/Users/rafael.goncalves/ia-framework/.ia-framework/`. Contains benchmarks.sqlite, graph.sqlite, metrics.sqlite, project.json. No indexing-progress.json file exists. Both CLI and dashboard API use this same directory path.
  implication: Writing a progress file here is a viable shared-state mechanism — Lima mounts /Users so both processes access the same file.

## Resolution

root_cause: The CLI's progress callback only wrote to stdout. The dashboard API's IndexingStateManager lived in-memory in a separate process (Docker container running in a Lima VM via Rancher Desktop). No shared state bridge existed between CLI-triggered indexing and the dashboard API's status endpoint. The dashboard frontend correctly polled /api/indexing/status every 2 seconds, but that endpoint always returned zeros because the in-memory state was never updated by the CLI process.
fix: 1) Added writeIndexingProgress() helper to CLI that writes .ia-framework/indexing-progress.json on every progress event (and on start/complete/error). 2) Modified /api/indexing/status to read this file as fallback when in-memory state shows idle — returns file state if it exists. 3) Passed frameworkDir to indexingRouter so it can find the file. The shared file works because the container mounts /Users/rafael.goncalves/ia-framework/.ia-framework as /ia-framework-data, making both processes access the same inode.
verification: Manual test confirmed: writing a test indexing-progress.json to .ia-framework/ causes /api/indexing/status to immediately return the file's data with correct fields. Removing the file causes it to fall back to zeros. All 20 existing dashboard-api tests pass with zero regressions.
files_changed:

- packages/cli/src/commands/index.command.ts
- packages/dashboard-api/src/routes/indexing.ts
- packages/dashboard-api/src/app.ts
