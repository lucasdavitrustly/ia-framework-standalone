# Research: Enrichment Call Reduction

**Date**: 2026-06-10 | **Feature**: 011-enrichment-call-reduction

## Research Summary

All technical unknowns from the specification were resolved through codebase exploration. No external research needed — the feature builds directly on existing patterns.

---

## Finding 1: Current Enrichment Batching Implementation

**Decision**: Replace fixed `BATCH_SIZE = 10` with `buildDynamicBatches()` pure function

**Source**: `packages/indexer/src/enrichment/enricher.ts:92-158`

**Current State**:

- `BATCH_SIZE = 10` is a local constant inside `enrich()` method (line 98)
- `CHARS_PER_TOKEN = 4` already exists (line 99) — reuse in dynamic batching
- `LARGE_FILE_THRESHOLD = 0.7` determines class-grouping path (line 100)
- Both standard and large-file paths use `group.slice(i, i + BATCH_SIZE)` loops
- `batchGroups: CodeChunk[][]` array is pre-computed before processing (lines 108-120)

**Change Strategy**: Replace the `for (let i = 0; i < ...; i += BATCH_SIZE)` loops with calls to `buildDynamicBatches(chunks, numCtx)`. The function returns `CodeChunk[][]` (same type as current `batchGroups`), so downstream code (concurrency, progress, apply) remains unchanged.

**Rationale**: Pure function is independently testable. Same return type ensures minimal integration risk.

**Alternatives Considered**:

- Inline logic in enrich(): Rejected — harder to unit test, duplicated in both paths
- Class method: Acceptable but exported function enables direct import in tests without instantiating LlmEnricher

---

## Finding 2: Filter Chain Extension Points

**Decision**: Extend `filterChunksForEnrichment()` with two additional filter steps

**Source**: `packages/indexer/src/pipeline.ts:50-77`

**Current State**:

- Function accepts `chunks: CodeChunk[]` and `config: EnrichmentConfig`
- Returns `{ enrichable: CodeChunk[]; skipped: CodeChunk[] }`
- Currently applies: language exclusion OR stereotype exclusion (single loop)
- Early return if both sets are empty (optimization)
- Default exclusions: `['xml', 'yaml', 'sql', 'proto']` (languages), `['test', 'dto', 'config-block', 'migration']` (stereotypes)

**Change Strategy**: Add extension filter and trivial filter as sequential steps after the existing language/stereotype loop. Order: (1) language, (2) stereotype, (3) extension, (4) trivial. The existing single loop handles (1) and (2) together; add (3) and (4) as post-filters on the `enrichable` array.

**Rationale**: Post-filtering the enrichable array is simpler than adding more conditions to the existing loop. The order ensures a chunk excluded by language never reaches the extension check (correct behavior, slightly more efficient).

---

## Finding 3: CodeChunk Type Fields Available

**Decision**: No type changes needed for CodeChunk — all required fields exist

**Source**: `packages/ast-parser/src/types.ts:5-125`

**Verified Fields**:

- `filePath: string` — absolute path, always includes extension
- `chunkType` — union type includes `'method'` and `'function'` (the two types subject to trivial filtering)
- `startLine: number` — 1-indexed
- `endLine: number` — 1-indexed
- `content: string` — raw source text (for token estimation)
- `language: string` — programming language identifier

**Line Count Calculation**: `endLine - startLine + 1` gives actual line count (both boundaries inclusive).

---

## Finding 4: Extension Extraction

**Decision**: Use `path.extname()` from Node.js `node:path` module

**Source**: Node.js standard library

**Behavior**: `path.extname('/foo/bar.ts')` returns `'.ts'` (with leading dot). For files without extension, returns `''`. Already used elsewhere in the codebase.

**Normalization**: User config may provide `"js"` (no dot) or `".js"` (with dot). Normalize by prepending `.` if the first character is not `.`.

---

## Finding 5: Token Budget Calculation Validation

**Decision**: Use constants `TOKEN_BUDGET_RATIO = 0.55`, `PROMPT_OVERHEAD_TOKENS = 500`

**Analysis**:

- The prompt template in `packages/indexer/src/enrichment/prompt.ts:110-168` is ~400 characters of fixed text (~100 tokens)
- Each chunk adds header lines (~120 chars / ~30 tokens) plus content
- With 20 chunks at 30 tokens overhead each = 600 tokens of formatting overhead
- Total overhead: ~100 (system) + ~600 (chunk headers) = ~700 tokens
- Budget ratio 0.55 at 16384 numCtx = 9011 tokens for input
- Subtract 500 prompt overhead = 8511 tokens available for chunk content
- Remaining 45% (7373 tokens) for response: 20 chunks × ~4 fields × ~20 tokens = ~1600 tokens (well within budget)
- Safety margin is adequate

**Alternatives Considered**:

- Exact token counting (e.g., tiktoken): Rejected — adds dependency, negligible precision gain for batch sizing
- Lower ratio (0.4): Too conservative, limits batch efficiency
- Higher ratio (0.7): Risks context overflow on larger batches with long output

---

## Finding 6: Existing Test Patterns

**Decision**: Follow existing test structure — co-located test files with `describe/it` blocks, mock `fetch` for Ollama calls

**Source**:

- `packages/indexer/src/enrichment/enricher.test.ts` (797 lines)
- `packages/indexer/src/__tests__/pipeline-filtering.test.ts` (306 lines)
- `packages/indexer/src/enrichment/__tests__/enricher.test.ts` (214 lines)

**Pattern**:

- Tests mock `global.fetch` to intercept Ollama API calls
- `CodeChunk` fixtures are created inline with minimal required fields
- Test IDs follow the format T### (e.g., T006, T015, T037)
- Describe blocks use User Story references (e.g., "US1: Language Exclusion")

**New Tests**:

- Extension filter tests → `packages/indexer/src/__tests__/pipeline-filtering.test.ts` (extend existing file)
- Trivial filter tests → same file
- Dynamic batching tests → `packages/indexer/src/enrichment/__tests__/enricher.test.ts` (extend existing file)

---

## Finding 7: Output Truncation with Small Models (num_predict)

**Decision**: Always set explicit `num_predict` in Ollama API options

**Source**: Production observation — `qwen2.5-coder:0.5b` returning truncated JSON for 20-chunk batches

**Problem**:

- The Ollama `/api/generate` call did not specify `num_predict` (max output tokens)
- Without this, Ollama uses a model-dependent default (often 128-256 tokens for small models)
- For 20-chunk batches, the expected JSON output is ~4000+ tokens
- Small models hit their output limit and produce truncated, unparseable JSON
- The `parseEnrichmentResponse()` function returns `null`, triggering retries then skip

**Root Cause Analysis**:

- `callOllama()` method only set `num_ctx` and `temperature` in the options object
- No output budget was communicated to the model
- The 0.55 token budget ratio accounts for INPUT fitting the context, but not OUTPUT completion

**Solution**:

- Compute `numPredict = batchChunkCount × 200 + 100` in `enrichBatch()` based on actual batch size
- Pass `num_predict` to Ollama alongside existing options
- Fallback default of 4096 tokens for any uncomputed calls
- Formula: 200 tokens per chunk (JSON with all 4 fields) + 100 tokens wrapper overhead

**Validation**: Tested against 20-chunk batch → `20 × 200 + 100 = 4100` tokens (well within typical model limits for 7B+ models)

---

## Finding 8: Model Size Requirements for Enrichment

**Decision**: Document minimum model recommendations; recommend ≥ 7B params

**Source**: Production observation — `qwen2.5-coder:0.5b` producing repetitive/identical metadata for all chunks

**Analysis**:

| Model Size | JSON Quality | Differentiation                                 | Batch Reliability                |
| ---------- | ------------ | ----------------------------------------------- | -------------------------------- |
| 0.5B       | Fails        | No differentiation — same output for all chunks | Truncates at 5+ chunks           |
| 2-3B       | Acceptable   | Some differentiation on small batches (5-8)     | Works with low `maxBatchChunks`  |
| 7-8B       | Good         | Full differentiation across 20 chunks           | Reliable at `maxBatchChunks: 20` |
| 14B+       | Excellent    | Detailed, contextual descriptions               | Reliable at `maxBatchChunks: 20` |

**Recommendation**: Default model `qwen3:8b` is the minimum for production-quality enrichment. For memory-constrained environments (< 8GB VRAM), `qwen2.5-coder:3b` or `gemma4:e2b` with `maxBatchChunks: 8` is the minimum viable setup.

---

## Finding 9: Grammar-Constrained `format` vs Plain `format: 'json'`

**Decision**: Use `format: 'json'` (plain string), not the structured output JSON Schema

**Source**: Implementation divergence found during Phase 8 review — `callOllama()` was sending a full JSON Schema object

**Problem**:

The code had implemented `format: { type: 'array', items: { type: 'object', properties: {...} } }` — Ollama's structured output (grammar-constrained generation), introduced in v0.5. This differs from D-010, which specifies `format: 'json'`.

| Approach | Compatibility | Failure mode |
|---|---|---|
| `format: { type: 'array', ... }` | Ollama ≥ 0.5 only | Stops mid-array on context overflow, wrapping varies by version |
| `format: 'json'` | All Ollama versions | Falls back to best-effort JSON; `parseEnrichmentResponse()` handles structural variants |

The structured output schema fails silently on context overflow: the model stops generating mid-array, producing truncated invalid JSON with a 200 OK status. This is the dominant cause of parse failures in production.

**Resolution**: Replaced the schema object with `format: 'json'`. The existing `parseEnrichmentResponse()` already handles flat arrays, legacy `{chunks: [...]}` objects, and single-object fallbacks, so no response-parsing changes were needed.

---

## Finding 10: Batch Size Configurability Need

**Decision**: Expose both `embeddingBatchSize` and `maxBatchChunks` in `project.json`

**Source**: User need — different models require different batch sizes for optimal quality/performance

**Analysis**:

- **Embedding** (`embeddingBatchSize`): Already supported internally in pipeline at line 148 (default: 50). Was NOT exposed in the project config schema. Embedding is stateless vector math — batch size affects memory and throughput only, not quality.
- **Enrichment** (`maxBatchChunks`): Was hardcoded as `MAX_BATCH_CHUNKS = 20` constant. Dynamic batching already respects token budget, but the hard cap was not configurable. Small models need smaller batches for quality.

**Rationale for separate fields** (D-006):

- Embedding and enrichment are fundamentally different workloads
- Embedding tolerance: 1-200 chunks per call (no quality impact)
- Enrichment tolerance: 1-50 chunks per call (direct quality impact for smaller models)
- Users tune them independently based on model size, RAM, and quality needs
