# Data Model: Indexing Performance — Pipeline Streaming & Enrichment Optimization

**Feature**: 009-indexing-performance | **Date**: 2026-06-10

## Entity Changes

### 1. EnrichmentConfig (Modified)

**Package**: `@ia-framework/core`
**File**: `packages/core/src/types/index.ts`

| Field                  | Type       | Required | Default                                        | Description                                          |
| ---------------------- | ---------- | -------- | ---------------------------------------------- | ---------------------------------------------------- |
| provider               | `'ollama'` | Yes      | `'ollama'`                                     | LLM provider                                         |
| model                  | `string`   | Yes      | `'qwen3:8b'`                                   | Model name                                           |
| baseUrl                | `string`   | No       | `http://localhost:11434`                       | Ollama API URL                                       |
| numCtx                 | `number`   | No       | `16384` (was 32768)                            | Context window tokens — reduced for faster inference |
| concurrency            | `number`   | No       | `5` (was 3)                                    | Max parallel Ollama generation calls                 |
| retryAttempts          | `number`   | No       | `2`                                            | Retry on failure                                     |
| skipOnFailure          | `boolean`  | No       | `true`                                         | Skip vs throw on failure                             |
| **excludeLanguages**   | `string[]` | No       | `["xml", "yaml", "sql", "proto"]`              | Languages to exclude from LLM enrichment             |
| **excludeStereotypes** | `string[]` | No       | `["test", "dto", "config-block", "migration"]` | **NEW** — Stereotypes to exclude from LLM enrichment |

**Validation Rules**:

- `excludeLanguages` items must be non-empty strings
- `excludeStereotypes` items must be non-empty strings
- Empty array `[]` explicitly overrides defaults (enrich all)
- `undefined`/missing applies default exclusion list
- Language values matched case-insensitively against chunk `language` field
- Stereotype values matched case-insensitively against chunk `stereotype` field
- A chunk is excluded if EITHER its language matches `excludeLanguages` OR its stereotype matches `excludeStereotypes`

**Default Changes**:

- `numCtx`: 32768 → 16384 (halves KV cache allocation, reduces per-call latency by ~30-40%)
- `concurrency`: 3 → 5 (better utilization of Apple Silicon GPU)

**State Transitions**: N/A (configuration entity, no state machine)

---

### 2. IndexingConfig (Modified — default change)

**Package**: `@ia-framework/core`
**File**: `packages/core/src/types/index.ts`

| Field                | Type               | Required | Default                             | Description                      |
| -------------------- | ------------------ | -------- | ----------------------------------- | -------------------------------- |
| includePatterns      | `string[]`         | Yes      | —                                   | Glob patterns for files to index |
| excludePatterns      | `string[]`         | Yes      | —                                   | Glob patterns to exclude         |
| maxChunkLines        | `number`           | No       | —                                   | Max lines per chunk              |
| respectGitignore     | `boolean`          | No       | `true`                              | Honour .gitignore                |
| embeddingConcurrency | `number`           | No       | `6` (Ollama, was 3) / `10` (OpenAI) | Max parallel embedding batches   |
| llm                  | `object`           | No       | —                                   | Legacy LLM config                |
| enrichment           | `EnrichmentConfig` | No       | —                                   | LLM enrichment configuration     |

**Default Change**: `embeddingConcurrency` for Ollama provider changed from 3 to 6 in `getDefaultConcurrency()`.

---

### 3. CodeChunk (Unchanged — filtering relies on existing fields)

**Package**: `@ia-framework/core`
**File**: `packages/core/src/types/index.ts`

Relevant fields for filtering:

| Field      | Type     | Source                         | Values                                                                                                 |
| ---------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| language   | `string` | `LANGUAGE_MAP` in `chunker.ts` | `typescript`, `tsx`, `javascript`, `jsx`, `java`, `proto`, `yaml`, `xml`, `sql`, or extension fallback |
| stereotype | `string` | `classify()` in `pipeline.ts`  | `controller`, `service`, `repository`, `entity`, `dto`, `test`, `config-block`, `migration`, `unknown` |

---

### 4. EnrichedCodeChunk (Unchanged — documented for clarity)

**Package**: `@ia-framework/indexer`

Fields added by enrichment (only present on enriched chunks):

| Field           | Type       | Description                                |
| --------------- | ---------- | ------------------------------------------ |
| description     | `string`   | LLM-generated natural language description |
| businessContext | `string`   | Business domain context                    |
| semanticTags    | `string[]` | Semantic classification tags               |
| relationships   | `object[]` | Cross-chunk relationships                  |
| enrichedAt      | `string`   | ISO timestamp of enrichment                |
| enrichmentModel | `string`   | Model used for enrichment                  |

**Chunks excluded from enrichment** will NOT have these fields but will retain all AST-derived fields (stereotype, archLayer, imports, exports, chunkType, parentName, etc.).

---

## Relationships

```
ProjectConfig (project.json)
  └── indexing: IndexingConfig
        ├── embeddingConcurrency → Pipeline embedding p-queue (default: 6 for Ollama)
        └── enrichment: EnrichmentConfig
              ├── concurrency → Enricher p-queue (default: 5)
              ├── numCtx → Ollama API call parameter (default: 16384)
              ├── excludeLanguages → Pipeline filtering predicate (language match)
              └── excludeStereotypes → Pipeline filtering predicate (stereotype match)

CodeChunk.language ──matches──→ excludeLanguages list ──┐
                                                         ├── determines → enrichment skip/pass
CodeChunk.stereotype ──matches──→ excludeStereotypes ──┘
```

## Pipeline Flow (Sequential)

```
Parsed chunks
  ├── filterChunksForEnrichment(chunks, config)
  │     ├── Check language against excludeLanguages
  │     └── Check stereotype against excludeStereotypes
  │     → enrichable[] + skipped[]
  │
  ├── Enrichment Stage (p-queue, concurrency: 5)
  │     └── Enrich ALL enrichable[] in batches
  │     → enriched[]
  │
  └── Embedding Stage (p-queue, concurrency: 6)
        ├── Embed ALL chunks (enriched[] + skipped[])
        └── Upsert to Qdrant
```

> **Note**: A streaming (producer-consumer) pattern was implemented but reverted (D-002).
> Ollama cannot hold generate + embed models in VRAM simultaneously on 16GB Apple Silicon.
> Pipeline remains sequential: enrich all → embed all.

## Constants

| Constant                    | Value                                          | Location          | Purpose                                     |
| --------------------------- | ---------------------------------------------- | ----------------- | ------------------------------------------- |
| BATCH_SIZE                  | 10                                             | enricher.ts       | Max chunks per single Ollama call           |
| CHARS_PER_TOKEN             | 4                                              | enricher.ts       | Approximate token estimation                |
| LARGE_FILE_THRESHOLD        | 0.7                                            | enricher.ts       | 70% of numCtx triggers class-grouping       |
| DEFAULT_EXCLUDE_LANGUAGES   | `["xml", "yaml", "sql", "proto"]`              | pipeline.ts       | Default languages to skip from enrichment   |
| DEFAULT_EXCLUDE_STEREOTYPES | `["test", "dto", "config-block", "migration"]` | pipeline.ts (new) | Default stereotypes to skip from enrichment |
| Default numCtx              | 16384 (was 32768)                              | enricher.ts       | Ollama context window                       |
| Default concurrency         | 5 (was 3)                                      | enricher.ts       | Enrichment parallelism                      |
| Default embed concurrency   | 6 (was 3) for Ollama                           | pipeline.ts       | Embedding parallelism                       |

## Design Decisions

### No Persistent Cache (D-001)

The pipeline does NOT persist enrichment results between runs. Each indexing run re-enriches all chunks from scratch. Rationale:

- Atomic operation — always produces consistent, up-to-date results
- No corner cases around model changes, content hash mismatches, or interrupted writes
- Incremental indexing (git-based) already skips unchanged files at the file level
- Performance gains from streaming + filtering + concurrency are sufficient without cache
