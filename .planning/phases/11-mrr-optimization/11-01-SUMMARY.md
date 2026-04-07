---
phase: 11-mrr-optimization
plan: '01'
subsystem: benchmark
tags: [benchmark, corpus, validation, tdd]
dependency_graph:
  requires: [packages/benchmark]
  provides: [validateCorpus, 30-query-corpus]
  affects: [packages/cli/src/commands/benchmark.command.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, Zod schema extension, flat JSON corpus format]
key_files:
  created:
    - .ia-framework/benchmark-queries.json
  modified:
    - packages/benchmark/src/corpus.ts
    - packages/benchmark/src/corpus.test.ts
    - packages/benchmark/src/index.ts
    - packages/cli/src/commands/benchmark.command.ts
    - .gitignore
decisions:
  - 'validateCorpus uses async fs.access — no sync I/O'
  - 'Zod schema expectedFiles changed from .min(1) to .min(0) to allow negative queries'
  - 'loadCorpus now accepts flat JSON array in addition to { queries: [...] } wrapper format'
  - 'Corpus file tracked via gitignore exception: !.ia-framework/benchmark-queries.json'
metrics:
  duration: '~18 min'
  completed: '2026-04-07T13:23:44Z'
  tasks: 3
  files: 5
---

# Phase 11 Plan 01: Benchmark Corpus — 30-Query Suite with Validation Summary

**One-liner:** TDD-validated `validateCorpus()` + 30-query corpus JSON spanning 6 categories for reliable MRR measurement.

## What Was Built

### Task 1 — `validateCorpus()` (TDD)

Added `validateCorpus(queries, projectRoot)` async function to `packages/benchmark/src/corpus.ts`:

- Checks for duplicate query IDs (Set-based O(n))
- Rejects empty/whitespace-only query text
- Runs `fs.access()` for each file in `expectedFiles` (relative paths resolved against `projectRoot`)
- Skips file checks for negative queries (`expectedFiles: []`) — valid by design
- Returns all errors (no short-circuit) as `CorpusValidationError[]`

Also exported `CorpusValidationError` interface and `BenchmarkQueriesFlatSchema` from `packages/benchmark/src/index.ts`.

**Tests:** 7 new tests added — 26 tests pass total in the benchmark package.

### Task 2 — 30-Query Corpus JSON

`.ia-framework/benchmark-queries.json` — flat JSON array of exactly 30 `BenchmarkQuery` objects across 6 categories:

| Category | Count | Query style                                                     |
| -------- | ----- | --------------------------------------------------------------- |
| `sem-*`  | 5     | Natural language concept queries                                |
| `kw-*`   | 5     | Exact class/method/identifier names                             |
| `xf-*`   | 5     | Cross-file queries spanning 2+ source files                     |
| `cx-*`   | 5     | Multi-concept complex queries                                   |
| `neg-*`  | 5     | Negative queries — topics not in codebase (`expectedFiles: []`) |
| `edge-*` | 5     | Boundary conditions and tricky implementation details           |

All 25 non-negative file paths verified to exist. All 30 IDs unique.

### Task 3 — CLI Wiring

`packages/cli/src/commands/benchmark.command.ts` `runSubcommand` now:

1. Calls `validateCorpus(queries, config.targetProjectPath)` after corpus load
2. Prints each error to stderr as `[corpus][queryId] <error>`
3. Exits with code 1 if any errors found

## Decisions Made

| Decision                                           | Rationale                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `expectedFiles.min(0)` in Zod schema               | Previous `.min(1)` would reject valid negative test queries                  |
| Flat JSON array format supported in `loadCorpus()` | Corpus file uses flat array; wrapper format was the only supported form      |
| Gitignore exception for corpus file                | `.ia-framework/` is gitignored as runtime data; corpus needs version control |
| `fs.access` (async) for file checks                | Plan constraint — no sync I/O in validateCorpus                              |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod schema rejecting negative queries**

- **Found during:** Task 1 (RED phase — test for empty expectedFiles failing with schema error)
- **Issue:** `BenchmarkQueriesFlatSchema` used `expectedFiles: z.array(z.string()).min(1)`, which rejects `expectedFiles: []`
- **Fix:** Changed to `.min(0)` — negative queries are explicitly supported per plan's `BenchmarkQuery` interface
- **Files modified:** `packages/benchmark/src/corpus.ts`
- **Commit:** 4038d3f

**2. [Rule 1 - Bug] Fixed `loadCorpus()` only supporting `{ queries: [...] }` wrapper format**

- **Found during:** Task 2 (verifying corpus file would load correctly)
- **Issue:** Corpus file is flat JSON array; `loadCorpus()` only parsed `{ queries: [] }` wrapper
- **Fix:** Added flat array detection — if root is an array, use it directly; if object with `queries`, use that
- **Files modified:** `packages/benchmark/src/corpus.ts`
- **Commit:** 4038d3f

**3. [Rule 3 - Blocking] Logger path mismatch**

- **Found during:** Task 2 (checking edge-03 query path `packages/core/src/logger.ts`)
- **Issue:** Logger is at `packages/core/src/logger/index.ts`, not `packages/core/src/logger.ts`
- **Fix:** Updated `edge-03` expectedFiles to `packages/core/src/logger/index.ts` in corpus JSON
- **Files modified:** `.ia-framework/benchmark-queries.json`
- **Commit:** 1c77e9c

**4. [Rule 3 - Blocking] Embedding provider path mismatch**

- **Found during:** Task 2 (checking xf-03 query paths)
- **Issue:** Plan referenced `packages/embedding/src/ollama.ts` and `packages/embedding/src/openai.ts`; actual paths are `packages/embedding/src/providers/ollama.ts` and `packages/embedding/src/providers/openai.ts`
- **Fix:** Updated xf-03 expectedFiles to use `providers/` subdirectory
- **Files modified:** `.ia-framework/benchmark-queries.json`
- **Commit:** 1c77e9c

**5. [Rule 2 - Missing] Gitignore exception for corpus file**

- **Found during:** Task 2 (git status showed .ia-framework/ fully ignored)
- **Issue:** `.ia-framework/` is gitignored as runtime data directory; corpus file needs version control
- **Fix:** Added `!.ia-framework/benchmark-queries.json` exception to `.gitignore`; used `git add -f` to force-add
- **Files modified:** `.gitignore`
- **Commit:** 1c77e9c

## Known Stubs

None — all functionality is fully implemented and wired.

## Self-Check: PASSED

- [x] `.ia-framework/benchmark-queries.json` — exists (verified: `git show HEAD~2 --name-only`)
- [x] `packages/benchmark/src/corpus.ts` — `validateCorpus` present
- [x] `packages/benchmark/src/index.ts` — `validateCorpus` exported
- [x] `packages/cli/src/commands/benchmark.command.ts` — validation call wired
- [x] Commits: 4b62697, 4038d3f, 1c77e9c, 4560b3c — all verified in git log
