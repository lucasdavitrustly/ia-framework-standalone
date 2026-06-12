# Quickstart: Enrichment Call Reduction

**Date**: 2026-06-10 | **Feature**: 011-enrichment-call-reduction

## Overview

This feature reduces Ollama LLM enrichment calls by 50%+ through three mechanisms:

1. **Trivial filtering** — skip short methods/functions (≤5 lines by default)
2. **Extension exclusion** — skip files by extension (e.g., `.js`)
3. **Dynamic batching** — pack more small chunks per Ollama call (up to 20)

All features are opt-in or have safe defaults. Existing configurations work without changes.

---

## Configuration

Add these fields to the `enrichment` section of your `project.json`:

```json
{
  "indexing": {
    "embeddingBatchSize": 50,
    "enrichment": {
      "provider": "ollama",
      "model": "qwen3:8b",
      "numCtx": 16384,
      "maxBatchChunks": 20,
      "minEnrichmentLines": 6,
      "excludeExtensions": [".js", ".jsx", ".mjs"]
    }
  }
}
```

### Field Reference

| Field                | Type     | Default | Description                                                                 |
| -------------------- | -------- | ------- | --------------------------------------------------------------------------- |
| `embeddingBatchSize` | number   | `50`    | Chunks per embedding API call (range: 1-200).                               |
| `maxBatchChunks`     | number   | `20`    | Max chunks per Ollama enrichment call (range: 1-50). Caps dynamic batching. |
| `minEnrichmentLines` | number   | `6`     | Methods/functions with fewer lines skip enrichment. Set to `1` to disable.  |
| `excludeExtensions`  | string[] | (none)  | File extensions to skip for enrichment. Case-insensitive, dot-normalized.   |

---

## Usage Examples

### Example 1: Skip trivial methods (default behavior)

With default `minEnrichmentLines: 6`, methods like these are NOT enriched:

```java
// 3 lines — skipped from enrichment
public String getName() {
    return this.name;
}
```

```java
// 7 lines — IS enriched
public Order processPayment(PaymentRequest request) {
    validate(request);
    Order order = orderService.create(request);
    paymentGateway.charge(order);
    auditLog.record(order);
    return order;
}
```

Skipped methods still get full AST metadata, embeddings, and are searchable.

### Example 2: Exclude JavaScript from enrichment

```json
{
  "indexing": {
    "enrichment": {
      "model": "qwen2.5-coder:7b",
      "excludeExtensions": [".js", ".jsx", ".mjs"]
    }
  }
}
```

TypeScript (`.ts`, `.tsx`) files are enriched; JavaScript is indexed but not enriched.

### Example 3: Maximize batch efficiency for small codebases

With `numCtx: 32768`, the dynamic batcher has more budget per call:

```json
{
  "indexing": {
    "enrichment": {
      "model": "qwen2.5-coder:14b",
      "numCtx": 32768
    }
  }
}
```

Budget = `32768 * 0.55 - 500` = **17522 tokens** (~70K chars) per batch. Most small repositories can be enriched in 2-3 calls.

### Example 4: Disable trivial filtering

```json
{
  "indexing": {
    "enrichment": {
      "model": "qwen2.5-coder:7b",
      "minEnrichmentLines": 1
    }
  }
}
```

All methods/functions are enriched regardless of line count (pre-011 behavior).

### Example 5: Aggressive filtering for large monorepos

```json
{
  "indexing": {
    "enrichment": {
      "model": "qwen2.5-coder:7b",
      "minEnrichmentLines": 10,
      "excludeExtensions": [".js", ".jsx", ".mjs", ".css", ".scss"],
      "excludeLanguages": ["xml", "yaml", "sql", "proto", "json"]
    }
  }
}
```

Only methods/functions with 10+ lines in non-excluded extensions/languages get enrichment.

### Example 6: Tuning for small models (2-3B parameters)

For models like `gemma4:e2b` or `qwen2.5-coder:3b`, reduce batch sizes to improve quality:

```json
{
  "indexing": {
    "embeddingBatchSize": 25,
    "enrichment": {
      "model": "gemma4:e2b",
      "numCtx": 8192,
      "maxBatchChunks": 8
    }
  }
}
```

- `numCtx: 8192` — smaller context window means fewer chunks fit per batch token budget
- `maxBatchChunks: 8` — hard cap prevents the dynamic batcher from exceeding 8 chunks even if budget allows
- `embeddingBatchSize: 25` — reduces memory pressure for embedding calls (optional for small RAM setups)

---

## Behavior Notes

- **Extension normalization**: `"js"` (no dot) is automatically treated as `".js"`
- **Case insensitivity**: `".JS"` matches files with `.js` extension
- **Filter stacking**: `excludeExtensions`, `excludeLanguages`, and `excludeStereotypes` all apply independently
- **Dynamic batching is automatic**: No configuration needed. It uses `numCtx` to calculate optimal batch sizes.
- **No data loss**: Filtered chunks retain full AST metadata, embeddings, and Qdrant storage. Only LLM enrichment (description, tags, relationships) is skipped.
- **Output token budget**: The enricher automatically sets `num_predict` based on batch size (200 tokens per chunk + 100 overhead), preventing JSON truncation on any model size.

---

## Model Requirements

The enrichment model must be capable of generating structured JSON for up to 20 code chunks per batch. **Minimum recommended: 7B+ parameters.**

| Model                | Quality           | Notes                                                          |
| -------------------- | ----------------- | -------------------------------------------------------------- |
| `qwen3:8b` (default) | Good              | Recommended for most setups                                    |
| `qwen2.5-coder:7b`   | Good              | Code-specialized alternative                                   |
| `qwen2.5-coder:14b`  | Best              | Requires 10GB+ VRAM                                            |
| `qwen2.5-coder:3b`   | Acceptable        | Minimum viable for enrichment                                  |
| `qwen2.5-coder:0.5b` | **Not supported** | Produces repetitive/truncated JSON — do not use for enrichment |

If you see `parse-failure` errors in enrichment logs, upgrade your model to `qwen3:8b` or larger.

---

## Verifying the Optimization

After indexing, check the logs for batch count reduction:

```
Enrichment: 2000 chunks → 1400 after filtering → 35 batches (was ~140 with fixed 10/batch)
```

Chunks without enrichment will have no `enrichedAt` or `enrichmentModel` fields in their Qdrant payloads, but all other metadata remains intact.
