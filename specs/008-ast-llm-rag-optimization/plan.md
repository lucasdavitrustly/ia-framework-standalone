# Implementation Plan: AST + LLM RAG Optimization

**Branch**: `feat/008-ast-llm-rag-optimization` | **Date**: 2026-06-04 | **Spec**: `specs/008-ast-llm-rag-optimization/spec.md`

**Input**: Feature specification from `/specs/008-ast-llm-rag-optimization/spec.md`

## Current Status

| Phase                           | Tasks     | Status                                 |
| ------------------------------- | --------- | -------------------------------------- |
| Phase 1 — Setup                 | T001–T005 | ✅ Complete                            |
| Phase 2 — Foundational          | T006–T012 | ✅ Complete                            |
| Phase 3 — US1 Enriched Indexing | T013–T033 | ✅ Complete                            |
| Phase 4 — US2 Dependency Graph  | T034–T040 | ✅ Complete                            |
| Phase 5 — US3 Chunk Boundaries  | T041–T044 | ✅ Complete                            |
| Phase 6 — US4 Language Support  | T045–T054 | ✅ Complete                            |
| Phase 7 — US5 Retrieval         | T055–T069 | ✅ Complete                            |
| Phase 8 — Polish                | T070–T075 | ✅ Complete                            |
| Phase 9 — Pipeline Gap-Fill     | T078–T082 | ✅ Complete                            |
| Phase 10 — Enrichment Progress  | T083–T085 | ✅ Complete                            |
| Phase 8 — Benchmark / E2E       | T076–T077 | ⏳ Pending (requires live environment) |

**Remaining**: T076 (benchmark precision@5/recall@10) and T077 (quickstart E2E) require a running Qdrant instance + real project and have not been automated.

## Summary

Unify the indexing pipeline into a single AST-first pass with optional LLM enrichment via Ollama. Replace the strategy pattern (ast OR llm) with one always-on pipeline that: (1) parses with AST for semantic chunk boundaries, (2) classifies by stereotype/archLayer heuristics, (3) enriches with LLM metadata, (4) embeds into 3 named vectors (semantic, signature, sparse), and (5) stores lean metadata in Qdrant without raw code. Consolidate MCP tools from 5+ to 3.

## Technical Context

**Language/Version**: TypeScript ~5.9, Node.js >= 22.0.0

**Primary Dependencies**: tree-sitter (native), tree-sitter-java, @tree-sitter-grammars/tree-sitter-yaml (NEW), @tree-sitter-grammars/tree-sitter-xml (NEW), @qdrant/js-client-rest, Ollama (local), Commander.js, Zod 4

**Storage**: Qdrant (vectors + lean metadata), filesystem (code content at retrieval time), SQLite (metrics)

**Testing**: Vitest (TDD mandated by constitution)

**Target Platform**: Local development machine (macOS/Linux)

**Project Type**: Monorepo (pnpm workspace) — CLI + MCP server + packages

**Performance Goals**: Retrieval <500ms for top-10 results; indexing within 3x current duration

**Constraints**: Local-first (no cloud deps for core), lean Qdrant payloads (no raw code stored), graceful degradation when Ollama unavailable

**Scale/Scope**: Multi-repo codebases (1M+ LOC), Java/TS/JS/Proto/YAML/XML/SQL

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status  | Notes                                                                                                                                             |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. TDD                     | ✅ PASS | Tests first for all new parsers, enrichment pipeline, retrieval changes                                                                           |
| II. TypeScript-Only        | ✅ PASS | All code in TypeScript strict mode                                                                                                                |
| III. Local-First           | ✅ PASS | Ollama + Qdrant local; no cloud dependencies for core functionality                                                                               |
| IV. Monorepo Architecture  | ✅ PASS | No new packages — extending existing ast-parser, indexer, retrieval, mcp-server, vector-store, core                                               |
| V. Simplicity              | ✅ PASS | Net reduction: removes strategy abstraction + 2 MCP tools. Complexity additions (3 vectors, enrichment) justified by measurable RAG improvements. |
| VI. Incremental by Default | ✅ PASS | git-diff for file change detection, contentHash for enrichment caching                                                                            |
| VII. MCP-First Interface   | ✅ PASS | Cleaner 3-tool surface with richer metadata responses                                                                                             |

**Gate Result: PASS** — No violations.

## Project Structure

### Documentation (this feature)

```text
specs/008-ast-llm-rag-optimization/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/
├── ast-parser/src/
│   ├── parsers/
│   │   ├── java.ts              # ENHANCE — add annotation/stereotype extraction
│   │   ├── typescript.ts        # ENHANCE — add annotation/decorator extraction
│   │   ├── proto.ts             # NEW — regex-based proto chunker
│   │   ├── yaml.ts             # NEW — tree-sitter-yaml parser
│   │   ├── xml.ts              # NEW — tree-sitter-xml parser
│   │   └── sql.ts             # NEW — Flyway migration statement chunker
│   ├── chunker.ts               # ENHANCE — contextHeader, class-signature chunks
│   ├── types.ts                 # ENHANCE — new ChunkType values, metadata fields
│   ├── classifier.ts           # NEW — stereotype + archLayer heuristic detection
│   └── module-resolver.ts      # NEW — path + pom.xml → moduleInfo + mavenCoordinates
├── indexer/src/
│   ├── pipeline.ts              # NEW — unified single-pass pipeline
│   ├── enrichment/
│   │   ├── enricher.ts          # NEW — Ollama LLM enrichment (batched, concurrent)
│   │   ├── prompt.ts            # NEW — structured enrichment prompt
│   │   └── cache.ts             # ADAPT — from existing strategies/llm-cache.ts
│   ├── embedder.ts              # NEW — 3-vector embedding generation
│   ├── strategies/
│   │   ├── llm-strategy.ts      # DELETE
│   │   ├── llm-chunker.ts       # DELETE
│   │   ├── prompt.ts            # DELETE (replaced by enrichment/prompt.ts)
│   │   ├── prompt-examples.ts   # DELETE
│   │   └── types.ts             # SIMPLIFY — remove ChunkingStrategy interface
│   └── chunk-description.ts     # DELETE (replaced by enrichment pipeline)
├── vector-store/src/
│   ├── interface.ts             # MODIFY — new ChunkPayload (no content), VectorPoint (3 vectors)
│   └── qdrant.ts                # MODIFY — 3 named vectors, migration detection, no raw code
├── retrieval/src/
│   ├── query-classifier.ts      # NEW — classify query type → vector routing
│   ├── search-engine.ts         # MODIFY — unified pipeline with auto-classification
│   └── dependency-graph.ts      # MODIFY — use indexed dependency edges
├── mcp-server/src/tools/
│   ├── search-codebase.ts       # MODIFY — unified with metadata filters
│   ├── get-file.ts              # MODIFY — filesystem read + semantic fallback
│   ├── get-dependencies.ts      # MODIFY — file-level + module-level (merged)
│   ├── search-codebase-hybrid.ts # DELETE (merged into search-codebase)
│   ├── get-module-dependencies.ts # DELETE (merged into get-dependencies)
│   └── benchmark-preflight.ts    # DELETE (becomes internal health check)
└── core/src/types/
    └── index.ts                 # MODIFY — add shared types (Stereotype, ArchLayer, etc.)
```

**Structure Decision**: Extending existing monorepo packages. No new packages created. The enrichment pipeline lives in `indexer` since it's part of the indexing flow. The classifier and module-resolver live in `ast-parser` since they operate on parsed AST output.

### Post-MVP Additions (Phases 9–10)

The following gaps were discovered during live testing against a real Java project (`paywithmybank`) and fixed post-MVP:

**Phase 9 — Pipeline Completeness** (`b23a7f3`):

- `filePath` was being stored in Qdrant payloads (absolute host paths leak across machines) → removed; retrieval reconstructs from `projectRoot + '/' + relativePath`
- `classify()` was never called during indexing → wired into the parsing loop; `stereotype`/`archLayer` now in every payload
- Several `CodeChunk` fields were parsed but never written to the payload → wired: `annotations`, `visibility`, `contextHeader`, `classSignature`, `dependencyEdges`, `moduleInfo`, `contentHash` (SHA256)
- `LlmEnricher.enrich()` was implemented but never called from `pipeline.ts` → wired between parsing and embedding loops
- `'enriching'` stage was missing from `IndexingProgress` → added; CLI renderer updated

**Phase 10 — Enrichment Progress Visibility** (`d9ebf37`):

- The `enriching` stage was a silent black box during long Ollama runs (3,000+ chunks = 300+ sequential calls) → added `EnrichmentProgress` callback to `LlmEnricher.enrich()`; pipeline pipes it into `IndexingProgress.batchesTotal`/`batchesCompleted`/`currentFile`; CLI renders a live progress bar with elapsed time and ETA

## Complexity Tracking

| Addition                      | Why Needed                                                                                              | Simpler Alternative Rejected Because                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 3 vectors instead of 2        | Each serves distinct retrieval need (business, symbol, keyword). Removes need for separate hybrid tool. | Single vector can't optimize for all query types — proven by current precision issues |
| LLM enrichment pipeline       | Enables semantic search on business context (core value prop). Gracefully degrades.                     | AST-only metadata lacks business meaning descriptions                                 |
| 4 new language parsers        | Proto/YAML/XML/SQL critical for understanding service architecture                                      | Ignoring config/contract files misses architectural relationships                     |
| `EnrichmentProgress` callback | Makes 300+ sequential Ollama calls visible; critical UX for long-running indexing jobs                  | Static spinner gives no feedback during multi-minute enrichment runs                  |
