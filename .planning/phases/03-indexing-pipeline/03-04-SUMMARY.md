---
phase: 03-indexing-pipeline
plan: "04"
subsystem: indexer
tags: [indexing-pipeline, file-walker, incremental, tinyglobby, gitignore, tdd]
dependency_graph:
  requires: [03-01-ast-parser, 03-02-embedding, 03-03-vector-store, 01-02-core]
  provides: [@ia-framework/indexer]
  affects: [04-mcp-server, 05-retrieval]
tech_stack:
  added: ["tinyglobby@0.2.x", "ignore@6.0.x"]
  patterns: [Pipeline orchestration, progress callbacks, incremental re-indexing, git diff change detection]
key_files:
  created:
    - packages/indexer/src/file-walker.ts
    - packages/indexer/src/incremental.ts
    - packages/indexer/src/pipeline.ts
    - packages/indexer/src/pipeline.test.ts
    - packages/indexer/src/index.ts
    - packages/indexer/package.json
    - packages/indexer/tsconfig.json
    - packages/indexer/tsup.config.ts
  modified: []
decisions:
  - "Same embedding provider used for both text and code vectors in Phase 3 (dual-model optimization deferred to Phase 7 benchmarks)"
  - "ignore package imported via createRequire() CJS interop due to NodeNext module resolution incompatibility with default export callable syntax"
  - "vi.hoisted() used for mock variables in pipeline.test.ts to avoid temporal dead zone errors when vi.mock factories are hoisted"
  - "afterAll imported explicitly from vitest (no global test APIs in strict ESM mode)"
  - "FileWalker filters source extensions by default (.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.kt,.rb,.mjs,.cjs)"
metrics:
  duration: "~35 minutes"
  completed: "2026-04-01"
  tasks_completed: 3
  files_created: 8
---

# Phase 03 Plan 04: Indexer Summary

**One-liner:** `IndexingPipeline` orchestrating file walk → AST parse → embed → Qdrant upsert with gitignore-aware `FileWalker` and git-diff incremental re-indexing.

## What Was Built

`@ia-framework/indexer` — the main pipeline package that wires together all Phase 3 packages. Running `pipeline.run(config)` on a target project walks source files, parses them with `ast-parser`, embeds chunks via the configured provider, and upserts dual-vector points to Qdrant. Incremental mode uses `git diff` to only re-process changed files.

### Key Components

| File | Purpose |
|------|---------|
| `src/file-walker.ts` | `walkFiles()` with tinyglobby + ignore, skips node_modules/.git/dist/build, respects .gitignore |
| `src/incremental.ts` | `getChangedFiles()` via git diff, `getLastIndexedCommit()`/`saveLastIndexedCommit()` for state persistence |
| `src/pipeline.ts` | `IndexingPipeline.run()` — orchestrates walk->parse->embed->store with progress callbacks. Passes `maxChunkLines` config to ast-parser, which splits oversized chunks with signature context preservation. |
| `src/pipeline.test.ts` | 8 TDD tests (vi.hoisted + vi.mock for ast-parser and incremental) |
| `src/index.ts` | Package barrel export |

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Package scaffold + FileWalker + incremental detection | 990156a |
| 2 | IndexingPipeline TDD (RED→GREEN) | 990156a |
| 3 | Build all Phase 3 packages, 32/32 tests | 990156a |

## Phase 3 Final State

| Package | Tests | Build |
|---------|-------|-------|
| `@ia-framework/ast-parser` | 8/8 ✅ | ✅ |
| `@ia-framework/embedding` | 8/8 ✅ | ✅ |
| `@ia-framework/vector-store` | 8/8 ✅ | ✅ |
| `@ia-framework/indexer` | 8/8 ✅ | ✅ |
| **Total** | **32/32 ✅** | **All ✅** |

## Verification

- `pnpm --filter @ia-framework/indexer test` → 8/8 passed ✅
- `pnpm --filter @ia-framework/indexer build` → dist/index.js + dist/index.d.ts ✅
- All 4 Phase 3 packages: 32/32 tests pass ✅

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ignore package CJS interop**
- **Found during:** Task 1 (typecheck)
- **Issue:** `import ignore from 'ignore'` + `ignore()` call fails with NodeNext module resolution — `ignore` is CJS with default export not recognized as callable
- **Fix:** Used `createRequire(import.meta.url)` to require the CJS module, with `(createIgnore.default ?? createIgnore)()` for safe invocation
- **Files modified:** `packages/indexer/src/file-walker.ts`
- **Commit:** 990156a

**2. [Rule 1 - Bug] vi.hoisted() required for mock variables**
- **Found during:** Task 2 (RED phase)
- **Issue:** `vi.mock()` factory is hoisted before `const mockParseFile = vi.fn()` — temporal dead zone error
- **Fix:** Used `vi.hoisted(() => ({ mockParseFile: vi.fn() }))` pattern for all mock variables that are referenced in `vi.mock` factories
- **Files modified:** `packages/indexer/src/pipeline.test.ts`
- **Commit:** 990156a

**3. [Rule 2 - Missing] afterAll import**
- **Found during:** Task 2 (test run)
- **Issue:** `afterAll` not globally available in strict ESM Vitest mode
- **Fix:** Added explicit import `import { ..., afterAll } from 'vitest'`
- **Files modified:** `packages/indexer/src/pipeline.test.ts`
- **Commit:** 990156a

## Known Stubs

- **Dual-vector embeddings:** `codeVector = textVector` (same provider for both). Phase 7 will evaluate code-specialized models.
- **`tsup.config.ts` not committed separately** — included in the 990156a commit with other indexer files.

## Self-Check: PASSED

- `packages/indexer/src/pipeline.ts` → FOUND ✅
- `packages/indexer/src/pipeline.test.ts` → FOUND ✅
- `packages/indexer/src/file-walker.ts` → FOUND ✅
- `packages/indexer/src/incremental.ts` → FOUND ✅
- `packages/indexer/dist/index.js` → FOUND ✅
- Commit 990156a → FOUND ✅
