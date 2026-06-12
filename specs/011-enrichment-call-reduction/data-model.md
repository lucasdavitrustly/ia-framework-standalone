# Data Model: Enrichment Call Reduction

**Date**: 2026-06-10 | **Feature**: 011-enrichment-call-reduction

## Overview

This feature extends existing types and schemas — no new entities are introduced. The changes add two optional fields to `EnrichmentConfig` and introduce a new pure function for batch computation.

---

## Type Changes

### EnrichmentConfig (Extended)

**File**: `packages/core/src/types/index.ts`

| Field                | Type                    | Default     | Description                                                                                                                 |
| -------------------- | ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `minEnrichmentLines` | `number \| undefined`   | `6`         | Minimum line count (endLine - startLine + 1) for method/function chunks to qualify for LLM enrichment. Set to 1 to disable. |
| `excludeExtensions`  | `string[] \| undefined` | `undefined` | File extensions to exclude from enrichment (e.g., `[".js", ".jsx"]`). Case-insensitive. Dot-normalized.                     |
| `maxBatchChunks`     | `number \| undefined`   | `20`        | Maximum chunks per Ollama enrichment call (range: 1-50). Caps the dynamic token-budget batcher.                             |

**Existing fields unchanged**: `provider`, `model`, `baseUrl`, `numCtx`, `concurrency`, `retryAttempts`, `skipOnFailure`, `excludeLanguages`, `excludeStereotypes`.

### IndexingConfig (Extended)

**File**: `packages/core/src/types/index.ts`

| Field                | Type                  | Default | Description                                                                                                     |
| -------------------- | --------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `embeddingBatchSize` | `number \| undefined` | `50`    | Chunks per embedding API call (range: 1-200). Each batch makes 2 parallel HTTP requests (semantic + signature). |

**Existing fields unchanged**: `includePatterns`, `excludePatterns`, `maxChunkLines`, `respectGitignore`, `embeddingConcurrency`, `llm`, `enrichment`.

### CodeChunk (No Changes)

All required fields already exist:

- `chunkType`: includes `'method'` | `'function'` (trivial filter targets)
- `startLine`, `endLine`: 1-indexed line boundaries
- `filePath`: absolute path with extension
- `content`: raw source for token estimation
- `language`: language identifier (existing filter)
- `stereotype`: heuristic stereotype (existing filter)

---

## Schema Changes

### Zod Schema (IndexingConfigSchema)

**File**: `packages/core/src/config/schema.ts`

New fields on `IndexingConfigSchema`:

```
embeddingBatchSize: z.number().int().min(1).max(200).optional()
```

New fields in the `enrichment` object schema:

```
minEnrichmentLines: z.number().int().min(1).optional()
excludeExtensions: z.array(z.string().min(1)).optional()
maxBatchChunks: z.number().int().min(1).max(50).optional()
```

Validation rules:

- `minEnrichmentLines` must be a positive integer (≥1). Values ≤0 are rejected by Zod (`.min(1)`).
- `excludeExtensions` items must be non-empty strings. Normalization (dot-prepend, lowercase) happens at runtime in the filter function, not in the schema.
- `maxBatchChunks` must be between 1 and 50. Values outside this range are rejected by Zod.
- `embeddingBatchSize` must be between 1 and 200. Values outside this range are rejected by Zod.

---

## New Function Signatures

### buildDynamicBatches()

**File**: `packages/indexer/src/enrichment/enricher.ts`

```typescript
export function buildDynamicBatches(
  chunks: CodeChunk[],
  numCtx: number,
  maxChunks?: number, // default: MAX_BATCH_CHUNKS (20)
): CodeChunk[][];
```

**Parameters**:

- `chunks`: Array of chunks to batch (already filtered)
- `numCtx`: Context window size in tokens (from config)
- `maxChunks`: Maximum chunks per batch (from `config.maxBatchChunks`, default: 20)

**Returns**: Array of batches (each batch is an array of CodeChunk references — not copies)

**Constants** (module-level exports for testability):

- `TOKEN_BUDGET_RATIO = 0.55`
- `PROMPT_OVERHEAD_TOKENS = 500`
- `MAX_BATCH_CHUNKS = 20`
- `CHARS_PER_TOKEN = 4`
- `OUTPUT_TOKENS_PER_CHUNK = 200`
- `OUTPUT_TOKENS_OVERHEAD = 100`

**Algorithm**: Greedy bin-packing

1. Compute `tokenBudget = numCtx * TOKEN_BUDGET_RATIO - PROMPT_OVERHEAD_TOKENS`
2. For each chunk: estimate tokens as `chunk.content.length / CHARS_PER_TOKEN`
3. Add chunk to current batch if: `currentBatchTokens + chunkTokens ≤ tokenBudget` AND `currentBatch.length < MAX_BATCH_CHUNKS`
4. Otherwise: close current batch, start new batch with this chunk
5. If a single chunk exceeds tokenBudget: it still forms a single-chunk batch (never dropped)
6. Return all batches

---

## Filter Chain (Updated)

### filterChunksForEnrichment()

**File**: `packages/indexer/src/pipeline.ts`

**Updated signature** (unchanged externally):

```typescript
export function filterChunksForEnrichment(
  chunks: CodeChunk[],
  config: EnrichmentConfig,
): { enrichable: CodeChunk[]; skipped: CodeChunk[] };
```

**Internal filter order**:

1. Language exclusion (`excludeLanguages`, existing)
2. Stereotype exclusion (`excludeStereotypes`, existing)
3. Extension exclusion (`excludeExtensions`, new)
4. Trivial line-count exclusion (`minEnrichmentLines`, new)

**Extension filter logic**:

- Extract extension from `chunk.filePath` via `path.extname()`
- Normalize config extensions: lowercase, prepend dot if missing
- Compare case-insensitively
- Skip if extension matches

**Trivial filter logic**:

- Only applies to chunks with `chunkType === 'method'` or `chunkType === 'function'`
- Compute line count: `endLine - startLine + 1`
- Skip if line count < `minEnrichmentLines` (default: 6)
- Disabled when `minEnrichmentLines` is 1 (all chunks pass since minimum line count is 1)

---

## Relationships

```
EnrichmentConfig (core)
  ├── used by: filterChunksForEnrichment (indexer/pipeline.ts)
  ├── used by: LlmEnricher constructor (indexer/enrichment/enricher.ts)
  │     └── reads: maxBatchChunks → passed to buildDynamicBatches()
  └── validated by: IndexingConfigSchema (core/config/schema.ts)

IndexingConfig (core)
  ├── used by: IndexingPipeline.run() (indexer/pipeline.ts)
  │     └── reads: embeddingBatchSize → controls embedding batch loop
  └── validated by: IndexingConfigSchema (core/config/schema.ts)

buildDynamicBatches (indexer/enrichment/enricher.ts)
  ├── called by: LlmEnricher.enrich() — standard path
  ├── called by: LlmEnricher.enrich() — large-file path (per class group)
  └── uses: maxChunks param (from config.maxBatchChunks)

callOllama (indexer/enrichment/enricher.ts)
  └── uses: numPredict param (computed from batch chunk count × 200 + 100)

filterChunksForEnrichment (indexer/pipeline.ts)
  └── called by: IndexingPipeline.run() before passing chunks to enricher
```
