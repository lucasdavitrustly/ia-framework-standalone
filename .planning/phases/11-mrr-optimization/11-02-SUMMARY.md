---
phase: 11-mrr-optimization
plan: 02
subsystem: indexer
tags: [embedding, rag, semantic-search, tdd, typescript, nlp]

# Dependency graph
requires:
  - phase: 11-01
    provides: corpus with 30 benchmark queries for validating retrieval improvements
provides:
  - chunkToDescription(chunk) — prose description generator for NLP embedding
  - textVector now embeds prose descriptions (semantic) instead of raw code
  - codeVector still embeds raw chunk.content (identifier/keyword matching)
affects: [11-03, 11-04, benchmark, retrieval, mcp-server]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Structural ChunkLike type for accepting both CodeChunk and ChunkMetadata in description helper'
    - 'TDD RED-GREEN commit pattern: test commit before implementation commit'

key-files:
  created:
    - packages/indexer/src/chunk-description.ts
    - packages/indexer/src/chunk-description.test.ts
  modified:
    - packages/indexer/src/pipeline.ts
    - packages/indexer/src/index.ts

key-decisions:
  - "Used ChunkLike structural type instead of CodeChunk import — accepts both CodeChunk and ChunkMetadata (which adds 'table' and 'view' chunkTypes from DB context sources)"
  - 'Embedding cost doubles (2x embedBatch calls per batch) — intentional trade-off for semantic quality, acceptable for local Ollama and documented for OpenAI users'
  - 'No VectorStore interface changes needed — textVector and codeVector fields already exist'

patterns-established:
  - 'Prose description for NLP embedding: language + chunkType + name + file + optional parentName + exports + imports'

requirements-completed: [RETR-01]

# Metrics
duration: 3min
completed: 2026-04-07
---

# Phase 11 Plan 02: Fix Text Vector — Embed Prose Descriptions Summary

**`chunkToDescription()` helper generates NLP-friendly prose from chunk metadata; IndexingPipeline now embeds prose descriptions into textVector and raw code into codeVector using separate embedBatch calls**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T13:29:24Z
- **Completed:** 2026-04-07T13:32:46Z
- **Tasks:** 2 (TDD: RED + GREEN commits for Task 1, feat commit for Task 2)
- **Files modified:** 4

## Accomplishments

- Implemented `chunkToDescription(chunk)` with 12 unit tests covering all 7 chunkTypes, parentName, exports, imports, anonymous handling, and period-terminated output
- Wired `chunkToDescription()` into `IndexingPipeline.run()` — both main file chunks and context source chunks now embed prose descriptions into textVector
- codeVector continues to embed raw `chunk.content` — identifier/keyword matching unchanged
- Exported `chunkToDescription` from `@ia-framework/indexer` public API

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for chunkToDescription()** - `9e746b9` (test)
2. **Task 1 GREEN: Implement chunkToDescription() + export** - `948e6ba` (feat)
3. **Task 2: Wire into IndexingPipeline** - `50f82ef` (feat)

**Plan metadata:** TBD (docs commit)

_Note: TDD task has 2 commits (test → feat). No REFACTOR needed — implementation was already clean._

## Files Created/Modified

- `packages/indexer/src/chunk-description.ts` - chunkToDescription() with ChunkLike structural type
- `packages/indexer/src/chunk-description.test.ts` - 12 Vitest tests for all variants
- `packages/indexer/src/pipeline.ts` - Separate textVectors/codeVectors embedding loops
- `packages/indexer/src/index.ts` - Export chunkToDescription from public API

## Decisions Made

- **ChunkLike structural type**: Context source chunks are `ChunkMetadata` (which has `'table'` and `'view'` chunkTypes not in `CodeChunk`). Rather than importing `ChunkMetadata` from `@ia-framework/core` (cross-package dependency), defined a minimal structural `ChunkLike` type in chunk-description.ts. Both `CodeChunk` and `ChunkMetadata` are structurally compatible with it.
- **2x embedding cost**: Each batch now makes two `embedBatch()` calls (prose descriptions for text, raw code for code). This is the correct trade-off — NLP models trained on prose cannot match semantic queries against raw code. For local Ollama providers, this is free. For OpenAI, the cost doubles per indexing run. Documented below.
- **No schema migration**: `VectorPoint.textVector` and `VectorPoint.codeVector` fields already accepted separate values — only the pipeline logic changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ChunkLike structural type to accept ChunkMetadata context source chunks**

- **Found during:** Task 2 (wiring context sources section)
- **Issue:** `chunkToDescription(c)` call in context sources loop failed TypeScript check — `ChunkMetadata.chunkType` includes `'table'` and `'view'` not in `CodeChunk.chunkType`
- **Fix:** Replaced `import type { CodeChunk }` with a local `ChunkLike` structural interface using `chunkType: string` — accepts both types
- **Files modified:** packages/indexer/src/chunk-description.ts
- **Verification:** TypeScript build succeeds, all 29 tests pass
- **Committed in:** 50f82ef (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 type compatibility bug)
**Impact on plan:** Necessary for TypeScript correctness. No behavior change — the `default` case in the switch handles 'table'/'view' gracefully as `${lang} code in ${file}`.

## Issues Encountered

None — plan executed cleanly aside from the auto-fixed type compatibility issue.

## Re-indexing Required

**⚠️ A full re-index is required after this change.** The existing Qdrant collection has stale textVectors (raw code). Until re-indexed, the `textVector` will still contain code embeddings, not prose.

To trigger re-index:

```bash
# From the ia-framework directory
ia-framework index --full
# or
ia-framework index
```

Plan 11-04 runs the MRR benchmark AFTER a full re-index to measure the actual improvement.

## Embedding Cost Impact

This change doubles the number of `embedBatch()` API calls per indexing run:

- **Before**: 1 call per batch (raw code → both vectors)
- **After**: 2 calls per batch (prose description → textVector, raw code → codeVector)

**Impact by provider:**

- **Local Ollama**: No cost impact (runs locally). Indexing time doubles for embedding step.
- **OpenAI text-embedding-ada-002**: 2x token cost per indexing run. For a typical 10k-chunk codebase, this is ~2M tokens vs ~1M previously (roughly $0.20 vs $0.10 at current pricing). One-time cost per full re-index.

This trade-off is intentional and expected per the plan.

## Next Phase Readiness

- Plan 11-03 (retrieval algorithm improvements) can proceed — no dependency on re-index
- Plan 11-04 (MRR benchmark run) should run AFTER a full re-index to measure actual improvement
- chunkToDescription is exported and ready for use in other packages if needed

## Self-Check: PASSED

- ✅ `packages/indexer/src/chunk-description.ts` exists
- ✅ `packages/indexer/src/chunk-description.test.ts` exists
- ✅ `.planning/phases/11-mrr-optimization/11-02-SUMMARY.md` exists
- ✅ Commits 9e746b9, 948e6ba, 50f82ef all present in git log

---

_Phase: 11-mrr-optimization_
_Completed: 2026-04-07_
