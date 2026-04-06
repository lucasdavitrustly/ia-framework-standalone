# PLAN: Add Stop Indexing Capability — CLI Command + Dashboard Button

**Task ID:** 260406-n9z  
**Goal:** Allow a running indexing job to be cancelled — from the dashboard ("Stop" button) and from the CLI (`ia-framework index stop`).

---

## Architecture

Two indexing sources exist:

1. **Dashboard-triggered** — pipeline runs in-process inside the dashboard Docker container, managed by `IndexingStateManager`.
2. **CLI-triggered** — pipeline runs as a separate host process, writes progress to `.ia-framework/indexing-progress.json`.

Stop strategy:

- **Dashboard-triggered stop:** `IndexingStateManager.cancel()` sets a flag; an `AbortController` is created per-trigger and its signal is passed to `pipeline.run()`; the pipeline checks the signal between batches and throws on abort.
- **CLI-triggered stop:** `ia-framework index stop` writes a `.ia-framework/indexing-stop-requested` sentinel file; the CLI index command checks for this file between embedding batches and exits cleanly, writing `running: false` to the progress file.
- `POST /api/indexing/stop` handles both: calls `indexingState.cancel()` (dashboard-triggered) and writes the sentinel file (CLI-triggered).

## Constraints

- `IndexingProgress` interface and `ProgressCallback` type in `packages/indexer/src/pipeline.ts` MUST NOT be modified.
- `IndexingPanel.tsx` uses 2s polling — keep polling approach unchanged.
- TDD: failing tests first, then implementation.
- Backend tests only (Vitest) — no frontend component tests.

---

## Tasks

### T1: Add `cancel()` to `IndexingStateManager`

- Adds `private cancelled = false` flag
- `cancel()` sets flag, calls `fail('Indexing cancelled')` to notify observers and stop running state
- `isCancelled()` getter for external consumers
- `start()` resets the flag

### T2: Wire `AbortSignal` into `IndexingPipeline.run()`

- Add optional `signal?: AbortSignal` parameter to `run()`
- Check `signal.aborted` at the top of each embedding batch loop iteration
- If aborted, throw `new Error('Indexing cancelled')` (caught by the route's `.catch()` → `indexingState.fail()`)
- Also check after parsing loop completes before entering embedding stage

### T3: Add `POST /api/indexing/stop` route

- Calls `deps.indexingState.cancel()` (marks dashboard-triggered as cancelled)
- Writes sentinel file `.ia-framework/indexing-stop-requested` (for CLI-triggered)
- Returns `200 { message: 'Stop requested' }`
- Returns `200` even if not running (idempotent)

### T4: Wire `AbortController` into `/trigger` route

- Create `new AbortController()` when trigger fires
- Store it on `indexingState` (or as a module-level ref in the route closure)
- Pass `signal` to `pipeline.run()`
- On `cancel()`, call `controller.abort()`

### T5: Add sentinel file check in CLI index command

- After each batch write to progress file, call `checkStopSentinel(frameworkDir)` — reads `.ia-framework/indexing-stop-requested` existence
- If found: delete sentinel, write `running: false / stage: null / error: 'Stopped by user'` to progress file, `process.exit(0)`
- Sentinel check is fire-and-forget-safe (never throws)

### T6: Add `ia-framework index stop` subcommand

- New file: `packages/cli/src/commands/index-stop.command.ts`
- Writes `.ia-framework/indexing-stop-requested` sentinel file
- Prints `✓ Stop requested — indexing will halt after current batch`
- Registered in `bin.ts` as a subcommand of `index` (or standalone `index-stop`)

### T7: Add Stop button + `stopIndexing()` to dashboard

- `DashboardClient.stopIndexing()` → `POST /api/indexing/stop`
- `IndexingPanel.tsx`: red "Stop" button, visible only when `isRunning`, next to existing "Start Indexing" button
- On click: calls `stopIndexing()`, sets a `stopping` state flag to show "Stopping…" while poll catches up

---

## Test Plan (backend only, Vitest)

**T11: `IndexingStateManager.cancel()` sets running=false, error='Indexing cancelled'**  
**T12: `IndexingStateManager.cancel()` notifies observers**  
**T13: `IndexingStateManager.start()` resets cancelled flag**  
**T14: `POST /api/indexing/stop` when running → returns 200 `{ message: 'Stop requested' }`**  
**T15: `POST /api/indexing/stop` when NOT running → still returns 200 (idempotent)**  
**T16: `POST /api/indexing/trigger` with aborting signal → pipeline throw is caught as fail()**

---

## Files Modified / Created

```
packages/dashboard-api/src/
  indexing-state.ts          # +cancel(), +isCancelled(), reset in start()
  routes/indexing.ts         # +POST /stop, AbortController wired into trigger
  routes/indexing.test.ts    # +T11–T16

packages/indexer/src/
  pipeline.ts                # +signal?: AbortSignal in run(), check between batches

packages/cli/src/
  bin.ts                     # register index-stop command
  commands/index.command.ts  # +sentinel file check between batches
  commands/index-stop.command.ts   # NEW — writes sentinel file

apps/dashboard/src/
  api/client.ts              # +stopIndexing()
  components/IndexingPanel.tsx     # +Stop button

.planning/quick/260406-n9z-add-stop-indexing-capability-cli-command/
  PLAN.md                    # this file
```
