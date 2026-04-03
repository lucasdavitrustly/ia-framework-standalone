---
phase: 05-installer
plan: "02"
subsystem: cli
tags: [cli, commander, typescript, index, search, status]
dependency_graph:
  requires: [05-01-installer, 04-02-mcp-server, 04-01-retrieval, 03-04-indexer]
  provides: [ia-framework CLI binary, index command, search command, status command]
  affects: [05-03-integration, install.sh]
tech_stack:
  added:
    - commander@13.x
  patterns: [commander subcommands, config-path resolution via env var or convention, incremental indexing with force flag]
key_files:
  created:
    - packages/cli/package.json
    - packages/cli/tsconfig.json
    - packages/cli/tsup.config.ts
    - packages/cli/src/bin.ts
    - packages/cli/src/index.ts
    - packages/cli/src/commands/index.command.ts
    - packages/cli/src/commands/search.command.ts
    - packages/cli/src/commands/status.command.ts
    - packages/cli/src/commands/index.ts
  modified:
    - pnpm-lock.yaml
decisions:
  - "IndexingPipeline API uses run(config, onProgress) not constructor — matched actual implementation (IndexingConfig.frameworkDir required for incremental state)"
  - "getLastIndexedCommit takes frameworkDir (not targetProjectPath) — state stored in .ia-framework/indexing-state.json, frameworkDir derived from dirname(configPath)"
  - "status command uses getCollectionInfo().pointCount (not vectorsCount) — matched CollectionInfo interface in vector-store/src/interface.ts"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-01"
  tasks_completed: 3
  files_created: 9
---

# Phase 05 Plan 02: CLI Package Summary

**One-liner:** Commander-based `ia-framework` CLI with `index` (IndexingPipeline with progress), `search` (SearchEngine with formatted output), and `status` (Qdrant collection info + indexed commit comparison).

## What Was Done

Created the `@ia-framework/cli` package:
- `packages/cli/` scaffold with package.json, tsconfig.json, tsup.config.ts
- `index` command: wires `IndexingPipeline.run()` with live progress display
- `search` command: wires `SearchEngine.search()` with formatted code preview output
- `status` command: shows config, Qdrant connection, chunk count, and indexed commit vs HEAD
- CLI binary at `packages/cli/dist/bin.js` with `#!/usr/bin/env node` shebang

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | CLI package scaffold + pnpm install | 3368cd9 |
| 2 | index, search, status command implementations | 3368cd9 |
| 3 | bin.ts entrypoint, build, verification | 3368cd9 |

## CLI Commands

```
ia-framework --help            Show all commands
ia-framework index             Index target project (incremental by default)
ia-framework index --force     Force full re-index
ia-framework search <query>    Search codebase
ia-framework search <query> --limit 5 --threshold 0.3
ia-framework status            Show Qdrant status + indexed commit
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] IndexingPipeline API mismatch**
- **Found during:** Task 2 (reading actual source)
- **Issue:** Plan specified constructor-based API (`new IndexingPipeline({ config })`) but actual implementation uses `new IndexingPipeline()` + `pipeline.run(config, callback)`
- **Fix:** Updated index.command.ts to use correct API: `new IndexingPipeline()` then `pipeline.run(indexingConfig, onProgress)`
- **Files modified:** `packages/cli/src/commands/index.command.ts`
- **Commit:** 3368cd9

**2. [Rule 1 - Bug] getLastIndexedCommit parameter mismatch**
- **Found during:** Task 2 (reading actual source)
- **Issue:** Plan specified `getLastIndexedCommit(targetProjectPath)` but actual function takes `frameworkDir` (path to .ia-framework/ directory)
- **Fix:** Derived `frameworkDir = dirname(configPath)` and passed that instead
- **Files modified:** `packages/cli/src/commands/status.command.ts`
- **Commit:** 3368cd9

## Known Stubs

None — all commands wire real implementations.

## Self-Check: PASSED

- `packages/cli/dist/bin.js` → FOUND ✅
- `packages/cli/dist/index.js` → FOUND ✅
- `packages/cli/dist/index.d.ts` → FOUND ✅
- `node packages/cli/dist/bin.js --help` → shows index, search, status ✅
- `node packages/cli/dist/bin.js index --help` → shows --force, --config ✅
- Typecheck passes → ✅
- Build succeeds → ✅
- Commit 3368cd9 → FOUND ✅
