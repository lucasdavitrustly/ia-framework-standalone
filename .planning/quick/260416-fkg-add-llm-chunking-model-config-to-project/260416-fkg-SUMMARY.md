---
phase: quick
plan: 01
subsystem: config
tags: [llm-chunking, init, dashboard, config]
dependency-graph:
  requires: []
  provides: [llm-config-init, llm-config-dashboard-edit]
  affects: [packages/project-detector, packages/cli, packages/dashboard-api, apps/dashboard]
tech-stack:
  added: []
  patterns: [deep-merge-patch, editable-config-fields]
key-files:
  created: []
  modified:
    - packages/project-detector/src/persister.ts
    - packages/project-detector/src/persister.test.ts
    - packages/cli/src/commands/init.command.ts
    - packages/dashboard-api/src/routes/config.ts
    - packages/dashboard-api/src/app.ts
    - packages/dashboard-api/src/server.ts
    - packages/dashboard-api/src/app.test.ts
    - apps/dashboard/src/api/client.ts
    - apps/dashboard/src/pages/Config.tsx
    - README.md
decisions:
  - PATCH /api/config uses targeted deep-merge for indexing.llm (not full config replacement)
  - ConfigWatcher auto-detects PATCH writes via chokidar file watch (no manual reload needed)
metrics:
  duration: ~27min
  completed: 2026-04-16
  tasks: 3
  files: 10
---

# Quick Task 260416-fkg: Add LLM Chunking Model Config Summary

**One-liner:** LLM chunking model configurable via `init --llm-model`, editable in dashboard Config page, documented in README

## What Was Done

### Task 1: Add LLM config to init flow (persister + CLI) — TDD

- Added `llmModel` and `llmUrl` to `PersistOptions` interface
- `persistProfile()` writes `indexing.llm.model` and `indexing.llm.ollamaUrl` when llmModel option is set
- Merges LLM config into existing indexing config without clobbering include/exclude patterns
- Added `--llm-model` and `--llm-url` CLI flags to `init` command
- 4 new tests covering all LLM config persistence scenarios
- **Commit:** `ba888bb`

### Task 2: Dashboard config display + edit for LLM chunking

- Added `PATCH /` handler to config router for editing indexing.llm config on disk
- Wired `configPath` through AppDependencies → configRouter
- Added `updateConfig` method to DashboardClient
- Updated `ProjectConfig` interface with `indexing.llm` type
- New `LlmChunkingSection` component with editable model/URL fields and save button
- Shows "Configure LLM Chunking" button when no config exists
- Inline success/error feedback on save
- **Commit:** `95412ed`

### Task 3: Document LLM chunking config in README

- Added `indexing.llm` block to Step 5 JSON example and Configuration reference
- Documented `--llm-model` and `--llm-url` flags in CLI Reference
- Added note about pre-configuring chunking model in LLM strategy description
- **Commit:** `5ab686e`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed configPath wiring through AppDependencies**

- **Found during:** Task 2
- **Issue:** `ConfigDeps` required `configPath` but `AppDependencies` didn't include it, causing type errors in app.ts and app.test.ts
- **Fix:** Added `configPath` to `AppDependencies`, wired through server.ts and app.ts, updated test mocks
- **Files modified:** app.ts, server.ts, app.test.ts

## Verification

- All 366 tests pass across 10 packages
- Full build succeeds (14/14 tasks)
- README has 4+ LLM config references

## Known Stubs

None — all features are fully wired.
