# Tasks: Indexing Performance — Enrichment Optimization

**Input**: Design documents from `/specs/009-indexing-performance/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — TDD required per project constitution.

**Organization**: Tasks are grouped by phase. Phases 1-6 are complete (original spec). Phases 7-11 implement the new optimizations.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1-US5)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/core/src/`, `packages/indexer/src/`, `packages/cli/src/`
- Tests colocated: `packages/indexer/src/__tests__/`, `packages/indexer/src/enrichment/__tests__/`

---

## Phases 1-6: COMPLETED (Original Spec)

> These phases implemented language-based filtering (US1), batch-grouping cap (US3), and configurable concurrency (US2). All tasks marked complete.

- [x] T001–T032: See git history for original implementation

---

## Phase 7: Config & Types — excludeStereotypes + Default Changes

**Purpose**: Extend core types to support stereotype-based filtering and update performance defaults

**Blocked by**: Nothing (can start immediately)

### Implementation

- [x] T033 [US5] Add `excludeStereotypes?: string[]` field to `EnrichmentConfig` interface in packages/core/src/types/index.ts
- [x] T034 [P] [US5] Add Zod validation `excludeStereotypes: z.array(z.string().min(1)).optional()` to enrichment schema in packages/core/src/config/schema.ts
- [x] T035 [US2] Change default `numCtx` from 32768 to 16384 in LlmEnricher constructor in packages/indexer/src/enrichment/enricher.ts
- [x] T036 [US2] Change default `concurrency` from 3 to 5 in LlmEnricher constructor in packages/indexer/src/enrichment/enricher.ts

**Checkpoint**: Core types extended with `excludeStereotypes`; enricher defaults updated to 16K context / 5 concurrency.

---

## Phase 8: Stereotype-based Enrichment Filtering

**Purpose**: Skip low-value chunks (test, dto, config-block, migration) from LLM enrichment

**Blocked by**: Phase 7 (needs `excludeStereotypes` type)

### Tests (Write FIRST — must FAIL before implementation)

- [x] T037 [P] [US5] Write unit test: chunks with excluded stereotypes are filtered out before enrichment call in packages/indexer/src/**tests**/pipeline-filtering.test.ts
- [x] T038 [P] [US5] Write unit test: default stereotype exclusion list applied when `excludeStereotypes` is undefined in packages/indexer/src/**tests**/pipeline-filtering.test.ts
- [x] T039 [P] [US5] Write unit test: empty array `[]` overrides stereotype defaults (all stereotypes enriched) in packages/indexer/src/**tests**/pipeline-filtering.test.ts
- [x] T040 [P] [US5] Write unit test: chunks with no stereotype assigned are enriched (not excluded) in packages/indexer/src/**tests**/pipeline-filtering.test.ts
- [x] T041 [P] [US5] Write unit test: language filter AND stereotype filter combine (chunk excluded if either matches) in packages/indexer/src/**tests**/pipeline-filtering.test.ts

### Implementation

- [x] T042 [US5] Define `DEFAULT_EXCLUDE_STEREOTYPES` constant `["test", "dto", "config-block", "migration"]` in packages/indexer/src/pipeline.ts
- [x] T043 [US5] Extend `filterChunksForEnrichment()` to also check `excludeStereotypes` from config against chunk's `stereotype` field in packages/indexer/src/pipeline.ts
- [x] T044 [US5] Run stereotype filter tests and verify all pass: `pnpm --filter @ia-framework/indexer test`

**Checkpoint**: US5 functional — test/dto/config-block/migration chunks skip enrichment automatically.

---

## Phase 9: Pipeline Streaming (Producer-Consumer) — REVERTED

**Purpose**: Originally intended to overlap enrichment and embedding. Implemented and all tests passed, but **REVERTED** because Ollama cannot hold both generate (qwen3:8b) and embed (nomic-embed-text) models in VRAM simultaneously on 16GB Apple Silicon. The `llama-server` crashes with "no longer running: unknown". Pipeline remains sequential (D-002).

**Blocked by**: Phase 8

> **Note**: All tasks below were completed and tests pass. The streaming code was reverted in `pipeline.ts` but `pipeline-streaming.test.ts` is retained as it validates p-queue mechanics independently.

### Tests (Write FIRST — must FAIL before implementation)

- [x] T045 [P] [US4] Write unit test: skipped chunks (excluded from enrichment) are immediately available for embedding without waiting for enrichment in packages/indexer/src/**tests**/pipeline-streaming.test.ts
- [x] T046 [P] [US4] Write unit test: embedding batches start processing before all enrichment batches complete in packages/indexer/src/**tests**/pipeline-streaming.test.ts
- [x] T047 [P] [US4] Write unit test: remaining chunks in accumulator are flushed to embedding when enrichment finishes (partial final batch) in packages/indexer/src/**tests**/pipeline-streaming.test.ts
- [x] T048 [P] [US4] Write unit test: abort signal clears both enrichment and embedding queues in packages/indexer/src/**tests**/pipeline-streaming.test.ts
- [x] T049 [P] [US4] Write unit test: embedding failure for one batch does not stall other batches in packages/indexer/src/**tests**/pipeline-streaming.test.ts

### Implementation

- [x] T050 [US4] Extract the current sequential enrichment+embedding block from `IndexingPipeline.run()` into a refactored streaming flow in packages/indexer/src/pipeline.ts
- [x] T051 [US4] Implement `flushToEmbedding()` helper that drains accumulator buffer into embedding queue when ≥ embeddingBatchSize chunks are available in packages/indexer/src/pipeline.ts
- [x] T052 [US4] Wire skipped chunks (from filterChunksForEnrichment) directly into the pendingEmbed buffer before enrichment starts in packages/indexer/src/pipeline.ts
- [x] T053 [US4] Wire enrichment batch completion callback to push enriched chunks into pendingEmbed and call flushToEmbedding() in packages/indexer/src/pipeline.ts
- [x] T054 [US4] Add final flush after enrichment queue idle: `flushToEmbedding(true)` + `await embedQueue.onIdle()` in packages/indexer/src/pipeline.ts
- [x] T055 [US4] Wire abort signal to clear both enrichment queue and embedding queue in packages/indexer/src/pipeline.ts
- [x] T056 [US4] Update progress reporting to track enrichment and embedding independently (both can be active simultaneously) in packages/indexer/src/pipeline.ts
- [x] T057 [US4] Run streaming pipeline tests and verify all pass: `pnpm --filter @ia-framework/indexer test`

**Checkpoint**: ~~US4 functional~~ REVERTED — Pipeline remains sequential. Streaming tests retained as p-queue unit tests.

---

## Phase 10: Concurrency Tuning + CLI Warning

**Purpose**: Update embedding concurrency default and warn about OLLAMA_NUM_PARALLEL

**Blocked by**: Phase 9 (concurrency defaults should match streaming architecture)

### Tests

- [x] T058 [P] [US2] Write unit test: Ollama embedding default concurrency is 6 (was 3) in packages/indexer/src/**tests**/pipeline-filtering.test.ts
- [x] T059 [P] [US2] Write test: CLI logs warning when enrichment concurrency > 3 in packages/cli/src/**tests**/ (or verify manually)

### Implementation

- [x] T060 [US2] Change `getDefaultConcurrency('ollama')` return value from 3 to 6 in packages/indexer/src/pipeline.ts
- [x] T061 [US2] Add OLLAMA_NUM_PARALLEL warning log in CLI index command when resolved enrichment concurrency > 3 in packages/cli/src/commands/index.command.ts
- [x] T062 [US2] Run affected tests: `pnpm --filter @ia-framework/indexer test && pnpm --filter @ia-framework/cli test`

**Checkpoint**: US2 enhanced — defaults optimized for 16GB Apple Silicon, CLI warns about server config.

---

## Phase 11: Integration Validation & Polish

**Purpose**: Verify all optimizations work together, run full test suite, ensure no regressions

**Blocked by**: All previous phases

- [x] T063 Run full test suite across all affected packages: `pnpm --filter @ia-framework/core test && pnpm --filter @ia-framework/indexer test && pnpm --filter @ia-framework/cli test`
- [x] T064 Run full build to verify no type errors: `pnpm build`
- [x] T065 [P] Verify existing tests still pass (no regressions): `pnpm test`
- [ ] T066 [P] Run quickstart.md validation steps (index a multi-module project, verify timing improvement, verify stereotype filtering in progress output)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 7 (config/types) ──→ Phase 8 (stereotype filter) ──→ Phase 9 (REVERTED) ──→ Phase 10 (CLI) ──→ Phase 11 (validation)
```

- **Phase 7**: No dependencies — can start immediately
- **Phase 8**: Depends on Phase 7 (`excludeStereotypes` type must exist)
- **Phase 9**: REVERTED — streaming implemented then reverted (Ollama memory constraints)
- **Phase 10**: Independent of Phase 9
- **Phase 11**: Depends on ALL previous phases being complete

### Within Each Phase

- Tests MUST be written and FAIL before implementation (TDD)
- Implementation tasks are sequential within their phase
- Phase complete when its test command passes

### Parallel Opportunities

- T033 and T034 can run in parallel (different files)
- T035 and T036 can run in parallel (same file but different lines)
- T037–T041 can all run in parallel (different test cases, same file)
- T045–T049 can all run in parallel (different test cases, same file)
- T058 and T059 can run in parallel (different packages)

---

## Implementation Strategy

### Incremental Delivery

1. Phase 7 → Config ready (5 min)
2. Phase 8 → Stereotype filtering active → 15-25% fewer enrichment calls
3. Phase 9 → ~~Streaming pipeline~~ REVERTED (Ollama memory constraints on 16GB Apple Silicon)
4. Phase 10 → Optimized defaults + warning → additional 40-60% per-call improvement
5. Phase 11 → Full validation → Ready for merge

### Expected Combined Impact

| Metric                        | Before                       | After                                     | Improvement           |
| ----------------------------- | ---------------------------- | ----------------------------------------- | --------------------- |
| Enrichable chunks (32K total) | ~26K (after language filter) | ~20K (after language + stereotype filter) | -23%                  |
| Enrichment concurrency        | 3                            | 5                                         | +67% throughput       |
| Per-call latency (numCtx)     | ~3-5s (32K ctx)              | ~2-3s (16K ctx)                           | -40% latency          |
| Embedding concurrency         | 3                            | 6                                         | +100% throughput      |
| Pipeline overlap              | 0% (sequential)              | 0% (REVERTED — D-002)                     | N/A                   |
| **Total indexing time**       | **~54 min**                  | **~20-25 min**                            | **~54-63% reduction** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- TDD required: write tests first, verify they fail, then implement
- Commit after each phase completion
- No persistent enrichment cache (explicit design decision — see spec D-001)
- All concurrency defaults assume Apple Silicon 16GB + OLLAMA_NUM_PARALLEL=5
