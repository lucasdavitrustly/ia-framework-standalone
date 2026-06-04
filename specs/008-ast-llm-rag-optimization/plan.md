# Implementation Plan: AST + LLM RAG Optimization

**Branch**: `feat/008-ast-llm-rag-optimization` | **Date**: 2026-06-04 | **Spec**: `specs/008-ast-llm-rag-optimization/spec.md`

**Input**: Feature specification from `/specs/008-ast-llm-rag-optimization/spec.md`

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

## Complexity Tracking

| Addition                | Why Needed                                                                                              | Simpler Alternative Rejected Because                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 3 vectors instead of 2  | Each serves distinct retrieval need (business, symbol, keyword). Removes need for separate hybrid tool. | Single vector can't optimize for all query types — proven by current precision issues |
| LLM enrichment pipeline | Enables semantic search on business context (core value prop). Gracefully degrades.                     | AST-only metadata lacks business meaning descriptions                                 |
| 4 new language parsers  | Proto/YAML/XML/SQL critical for understanding service architecture                                      | Ignoring config/contract files misses architectural relationships                     |
