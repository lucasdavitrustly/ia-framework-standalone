# Research: Indexing Performance — Enrichment Filtering & Concurrency

**Feature**: 009-indexing-performance | **Date**: 2026-06-09

## Research Tasks

### R1: Filtering Non-Code Files from LLM Enrichment

**Decision**: Filter chunks by `language` field before passing to `LlmEnricher.enrich()`. Filtering occurs in `pipeline.ts` (orchestrator) — the enricher itself remains language-agnostic.

**Rationale**:

- The `language` field is reliably set on every chunk via `LANGUAGE_MAP` in `packages/ast-parser/src/chunker.ts`. Supported languages: `typescript`, `tsx`, `javascript`, `jsx`, `java`, `proto`, `yaml`, `xml`, `sql`. Unknown extensions get `ext.slice(1)` as fallback.
- Filtering at the pipeline level (before enrichment) is cleaner than filtering inside the enricher because:
  - The enricher's single responsibility is LLM interaction
  - Progress reporting naturally reflects only enrichable chunks
  - Excluded chunks bypass enrichment entirely (no p-queue overhead)
- Default exclusion list: `["xml", "yaml", "sql", "proto"]` — these file types produce chunk types (config-block, migration, service-def, message-def) that don't benefit from natural language descriptions and cause parse failures with Ollama.

**Alternatives Considered**:

1. Filter inside `enricher.enrich()` — Rejected: violates single responsibility; enricher would need to know about config at chunk-filtering level
2. Filter at the parser level (don't parse excluded files) — Rejected: excluded files still need AST metadata, embeddings, and Qdrant storage for search

**Implementation Location**: `packages/indexer/src/pipeline.ts` lines 506-515 (before `enricher.enrich()` call)

---

### R2: Configurable Concurrency for Enrichment and Embedding

**Decision**: Use existing `concurrency` field in `EnrichmentConfig` (already in type + schema) and existing `embeddingConcurrency` in `IndexingConfig`. Default enrichment concurrency stays at 3; users can increase via `project.json`.

**Rationale**:

- p-queue is already in place in both the enricher (line 148) and the embedding phase (pipeline.ts). The infrastructure exists — it just needs the config value to flow through correctly.
- Current defaults: enricher concurrency=3, embedding concurrency varies by provider (Ollama=3, OpenAI=10). These are sensible defaults for modest hardware.
- `numCtx` is already in the `EnrichmentConfig` type and schema but needs to be passed in the Ollama API call body to actually limit context window.

**Alternatives Considered**:

1. Auto-detect optimal concurrency from GPU — Rejected per YAGNI (Principle V); manual config is simpler and predictable
2. Dynamic concurrency based on error rate — Rejected: adds complexity, Ollama handles queuing internally

**Implementation**: Verify `numCtx` passes through to the Ollama request. No new fields needed — schema already supports `concurrency`, `numCtx`, and `embeddingConcurrency`.

---

### R3: Batch-Grouping Cap (Sub-Batching Oversized Groups)

**Decision**: After `groupByClass()` returns groups, sub-batch any group exceeding `BATCH_SIZE` (10) into chunks of 10 before pushing to `batchGroups`. This applies to both class groups AND the `_top_level` catch-all group.

**Rationale**:

- Current code at enricher.ts lines 110-113 pushes entire class groups as single batches:
  ```typescript
  for (const group of groups.values()) {
    batchGroups.push(group); // BUG: group can be any size
  }
  ```
- A project with 200 top-level functions creates a `_top_level` group of 200 chunks → single Ollama call with 200 chunks → prompt exceeds context window → JSON parse failure.
- Fix is trivial: slice each group into sub-arrays of `BATCH_SIZE`:
  ```typescript
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += BATCH_SIZE) {
      batchGroups.push(group.slice(i, i + BATCH_SIZE));
    }
  }
  ```

**Alternatives Considered**:

1. Increase BATCH_SIZE to 20+ — Rejected: larger batches → more tokens → higher failure rate with smaller context windows
2. Dynamically calculate batch size from numCtx — Rejected: adds complexity; fixed cap of 10 is proven reliable

**Implementation Location**: `packages/indexer/src/enrichment/enricher.ts` lines 110-113

---

### R4: Config Schema Extension for `excludeLanguages`

**Decision**: Add `excludeLanguages?: string[]` to `EnrichmentConfig` interface and Zod schema. When not set, apply default `["xml", "yaml", "sql", "proto"]`. When set to `[]` (empty array), enrich all chunks.

**Rationale**:

- Follows existing pattern of optional config fields with sensible defaults
- Config validation uses Zod 4 (per constitution) — simple `z.array(z.string()).optional()` addition
- Default list matches exactly the non-code languages in `LANGUAGE_MAP` that produce parse failures

**Schema Change** (`packages/core/src/config/schema.ts`):

```typescript
excludeLanguages: z.array(z.string()).optional(),
```

**Type Change** (`packages/core/src/types/index.ts`):

```typescript
/** Languages to exclude from LLM enrichment (default: ["xml", "yaml", "sql", "proto"]) */
excludeLanguages?: string[];
```

---

### R5: Progress Reporting Accuracy

**Decision**: Pipeline reports enrichment progress based on filtered chunk count (enrichable chunks only), not total chunk count.

**Rationale**:

- Currently `enricher.enrich()` receives all chunks and reports progress internally based on batch count. If we filter before calling enrich, progress naturally reflects only enrichable chunks.
- No code changes needed beyond the filtering — the enricher's progress callback already works correctly when given fewer chunks.

---

## Summary of Decisions

| Decision                         | Impact                                   | Risk                                              |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Filter in pipeline.ts            | Reduces enrichment batch count by 20-40% | Low — excluded chunks retain all non-LLM metadata |
| Existing concurrency config      | No schema changes for concurrency itself | Low — proven p-queue mechanism                    |
| Sub-batch oversized groups       | Eliminates JSON parse failures           | None — strictly additive fix                      |
| Add `excludeLanguages` to config | One new optional field in type + schema  | Low — backward compatible, defaults maintained    |
| Progress reflects filtered count | Accurate user feedback                   | None — automatic from filtering placement         |
