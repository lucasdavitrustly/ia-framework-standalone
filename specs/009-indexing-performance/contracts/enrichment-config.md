# Contract: EnrichmentConfig Schema (project.json)

**Feature**: 009-indexing-performance | **Type**: Configuration contract

This document defines the user-facing configuration contract for enrichment in `project.json`.

## Schema (JSON)

```json
{
  "indexing": {
    "embeddingConcurrency": 6,
    "enrichment": {
      "provider": "ollama",
      "model": "qwen3:8b",
      "baseUrl": "http://localhost:11434",
      "numCtx": 16384,
      "concurrency": 5,
      "retryAttempts": 2,
      "skipOnFailure": true,
      "excludeLanguages": ["xml", "yaml", "sql", "proto"]
    }
  }
}
```

## Field Specifications

### `enrichment.excludeLanguages` (NEW)

| Property   | Value                             |
| ---------- | --------------------------------- |
| Type       | `string[]`                        |
| Required   | No                                |
| Default    | `["xml", "yaml", "sql", "proto"]` |
| Validation | Array of non-empty strings        |

**Behavior**:

- When **omitted/undefined**: Default exclusion list applied — `["xml", "yaml", "sql", "proto"]`
- When **empty array `[]`**: All chunks are enriched (explicit override)
- When **populated**: Only listed languages are excluded; all others enriched
- Matching is **case-insensitive** against `CodeChunk.language`
- Unknown language values are silently ignored (no error on typos)

### `enrichment.concurrency` (EXISTING — documented)

| Property   | Value                       |
| ---------- | --------------------------- |
| Type       | `number` (positive integer) |
| Required   | No                          |
| Default    | `3`                         |
| Validation | Integer, min 1              |

Controls max parallel Ollama generation calls via p-queue.

### `enrichment.numCtx` (EXISTING — documented)

| Property   | Value                       |
| ---------- | --------------------------- |
| Type       | `number` (positive integer) |
| Required   | No                          |
| Default    | `32768`                     |
| Validation | Integer, positive           |

Passed to Ollama API as `num_ctx` parameter. Reducing to 16384 lowers per-call latency.

### `indexing.embeddingConcurrency` (EXISTING — documented)

| Property   | Value                        |
| ---------- | ---------------------------- |
| Type       | `number` (positive integer)  |
| Required   | No                           |
| Default    | `3` (Ollama) / `10` (OpenAI) |
| Validation | Integer, positive            |

Controls max parallel embedding batch operations.

## Backward Compatibility

- All new fields are optional with backward-compatible defaults
- Existing `project.json` files without `excludeLanguages` will apply the default exclusion list (behavior change: previously all chunks were enriched)
- To preserve old behavior (enrich everything), explicitly set `"excludeLanguages": []`

## Zod Schema Addition

```typescript
// In packages/core/src/config/schema.ts
excludeLanguages: z.array(z.string().min(1)).optional(),
```
