---
phase: "07-benchmarking"
plan: "03"
subsystem: cli
tags: [benchmark, compare, cli, integration]
dependency_graph:
  requires: [packages/benchmark (07-01), packages/cli/commands/benchmark.command (07-02)]
  provides: [benchmark compare subcommand, full Phase 7 integration]
  affects: []
tech_stack:
  added: []
  patterns: [commander-subcommand-helpers, prefix-match-id-resolution, unicode-table-formatting]
key_files:
  created: []
  modified:
    - packages/cli/src/commands/benchmark.command.ts
decisions:
  - "compare subcommand supports prefix ID matching via listRuns() scan — avoids requiring full UUID input"
  - "All benchmark subcommands extracted to named helpers (runSubcommand/listSubcommand/historySubcommand/compareSubcommand) co-located in one file for readability"
metrics:
  duration: "5 min"
  completed: "2026-04-01"
  tasks_completed: 2
  files_created: 0
---

# Phase 7 Plan 03: benchmark compare + Full Integration Verification Summary

**One-liner:** Added `benchmark compare <id1> <id2>` with config diff + metric deltas + per-query breakdown, confirmed 120 tests across all 11 packages.

## What Was Built

### benchmark compare subcommand

Added `compareSubcommand()` to `benchmark.command.ts`:

- **Arguments:** Two positional run IDs (full UUID or prefix)
- **Prefix matching:** If exact `getRunById()` fails, scans `listRuns(1000)` for prefix match
- **Output:**
  - Config table (provider, model, collection, topK, threshold) — Run A vs Run B
  - Results table with Hit@K delta (↑/↓/=), MRR delta, avg latency, queries run
  - Per-query breakdown joined by queryId — shows hit/rank or `—` for missing queries
  - Verdict line: "Run A outperforms / Run B outperforms / Runs are equivalent"

### Full Workspace Integration

| Package | Tests |
|---------|-------|
| @ia-framework/core | 7 |
| @ia-framework/observability | 21 |
| @ia-framework/project-detector | 19 |
| @ia-framework/embedding | 8 |
| @ia-framework/ast-parser | 8 |
| @ia-framework/vector-store | 8 |
| @ia-framework/retrieval | 8 |
| @ia-framework/indexer | 8 |
| @ia-framework/mcp-server | 8 |
| **@ia-framework/benchmark** | **19** |
| @ia-framework/cli | 6 |
| **Total** | **120** |

All 11 packages: build ✅, typecheck ✅, test ✅

### CLI Help Tree

```
ia-framework benchmark --help     → run/list/history/compare
ia-framework benchmark run --help → --baseline, --top-k, --label, --corpus
ia-framework benchmark list --help
ia-framework benchmark history --help
ia-framework benchmark compare --help  → <runId1> <runId2>
```

### Benchmark Package Exports

`['BenchmarkQueriesFileSchema', 'BenchmarkRunner', 'BenchmarkStore', 'CorpusNotFoundError', 'loadCorpus', 'scaffoldExampleCorpus']`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Post-Execution Bugs Found & Fixed

### 1. `better-sqlite3` native module version mismatch

**Symptom:** `node packages/cli/dist/bin.js benchmark list` crashed with:
```
Error: The module '.../better_sqlite3.node' was compiled against a different Node.js version
using NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 141.
```

**Root cause:** Homebrew upgraded `icu4c` (v74 → v78), breaking the Homebrew Node.js v21 binary. After upgrading to Node.js v25, the pre-compiled `better-sqlite3` native addon (built for NODE_MODULE_VERSION 127) was incompatible.

**Fix:** Recompile the native addon against the running Node.js version:
```bash
cd node_modules/.pnpm/better-sqlite3@12.8.0/node_modules/better-sqlite3
node-gyp rebuild
```

**Note:** This must be repeated after any Node.js major version upgrade. `pnpm rebuild better-sqlite3` should also work but did not trigger a recompile in this case.

---

### 2. `benchmark list` / `history` / `compare` crash when `.ia-framework/` directory does not exist

**Symptom:** Running `benchmark list` with no prior setup crashed with:
```
✗ benchmark list failed: TypeError: Cannot open database because the directory does not exist
```
instead of printing `"No benchmark runs yet."`.

**Root cause:** `better-sqlite3`'s `new Database(path)` will create the SQLite file if it doesn't exist, but it will **not** create missing parent directories. The `list`, `history`, and `compare` subcommands derived the DB path from the config file location (defaulting to `<cwd>/.ia-framework/benchmarks.sqlite`) without ensuring the parent directory existed first. The `TypeError` was caught by the generic catch block, which exited with code 1 instead of printing the friendly "no runs" message.

**Fix:** Added `mkdirSync(frameworkDir, { recursive: true })` before `new BenchmarkStore(...)` in all three subcommands (`listSubcommand`, `historySubcommand`, `compareSubcommand`) in `packages/cli/src/commands/benchmark.command.ts`. Also added `import { mkdirSync } from 'node:fs'` to the imports.

**File:** `packages/cli/src/commands/benchmark.command.ts`

## Self-Check: PASSED

- ✅ FOUND: packages/cli/src/commands/benchmark.command.ts (benchmark compare subcommand)
- ✅ FOUND: commit f22dee0
- ✅ 120 tests passing across 11 packages
- ✅ All 5 benchmark CLI help texts display correctly
- ✅ Benchmark package exports verified
- ✅ `benchmark list` prints "No benchmark runs yet." with no config present
- ✅ `benchmark history` prints "Not enough runs for trend." with no config present
