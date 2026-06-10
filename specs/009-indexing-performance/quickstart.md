# Quickstart: Indexing Performance — Enrichment Optimization

**Feature**: 009-indexing-performance | **Date**: 2026-06-10

## Overview

This feature optimizes the indexing pipeline to reduce total indexing time from ~54 minutes to ≤25 minutes for large codebases (32K+ chunks) by:

1. **Stereotype filtering** — skip low-value chunks (test, dto, config-block, migration) from LLM enrichment
2. **Language filtering** — skip non-code files (XML, YAML, SQL, proto) from LLM enrichment
3. **Concurrency tuning** — optimized defaults for Apple Silicon 16GB (enrichment: 5, embedding: 6)
4. **Context window reduction** — numCtx 32768→16384 for faster per-call inference
5. **Batch-grouping cap** — sub-batch oversized groups to ≤10 chunks per Ollama call

**Explicit Decisions**:

- No persistent enrichment cache. Pipeline is atomic — always re-processes all chunks.
- No pipeline streaming (D-002). Ollama cannot hold generate + embed models simultaneously on 16GB Apple Silicon.

## Changes Summary

### Files Modified

| File                                          | Change                                           |
| --------------------------------------------- | ------------------------------------------------ |
| `packages/core/src/types/index.ts`            | Add `excludeStereotypes` to `EnrichmentConfig`   |
| `packages/core/src/config/schema.ts`          | Add Zod validation for `excludeStereotypes`      |
| `packages/indexer/src/pipeline.ts`            | Stereotype filter, embedding concurrency default |
| `packages/indexer/src/enrichment/enricher.ts` | numCtx default 16384, concurrency default 5      |
| `packages/cli/src/commands/index.command.ts`  | OLLAMA_NUM_PARALLEL warning when concurrency > 3 |

### Files Added

| File                                                        | Purpose                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/indexer/src/__tests__/pipeline-streaming.test.ts` | Tests for p-queue mechanics (streaming reverted but tests valid) |

## Architecture: Sequential Pipeline (Optimized)

### Before

```
[Enrich ALL chunks] ────────────────→ [Embed ALL chunks] ────→ Done
     ~35 min (3 concurrency, 32K ctx)      ~15 min (3 conc)  = ~50 min
```

### After

```
[Filter] → [Enrich enrichable chunks] ──→ [Embed ALL chunks] ──→ Done
  skip       ~15 min (5 conc, 16K ctx)       ~8 min (6 conc)   = ~23 min
  test/dto/
  config/
  migration
```

> **Note**: A streaming (producer-consumer) pattern was implemented but reverted (D-002).
> Ollama cannot hold generate + embed models in VRAM simultaneously on 16GB Apple Silicon.

## Implementation Steps (TDD Order)

### Step 1: Add `excludeStereotypes` to EnrichmentConfig

```typescript
// packages/core/src/types/index.ts
export interface EnrichmentConfig {
  // ... existing fields ...
  /** Stereotypes to exclude from LLM enrichment (default: ["test", "dto", "config-block", "migration"]) */
  excludeStereotypes?: string[];
}
```

```typescript
// packages/core/src/config/schema.ts (inside enrichment object)
excludeStereotypes: z.array(z.string().min(1)).optional(),
```

### Step 2: Update defaults in enricher

```typescript
// packages/indexer/src/enrichment/enricher.ts — constructor
this.config = {
  // ...
  numCtx: config.numCtx ?? 16384, // was 32768
  concurrency: config.concurrency ?? 5, // was 3
};
```

### Step 3: Extend filterChunksForEnrichment with stereotype filtering

```typescript
// packages/indexer/src/pipeline.ts
export const DEFAULT_EXCLUDE_STEREOTYPES = ['test', 'dto', 'config-block', 'migration'];

export function filterChunksForEnrichment(
  chunks: CodeChunk[],
  config: EnrichmentConfig,
): { enrichable: CodeChunk[]; skipped: CodeChunk[] } {
  const excludeLanguages = config.excludeLanguages ?? DEFAULT_EXCLUDE_LANGUAGES;
  const excludeStereotypes = config.excludeStereotypes ?? DEFAULT_EXCLUDE_STEREOTYPES;
  const langSet = new Set(excludeLanguages.map((l) => l.toLowerCase()));
  const stereoSet = new Set(excludeStereotypes.map((s) => s.toLowerCase()));

  if (langSet.size === 0 && stereoSet.size === 0) {
    return { enrichable: chunks, skipped: [] };
  }

  const enrichable: CodeChunk[] = [];
  const skipped: CodeChunk[] = [];

  for (const chunk of chunks) {
    const lang = (chunk.language ?? '').toLowerCase();
    const stereo = (chunk.stereotype ?? '').toLowerCase();
    if (langSet.has(lang) || (stereo && stereoSet.has(stereo))) {
      skipped.push(chunk);
    } else {
      enrichable.push(chunk);
    }
  }

  return { enrichable, skipped };
}
```

### Step 4: Pipeline remains sequential (streaming reverted — D-002)

> The streaming producer-consumer pattern was implemented but reverted because Ollama crashes
> when running both generate and embed models simultaneously on 16GB Apple Silicon.
> The pipeline retains the existing sequential flow: enrich all → embed all.

### Step 5: Add OLLAMA_NUM_PARALLEL warning

```typescript
// packages/cli/src/commands/index.command.ts
const enrichConcurrency = resolvedConfig.enrichment?.concurrency ?? 5;
if (enrichConcurrency > 3) {
  console.warn(
    `⚠ Enrichment concurrency is ${enrichConcurrency}. For optimal performance, start Ollama with: OLLAMA_NUM_PARALLEL=${enrichConcurrency}`,
  );
}
```

## Configuration Example

```json
{
  "indexing": {
    "embeddingConcurrency": 6,
    "enrichment": {
      "provider": "ollama",
      "model": "qwen3:8b",
      "numCtx": 16384,
      "concurrency": 5,
      "excludeLanguages": ["xml", "yaml", "sql", "proto"],
      "excludeStereotypes": ["test", "dto", "config-block", "migration"]
    }
  }
}
```

## Ollama Server Configuration

For optimal performance, start Ollama with parallel inference enabled:

```bash
OLLAMA_NUM_PARALLEL=5 ollama serve
```

This allows Ollama to process 5 enrichment requests truly in parallel (instead of queuing them internally).

## Verification

```bash
# Run tests
pnpm --filter @ia-framework/core test
pnpm --filter @ia-framework/indexer test
pnpm --filter @ia-framework/cli test

# Full build
pnpm build

# End-to-end: index a multi-module project and verify timing improvement
pnpm --filter @ia-framework/cli start -- index --force
# Expected: stereotype-excluded chunks show as "skipped" in progress, total time ~20-25 min for 32K chunks
```

## Behavioral Notes

- Setting `"excludeLanguages": []` enriches all languages (opt-out of language filtering)
- Setting `"excludeStereotypes": []` enriches all stereotypes (opt-out of stereotype filtering)
- Omitting either field applies the default exclusion list
- Excluded chunks remain fully searchable via AST metadata, signature, and sparse vectors
- Pipeline is sequential (enrich all → embed all) — streaming was reverted due to Ollama memory constraints (D-002)
- No persistent cache — every run re-processes all chunks from scratch (atomic operation)
- Abort (Ctrl+C) cleanly stops both enrichment and embedding queues
