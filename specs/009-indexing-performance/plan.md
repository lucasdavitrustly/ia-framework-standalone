# Implementation Plan: Indexing Performance — Enrichment Optimization

**Branch**: `009-indexing-performance` | **Date**: 2026-06-10 | **Spec**: `specs/009-indexing-performance/spec.md`

**Input**: Feature specification from `/specs/009-indexing-performance/spec.md`

## Summary

Reduce total indexing time for large codebases (32K+ chunks, currently ~54 min) by:

1. **Stereotype-based enrichment filtering** — skip low-value chunks (test, dto, config-block, migration) from LLM enrichment (15-25% reduction)
2. **Concurrency tuning** — increase defaults (enrichment: 5, embedding: 6) and reduce numCtx (32768→16384) (40-60% per-call improvement)
3. **OLLAMA_NUM_PARALLEL CLI warning** — remind users to configure Ollama server for parallel inference
4. **Batch-grouping cap** (already implemented) — sub-batch `_top_level` groups to prevent oversized prompts
5. **Language-based filtering** (already implemented) — exclude XML/YAML/SQL/proto from enrichment

**Explicit Decisions**:

- No persistent enrichment cache. Pipeline remains atomic — always re-processes all chunks from scratch. Too many corner cases with caching (model changes, content changes, interrupted writes).
- **No pipeline streaming** (D-002). A producer-consumer streaming pattern was implemented and tested but **reverted** because Ollama cannot reliably hold both a generate model (qwen3:8b ~5GB + KV cache) and an embed model (nomic-embed-text) in VRAM simultaneously on 16GB Apple Silicon. The `llama-server` process crashes. The pipeline remains sequential: enrich all → embed all.

Changes are scoped to `@ia-framework/core` (types) and `@ia-framework/indexer` (pipeline + enricher logic) and `@ia-framework/cli` (warning).

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js >= 22.0.0

**Primary Dependencies**: p-queue (concurrency), Ollama (local LLM), web-tree-sitter (AST parsing), Qdrant (vector store)

**Storage**: Qdrant (vectors), better-sqlite3 (metrics)

**Testing**: Vitest (unit + integration), TDD required per constitution

**Target Platform**: macOS (Apple Silicon 16GB primary), Linux server

**Project Type**: Monorepo library/CLI/MCP-server (pnpm workspace with Turborepo)

**Performance Goals**: Total indexing time ≤25 min for 32K-chunk project (down from ~54 min); zero Ollama parse failures

**Constraints**: Local-first (no cloud dependencies for core), offline-capable, no single Ollama call >10 chunks, no persistent enrichment cache, safe for 16GB unified memory, sequential pipeline (no concurrent generate + embed)

**Scale/Scope**: 32K+ chunks per project, 13 packages in monorepo, 3 packages affected (core, indexer, cli)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                |
| -------------------------- | ------ | -------------------------------------------------------------------- |
| I. TDD                     | PASS   | Tests required for stereotype filtering, concurrency behavior        |
| II. TypeScript-Only        | PASS   | All changes in TypeScript with strict types                          |
| III. Local-First           | PASS   | Ollama remains the local default; changes improve local performance  |
| IV. Monorepo Architecture  | PASS   | Changes scoped to `core` (types), `indexer` (logic), `cli` (warning) |
| V. Simplicity              | PASS   | No new abstractions — p-queue, config fields, filtering predicates   |
| VI. Incremental by Default | PASS   | No change to incremental indexing; enrichment skipping is additive   |
| VII. MCP-First Interface   | N/A    | No MCP tool changes; indexing is a CLI/pipeline operation            |

**Gate Result**: PASS — No violations detected. All changes align with existing patterns and principles.

## Project Structure

### Documentation (this feature)

```text
specs/009-indexing-performance/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output — implementation tasks
```

### Source Code (repository root)

```text
packages/core/src/types/index.ts              # EnrichmentConfig type extension (excludeStereotypes)
packages/core/src/config/schema.ts            # Zod schema for excludeStereotypes
packages/indexer/src/pipeline.ts              # Sequential pipeline, stereotype filter, concurrency defaults
packages/indexer/src/enrichment/enricher.ts   # numCtx default change (16384), concurrency default (5)
packages/indexer/src/enrichment/__tests__/    # Unit tests for filtering
packages/indexer/src/__tests__/               # Integration tests (including streaming revert validation)
packages/cli/src/commands/index.command.ts    # OLLAMA_NUM_PARALLEL warning
```

**Structure Decision**: Existing monorepo structure — no new packages or directories needed. Changes confined to existing files in `packages/core`, `packages/indexer`, and `packages/cli`.

## Architecture: Sequential Pipeline (Optimized)

### Pipeline Flow

```
Parse all files
    │
    ├── filterChunksForEnrichment(chunks, config)
    │     ├── Check language against excludeLanguages
    │     └── Check stereotype against excludeStereotypes
    │     → enrichable[] + skipped[]
    │
    ├── Enrichment Stage (p-queue, concurrency: 5)
    │   └── Enrich ALL enrichable chunks in batches
    │
    └── Embedding Stage (p-queue, concurrency: 6)
        ├── Embed ALL chunks (enriched + skipped)
        └── Upsert to Qdrant
```

### Why NOT Streaming (D-002)

A producer-consumer streaming pattern (overlapping enrichment and embedding) was fully implemented and unit-tested (see `pipeline-streaming.test.ts`). However, **real-world testing revealed that Ollama cannot hold both a generate model (qwen3:8b ~5GB + KV cache) and an embed model (nomic-embed-text) in VRAM simultaneously on 16GB Apple Silicon**. The `llama-server` process crashes with "no longer running: unknown" error.

The streaming pattern would only benefit systems with either:

- Dedicated separate GPUs for generate and embed
- ≥32GB unified memory (enough for both models + KV cache)
- Cloud-based LLM providers (no local memory contention)

Since the project targets 16GB Apple Silicon as the primary platform, the pipeline remains sequential.

## Implementation Phases

### Phase 7: Config & Types — excludeStereotypes + Default Changes

**Purpose**: Extend core types to support stereotype-based filtering and update defaults

**Files**:

- `packages/core/src/types/index.ts` — Add `excludeStereotypes?: string[]` to `EnrichmentConfig`
- `packages/core/src/config/schema.ts` — Add Zod validation for `excludeStereotypes`
- `packages/indexer/src/enrichment/enricher.ts` — Change `numCtx` default 32768→16384, `concurrency` default 3→5

**Rationale**: Foundation for stereotype filtering and concurrency tuning. Must be done before pipeline changes.

### Phase 8: Stereotype-based Enrichment Filtering

**Purpose**: Skip low-value chunks from LLM enrichment based on their stereotype

**Files**:

- `packages/indexer/src/pipeline.ts` — Extend `filterChunksForEnrichment()` to also filter by stereotype
- `packages/indexer/src/__tests__/pipeline-filtering.test.ts` — Add stereotype filter tests

**Logic**: A chunk is excluded if its `language` matches `excludeLanguages` OR its `stereotype` matches `excludeStereotypes`. Default stereotypes to exclude: `["test", "dto", "config-block", "migration"]`.

### Phase 9: Pipeline Streaming — REVERTED (kept sequential)

**Purpose**: Originally intended to overlap enrichment and embedding via producer-consumer pattern.

**Status**: REVERTED — Implemented and all unit tests passed, but Ollama crashes in production when running generate + embed models simultaneously on 16GB Apple Silicon (D-002). Pipeline remains sequential.

**Files**:

- `packages/indexer/src/pipeline.ts` — Streaming code reverted; sequential flow retained
- `packages/indexer/src/__tests__/pipeline-streaming.test.ts` — Tests retained (validates p-queue mechanics, still useful as unit tests)

**Lesson learned**: Ollama's `/api/generate` (qwen3:8b ~5GB + KV cache) and `/api/embed` (nomic-embed-text) cannot coexist in VRAM on 16GB unified memory. The `llama-server` process crashes with "no longer running: unknown".

### Phase 10: Concurrency Tuning + CLI Warning

**Purpose**: Update embedding concurrency default and add OLLAMA_NUM_PARALLEL warning

**Files**:

- `packages/indexer/src/pipeline.ts` — Change Ollama embedding default concurrency from 3 to 6
- `packages/cli/src/commands/index.command.ts` — Add startup warning about OLLAMA_NUM_PARALLEL

**Warning logic**: If resolved `enrichment.concurrency` > 3, log:

```
⚠ Enrichment concurrency is {N}. For optimal performance, start Ollama with: OLLAMA_NUM_PARALLEL={N}
```

### Phase 11: Tests & Validation

**Purpose**: Verify all optimizations work together, no regressions

**Files**:

- `packages/indexer/src/__tests__/pipeline-streaming.test.ts` — Streaming pipeline tests
- `packages/indexer/src/__tests__/pipeline-filtering.test.ts` — Stereotype filter tests (extend existing)
- Full test suite validation

## Dependencies & Execution Order

```
Phase 7 (config/types) ──→ Phase 8 (stereotype filter) ──→ Phase 9 (REVERTED) ──→ Phase 10 (CLI) ──→ Phase 11 (validation)
```

- Phase 7 is a prerequisite for Phase 8 (needs `excludeStereotypes` type)
- Phase 9 was implemented then reverted (Ollama memory constraints)
- Phase 10 and 11 proceed independently

## Risk Assessment

| Risk                                          | Probability | Impact | Mitigation                                                        |
| --------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------- |
| Ollama OOM at high concurrency                | Low         | High   | Conservative defaults (5 generate, 6 embed); numCtx halved to 16K |
| Ollama crash with concurrent generate + embed | **High**    | High   | **MITIGATED**: Reverted to sequential pipeline (D-002)            |
| Per-call latency increase from lower numCtx   | Low         | Low    | 16K is sufficient for ≤10 chunks per call; long inputs truncated  |
| Stereotype filter too aggressive              | Low         | Low    | Users can override with `"excludeStereotypes": []`                |

## Complexity Tracking

> No violations detected — section intentionally left empty.
