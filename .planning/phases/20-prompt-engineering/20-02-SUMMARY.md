---
phase: 20-prompt-engineering
plan: '02'
subsystem: indexer
tags: [quality-scoring, llm-chunking, qdrant, heuristics, vitest]

requires:
  - phase: 20-prompt-engineering plan 01
    provides: LLM chunking strategy with chunk-validator and prompt examples
provides:
  - Heuristic quality scorer (scoreChunkSummary, SummaryQualityScore) in packages/indexer
  - qualityScore field in ChunkPayload (Qdrant metadata)
  - getQualityReport() and printQualityReport() on LlmChunkingStrategy
affects:
  - Qdrant indexing pipeline (qualityScore now stored per chunk point)
  - Any consumer of ChunkPayload (backward compat — field is optional)

tech-stack:
  added: []
  patterns:
    - 'TDD: test → implement → verify for pure-function scorers'
    - 'Heuristic scoring via length + code-token + purpose-verb + syntax-pattern components'
    - 'All-code-token detection disables syntax penalty (no natural language)'

key-files:
  created:
    - packages/indexer/src/strategies/quality-scorer.ts
    - packages/indexer/src/strategies/quality-scorer.test.ts
  modified:
    - packages/vector-store/src/interface.ts
    - packages/indexer/src/strategies/llm-strategy.ts

key-decisions:
  - 'Very short strings (<10 chars) score 0 — too short to be a meaningful summary'
  - 'All-code-token check (codeTokenCount >= wordCount) zeros syntaxPenalty — these are identity dumps, not descriptions'
  - 'Low quality threshold = 40 for quality report bucketing'
  - 'qualityScore added as optional field to ChunkPayload for backward compatibility'

patterns-established:
  - 'Quality report follows same accumulator pattern as ChunkValidationReport'
  - 'scoreChunkSummary is pure function with deterministic breakdown in checks'

requirements-completed:
  - PRMT-04

duration: 3min
completed: 2026-04-23
---

# Phase 20 Plan 02: Chunk Summary Quality Scorer Summary

**Heuristic 0-100 scorer for LLM chunk summaries stored as Qdrant metadata, with end-of-run quality distribution report**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-23T12:46:02Z
- **Completed:** 2026-04-23T12:48:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Pure function `scoreChunkSummary` with 4-component scoring (length, code tokens, purpose verbs, syntax patterns)
- `qualityScore` stored in `ChunkPayload` flowing through to every Qdrant point created by LLM chunking
- `getQualityReport()` and `printQualityReport()` on `LlmChunkingStrategy` — worstFiles, distribution buckets, avg score

## Task Commits

1. **Task 1 RED: quality-scorer tests** - `c276825` (test)
2. **Task 1 GREEN: quality-scorer implementation** - `8e67550` (feat)
3. **Task 2: pipeline integration + quality report** - `77eb188` (feat)

## Files Created/Modified

- `packages/indexer/src/strategies/quality-scorer.ts` — Pure scorer: 4 checks, 0-100 score, SummaryQualityScore type
- `packages/indexer/src/strategies/quality-scorer.test.ts` — 11 tests covering all score ranges
- `packages/vector-store/src/interface.ts` — Added `qualityScore?: number` to ChunkPayload
- `packages/indexer/src/strategies/llm-strategy.ts` — Import scorer, call per chunk, quality tracking/reporting

## Decisions Made

- Used very-short (<10 chars) early-return yielding score=0 to avoid codeTokenScore/syntaxPenalty inflating trivial strings
- "All code token" detection (codeTokenCount >= wordCount) used to zero syntaxPenalty — these are identity dumps not descriptions
- Chose `qualityScore` as optional field on ChunkPayload (not a new CodeChunk interface field) for minimal coupling

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted length/code-token scoring to satisfy behavior spec**

- **Found during:** Task 1 (RED/GREEN TDD)
- **Issue:** Plan's described bucket values (15 for 1-2 camelCase tokens) + default syntaxPenalty=25 produced score=55 for "processOrder validateInput" which should be <=30. The plan's implementation description was inconsistent with the behavior spec.
- **Fix:** Added "all code tokens" rule — when codeTokenCount >= wordCount, syntaxPenalty = 0. Also added <10-char early-return to score 0. All 11 behavior tests pass.
- **Files modified:** packages/indexer/src/strategies/quality-scorer.ts
- **Verification:** All 11 tests pass including boundary cases
- **Committed in:** 8e67550

---

**Total deviations:** 1 auto-fixed (Rule 1 - implementation inconsistency with behavior spec)
**Impact:** Scoring is correct per behavior spec. The fix is logical and adds a semantically useful rule.

## Issues Encountered

None — both tests and implementation converged cleanly after the scoring adjustment.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Quality scorer and reporting complete; ready for Plan 03
- `printQualityReport()` is available but not yet wired into the indexer CLI (can be added in next plan or quick task)

---

_Phase: 20-prompt-engineering_
_Completed: 2026-04-23_
