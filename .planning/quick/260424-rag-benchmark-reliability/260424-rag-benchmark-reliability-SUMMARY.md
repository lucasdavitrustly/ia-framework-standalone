---
phase: quick
plan: 01
subsystem: rag-reliability
tags: [benchmark, mcp, fallback, preflight]
dependency-graph:
  requires: []
  provides: [benchmark-preflight, retrieval-fallback]
  affects: [packages/benchmark, packages/mcp-server]
tech-stack:
  added: []
  patterns: [preflight-capability-report, indexed-evidence-fallback]
key-files:
  created:
    - packages/benchmark/src/mcp-preflight.ts
    - packages/benchmark/src/mcp-preflight.test.ts
    - packages/mcp-server/src/tools/benchmark-preflight.ts
    - packages/core/src/retrieval/query-intelligence.ts
    - packages/core/src/retrieval/query-intelligence.test.ts
    - packages/retrieval/src/query-intelligence.ts
    - packages/mcp-server/src/tools/result-formatting.ts
    - packages/indexer/src/retrieval-metadata.ts
  modified:
    - packages/benchmark/src/types.ts
    - packages/benchmark/src/index.ts
    - packages/core/src/index.ts
    - packages/core/src/types/index.ts
    - packages/retrieval/src/types.ts
    - packages/retrieval/src/search-engine.ts
    - packages/retrieval/src/search-engine.test.ts
    - packages/indexer/src/pipeline.ts
    - packages/vector-store/src/interface.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/server.test.ts
    - packages/mcp-server/src/tools/search-codebase.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.ts
    - packages/mcp-server/src/tools/search-codebase-hybrid.test.ts
    - packages/mcp-server/src/tools/get-file.ts
    - packages/mcp-server/src/tools/get-dependencies.ts
decisions:
  - The phased plan is captured in the quick plan artifact and begins with reliability work before retrieval tuning
  - Reusable benchmark preflight evaluation lives in packages/benchmark
  - MCP server keeps a local preflight contract for now to avoid introducing a new package wiring dependency in this increment
  - Retrieval tools fall back to the best available indexed evidence and include a note when expansion, hybrid search, or direct file lookup is unavailable
  - The original plan named packages/core for retrieval changes, but the actual executable retrieval/indexing work lives in packages/retrieval and packages/indexer; planning artifacts were updated to match repo structure
  - Shared query/anchor helpers were added to packages/core as the canonical reference, while runtime consumers in retrieval and mcp-server use local helpers in this checkpoint to avoid workspace build-order issues during package-isolated tests
metrics:
  completed: 2026-04-24
  tasks: 6
  files: 21
---

# Quick Task 260424: RAG Benchmark Reliability Summary

**One-liner:** Added phased RAG improvement planning, benchmark preflight reporting, and indexed-evidence fallback for MCP retrieval tools.

## What Was Done

### Task 1: Add benchmark preflight evaluation primitives

- Added benchmark preflight types for tool probes, requirements, capabilities, and readiness reports
- Added `evaluateBenchmarkPreflight()` and default benchmark-critical tool requirements in `packages/benchmark`
- Covered ready, fallback, blocked, and optional-tool scenarios with tests

### Task 2: Expose MCP benchmark preflight tool

- Added `benchmark_preflight` in `packages/mcp-server`
- The tool probes `search_codebase`, `search_codebase_hybrid`, and `get_file`
- Output includes a summary plus per-tool ready/fallback/blocked state for benchmark gating

### Task 3: Add indexed-evidence fallback to retrieval tools

- `search_codebase` now falls back from expansion search to plain indexed semantic search
- `search_codebase_hybrid` now falls back to semantic search when hybrid retrieval is unavailable
- `get_file` and `get_dependencies` now fall back to indexed search evidence when direct file retrieval fails
- All fallback outputs include an explicit note so callers know they received degraded evidence rather than a silent success

### Task 4: Add symbol-aware hybrid reranking and richer anchors

- Added shared query-analysis and anchor helpers in `packages/core`
- Added retrieval-side symbol/package/module-aware reranking for exact identifiers, entry points, architecture, and data-flow queries
- Added indexed metadata fields for module path, package name, and layer hints
- MCP search and file responses now include first-class anchors plus module/package/layer context

### Task 5: Add response-quality guardrails

- MCP search, hybrid search, file, and dependency tools now emit a direct `Conclusion:` line instead of procedural-only output
- No-result responses now explicitly state insufficient evidence while still returning highest-confidence findings gathered so far

### Task 6: Add module-aware retrieval metadata and expansion bias

- Indexer now persists module path, package name, and architectural layer hints into vector payloads
- Retrieval expansion now biases same-module neighbors for architecture and request-to-database style questions
- This is a partial Phase 4 completion; deeper chunking changes and graph templates still remain

## Verification

- `pnpm --filter @ia-framework/benchmark test -- --run`
- `pnpm --filter @ia-framework/core test -- --run`
- `pnpm --filter @ia-framework/retrieval test -- --run`
- `pnpm --filter @ia-framework/indexer test -- --run`
- `pnpm --filter @ia-framework/mcp-server test -- --run`

## Remaining Phases

1. Extend module-aware chunking beyond metadata inference into chunking-strategy decisions and query templates for controller -> service -> repository/model flows
2. Wire the richer structured anchors into any downstream benchmark/reporting consumers that still rely on plain text parsing only
3. Re-run the benchmark corpus with the completed `.opencode` preflight wiring and compare converted failure prompts against the baseline
