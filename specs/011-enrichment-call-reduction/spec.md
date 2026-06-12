# Feature Specification: Enrichment Call Reduction — Trivial Filtering, Extension Exclusion & Dynamic Batching

**Feature Branch**: `011-enrichment-call-reduction`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Indexing with qwen2.5-coder is still very slow. Reduce the number of Ollama enrichment calls by (1) skipping trivial/short methods, (2) allowing file extension-based exclusion (e.g., .js files), and (3) packing more chunks per batch dynamically based on token budget instead of the fixed 10-chunk limit."

**Context**: Spec 009 (`009-indexing-performance`) already implemented language filtering, stereotype filtering, concurrency tuning, and batch-group capping. This spec builds on that foundation with three additional optimizations targeting the **number of Ollama `/api/generate` calls** — the dominant bottleneck (55-70% of total pipeline time).

## Clarifications

### Session 2026-06-10

- Q: What line threshold should be the default for skipping trivial chunks? → A: 6 lines. Methods/functions with ≤5 lines are skipped. Set `minEnrichmentLines: 1` to disable.
- Q: What should the maximum chunks per dynamic batch be? → A: 20. Quality cap to prevent LLM degradation on large batches.
- Q: Should file extension exclusion be a new field or replace `excludeLanguages`? → A: New field `excludeExtensions` that stacks with (is additive to) existing `excludeLanguages`.
- Q: Should trivial filtering use name-pattern matching (getter/setter heuristics)? → A: No — line count only for V1. Keep it simple and configurable.
- Q: Target hardware? → A: Apple Silicon 16GB with qwen2.5-coder (7b or 14b). Same as spec 009.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Skip trivial methods from enrichment (Priority: P1)

As a developer indexing a Java/TypeScript monorepo, I want short trivial methods (getters, setters, simple delegators) to skip LLM enrichment — so that enrichment calls are reduced by 15-25% without losing meaningful search quality.

**Why this priority**: Short methods (≤5 lines) like `getName()`, `setActive()`, or `return delegate.call()` produce trivial enrichment metadata ("returns the name field") that adds zero search value. Skipping them directly reduces Ollama call count.

**Independent Test**: Index a project with 10+ getter/setter methods (≤5 lines) and 10 business methods (>5 lines). Verify only business methods have `enrichedAt`/`enrichmentModel` fields. Verify short methods still have AST metadata and embeddings.

**Acceptance Scenarios**:

1. **Given** a method chunk with 5 lines (endLine - startLine + 1 = 5), **When** enrichment filtering runs with default `minEnrichmentLines: 6`, **Then** the chunk is skipped from enrichment.
2. **Given** a method chunk with 6 lines, **When** enrichment filtering runs with default `minEnrichmentLines: 6`, **Then** the chunk IS enriched.
3. **Given** a `class-signature` chunk with 3 lines, **When** enrichment filtering runs, **Then** the chunk IS enriched (class-signature is never subject to trivial filtering regardless of line count).
4. **Given** a `class` chunk with 4 lines, **When** enrichment filtering runs, **Then** the chunk IS enriched (only `method` and `function` types are subject to trivial filtering).
5. **Given** `minEnrichmentLines: 1` in config, **When** enrichment filtering runs, **Then** NO chunks are filtered by line count (feature disabled).
6. **Given** `minEnrichmentLines: 10` in config, **When** enrichment filtering runs, **Then** methods/functions with ≤9 lines are filtered.

---

### User Story 2 - Exclude files by extension from enrichment (Priority: P1)

As a developer with a mixed-language monorepo (Java + JavaScript), I want to exclude specific file extensions (e.g., `.js`, `.jsx`) from LLM enrichment — so that I can focus GPU time on the most valuable code without switching off enrichment entirely.

**Why this priority**: The existing `excludeLanguages` filters by internal language identifier which isn't intuitive (users must know that `.js` maps to `'javascript'` internally). Extension-based filtering is more direct and allows finer granularity (e.g., skip `.mjs` but keep `.ts`).

**Independent Test**: Configure `excludeExtensions: [".js", ".jsx"]` and index a project with both TypeScript and JavaScript files. Verify JS/JSX chunks have no `enrichedAt` field but TS chunks do.

**Acceptance Scenarios**:

1. **Given** `excludeExtensions: [".js"]` in enrichment config, **When** enrichment filtering runs on chunks from `app.js`, **Then** those chunks are skipped from enrichment.
2. **Given** `excludeExtensions: [".js"]` in enrichment config, **When** enrichment filtering runs on chunks from `app.ts`, **Then** those chunks ARE enriched.
3. **Given** `excludeExtensions: [".JS"]` (uppercase), **When** enrichment filtering runs on chunks from `app.js`, **Then** those chunks are still skipped (case-insensitive matching).
4. **Given** `excludeExtensions: [".js", ".jsx", ".mjs"]`, **When** enrichment filtering runs, **Then** all three extensions are excluded.
5. **Given** `excludeExtensions` is undefined/not set, **When** enrichment filtering runs, **Then** no extension-based filtering is applied (no default exclusions for extensions).
6. **Given** `excludeExtensions: []` (explicit empty), **When** enrichment filtering runs, **Then** no extension-based filtering is applied.
7. **Given** both `excludeExtensions: [".js"]` AND `excludeLanguages: ["yaml"]`, **When** enrichment filtering runs, **Then** BOTH filters apply (chunks from .js files AND yaml-language chunks are skipped).

---

### User Story 3 - Dynamic batch sizing packs more small chunks per Ollama call (Priority: P1)

As a developer indexing a project with many short methods, I want the enricher to pack as many chunks as fit within the context window budget per Ollama call — so that total call count is reduced by 30-40% without degrading response quality.

**Why this priority**: The current fixed `BATCH_SIZE = 10` is suboptimal. For repositories with small methods (5-20 lines each), 10 chunks consume only 30% of the 16K context window. Dynamic packing fills the budget efficiently, reducing total calls.

**Independent Test**: Create 20 chunks with 50 characters each (trivially small) and verify they batch into fewer calls than the current 2 batches (10+10). Create 5 chunks with 3000 characters each and verify they produce more, smaller batches.

**Acceptance Scenarios**:

1. **Given** 20 chunks with 50 chars each (total ~250 tokens), **When** enrichment batching runs with numCtx=16384, **Then** all 20 chunks fit into a single batch (well within token budget and MAX_BATCH_CHUNKS=20).
2. **Given** 40 small chunks (50 chars each), **When** enrichment batching runs, **Then** they are split into 2 batches of 20 (hitting MAX_BATCH_CHUNKS cap, not token budget).
3. **Given** 5 large chunks (12000 chars each, ~3000 tokens), **When** enrichment batching runs with numCtx=16384 (budget ~8511 tokens), **Then** they produce 2+ batches (3000 tokens x 5 > budget).
4. **Given** a single chunk that exceeds the token budget alone, **When** enrichment batching runs, **Then** it gets its own single-chunk batch (never skipped).
5. **Given** the large-file path is active (class grouping), **When** batches are formed within a class group, **Then** dynamic sizing applies to each group (not just the standard path).
6. **Given** `numCtx: 32768` configured, **When** batching runs, **Then** the token budget is proportionally larger (more chunks per batch).
7. **Given** empty input (0 chunks), **When** batching runs, **Then** zero batches are produced (no crash).

---

### Edge Cases

- What happens when `excludeExtensions` contains an extension without a leading dot (e.g., `"js"` instead of `".js"`)? → System normalizes it — prepends a dot if missing. `"js"` is treated as `".js"`.
- What happens when `minEnrichmentLines` is 0 or negative? → Treated as disabled (same as 1). No chunks filtered.
- What happens when ALL remaining chunks after language/stereotype/extension/trivial filtering are empty? → Enrichment stage completes instantly with 0 batches. All chunks go to embedding without enrichment.
- What happens when dynamic batching produces batches larger than the old BATCH_SIZE=10 — does progress reporting break? → No. Progress reports `batchesTotal` and `batchesCompleted` based on actual batch count, not chunk count.
- What happens when a batch contains a mix of very small and one large chunk? → The large chunk triggers a batch boundary, and the small chunks before it form a dense batch. Greedy packing: each chunk is added until budget is exceeded.
- What happens when `excludeExtensions` overlaps with `excludeLanguages` (e.g., both `.yaml` extension and `"yaml"` language)? → Chunk is filtered by whichever matches first. No duplicate filtering issue — the chunk is only in the `skipped` array once.

## Decisions

### D-001: Line Count Only for Trivial Detection (No Name Pattern Matching)

Name-based heuristics (detecting `getName`/`setName`/`isActive` patterns) were considered and rejected for V1:

- Fragile across naming conventions (Java vs TypeScript vs custom patterns)
- Adds regex complexity with marginal gain over simple line count
- Line count catches 90%+ of getters/setters (they're almost always ≤5 lines)
- Can be added later as an optional enhancement without breaking changes

### D-002: excludeExtensions Has No Default Exclusions

Unlike `excludeLanguages` (which defaults to `["xml", "yaml", "sql", "proto"]`), `excludeExtensions` defaults to `undefined` (no filtering). Rationale:

- Extension filtering is project-specific — some teams want JS enriched, others don't
- The existing `excludeLanguages` default already covers non-code files
- Forcing users to explicitly opt-in for extension filtering avoids surprising behavior

### D-003: Dynamic Batching Constants

| Constant               | Value | Rationale                                                                                                             |
| ---------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| TOKEN_BUDGET_RATIO     | 0.55  | 55% of numCtx for input — conservative to leave room for JSON formatting overhead, system prompt, and response tokens |
| PROMPT_OVERHEAD_TOKENS | 500   | Accounts for the system prompt template in `buildEnrichmentPrompt()`                                                  |
| MAX_BATCH_CHUNKS       | 20    | Quality cap — LLM response quality degrades beyond 20 chunks per structured JSON output                               |
| CHARS_PER_TOKEN        | 4     | Existing approximation, used by the enricher already                                                                  |

Effective budget at `numCtx: 16384` = `16384 * 0.55 - 500` = **8511 tokens** (~34044 chars).

### D-004: Sequential Pipeline Maintained

Per D-002 in spec 009, the pipeline remains sequential (enrich all → embed all). This spec does not change pipeline orchestration — only reduces the work done within the enrichment phase.

### D-005: Explicit `num_predict` Prevents Output Truncation

The Ollama `/api/generate` call MUST set `num_predict` (max output tokens) explicitly, calculated from the batch chunk count:

```
num_predict = chunkCount × OUTPUT_TOKENS_PER_CHUNK (200) + OUTPUT_TOKENS_OVERHEAD (100)
```

**Rationale**: Without explicit `num_predict`, Ollama uses a model-dependent default (often 128-256 tokens for small models). For batches of 20 chunks, the expected JSON output requires ~4000+ tokens. Small models (< 3B params) hit their output limit and produce truncated, invalid JSON. Setting `num_predict` explicitly ensures the model has enough room to complete its structured response regardless of model size.

**Fallback**: If `num_predict` is not computed from batch size (e.g., future call paths), a default of `4096` tokens is used — sufficient for any reasonable batch response.

### D-006: Separate Batch Size Controls for Embedding vs Enrichment

Embedding and enrichment batch sizes are separate configuration fields because they address fundamentally different workloads:

- **Embedding** (`embeddingBatchSize`): Stateless vector math — larger batches are safe and faster. The default of 50 is optimal for most providers. Users may lower this for memory-constrained environments or raise it for cloud APIs.
- **Enrichment** (`maxBatchChunks`): LLM generation — larger batches require more output tokens and risk quality degradation. The default of 20 is a quality ceiling; smaller values (5-10) improve quality for small models (< 7B params).

Both are optional with safe defaults. Existing configurations continue to work without changes.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: `EnrichmentConfig` MUST support a `minEnrichmentLines` field (type: `number`, default: `6`) that sets the minimum line count for a chunk to qualify for enrichment.
- **FR-002**: Chunks with `chunkType` of `method` or `function` AND line count (`endLine - startLine + 1`) less than `minEnrichmentLines` MUST be excluded from enrichment.
- **FR-003**: Chunks with `chunkType` other than `method` or `function` (e.g., `class-signature`, `class`, `interface`, `enum`, `module`) MUST NOT be filtered by `minEnrichmentLines` regardless of their line count.
- **FR-004**: Setting `minEnrichmentLines: 1` MUST disable trivial filtering entirely (all chunks pass regardless of line count).
- **FR-005**: `EnrichmentConfig` MUST support an `excludeExtensions` field (type: `string[]`, default: `undefined`) that lists file extensions to exclude from enrichment.
- **FR-006**: Extension matching MUST be case-insensitive (`.JS` matches `.js`).
- **FR-007**: Extensions without a leading dot MUST be normalized (e.g., `"js"` treated as `".js"`).
- **FR-008**: `excludeExtensions` filtering MUST stack with existing `excludeLanguages` and `excludeStereotypes` filters — all three apply independently.
- **FR-009**: When `excludeExtensions` is undefined or empty, no extension-based filtering MUST be applied.
- **FR-010**: Chunks excluded by any filter MUST still be indexed (parsed, classified, embedded, stored in Qdrant) with full AST metadata — only LLM enrichment is skipped.
- **FR-011**: The enricher MUST replace the fixed `BATCH_SIZE = 10` with dynamic token-budget-based batching that packs chunks until the token budget is reached.
- **FR-012**: No single batch MUST exceed `MAX_BATCH_CHUNKS` (20 chunks) regardless of token budget availability.
- **FR-013**: The token budget per batch MUST be calculated as `numCtx * TOKEN_BUDGET_RATIO - PROMPT_OVERHEAD_TOKENS` where `TOKEN_BUDGET_RATIO = 0.55` and `PROMPT_OVERHEAD_TOKENS = 500`.
- **FR-014**: Token estimation per chunk MUST use `chunk.content.length / CHARS_PER_TOKEN` (where `CHARS_PER_TOKEN = 4`).
- **FR-015**: Dynamic batching MUST apply to both the standard path and the large-file (class-grouped) path.
- **FR-016**: A chunk that exceeds the entire token budget on its own MUST still be sent as a single-chunk batch (never dropped).
- **FR-017**: Progress reporting MUST correctly reflect the dynamically computed `batchesTotal` count.
- **FR-018**: The `filterChunksForEnrichment()` function MUST apply filters in this order: (1) language exclusion, (2) stereotype exclusion, (3) extension exclusion, (4) trivial line-count exclusion. The order ensures all filters compose correctly.
- **FR-019**: The Ollama API call MUST set `num_predict` (max output tokens) to `chunkCount × 200 + 100`, ensuring the model has sufficient output budget to produce complete JSON for the entire batch. Default fallback: `4096` tokens.
- **FR-020**: `IndexingConfig` MUST support an `embeddingBatchSize` field (type: `number`, default: `50`, range: 1-200) that controls how many chunks are sent per embedding API call.
- **FR-021**: `EnrichmentConfig` MUST support a `maxBatchChunks` field (type: `number`, default: `20`, range: 1-50) that caps the maximum chunks per Ollama enrichment call. Dynamic token-budget batching still applies — this field sets a hard ceiling that overrides the dynamic calculation.

### Non-Functional Requirements

- **NFR-001**: Dynamic batching MUST NOT increase memory usage — batch arrays are views/slices of the existing chunk array, not copies.
- **NFR-002**: All new config fields MUST have sensible defaults so that existing configurations continue to work without changes (backward compatible).
- **NFR-003**: Performance improvement MUST be measurable: ≥40% reduction in Ollama enrichment calls for a typical mixed-language monorepo (2000+ chunks).

### Key Entities

- **EnrichmentConfig** (`packages/core/src/types/index.ts`): Extended with `minEnrichmentLines?: number` and `excludeExtensions?: string[]`.
- **ConfigSchema** (`packages/core/src/config/schema.ts`): Zod schema updated with both new fields.
- **filterChunksForEnrichment()** (`packages/indexer/src/pipeline.ts`): Updated to apply extension and trivial filters after existing language/stereotype filters.
- **LlmEnricher.enrich()** (`packages/indexer/src/enrichment/enricher.ts`): Batching logic replaced with `buildDynamicBatches()` function.
- **buildDynamicBatches()** (`packages/indexer/src/enrichment/enricher.ts`): New pure function that implements greedy bin-packing of chunks by token budget.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: For a 2000-chunk Java monorepo with enrichment enabled, total Ollama enrichment calls are reduced by ≥50% compared to the current fixed 10-per-batch approach (from ~140 calls to ≤70 calls).
- **SC-002**: No enrichment quality regression — enriched chunks still receive meaningful descriptions, tags, and relationships when the batch contains ≤20 chunks.
- **SC-003**: Chunks filtered by `excludeExtensions`, `minEnrichmentLines`, `excludeLanguages`, or `excludeStereotypes` are still fully searchable in Qdrant via signature/sparse vectors and AST metadata.
- **SC-004**: All existing tests pass after changes (`pnpm test` exits 0). Updated tests reflect new dynamic batching behavior.
- **SC-005**: Backward compatibility: a project.json with no new fields continues to work identically to the current behavior (with the exception of the new default `minEnrichmentLines: 6`).
- **SC-006**: `minEnrichmentLines: 1` completely disables trivial filtering (opt-out path exists).

### User Story 4 - Reduce output truncation via lean prompt, positional response, and configurable token budgets (Priority: P1)

As a developer using smaller models (gemma4:e2b, qwen2.5-coder:7b) for enrichment, I want the enrichment prompt to be minimal and the LLM to return only the enrichment fields — so that output tokens are used efficiently and responses stop being truncated.

**Why this priority**: Output truncation is the #1 cause of enrichment batch failures with models under 8B parameters. The current prompt wastes tokens on verbose instructions, chunk IDs in both input and output, and redundant delimiters. The model also sometimes wastes output tokens on explanations instead of JSON.

**Independent Test**: Index a 500-chunk project with `gemma4:e2b` (numCtx: 32768, maxBatchChunks: 5). Verify zero parse failures from truncation. Compare token usage before/after.

**Acceptance Scenarios**:

1. **Given** a batch of 10 chunks, **When** the LLM returns a JSON array of 10 enrichment objects (no IDs), **Then** the code maps `response[i]` to `batch[i]` positionally and appends enrichment fields.
2. **Given** a batch of 10 chunks, **When** the LLM returns only 7 objects (truncation), **Then** the first 7 chunks are enriched, remaining 3 go unenriched, and a warning is emitted.
3. **Given** `format: 'json'` in the Ollama request, **When** the model generates output, **Then** it produces only valid JSON (no markdown, no explanations).
4. **Given** `charsPerToken: 2.5` in config, **When** dynamic batching runs, **Then** batch sizes are smaller (more conservative token estimation).
5. **Given** `tokenBudgetRatio: 0.35` in config, **When** dynamic batching runs, **Then** less input budget is allocated, leaving more headroom for output.
6. **Given** `outputTokensPerChunk: 400` in config, **When** `num_predict` is computed, **Then** it equals `batchSize × 400 + 100`.
7. **Given** default config (no overrides), **When** enrichment runs, **Then** `charsPerToken=3`, `tokenBudgetRatio=0.45`, `outputTokensPerChunk=300` are used.
8. **Given** concurrent batch processing (p-queue), **When** batches complete in arbitrary order, **Then** positional mapping correctly updates each chunk at its global index (no race conditions, no overwrites).

---

### Edge Cases (User Story 4)

- What happens when the LLM returns an empty array `[]`? → All chunks in the batch go unenriched; warning emitted.
- What happens when the LLM returns more objects than chunks in the batch? → Extra objects are ignored.
- What happens when `charsPerToken` is set to a very low value (e.g., 1)? → Batches become very small (1-2 chunks each); more Ollama calls but guaranteed no truncation.
- What happens when `tokenBudgetRatio` is set to 0.2? → Only 20% of numCtx for input; very small batches but maximum output headroom.
- What happens when a model doesn't support `format: 'json'`? → Ollama ignores unsupported parameters; falls back to normal generation. The existing `parseEnrichmentResponse()` strips markdown fences as safety net.

---

### Decisions (User Story 4)

### D-007: Positional Array Output (Replace ID-Based Mapping)

The LLM response format changes from `{"chunks": [{"id": "...", ...}]}` to a flat array `[{...}, {...}]` where position maps to input chunk order. The calling code appends enrichment fields to the corresponding chunk.

**Rationale**:

- Saves ~15-20 output tokens per chunk (no UUID repetition)
- Eliminates the silent failure of model misspelling IDs
- Simpler output structure = less likely to produce malformed JSON
- Length mismatch is explicitly detectable (vs. silent ID misses)
- Safe with concurrent batch processing (batches are non-overlapping partitions)

### D-008: Lean Prompt (Minimize Instruction Overhead)

The enrichment prompt is reduced from ~180 tokens overhead to ~60 tokens:

- One-line instruction + compact JSON schema example (single line)
- Short chunk delimiters: `--- N: name (type) ---` instead of `=== CHUNK id="..." name="..." type="..." === / === END CHUNK ===`
- No end markers (next delimiter or end-of-prompt is sufficient)
- Remove chunk IDs from input (not needed with positional output)
- Remove "Respond with JSON only" footer (redundant with `format: 'json'`)

### D-009: Configurable Token Budget Parameters

Three new `EnrichmentConfig` fields expose the token budget constants:

| Field                  | Type     | Default  | Range   | Purpose                             |
| ---------------------- | -------- | -------- | ------- | ----------------------------------- | ----------------------- |
| `charsPerToken`        | `number` | `3`      | 1-10    | Model tokenizer efficiency estimate |
| `tokenBudgetRatio`     | `number` | `0.45`   | 0.2-0.7 | Fraction of numCtx for input        |
| `outputTokensPerChunk` | `number` | `number` | `300`   | 50-1000                             | Output budget per chunk |

**Rationale**: Different models have different tokenizer efficiencies and output verbosity. Making these configurable lets users tune per-model without code changes. Defaults are conservative (safe for most models ≥2B params).

### D-010: Force JSON Output Mode

The Ollama API request includes `format: 'json'` which constrains the model to produce only valid JSON tokens. This prevents models from wasting output tokens on explanations, markdown fences, or preamble text.

**Fallback**: If a model/version doesn't support this parameter, Ollama ignores it gracefully. The existing `parseEnrichmentResponse()` still strips markdown fences as a safety net.

---

## Requirements (User Story 4)

- **FR-022**: The enrichment prompt MUST NOT include chunk IDs. Chunks are delimited by short positional markers (`--- N: name (type) ---`).
- **FR-023**: The LLM response format MUST be a flat JSON array `[{description, businessContext, semanticTags, relationships}, ...]` where array position corresponds to input chunk position.
- **FR-024**: The calling code MUST map enrichment fields to chunks by array position: `response[i]` → `batch[i]`.
- **FR-025**: When `response.length < batch.length`, the first `response.length` chunks are enriched; remaining chunks go unenriched. A warning MUST be emitted via progress callback.
- **FR-026**: When `response.length > batch.length`, extra response objects MUST be ignored.
- **FR-027**: The Ollama API request MUST include `format: 'json'` to constrain output to valid JSON.
- **FR-028**: `EnrichmentConfig` MUST support a `charsPerToken` field (type: `number`, default: `3`, range: 1-10) controlling the character-to-token ratio used in batch building.
- **FR-029**: `EnrichmentConfig` MUST support a `tokenBudgetRatio` field (type: `number`, default: `0.45`, range: 0.2-0.7) controlling the fraction of numCtx allocated to input tokens.
- **FR-030**: `EnrichmentConfig` MUST support an `outputTokensPerChunk` field (type: `number`, default: `300`, range: 50-1000) controlling the per-chunk output token budget in `num_predict` calculation.
- **FR-031**: The enrichment prompt instruction overhead MUST be ≤80 tokens (excluding chunk content).
- **FR-032**: Concurrent batch processing (p-queue) MUST remain functional. Positional mapping is safe because batches are non-overlapping partitions — each batch writes to distinct indices in the result array.
- **FR-033**: The default `numCtx` MUST be updated to `32768` in the `LlmEnricher` constructor (aligning with the type documentation).

## Assumptions

- The `endLine` and `startLine` fields on `CodeChunk` are reliably set by the AST parser for all chunk types (verified: set in java.ts, typescript.ts for all declarations).
- The `filePath` field on `CodeChunk` always includes the file extension (verified: set from the absolute path passed to `parseFile()`).
- Token estimation at `chars / 4` is sufficiently accurate for batch sizing — over-estimation leads to smaller batches (safe, slightly suboptimal) while under-estimation could exceed context window (mitigated by the 0.55 ratio leaving 45% headroom for response).
- qwen2.5-coder (7b and 14b) reliably produces valid structured JSON output for batches of up to 20 chunks within a 16384-token context window.
- Models smaller than 3B parameters (e.g., `qwen2.5-coder:0.5b`) are NOT recommended for enrichment — they produce repetitive, low-quality metadata and are prone to JSON truncation even with explicit `num_predict`. The schema default of `qwen3:8b` is the minimum recommended size.
- Enrichment quality for trivial methods (≤5 lines) is negligible — "returns the name field" or "delegates to service" adds no retrieval signal beyond what AST metadata already provides.
- The `extname()` function from `node:path` correctly extracts extensions including the leading dot for all supported file types.
