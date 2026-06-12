# Tasks: Enrichment Call Reduction

**Input**: Design documents from `specs/011-enrichment-call-reduction/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Required by constitution (Principle I: TDD). Tests written first, must fail before implementation.

**Organization**: Tasks grouped by user story. All three stories are P1 priority; ordered by dependency simplicity (trivial filter → extension filter → dynamic batching).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/<package>/src/` for source, co-located `*.test.ts` for tests
- **Core types**: `packages/core/src/types/index.ts`
- **Config schema**: `packages/core/src/config/schema.ts`
- **Pipeline**: `packages/indexer/src/pipeline.ts`
- **Enricher**: `packages/indexer/src/enrichment/enricher.ts`
- **Pipeline tests**: `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- **Enricher tests**: `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- **Enricher integration tests**: `packages/indexer/src/enrichment/enricher.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend shared types and config schema with new fields needed by all three user stories.

- [x] T001 Add `minEnrichmentLines?: number` field to `EnrichmentConfig` interface in `packages/core/src/types/index.ts`
- [x] T002 Add `excludeExtensions?: string[]` field to `EnrichmentConfig` interface in `packages/core/src/types/index.ts`
- [x] T003 Add `minEnrichmentLines: z.number().int().min(1).optional()` to enrichment Zod schema in `packages/core/src/config/schema.ts`
- [x] T004 Add `excludeExtensions: z.array(z.string().min(1)).optional()` to enrichment Zod schema in `packages/core/src/config/schema.ts`
- [x] T005 Verify `pnpm build` passes with new type/schema fields (no compile errors)

**Checkpoint**: Types and schema extended. All user stories can now proceed.

---

## Phase 2: User Story 1 — Skip Trivial Methods (Priority: P1) 🎯 MVP

**Goal**: Methods/functions with ≤5 lines skip LLM enrichment by default, reducing enrichment calls by 15-25%.

**Independent Test**: Index a project with 10+ trivial methods (≤5 lines) and 10 business methods (>5 lines). Verify only business methods have `enrichedAt`/`enrichmentModel` fields.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T006 [P] [US1] Write test: method chunk with 5 lines (endLine - startLine + 1 = 5) is skipped with default `minEnrichmentLines: 6` in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T007 [P] [US1] Write test: method chunk with 6 lines IS enriched with default `minEnrichmentLines: 6` in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T008 [P] [US1] Write test: `class-signature` chunk with 3 lines IS enriched (not subject to trivial filtering) in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T009 [P] [US1] Write test: `class` chunk with 4 lines IS enriched (only `method`/`function` types filtered) in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T010 [P] [US1] Write test: `minEnrichmentLines: 1` disables trivial filtering entirely in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T011 [P] [US1] Write test: `minEnrichmentLines: 10` filters methods/functions with ≤9 lines in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T012 [P] [US1] Write test: `minEnrichmentLines` of 0 or negative treated as disabled (same as 1) in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Add `DEFAULT_MIN_ENRICHMENT_LINES = 6` constant in `packages/indexer/src/pipeline.ts`
- [x] T014 [US1] Implement trivial line-count filter step in `filterChunksForEnrichment()` — after existing language/stereotype loop, filter `enrichable` array: skip chunks where `chunkType` is `method` or `function` AND `endLine - startLine + 1 < minEnrichmentLines` in `packages/indexer/src/pipeline.ts`
- [x] T015 [US1] Handle edge case: `minEnrichmentLines <= 1` disables filtering (early return from trivial step) in `packages/indexer/src/pipeline.ts`
- [x] T016 [US1] Run tests for US1 — verify all T006-T012 pass in `packages/indexer/`

**Checkpoint**: Trivial method filtering works independently. Methods ≤5 lines skip enrichment.

---

## Phase 3: User Story 2 — Exclude Files by Extension (Priority: P1)

**Goal**: Users can exclude specific file extensions from LLM enrichment via `excludeExtensions` config.

**Independent Test**: Configure `excludeExtensions: [".js", ".jsx"]` and index a mixed TS/JS project. Verify JS/JSX chunks have no `enrichedAt` field but TS chunks do.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T017 [P] [US2] Write test: chunks from `app.js` skipped when `excludeExtensions: [".js"]` in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T018 [P] [US2] Write test: chunks from `app.ts` ARE enriched when `excludeExtensions: [".js"]` in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T019 [P] [US2] Write test: case-insensitive matching — `excludeExtensions: [".JS"]` skips `app.js` in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T020 [P] [US2] Write test: multiple extensions `[".js", ".jsx", ".mjs"]` all excluded in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T021 [P] [US2] Write test: `excludeExtensions` undefined means no extension filtering in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T022 [P] [US2] Write test: `excludeExtensions: []` (empty array) means no extension filtering in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T023 [P] [US2] Write test: both `excludeExtensions: [".js"]` AND `excludeLanguages: ["yaml"]` filter independently in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T024 [P] [US2] Write test: extension without leading dot (`"js"`) is normalized to `".js"` in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`

### Implementation for User Story 2

- [x] T025 [US2] Add `import { extname } from 'node:path'` to `packages/indexer/src/pipeline.ts`
- [x] T026 [US2] Add extension normalization helper: prepend dot if missing, lowercase, in `packages/indexer/src/pipeline.ts`
- [x] T027 [US2] Implement extension exclusion filter step in `filterChunksForEnrichment()` — after language/stereotype loop and BEFORE trivial filter: extract `extname(chunk.filePath)`, compare case-insensitively against normalized `excludeExtensions` set in `packages/indexer/src/pipeline.ts`
- [x] T028 [US2] Handle edge case: undefined or empty `excludeExtensions` skips filter step entirely in `packages/indexer/src/pipeline.ts`
- [x] T029 [US2] Run tests for US2 — verify all T017-T024 pass in `packages/indexer/`

**Checkpoint**: Extension-based filtering works independently. `.js` files skip enrichment when configured.

---

## Phase 4: User Story 3 — Dynamic Batch Sizing (Priority: P1)

**Goal**: Replace fixed 10-chunk batching with token-budget packing (up to 20 chunks), reducing total Ollama calls by 30-40%.

**Independent Test**: Create 20 small chunks (50 chars each) and verify they batch into 1 call (not 2). Create 5 large chunks (12000 chars each) and verify they produce 2+ batches.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T030 [P] [US3] Write test: 20 small chunks (50 chars each) fit into single batch with numCtx=16384 in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [x] T031 [P] [US3] Write test: 40 small chunks split into 2 batches of 20 (MAX_BATCH_CHUNKS cap) in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [x] T032 [P] [US3] Write test: 5 large chunks (12000 chars each) produce 2+ batches (exceed token budget) in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [x] T033 [P] [US3] Write test: single oversized chunk gets its own batch (never dropped) in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [x] T034 [P] [US3] Write test: empty input (0 chunks) produces 0 batches in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [x] T035 [P] [US3] Write test: numCtx=32768 produces proportionally larger token budget in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [x] T036 [P] [US3] Write test: dynamic batching applies within class-grouped (large-file) path in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`

### Implementation for User Story 3

- [x] T037 [US3] Export constants `TOKEN_BUDGET_RATIO = 0.55`, `PROMPT_OVERHEAD_TOKENS = 500`, `MAX_BATCH_CHUNKS = 20`, `CHARS_PER_TOKEN = 4` at module level in `packages/indexer/src/enrichment/enricher.ts`
- [x] T038 [US3] Implement `buildDynamicBatches(chunks: CodeChunk[], numCtx: number): CodeChunk[][]` as exported pure function using greedy bin-packing algorithm in `packages/indexer/src/enrichment/enricher.ts`
- [x] T039 [US3] Replace fixed `BATCH_SIZE = 10` loop in standard path of `LlmEnricher.enrich()` with `buildDynamicBatches()` call in `packages/indexer/src/enrichment/enricher.ts`
- [x] T040 [US3] Replace fixed `BATCH_SIZE = 10` loop in large-file (class-grouped) path of `LlmEnricher.enrich()` with `buildDynamicBatches()` call per class group in `packages/indexer/src/enrichment/enricher.ts`
- [x] T041 [US3] Verify progress reporting uses dynamically computed `batchesTotal` from actual batch array length in `packages/indexer/src/enrichment/enricher.ts`
- [x] T042 [US3] Run tests for US3 — verify all T030-T036 pass in `packages/indexer/`

**Checkpoint**: Dynamic batching works. Small chunks pack efficiently; large chunks split correctly.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Integration validation, existing test updates, and final verification.

- [x] T043 Update existing sub-batching tests (currently expect BATCH_SIZE=10 behavior) to expect dynamic batching in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [x] T044 Update existing enricher integration tests (T015, T083) if batch count expectations changed in `packages/indexer/src/enrichment/enricher.test.ts`
- [x] T045 [P] Verify filter order is correct: language → stereotype → extension → trivial (add order-verification test) in `packages/indexer/src/__tests__/pipeline-filtering.test.ts`
- [x] T046 Run full test suite `pnpm test` — verify all tests pass across all packages
- [x] T047 Run `pnpm build` — verify no compile errors across all packages
- [x] T048 Validate quickstart.md scenarios work with the implementation (manual check)

**Checkpoint**: All tests green, build passes, feature complete.

---

## Phase 6: Enrichment Error Visibility Fix (cross-cutting)

**Purpose**: Fix garbled CLI error display during enrichment failures and include raw Ollama response in parse-failure errors.

**Blocked by**: None (independent of call-reduction changes)

### Implementation

- [x] T049 Add `warning?: string` field to `EnrichmentProgress` interface in `packages/indexer/src/enrichment/enricher.ts`
- [x] T050 Add `warning?: string` field to `IndexingProgress` interface in `packages/indexer/src/pipeline.ts`
- [x] T051 Replace `console.warn()` in enricher catch block with passing warning via progress callback in `packages/indexer/src/enrichment/enricher.ts`
- [x] T052 Propagate `ep.warning` through pipeline progress callback to CLI in `packages/indexer/src/pipeline.ts`
- [x] T053 Add CLI warning rendering: clear progress line, print warning in yellow with batch context, show failure counter in progress bar in `packages/cli/src/commands/index.command.ts`
- [x] T054 Replace bare parse-failure error message with `formatOllamaError({ parseFailure: true, body: rawResponse })` in `packages/indexer/src/enrichment/enricher.ts`
- [x] T055 Update test: "logs full error details when skipOnFailure is true" to check `warning` on progress callback in `packages/indexer/src/__tests__/enricher-errors.test.ts`
- [x] T056 Update test: "logs a warning mentioning Ollama when connection fails" to check `warning` on progress callback in `packages/indexer/src/enrichment/enricher.test.ts`
- [x] T057 Add `warning?: string` to local `EnrichmentProgress` interface in `packages/indexer/src/enrichment/enricher.test.ts`
- [x] T058 Run full test suite `pnpm test` — verify all 23 suites pass
- [x] T059 Run `pnpm build` — verify no compile errors

**Checkpoint**: Enrichment warnings render cleanly in CLI, parse failures include raw response body.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1 (needs `minEnrichmentLines` field in type)
- **Phase 3 (US2)**: Depends on Phase 1 (needs `excludeExtensions` field in type)
- **Phase 4 (US3)**: Depends on Phase 1 (needs type awareness), independent of US1/US2
- **Phase 5 (Polish)**: Depends on Phases 2, 3, and 4 completion

### User Story Dependencies

- **User Story 1 (US1)**: Can start after Phase 1 — modifies `filterChunksForEnrichment()` (adds trivial step)
- **User Story 2 (US2)**: Can start after Phase 1 — modifies `filterChunksForEnrichment()` (adds extension step)
- **User Story 3 (US3)**: Can start after Phase 1 — modifies `enricher.ts` only (independent file)

**Note**: US1 and US2 both modify `packages/indexer/src/pipeline.ts`. They can be done in parallel (different filter steps, additive changes) but sequencing avoids merge conflicts. US3 is fully parallel with US1/US2 (different file).

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD)
- Implementation makes tests pass
- Run story-specific tests to validate

### Parallel Opportunities

- T001-T004 can all run in parallel (different lines in different files)
- All test tasks within a story (T006-T012, T017-T024, T030-T036) can run in parallel
- US3 (Phase 4) can run in parallel with US1 (Phase 2) or US2 (Phase 3) — different files
- T043-T045 in Polish phase are independent (parallel)

---

## Parallel Example: User Story 3

```text
# Launch all tests for US3 together (they test the same function but different scenarios):
Task T030: "20 small chunks fit into single batch"
Task T031: "40 small chunks split into 2 batches of 20"
Task T032: "5 large chunks produce 2+ batches"
Task T033: "single oversized chunk gets its own batch"
Task T034: "empty input produces 0 batches"
Task T035: "numCtx=32768 produces larger budget"
Task T036: "dynamic batching applies within class groups"

# After tests fail, implement sequentially:
Task T037: Export constants at module level
Task T038: Implement buildDynamicBatches() function
Task T039: Replace standard path loop
Task T040: Replace large-file path loop
Task T041: Verify progress reporting
Task T042: Run all US3 tests — green
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types + schema) — ~15 min
2. Complete Phase 2: User Story 1 (trivial filtering) — ~45 min
3. **STOP and VALIDATE**: Run `pnpm test` for indexer package
4. Verify: methods ≤5 lines excluded, classes/interfaces not filtered

### Incremental Delivery

1. Phase 1 → Setup complete
2. Phase 2 (US1) → Trivial filtering active → validate independently
3. Phase 3 (US2) → Extension filtering active → validate independently
4. Phase 4 (US3) → Dynamic batching active → validate independently
5. Phase 5 → All tests green, build passes
6. Each phase adds measurable call reduction without breaking previous features

### Optimal Execution (Parallel)

1. Complete Phase 1: Setup
2. In parallel:
   - Developer/Agent A: Phase 2 (US1 — pipeline.ts trivial filter)
   - Developer/Agent B: Phase 4 (US3 — enricher.ts dynamic batching)
3. Then Phase 3 (US2 — pipeline.ts extension filter, depends on same file as US1)
4. Phase 5: Polish & validate

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable — US1 reduces calls via filtering, US3 via packing
- Constitution requires TDD: write failing test → implement → green
- Commit after each completed story phase
- The `BATCH_SIZE = 10` constant is local to `enrich()` — removing it is safe
- `buildDynamicBatches()` is a pure function with no side effects — simple to test

---

## Phase 7: Output Token Budget & Configurable Batch Sizes (FR-019, FR-020, FR-021)

**Purpose**: Fix output truncation on small models by setting explicit `num_predict`, and expose batch sizes as user-configurable settings in `project.json`.

**Blocked by**: None (independent of Phases 2-6)

### Implementation — Output Token Budget (FR-019)

- [x] T060 Add constants `OUTPUT_TOKENS_PER_CHUNK = 200` and `OUTPUT_TOKENS_OVERHEAD = 100` in `packages/indexer/src/enrichment/enricher.ts`
- [x] T061 Compute `numPredict = chunks.length × 200 + 100` in `enrichBatch()` before calling Ollama in `packages/indexer/src/enrichment/enricher.ts`
- [x] T062 Extend `callOllama()` signature to accept `numPredict?: number` parameter (default: 4096) in `packages/indexer/src/enrichment/enricher.ts`
- [x] T063 Pass `num_predict: numPredict` in Ollama API options alongside `num_ctx` and `temperature` in `packages/indexer/src/enrichment/enricher.ts`

### Implementation — Configurable `embeddingBatchSize` (FR-020)

- [x] T064 Add `embeddingBatchSize?: number` to `IndexingConfig` interface in `packages/core/src/types/index.ts`
- [x] T065 Add `embeddingBatchSize: z.number().int().min(1).max(200).optional()` to `IndexingConfigSchema` in `packages/core/src/config/schema.ts`
- [x] T066 Pass `embeddingBatchSize` from project config to pipeline in `packages/cli/src/commands/index.command.ts`

### Implementation — Configurable `maxBatchChunks` (FR-021)

- [x] T067 Add `maxBatchChunks?: number` to `EnrichmentConfig` interface in `packages/core/src/types/index.ts`
- [x] T068 Add `maxBatchChunks: z.number().int().min(1).max(50).optional()` to enrichment Zod schema in `packages/core/src/config/schema.ts`
- [x] T069 Add `maxBatchChunks` to LlmEnricher constructor config (default: `MAX_BATCH_CHUNKS`) in `packages/indexer/src/enrichment/enricher.ts`
- [x] T070 Update `buildDynamicBatches()` signature to accept `maxChunks` parameter (default: `MAX_BATCH_CHUNKS`) in `packages/indexer/src/enrichment/enricher.ts`
- [x] T071 Pass `config.maxBatchChunks` to `buildDynamicBatches()` in both standard and large-file paths in `packages/indexer/src/enrichment/enricher.ts`

### Configuration & Verification

- [x] T072 Update `.ia-framework/project.json` with corrected model (`qwen3:8b`), `embeddingBatchSize: 25`, `maxBatchChunks: 10`, `numCtx: 16384`
- [x] T073 Rebuild core package (`pnpm --filter core build`) and verify type-check passes
- [x] T074 Run indexer tests (`pnpm --filter indexer test`) — verify all 216 tests pass
- [x] T075 Run core tests (`pnpm --filter core test`) — verify all 102 tests pass

### Documentation

- [x] T076 Add FR-019, FR-020, FR-021 to `specs/011-enrichment-call-reduction/spec.md`
- [x] T077 Add D-005 (num_predict rationale) and D-006 (separate batch controls) to spec.md
- [x] T078 Add Change 6 (num_predict) and Change 7 (configurable batches) to plan.md
- [x] T079 Add batch size fields and model recommendations table to quickstart.md
- [x] T080 Add `maxBatchChunks`, `embeddingBatchSize`, internal constants, and model table to contracts/enrichment-config.md
- [x] T081 Update data-model.md with new fields and updated function signatures
- [x] T082 Update research.md with output truncation findings

**Checkpoint**: Output truncation fixed. Both batch sizes configurable via `project.json`. All tests green.

---

## Phase 8: Lean Prompt, Positional Output & Configurable Token Budgets (US4)

**Purpose**: Eliminate output truncation by reducing prompt overhead, switching to positional array response (LLM returns only enrichment fields), adding `format: 'json'`, and exposing token budget constants as user-configurable settings.

**Blocked by**: Phase 7 (depends on `OUTPUT_TOKENS_PER_CHUNK` constant existing)

### Part A: Configurable Token Budget Parameters (FR-028 – FR-030, FR-033)

- [ ] T083 Add `charsPerToken?: number` to `EnrichmentConfig` interface in `packages/core/src/types/index.ts`
- [ ] T084 Add `tokenBudgetRatio?: number` to `EnrichmentConfig` interface in `packages/core/src/types/index.ts`
- [ ] T085 Add `outputTokensPerChunk?: number` to `EnrichmentConfig` interface in `packages/core/src/types/index.ts`
- [ ] T086 Add Zod validations: `charsPerToken: z.number().min(1).max(10).optional()`, `tokenBudgetRatio: z.number().min(0.2).max(0.7).optional()`, `outputTokensPerChunk: z.number().int().min(50).max(1000).optional()` in `packages/core/src/config/schema.ts`
- [ ] T087 Update `LlmEnricher` constructor to read new config fields with defaults: `charsPerToken ?? 3`, `tokenBudgetRatio ?? 0.45`, `outputTokensPerChunk ?? 300` in `packages/indexer/src/enrichment/enricher.ts`
- [ ] T088 Update constructor default `numCtx` from `16384` to `32768` in `packages/indexer/src/enrichment/enricher.ts`
- [ ] T089 Rename constants to `DEFAULT_*` prefix: `TOKEN_BUDGET_RATIO → DEFAULT_TOKEN_BUDGET_RATIO = 0.45`, `CHARS_PER_TOKEN → DEFAULT_CHARS_PER_TOKEN = 3`, `OUTPUT_TOKENS_PER_CHUNK → DEFAULT_OUTPUT_TOKENS_PER_CHUNK = 300` in `packages/indexer/src/enrichment/enricher.ts`
- [ ] T090 Update `buildDynamicBatches()` signature to accept `charsPerToken` and `tokenBudgetRatio` params (with defaults) in `packages/indexer/src/enrichment/enricher.ts`
- [ ] T091 Pass config values to `buildDynamicBatches()` calls in both standard and large-file paths in `packages/indexer/src/enrichment/enricher.ts`
- [ ] T092 Update `numPredict` calculation in `enrichBatch()` to use `this.config.outputTokensPerChunk` instead of hardcoded constant in `packages/indexer/src/enrichment/enricher.ts`

### Part B: Lean Prompt (FR-022, FR-031)

- [ ] T093 Rewrite `buildEnrichmentPrompt()` with compact one-line instruction + single-line JSON schema example (~60 tokens overhead max) in `packages/indexer/src/enrichment/prompt.ts`
- [ ] T094 Replace chunk delimiters: from `=== CHUNK id="..." name="..." type="..." === / === END CHUNK ===` to `--- N: name (type) ---` (positional, no IDs, no end markers) in `packages/indexer/src/enrichment/prompt.ts`
- [ ] T095 Keep annotations/imports metadata per chunk as compact single-line: `@annotations | imports: a, b, c` in `packages/indexer/src/enrichment/prompt.ts`
- [ ] T096 Remove `ChunkForPrompt.id` from the prompt output (no longer needed in delimiters) in `packages/indexer/src/enrichment/prompt.ts`

### Part C: Positional Array Output (FR-023 – FR-026)

- [ ] T097 Update `parseEnrichmentResponse()` to parse a flat JSON array `[{...}, ...]` instead of `{"chunks": [...]}` in `packages/indexer/src/enrichment/prompt.ts`
- [ ] T098 Update `PromptResponse` type: change from `{ chunks: EnrichedChunkResponse[] }` to just `EnrichedChunkResponse[]` (or add new type alias) in `packages/indexer/src/enrichment/prompt.ts`
- [ ] T099 Remove `id` field from `EnrichedChunkResponse` interface (no longer in response) in `packages/indexer/src/enrichment/prompt.ts`
- [ ] T100 Rewrite `enrichBatch()` mapping logic: replace ID-based `enrichmentMap` with positional mapping: `response[i]` → `batch[i]` in `packages/indexer/src/enrichment/enricher.ts`
- [ ] T101 Pre-build `indexMap: Map<string, number>` (chunk.id → global index in result array) at start of `enrich()` for concurrent-safe writes in `packages/indexer/src/enrichment/enricher.ts`
- [ ] T102 Update `applyBatch()` to use positional mapping with `indexMap` for writing to `result[]` in `packages/indexer/src/enrichment/enricher.ts`
- [ ] T103 Handle length mismatch: when `response.length < batch.length`, enrich first N chunks, emit warning via progress callback in `packages/indexer/src/enrichment/enricher.ts`
- [ ] T104 Handle length mismatch: when `response.length > batch.length`, ignore extra objects in `packages/indexer/src/enrichment/enricher.ts`

### Part D: Force JSON Output Mode (FR-027)

- [x] T105 Replace grammar-constrained JSON Schema `format` object with `format: 'json'` string in `callOllama()` in `packages/indexer/src/enrichment/enricher.ts` — fixes silent truncation and Ollama version compatibility
- [x] T106 N/A — `think: false` was never present in `callOllama()`; no change needed

### Part E: Tests

- [ ] T107 [P] Write test: positional mapping correctly assigns `response[i]` to `batch[i]` for a 5-chunk batch in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T108 [P] Write test: partial response (3 of 5 chunks returned) → first 3 enriched, last 2 unenriched, warning emitted in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T109 [P] Write test: extra response objects (7 returned for 5 chunks) → extras ignored in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T110 [P] Write test: empty response `[]` → all chunks unenriched, warning emitted in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T111 [P] Write test: concurrent batches (concurrency=3) with positional mapping produce correct results (no cross-batch contamination) in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T112 [P] Write test: `buildDynamicBatches()` uses custom `charsPerToken=2` → smaller batches than default in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T113 [P] Write test: `buildDynamicBatches()` uses custom `tokenBudgetRatio=0.3` → smaller batches in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T114 [P] Write test: `num_predict` uses config `outputTokensPerChunk=400` → `5 × 400 + 100 = 2100` in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T115 [P] Write test: lean prompt is ≤80 tokens overhead (measure character count / 4 of non-content portion) in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T116 [P] Write test: `parseEnrichmentResponse()` parses flat array `[{"description":"..."}]` correctly in `packages/indexer/src/enrichment/__tests__/enricher.test.ts`
- [ ] T117 Update existing enricher tests that assert on old response format (`{"chunks": [...]}`) to expect flat array in `packages/indexer/src/enrichment/enricher.test.ts`

### Part F: Verification

- [ ] T118 Run `pnpm --filter core build` — verify no compile errors with new config fields
- [ ] T119 Run `pnpm --filter indexer test` — verify all tests pass
- [ ] T120 Run `pnpm build` — verify full monorepo build passes
- [ ] T121 Manual validation: index a 200-chunk project with `gemma4:e2b` (numCtx: 32768, maxBatchChunks: 5) — verify zero parse failures from truncation

**Checkpoint**: Output truncation eliminated. Lean prompt saves ~800 tokens/batch. Token budget parameters configurable per project. Concurrent processing remains safe.

---

## Phase 9: Install Script — Full Config Template

**Purpose**: Update `scripts/init-config.sh` so that the generated `project.json` exposes all configurable settings for embedding and enrichment with sensible defaults. Existing configs get new fields merged automatically on re-run.

**Blocked by**: Phase 8 Part A (new config fields must exist in schema)

- [x] T122 Update fallback `project.json` template in `scripts/init-config.sh` to include full enrichment config: `numCtx`, `concurrency`, `retryAttempts`, `skipOnFailure`, `maxBatchChunks`, `charsPerToken`, `tokenBudgetRatio`, `outputTokensPerChunk`, `minEnrichmentLines`, `excludeLanguages`, `excludeStereotypes`, `excludeExtensions`
- [x] T123 Update fallback template to include `embeddingBatchSize` and `embeddingConcurrency` in the `indexing` block
- [x] T124 Update merge logic (existing config migration) to add missing enrichment fields with defaults
- [x] T125 Update merge logic to add missing `embeddingBatchSize` and `embeddingConcurrency`
- [ ] T126 Test: run `init_config` on an existing minimal config → verify new fields are merged without overwriting existing values
- [ ] T127 Test: run `init_config` on a fresh directory → verify full template is generated with all fields

**Checkpoint**: New installs get a complete, ready-to-tune `project.json`. Existing installs get new fields merged on upgrade.

---

## Dependencies & Execution Order (Updated)

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1)**: Depends on Phase 1
- **Phase 3 (US2)**: Depends on Phase 1
- **Phase 4 (US3)**: Depends on Phase 1
- **Phase 5 (Polish)**: Depends on Phases 2, 3, 4
- **Phase 6 (Error Visibility)**: Independent
- **Phase 7 (num_predict & batch sizes)**: Independent
- **Phase 8 (Lean Prompt & Positional Output)**: Depends on Phase 7 (constants must exist before renaming)
- **Phase 9 (Install Script)**: Depends on Phase 8 Part A (new config fields in schema)

### Within Phase 8

- Part A (config fields): Start first — types needed by other parts
- Part B (lean prompt) and Part D (format:json): Can run in parallel after Part A
- Part C (positional output): Depends on Part B (prompt change defines new response format)
- Part E (tests): Written alongside/before implementation (TDD)
- Part F (verification): After all parts complete
