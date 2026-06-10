# Contract: Enricher Batch Formation

**Feature**: 009-indexing-performance | **Type**: Internal API contract

This document defines the batch formation contract for `LlmEnricher.enrich()`.

## Invariant

> **No single Ollama enrichment call SHALL receive more than BATCH_SIZE (10) chunks.**

This invariant holds regardless of:

- Grouping strategy (large-file class grouping vs sequential batching)
- Number of top-level functions (no class parent)
- Class size (number of methods)

## Batch Formation Algorithm

```
INPUT: chunks: CodeChunk[]
OUTPUT: batchGroups: CodeChunk[][] where each group.length <= BATCH_SIZE

1. Compute totalTokens = sum(chunk.content.length) / CHARS_PER_TOKEN
2. IF totalTokens > LARGE_FILE_THRESHOLD * numCtx:
     groups = groupByClass(chunks)
     FOR EACH group IN groups.values():
       FOR i = 0; i < group.length; i += BATCH_SIZE:
         batchGroups.push(group.slice(i, i + BATCH_SIZE))  // ← SUB-BATCH CAP
   ELSE:
     FOR i = 0; i < chunks.length; i += BATCH_SIZE:
       batchGroups.push(chunks.slice(i, i + BATCH_SIZE))
```

## Pre-conditions

- All chunks in input have valid `id`, `filePath`, and `content` fields
- `BATCH_SIZE` is constant at 10
- `numCtx` comes from `EnrichmentConfig` (default: 32768)

## Post-conditions

- Every element in `batchGroups` has length in range `[1, BATCH_SIZE]`
- Union of all `batchGroups` elements equals the input `chunks` set (no chunks lost)
- Chunks within a sub-batch share the same class group (preserving context locality)

## Error Handling

- If Ollama returns invalid JSON for a batch and `skipOnFailure=true`: log warning, skip batch, continue
- If Ollama returns invalid JSON and `skipOnFailure=false`: throw error, abort enrichment
- Failed batches do not affect other batches (independent processing)
