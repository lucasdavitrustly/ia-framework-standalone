# Contract: EnrichmentConfig Schema

**Date**: 2026-06-10 | **Feature**: 011-enrichment-call-reduction

## Overview

The `EnrichmentConfig` is the user-facing configuration contract for LLM enrichment behavior. This document defines the updated schema including the two new fields introduced by this feature.

---

## Schema Definition (Zod 4)

```typescript
const EnrichmentConfigSchema = z.object({
  provider: z.literal('ollama').default('ollama'),
  model: z.string().min(1).default('qwen3:8b'),
  baseUrl: z.string().url().optional(),
  numCtx: z.number().int().positive().optional(),
  concurrency: z.number().int().positive().optional(),
  retryAttempts: z.number().int().min(0).max(10).optional(),
  skipOnFailure: z.boolean().optional(),
  excludeLanguages: z.array(z.string().min(1)).optional(),
  excludeStereotypes: z.array(z.string().min(1)).optional(),
  // NEW in 011-enrichment-call-reduction:
  minEnrichmentLines: z.number().int().min(1).optional(),
  excludeExtensions: z.array(z.string().min(1)).optional(),
  maxBatchChunks: z.number().int().min(1).max(50).optional(),
});

const IndexingConfigSchema = z.object({
  // ... existing fields ...
  embeddingBatchSize: z.number().int().min(1).max(200).optional(),
  enrichment: EnrichmentConfigSchema.optional(),
});
```

---

## Field Specifications

### New Fields

#### `minEnrichmentLines`

| Property          | Value                       |
| ----------------- | --------------------------- |
| Type              | `number` (positive integer) |
| Required          | No                          |
| Default (runtime) | `6`                         |
| Minimum           | `1`                         |
| Maximum           | No limit                    |

**Behavior**:

- Chunks with `chunkType` of `method` or `function` AND line count < this value are excluded from enrichment
- Line count = `endLine - startLine + 1`
- Value of `1` disables filtering (all chunks pass since minimum possible lines = 1)
- Other chunk types (`class`, `class-signature`, `interface`, `enum`, etc.) are never filtered by this setting

#### `excludeExtensions`

| Property          | Value                      |
| ----------------- | -------------------------- |
| Type              | `string[]`                 |
| Required          | No                         |
| Default (runtime) | `undefined` (no filtering) |
| Item constraint   | Non-empty string           |

**Behavior**:

- Lists file extensions to exclude from LLM enrichment
- Matching is case-insensitive (`.JS` matches `.js`)
- Dot is normalized: `"js"` is treated as `".js"`
- Empty array `[]` means no filtering (same as undefined)
- Stacks with `excludeLanguages` and `excludeStereotypes` (all three are independent)

#### `maxBatchChunks`

| Property          | Value                       |
| ----------------- | --------------------------- |
| Type              | `number` (positive integer) |
| Required          | No                          |
| Default (runtime) | `20`                        |
| Minimum           | `1`                         |
| Maximum           | `50`                        |

**Behavior**:

- Caps the maximum number of chunks per Ollama enrichment call
- Dynamic token-budget batching still applies — this is a hard ceiling on top of the dynamic calculation
- For small models (2-3B params), set to 5-10 to improve response quality
- For large models (14B+) with high `numCtx`, can be raised up to 50
- Value of `20` matches the pre-configuration hardcoded behavior

#### `embeddingBatchSize` (on `IndexingConfig`, not `EnrichmentConfig`)

| Property          | Value                       |
| ----------------- | --------------------------- |
| Type              | `number` (positive integer) |
| Required          | No                          |
| Default (runtime) | `50`                        |
| Minimum           | `1`                         |
| Maximum           | `200`                       |

**Behavior**:

- Controls how many chunks are sent per embedding API call (vector generation)
- Each batch results in 2 parallel HTTP requests (semantic + signature vectors)
- Lower values reduce peak memory usage; higher values improve throughput
- For Ollama embedding on 16GB RAM: 25-50 is optimal
- For OpenAI embedding API: 50-100 is safe (cloud API handles larger batches)

---

## Validation Rules

1. `minEnrichmentLines` must be ≥ 1 if provided (Zod `.min(1)`)
2. `excludeExtensions` items must be non-empty strings if array is provided
3. Both fields are optional — omission triggers runtime defaults
4. No cross-field validation needed between the new fields and existing fields

---

## Example Configurations

### Minimal (defaults apply)

```json
{
  "enrichment": {
    "model": "qwen2.5-coder:7b"
  }
}
```

Runtime behavior: `minEnrichmentLines = 6`, no extension exclusion.

### Full configuration

```json
{
  "indexing": {
    "embeddingBatchSize": 50,
    "enrichment": {
      "provider": "ollama",
      "model": "qwen2.5-coder:7b",
      "baseUrl": "http://localhost:11434",
      "numCtx": 16384,
      "concurrency": 3,
      "retryAttempts": 2,
      "skipOnFailure": true,
      "excludeLanguages": ["xml", "yaml", "sql", "proto"],
      "excludeStereotypes": ["test", "dto", "config-block", "migration"],
      "minEnrichmentLines": 6,
      "excludeExtensions": [".js", ".jsx", ".mjs"],
      "maxBatchChunks": 20
    }
  }
}
```

---

## Backward Compatibility

| Scenario                            | Behavior                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| Config with no new fields           | `minEnrichmentLines` defaults to 6 (new filtering active) |
| Config with `minEnrichmentLines: 1` | Trivial filtering disabled (pre-011 behavior)             |
| Config with no `excludeExtensions`  | No extension filtering (pre-011 behavior)                 |
| Config with no `maxBatchChunks`     | Defaults to 20 (same as pre-config hardcoded limit)       |
| Config with no `embeddingBatchSize` | Defaults to 50 (same as pre-config hardcoded default)     |

**Breaking change note**: The default `minEnrichmentLines: 6` means methods ≤5 lines will no longer be enriched by default. This is intentional — it's a performance optimization with negligible quality impact. Users who want the old behavior can set `minEnrichmentLines: 1`.

---

## Internal Constants (not user-configurable)

These constants are used internally by `LlmEnricher` and `buildDynamicBatches()`:

| Constant                  | Value | Purpose                                           |
| ------------------------- | ----- | ------------------------------------------------- |
| `TOKEN_BUDGET_RATIO`      | 0.55  | 55% of `numCtx` reserved for input tokens         |
| `PROMPT_OVERHEAD_TOKENS`  | 500   | Reserved for the prompt template                  |
| `MAX_BATCH_CHUNKS`        | 20    | Hard cap on chunks per Ollama call                |
| `CHARS_PER_TOKEN`         | 4     | Approximation for token budget calculation        |
| `OUTPUT_TOKENS_PER_CHUNK` | 200   | Expected output tokens per chunk in JSON response |
| `OUTPUT_TOKENS_OVERHEAD`  | 100   | JSON wrapper overhead (`{"chunks": [...]}`)       |

The `num_predict` option sent to Ollama is computed as: `batchChunkCount × OUTPUT_TOKENS_PER_CHUNK + OUTPUT_TOKENS_OVERHEAD`. This prevents output truncation regardless of model size or default output limits.

---

## Model Recommendations

| Model                | Params | Suitable for Enrichment | Notes                              |
| -------------------- | ------ | ----------------------- | ---------------------------------- |
| `qwen3:8b`           | 8B     | Yes (default)           | Best balance of quality and speed  |
| `qwen2.5-coder:7b`   | 7B     | Yes                     | Code-specialized                   |
| `qwen2.5-coder:14b`  | 14B    | Yes                     | Highest quality, needs 10GB+ VRAM  |
| `qwen2.5-coder:3b`   | 3B     | Minimum viable          | Acceptable quality, fast           |
| `qwen2.5-coder:0.5b` | 0.5B   | **No**                  | Produces repetitive/truncated JSON |

Models < 3B parameters are not recommended: they generate identical metadata for all chunks in a batch and frequently exceed their output token limits even with explicit `num_predict`.
