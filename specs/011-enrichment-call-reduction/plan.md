# Implementation Plan: Enrichment Call Reduction

**Branch**: `011-enrichment-call-reduction` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-enrichment-call-reduction/spec.md`

## Summary

Reduce Ollama enrichment calls by ≥50% through three complementary optimizations: (1) skip trivial methods/functions with ≤5 lines from enrichment, (2) exclude files by extension from enrichment, and (3) replace fixed 10-chunk batching with dynamic token-budget packing (up to 20 chunks). All changes target the enrichment phase only — filtered chunks still receive full AST metadata and embeddings.

## Technical Context

**Language/Version**: TypeScript strict mode, Node.js ≥22.0.0

**Primary Dependencies**: Zod 4 (validation), p-queue (concurrency), Vitest (testing), tsup (build)

**Storage**: Qdrant (vector DB via Docker), better-sqlite3 (metrics)

**Testing**: Vitest with co-located test files (`*.test.ts`)

**Target Platform**: macOS (Apple Silicon 16GB), local-first with Ollama

**Project Type**: Monorepo library/framework (pnpm workspace + Turborepo)

**Performance Goals**: ≥50% reduction in Ollama enrichment calls for 2000-chunk repos; maintain batch quality with ≤20 chunks per call

**Constraints**: 16GB RAM budget, Ollama context window 16384-32768 tokens, no external service dependencies

**Scale/Scope**: Repositories with 500-5000 code chunks, mixed Java/TypeScript/JavaScript

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                                                         |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| I. TDD                     | PASS   | Tests written first for all three features (trivial filter, extension filter, dynamic batching)               |
| II. TypeScript-Only        | PASS   | All changes in TypeScript with strict mode                                                                    |
| III. Local-First           | PASS   | Optimizes local Ollama calls, no external dependencies added                                                  |
| IV. Monorepo Architecture  | PASS   | Changes span core (types/schema) and indexer (pipeline/enricher) — proper dependency direction                |
| V. Simplicity              | PASS   | Line-count threshold (no regex heuristics), greedy bin-packing (no complex optimization), no new abstractions |
| VI. Incremental by Default | PASS   | No change to incremental detection — only reduces work within enrichment phase                                |
| VII. MCP-First Interface   | N/A    | No new MCP tools needed                                                                                       |

**Gate Result**: ALL PASS — proceed to implementation.

## Project Structure

### Documentation (this feature)

```text
specs/011-enrichment-call-reduction/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (type changes)
├── quickstart.md        # Phase 1 output (usage guide)
├── contracts/           # Phase 1 output (config contract)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── core/
│   └── src/
│       ├── types/index.ts           # EnrichmentConfig type (add fields)
│       └── config/schema.ts         # Zod schema (add validations)
├── indexer/
│   └── src/
│       ├── pipeline.ts              # filterChunksForEnrichment() (extend)
│       ├── enrichment/
│       │   ├── enricher.ts          # LlmEnricher.enrich() + buildDynamicBatches()
│       │   └── enricher.test.ts     # Existing tests (update for dynamic batching)
│       └── __tests__/
│           ├── pipeline-filtering.test.ts  # Extension + trivial filter tests
│           └── enricher.test.ts            # Sub-batching tests (update)
```

**Structure Decision**: Monorepo with changes in `packages/core` (types/config) and `packages/indexer` (pipeline/enricher). No new packages or files beyond test updates.

## Complexity Tracking

No constitution violations. All changes follow existing patterns:

- Config extension follows existing `excludeLanguages`/`excludeStereotypes` pattern
- Filter function extension follows existing filter chain
- Dynamic batching replaces a constant with a pure function (simpler reasoning)

## Implementation Approach

### Change 1: Type & Schema Extension (packages/core)

**File**: `packages/core/src/types/index.ts` (lines 296-315)

- Add `minEnrichmentLines?: number` to `EnrichmentConfig`
- Add `excludeExtensions?: string[]` to `EnrichmentConfig`

**File**: `packages/core/src/config/schema.ts` (lines 35-47)

- Add `minEnrichmentLines: z.number().int().min(1).optional()` to enrichment schema
- Add `excludeExtensions: z.array(z.string().min(1)).optional()` to enrichment schema

### Change 2: Filter Extension (packages/indexer)

**File**: `packages/indexer/src/pipeline.ts` (lines 50-77)

- Add extension exclusion filter (step 3 in chain): extract file extension via `path.extname()`, compare case-insensitively against normalized `excludeExtensions`
- Add trivial line-count filter (step 4 in chain): for `method`/`function` chunks, check `endLine - startLine + 1 < minEnrichmentLines`
- Normalize extensions (prepend dot if missing, lowercase)

### Change 3: Dynamic Batching (packages/indexer)

**File**: `packages/indexer/src/enrichment/enricher.ts` (lines 92-158)

- Extract `buildDynamicBatches()` as a pure exported function
- Replace `BATCH_SIZE = 10` loops with `buildDynamicBatches(chunks, numCtx)` calls
- Apply to both standard path and large-file (class-grouped) path
- Constants: `TOKEN_BUDGET_RATIO = 0.55`, `PROMPT_OVERHEAD_TOKENS = 500`, `MAX_BATCH_CHUNKS = 20`, `CHARS_PER_TOKEN = 4`
- Greedy packing: iterate chunks, accumulate token estimate, start new batch when budget exceeded or MAX_BATCH_CHUNKS reached
- Single oversized chunk gets its own batch (never dropped)

### Change 4: Test Updates (packages/indexer)

- `packages/indexer/src/__tests__/pipeline-filtering.test.ts`: Add test suites for extension exclusion and trivial filtering
- `packages/indexer/src/enrichment/__tests__/enricher.test.ts`: Update sub-batching tests (BATCH_SIZE=10 → dynamic)
- `packages/indexer/src/enrichment/enricher.test.ts`: Update T015/T083 expectations for dynamic batch counts

### Change 5: Lean Prompt & Positional Array Output (FR-022 – FR-027, FR-031 – FR-032)

**Problem**: The enrichment prompt wastes ~120 tokens on verbose instructions, repeats chunk IDs
in both input and output (~15-20 tokens per chunk), and uses heavy delimiters. On small models
(≤3B params), this leaves insufficient room for complete JSON output, causing truncation.

**Root Cause**: The prompt was designed for larger models where token efficiency didn't matter.
With dynamic batching packing 5-20 chunks, every wasted token multiplies across the batch.

#### Part A: Positional Array Output

**Files**:

- `packages/indexer/src/enrichment/prompt.ts` — Change response format from `{"chunks": [{"id":..., ...}]}` to flat array `[{description, businessContext, semanticTags, relationships}, ...]`
- `packages/indexer/src/enrichment/enricher.ts` — Replace ID-based mapping with positional mapping: `response[i]` → `batch[i]`. Pre-build `indexMap` (chunk.id → global index) for concurrent-safe writes.

**Response format change**:

```json
// Before:
{"chunks": [{"id": "uuid...", "description": "...", "businessContext": "...", "semanticTags": [...], "relationships": [...]}]}

// After:
[{"description": "...", "businessContext": "...", "semanticTags": [...], "relationships": [...]}]
```

**Concurrency safety**: Batches are non-overlapping partitions of the input array. Each batch writes
to distinct indices in `result[]`. JavaScript is single-threaded so array index writes are atomic.
p-queue concurrency remains functional without changes.

#### Part B: Lean Prompt

**File**: `packages/indexer/src/enrichment/prompt.ts`

**Before** (~180 tokens overhead):

```
You are a code analysis assistant. Analyze the following ${language} chunks...
For each chunk, provide:
- description: one concise sentence...
- businessContext: the business domain...
- semanticTags: 3-7 lowercase keywords...
- relationships: list of dependencies...

Return ONLY valid JSON matching this structure:
{ "chunks": [ { "id": "...", ... } ] }

=== CHUNK id="uuid" name="processPayment" type="method" ===
...content...
=== END CHUNK id="uuid" ===

Respond with JSON only. No markdown, no explanation.
```

**After** (~60 tokens overhead):

```
Enrich these ${language} chunks from "${filePath}". Return JSON array, one object per chunk in order.
Format: [{"description":"<1 sentence>","businessContext":"<domain>","semanticTags":["<3-7 lowercase>"],"relationships":[{"target":"<file>","type":"uses|implements|extends|configures|produces|consumes|tests"}]}]

--- 1: processPayment (method) ---
@Transactional | imports: PaymentService, RetryTemplate
...content...

--- 2: validateAccount (method) ---
...content...
```

**Savings per 10-chunk batch**: ~600 input tokens + ~200 output tokens = ~800 tokens total.

#### Part C: Add `format: 'json'` to Ollama Request

**File**: `packages/indexer/src/enrichment/enricher.ts`

**Change**: Replace the full JSON Schema object in the `format` field with the simpler `format: 'json'` string.

The implementation had diverged from D-010 — it was sending a grammar-constrained structured output schema (`format: { type: 'array', items: {...} }`), which is an Ollama ≥0.5 feature that is more fragile than plain JSON mode. Specifically, `type: 'array'` at the top level is unreliable across Ollama versions: some wrap the result in an object, others stop mid-array on context overflow without error. Switching to `format: 'json'` is broadly compatible and allows `parseEnrichmentResponse()` to handle any structural variation via its existing flat-array / legacy-object / single-object fallbacks.

### Change 6: Configurable Token Budget Parameters (FR-028 – FR-030, FR-033)

**Problem**: The hardcoded token budget constants (`CHARS_PER_TOKEN=4`, `TOKEN_BUDGET_RATIO=0.55`,
`OUTPUT_TOKENS_PER_CHUNK=200`) are suboptimal for models with different tokenizers or output
verbosity. Users need per-project tuning without code changes.

**Files**:

- `packages/core/src/types/index.ts` — Add `charsPerToken?: number`, `tokenBudgetRatio?: number`, `outputTokensPerChunk?: number` to `EnrichmentConfig`
- `packages/core/src/config/schema.ts` — Add Zod validations for the 3 new fields
- `packages/indexer/src/enrichment/enricher.ts` — Read from config in constructor, pass to `buildDynamicBatches()` and `enrichBatch()`; update defaults: `CHARS_PER_TOKEN: 4→3`, `TOKEN_BUDGET_RATIO: 0.55→0.45`, `OUTPUT_TOKENS_PER_CHUNK: 200→300`, `numCtx: 16384→32768`

**New config fields in project.json**:

```jsonc
{
  "indexing": {
    "enrichment": {
      "model": "gemma4:e2b",
      "numCtx": 32768,
      "maxBatchChunks": 5,
      "charsPerToken": 2.5,
      "tokenBudgetRatio": 0.35,
      "outputTokensPerChunk": 400,
    },
  },
}
```

**Updated defaults** (conservative, safe for models ≥2B):

| Constant                          | Old   | New   | Rationale                                           |
| --------------------------------- | ----- | ----- | --------------------------------------------------- |
| `DEFAULT_CHARS_PER_TOKEN`         | 4     | 3     | Most tokenizers average 2.5-3.5 for code            |
| `DEFAULT_TOKEN_BUDGET_RATIO`      | 0.55  | 0.45  | Leaves 55% for output headroom                      |
| `DEFAULT_OUTPUT_TOKENS_PER_CHUNK` | 200   | 300   | Safety margin for verbose models                    |
| `numCtx` (constructor default)    | 16384 | 32768 | Matches type documentation; most models support 32k |

**`buildDynamicBatches()` signature update**:

```typescript
export function buildDynamicBatches(
  chunks: CodeChunk[],
  numCtx: number,
  maxChunks: number = MAX_BATCH_CHUNKS,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
  tokenBudgetRatio: number = DEFAULT_TOKEN_BUDGET_RATIO,
): CodeChunk[][];
```

### Change 7: Enrichment Error Visibility Fix (cross-cutting)

**Problem**: When Ollama enrichment fails (batch skipped), the error was (a) garbled in the CLI because
`console.warn` output got overwritten by the progress bar's `\r\x1b[2K` escape, and (b) the parse-failure
case at `enricher.ts:278` didn't include the raw Ollama response body, making debugging impossible.

**Root Cause**: Two output channels (progress bar on stdout, warnings on stderr) competed on the same TTY
without coordination. Additionally, spec 010's FR-004 (include raw response on parse failure) was incomplete.

#### Fix A: Route warnings through progress callback

**Files**:

- `packages/indexer/src/enrichment/enricher.ts` — Add `warning?: string` to `EnrichmentProgress`, pass error through callback instead of `console.warn`
- `packages/indexer/src/pipeline.ts` — Add `warning?: string` to `IndexingProgress`, propagate from enricher callback
- `packages/cli/src/commands/index.command.ts` — When `progress.warning` is set, clear progress line, print warning on its own line (yellow with batch context), then re-render progress. Show failure counter `(N failed)` in progress bar.

**Rationale**: The CLI now controls all rendering — it properly clears the progress line before printing warnings,
ensuring they appear cleanly above the progress bar without garbling.

#### Fix B: Include raw response in parse-failure errors

**File**: `packages/indexer/src/enrichment/enricher.ts`

**Change**: Replace bare `throw new Error('Failed to parse Ollama response for batch at ${filePath}')` with
`formatOllamaError({ body: rawResponse, model, baseUrl, phase: 'enrichment', parseFailure: true })` so that
when Ollama returns 200 OK but the response can't be parsed, the raw response text is included in the error
message (fulfilling spec 010 FR-004).

### Change 8: Explicit `num_predict` Output Token Budget (FR-019)

**Problem**: When Ollama returns 200 OK but the JSON response is truncated/incomplete, the parse fails. This
occurs because no `num_predict` (max output tokens) is sent in the API request, leaving the output limit to
a model-dependent default. Small models (< 3B params) default to very low output limits (128-256 tokens),
which is insufficient for 20-chunk batch JSON responses (~4000+ tokens).

**Root Cause**: The `callOllama()` method at `enricher.ts:323` only set `num_ctx` and `temperature` in the
`options` object. The model was free to truncate output at its default limit.

**File**: `packages/indexer/src/enrichment/enricher.ts`

**Changes**:

1. Add constants `OUTPUT_TOKENS_PER_CHUNK = 200` and `OUTPUT_TOKENS_OVERHEAD = 100`
2. Compute `numPredict = chunkCount × 200 + 100` in `enrichBatch()` based on actual batch size
3. Pass `num_predict: numPredict` in the Ollama API options alongside `num_ctx` and `temperature`
4. `callOllama()` signature extended with optional `numPredict?: number` parameter (default: 4096)

**Rationale**: Explicit output budget ensures the model generates complete JSON regardless of model size.
The formula scales with batch size — 1 chunk gets 300 tokens, 20 chunks get 4100 tokens.

#### Test Updates

- `packages/indexer/src/__tests__/enricher-errors.test.ts` — Update "logs full error details" test to check
  `warning` field on progress callback (instead of `console.warn` spy)
- `packages/indexer/src/enrichment/enricher.test.ts` — Update "logs a warning mentioning Ollama" test to check
  `warning` field on progress callback; add `warning?: string` to local `EnrichmentProgress` interface

### Change 9: Configurable Batch Sizes (FR-020, FR-021)

**Problem**: Batch sizes for both embedding and enrichment are hardcoded (50 and 20 respectively). Users with
smaller models or memory-constrained environments need to tune these values without code changes.

#### Part A: `embeddingBatchSize` in `IndexingConfig`

**Files**:

- `packages/core/src/types/index.ts` — Add `embeddingBatchSize?: number` to `IndexingConfig`
- `packages/core/src/config/schema.ts` — Add `embeddingBatchSize: z.number().int().min(1).max(200).optional()` to `IndexingConfigSchema`
- `packages/indexer/src/pipeline.ts` — Read `embeddingBatchSize` from resolved project config (field already exists internally at line 148; wiring needed from config loader)

**Behavior**: Controls how many chunks are sent per embedding API call. Default: 50. Lower values reduce
memory pressure; higher values improve throughput for cloud APIs.

#### Part B: `maxBatchChunks` in `EnrichmentConfig`

**Files**:

- `packages/core/src/types/index.ts` — Add `maxBatchChunks?: number` to `EnrichmentConfig`
- `packages/core/src/config/schema.ts` — Add `maxBatchChunks: z.number().int().min(1).max(50).optional()` to enrichment schema
- `packages/indexer/src/enrichment/enricher.ts` — Read `config.maxBatchChunks ?? 20` in constructor, pass to `buildDynamicBatches()` instead of using the hardcoded `MAX_BATCH_CHUNKS` constant

**Behavior**: Caps the maximum chunks per Ollama enrichment call. Dynamic token-budget batching still
applies — this is a hard ceiling. For small models (2-3B), setting this to 5-10 improves response quality.
The `MAX_BATCH_CHUNKS` constant becomes the schema default (20) rather than an absolute limit.

#### Test Updates

- `packages/indexer/src/enrichment/enricher.test.ts` — Add tests for `maxBatchChunks` config override
- `packages/indexer/src/__tests__/pipeline-filtering.test.ts` — Verify `embeddingBatchSize` is read from config
