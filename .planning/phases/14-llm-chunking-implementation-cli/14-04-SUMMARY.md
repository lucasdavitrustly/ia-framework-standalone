---
phase: 14-llm-chunking-implementation-cli
plan: 04
type: gap-closure
status: done
started: 2026-04-11T03:30:00Z
completed: 2026-04-11T03:38:00Z
gaps_closed:
  - id: RETR-07
    severity: blocker
    description: 'QdrantVectorStore created with original collection name before routing — LLM chunks stored in wrong collection'
  - id: onFileProgress
    severity: warning
    description: 'onFileProgress callback stored but never invoked — dead code'
---

# Plan 14-04 Summary: Gap Closure

## What Changed

### Gap 1 (BLOCKER): Collection routing fix — RETR-07

**Problem:** `QdrantVectorStore` was constructed at line 227 with `config.vectorStore.collectionName` (the original name, e.g., `myproject`). Collection routing happened later at line 294, computing the `-llm` suffix — but the vectorStore was already created with the wrong name. All Qdrant operations (initialize, upsertBatch, deleteByFilter) used the original collection, so LLM chunks went to the same collection as AST chunks.

**Fix:** Moved collection routing (computing `baseCollectionName` and `collectionName` with optional `-llm` suffix) BEFORE `QdrantVectorStore` creation. The vectorStore constructor now receives the routed `collectionName`. Removed the duplicate routing block that was lower in the file.

**File:** `packages/cli/src/commands/index.command.ts`

### Gap 2 (WARNING): Dead `onFileProgress` code removal

**Problem:** `onFileProgress` was defined in `LlmChunkingOptions`, stored as a class field, but never invoked in `LlmChunkingStrategy.chunk()`. The CLI created a callback with a progress bar, but it was never triggered. Per-file progress was already shown by the pipeline's main `onProgress` callback during the parsing stage.

**Fix:** Removed `onFileProgress` from:

- `LlmChunkingOptions` interface (field + JSDoc)
- `LlmChunkingStrategy` class (private field + constructor assignment)
- CLI constructor call (callback definition)

**Files:** `packages/indexer/src/strategies/llm-strategy.ts`, `packages/cli/src/commands/index.command.ts`

## Verification

| Check                                                   | Result                                            |
| ------------------------------------------------------- | ------------------------------------------------- |
| `grep onFileProgress` in \*.ts                          | 0 matches                                         |
| `config.vectorStore.collectionName` in index.command.ts | Only in `baseCollectionName` assignment (correct) |
| `pnpm turbo typecheck` (24 tasks)                       | All passed                                        |
| `pnpm turbo build` (24 tasks)                           | All passed                                        |
| `pnpm turbo test` (23 tasks)                            | All passed                                        |

## Impact

- LLM strategy now correctly stores chunks in `{project}-llm` collection
- AST strategy continues to use `{project}` collection (unchanged)
- Mismatch detection now checks the correct (routed) collection
- No dead code remains in the LLM chunking path
