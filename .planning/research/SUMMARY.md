# Project Research Summary

**Project:** ia-framework v1.1 — RAG Quality & Dashboard Evolution
**Domain:** AI-assisted development framework — local RAG pipeline enhancement
**Researched:** 2026-04-09
**Confidence:** HIGH

## Executive Summary

ia-framework v1.1 adds LLM-based semantic chunking via Ollama as an alternative to the existing AST-based chunking, parallel embedding for faster indexing, multi-collection Qdrant search so AST and LLM chunks coexist and get queried together, and a dashboard search UI with analytics for RAG quality visibility. The existing v1.0 stack (Node 22, TypeScript 5.9, pnpm, Turborepo, Qdrant, MCP SDK, Hono, React/Vite, Recharts, better-sqlite3) is validated and unchanged. Only two new dependencies are needed: `ollama` (^0.6.3) for LLM chat and `p-queue` (^9.1.2) for concurrency control. Everything else leverages existing libraries in new ways — Zod 4's built-in `toJSONSchema()`, Qdrant's multi-collection support, and Recharts' scatter/radar charts.

The recommended approach is a phased build starting with pipeline refactoring (Strategy Pattern extraction, parallel embedding), followed by a **gated LLM chunking spike** that validates Ollama performance, context window handling, and output quality before full implementation. Cross-collection search uses Reciprocal Rank Fusion (RRF) for fair score merging — raw score comparison is explicitly rejected because AST and LLM collections have incompatible score distributions. The dashboard evolves with search and analytics pages only after the search engine supports multi-collection queries.

The dominant risk is Ollama resource management: VRAM contention between chunking and embedding models, context window overflow on large files, and LLM non-determinism breaking incremental indexing. All four research files converge on the same conclusion — **the LLM chunking spike is the single most important validation gate in v1.1.** If chunking quality or latency proves unacceptable, the entire milestone plan must adapt. Mitigation strategies are well-documented: separate pipeline phases (chunk-all-then-embed-all), AST pre-splitting for large files, chunk result caching for determinism, and provider-aware concurrency limits.

## Key Findings

### Recommended Stack

v1.1 is remarkably lean on new dependencies. The entire milestone requires only two new npm packages. All other capabilities come from existing stack libraries used in new patterns. See [STACK.md](./STACK.md) for full details.

**New dependencies:**

- `ollama` (^0.6.3): LLM chat API for semantic chunk generation — structured JSON output via `format` param with Zod schemas
- `p-queue` (^9.1.2): Promise-based concurrency control for parallel embedding — rate limiting, priority, abort signals

**Existing stack, new usage:**

- `zod` (^4.3.6): Built-in `z.toJSONSchema()` for Ollama structured output — eliminates need for `zod-to-json-schema`
- `@qdrant/js-client-rest` (^1.17.0): Multi-collection instances, `searchBatch()` for A/B comparison
- `recharts` (^3.8.1): ScatterChart, RadarChart, ComposedChart for analytics visualizations
- `better-sqlite3` (^12.8.0): Extended schema for search history persistence

**Explicitly rejected:** LangChain/LlamaIndex (too heavy), worker threads (I/O-bound not CPU-bound), tanstack/react-query (over-engineering), new charting libs (Recharts covers all needs), React state management libs (React 19 built-ins suffice).

### Expected Features

See [FEATURES.md](./FEATURES.md) for detailed analysis, dependency graph, and competitor comparison.

**Must have (P1 — table stakes for v1.1):**

- LLM chunking pipeline: Ollama integration, single-pass boundary + summary detection, structured JSON output
- Multi-collection Qdrant storage: `{project}` (AST) and `{project}-llm` (LLM) collections
- MCP tools query both collections: parallel query, RRF merging, source strategy tagging on results
- CLI `--strategy ast|llm|both` flag for indexing
- Parallel embedding with configurable concurrency and progress reporting
- Dashboard search UI: query input, collection selector, results with scores and code previews

**Should have (P2 — differentiators, v1.1.x):**

- A/B side-by-side comparison view with scoring visualization
- Search history with persistence, replay, and comparison
- Per-query metrics panel (latency, chunks scanned, score distribution)

**Defer (P3/v1.2+):**

- Analytics trend charts (need accumulated time-series data)
- Strategy win rate tracking (need query volume for statistical significance)
- Token usage breakdown by strategy
- Cloud LLM chunking (explicitly deferred to v3 per PROJECT.md)

**Anti-features (explicitly NOT building):**

- Real-time re-chunking on file save (LLM chunking too slow)
- Custom prompt templates for chunking (support burden)
- Embedding model fine-tuning UI (massive scope)
- Graph database for code relationships (unnecessary complexity)

### Architecture Approach

v1.1 uses four established patterns to integrate cleanly with the existing system: Strategy Pattern for chunking (mirroring the existing `EmbeddingProvider` pattern), Composition for multi-collection search, Convention for collection naming, and additive-only interface changes for backward compatibility. The architecture avoids creating new abstractions where existing ones suffice — `QdrantVectorStore` is already parameterized on `collectionName`, so multi-collection requires zero code changes to the vector store layer. See [ARCHITECTURE.md](./ARCHITECTURE.md) for full component boundaries and data flows.

**Major new components:**

1. `ChunkingStrategy` interface + `AstChunkingStrategy` + `LlmChunkingStrategy` — in `packages/indexer`
2. `MultiCollectionSearchEngine` — wraps two `SearchEngine` instances, parallel query + RRF merge — in `packages/retrieval`
3. Dashboard search & analytics routes — new Hono routes in `packages/dashboard-api`
4. Dashboard Search page & Analytics page — new React pages in `apps/dashboard`

**Key architectural decisions:**

- Separate Qdrant collections (not payload filters) for AST vs LLM chunks — independent lifecycle, different vector distributions
- LLM chunking is opt-in (`--strategy llm`), default remains `ast` — backward compatible
- Dashboard search lazy-initializes embedding provider — no startup cost if unused
- MCP tools stay duck-typed — `MultiCollectionSearchEngine` implements the same shape, zero MCP handler changes
- All new config fields are optional with sensible defaults — v1.0 configs work unchanged

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for all 13 pitfalls with full prevention strategies and recovery plans.

1. **Ollama VRAM contention (#1)** — Chunking model and embedding model fight for GPU memory, causing model-swap thrashing. **Prevent:** Separate phases completely (chunk all files first, then embed all). Use `keep_alive: "0"` to release models between phases.

2. **LLM chunk non-determinism (#2)** — Same file produces different chunks each run, breaking incremental indexing and benchmark reproducibility. **Prevent:** Cache LLM chunk results keyed by file hash. Disable incremental for LLM collection. Pin `temperature: 0, seed: fixed`.

3. **Cross-collection score incomparability (#3)** — Raw cosine scores from AST and LLM collections aren't comparable, causing unfair result merging. **Prevent:** Use RRF (rank-based) for cross-collection merging, never raw score comparison. Apply score thresholds per-collection before merging.

4. **Context window overflow (#4)** — Files >300 lines exceed Ollama's context window, causing silent truncation or hallucinated boundaries. **Prevent:** AST pre-splitting for large files. Budget: system prompt (200 tokens) + file content must be ≤ 70% of `num_ctx`.

5. **Config schema breaking v1.0 (#9)** — Adding required config fields breaks existing deployments. **Prevent:** All new fields optional with defaults. Test with actual v1.0 `project.json` as automated test.

## Implications for Roadmap

Based on combined research, the following phase structure respects dependency ordering, isolates risk, and groups related work.

### Phase 1: Pipeline Refactoring & Parallel Embedding

**Rationale:** Every other v1.1 feature depends on the `ChunkingStrategy` interface existing and the pipeline supporting pluggable strategies. This is pure refactoring with zero behavior change — the safest possible starting point. Parallel embedding delivers immediate indexing speed improvement independent of LLM chunking.

**Delivers:**

- `ChunkingStrategy` interface extracted from `IndexingPipeline`
- `AstChunkingStrategy` wrapping existing `parseFile()` + `chunkToDescription()` — identical output, all tests pass
- `EnrichedChunk` type with optional `description` field
- Parallel embedding via `p-queue` with provider-aware concurrency defaults
- Progress event emission (`IndexingProgress` interface)
- Config schema extension (optional fields, backward compatible)

**Addresses features:** Parallel embedding + progress (P1), CLI concurrency flag
**Avoids pitfalls:** #6 (pipeline abstraction leak), #9 (config schema breakage), #12 (test suite breakage)

### Phase 2: LLM Chunking Spike (Validation Gate)

**Rationale:** This is the highest-risk item in v1.1. Before committing to full LLM chunking implementation, a time-boxed spike (2-3 days) must validate: Ollama structured output quality with the target model, chunking latency per file, context window handling for large files, and output determinism. If the spike fails, the milestone pivots to parallel embedding + dashboard improvements without LLM chunking.

**Delivers:**

- Standalone script testing Ollama `chat()` with structured JSON output
- Measured latency: tokens/sec, seconds/file for representative file sizes
- Validated context window approach: direct send vs AST pre-split threshold
- Determinism measurement: run same file 5x, measure output variance
- Model recommendation (qwen3:8b vs alternatives) with evidence
- Go/no-go decision for LLM chunking

**Addresses features:** LLM chunking feasibility validation
**Avoids pitfalls:** #1 (VRAM contention), #2 (non-determinism), #4 (context overflow), #10 (JSON parsing failures)

### Phase 3: LLM Chunking Implementation

**Rationale:** With the spike validated and the strategy interface in place, this phase implements the full `LlmChunkingStrategy`, adds the `--strategy` CLI flag, and creates the `-llm` collection. It ships the v1.1 headline feature.

**Delivers:**

- `LlmChunkingStrategy` implementation using Ollama SDK
- AST pre-splitting for files exceeding context window threshold
- Chunk result caching (file hash → LLM output) for determinism
- CLI `--strategy ast|llm|both` flag
- `{project}-llm` collection creation and population
- Fallback: AST chunking for files where LLM fails 3x

**Addresses features:** LLM chunking pipeline (P1), CLI strategy selection (P1), multi-collection storage (P1)
**Avoids pitfalls:** #1 (phase separation), #2 (caching), #4 (pre-splitting), #7 (model warm-up)

### Phase 4: Multi-Collection Search & MCP Integration

**Rationale:** With both collections populated, this phase enables searching across them. The MCP tools must query both collections — this is what makes LLM chunking actually useful to the AI client. RRF-based merging is the critical design decision here.

**Delivers:**

- `MultiCollectionSearchEngine` with parallel query and RRF merging
- `source: 'ast' | 'llm'` tagging on `RetrievalResult`
- Graceful degradation when only one collection exists
- MCP `search_codebase` and `search_codebase_hybrid` using `MultiCollectionSearchEngine`
- Per-collection score threshold application before merge
- Benchmark validation: merged MRR ≥ better individual collection MRR

**Addresses features:** MCP tools multi-collection query (P1)
**Avoids pitfalls:** #3 (RRF over raw scores), #5 (provider-aware concurrency in search embedding)

### Phase 5: Dashboard Search & Analytics

**Rationale:** The dashboard evolves last because it depends on the search engine and multi-collection infrastructure. Search UI validates that LLM chunks produce good results. Analytics surfaces the data developers need to decide between strategies.

**Delivers:**

- Dashboard API: `GET /api/search`, `GET /api/analytics/collections`
- Dashboard Search page: query input, collection selector, results with source badges and code previews
- Per-query metrics panel: latency, chunks scanned, score distribution
- Dashboard Analytics page: collection comparison, chunk distribution charts
- A/B side-by-side comparison view (if time permits — P2)
- Search history persistence with retention policy (P2)

**Addresses features:** Dashboard search UI (P1), per-query metrics (P2), A/B comparison (P2), search history (P2), analytics (P3)
**Avoids pitfalls:** #8 (lazy-init embedding provider), #11 (retention policy from start), #13 (collection metadata alongside A/B results)

### Phase Ordering Rationale

- **Phase 1 before everything:** ChunkingStrategy interface is a prerequisite for LLM chunking. Parallel embedding is independent but shares the refactoring. Getting the abstraction right first prevents pitfall #6 (pipeline abstraction leak).
- **Phase 2 gates Phase 3:** The spike validates feasibility before investing in full implementation. If the spike reveals deal-breakers (unacceptable latency, terrible output quality), Phases 3-5 can be scoped down to parallel-embedding-only + dashboard improvements.
- **Phase 3 before Phase 4:** Multi-collection search requires collections to exist. LLM chunking creates the second collection.
- **Phase 4 before Phase 5:** Dashboard search routes need the `MultiCollectionSearchEngine` to function. Building UI before the API exists leads to throwaway mocks.
- **P2 features (A/B, search history) fold into Phase 5** as incremental additions once basic search works.

### Research Flags

**Phases needing deeper research during planning:**

- **Phase 2 (LLM Chunking Spike):** This IS the research phase. Budget 2-3 days. Key unknowns: optimal model choice, prompt engineering across languages, context window thresholds, determinism bounds.
- **Phase 4 (Multi-Collection Search):** RRF parameter tuning (k value) needs experimentation. Score distribution analysis between AST and LLM collections needed to validate merging fairness.

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Pipeline Refactoring):** Strategy Pattern is well-documented. p-queue has excellent docs. Pure refactoring — no unknowns.
- **Phase 3 (LLM Chunking Implementation):** By this point, the spike has resolved all unknowns. Implementation follows the validated approach.
- **Phase 5 (Dashboard):** Hono routes + React pages + Recharts charts. All well-documented, existing patterns in the codebase.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                             |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | **HIGH**   | Only 2 new deps, both verified via Context7 with HIGH reputation sources. Existing stack unchanged.                                               |
| Features     | **HIGH**   | Clear P1/P2/P3 prioritization. Feature dependencies well-mapped. Competitor analysis confirms all features are differentiators.                   |
| Architecture | **HIGH**   | All patterns verified against existing codebase. Integration points identified via source analysis. Build order respects real dependency graph.   |
| Pitfalls     | **HIGH**   | All pitfalls sourced from official Ollama/Qdrant docs (Context7) + existing codebase analysis. Prevention strategies are concrete and actionable. |

**Overall confidence:** **HIGH** — Research is thorough, sources are authoritative, and recommendations are strongly aligned across all four documents.

### Gaps to Address

- **LLM chunking prompt quality across languages:** Research assumes a universal prompt works for TypeScript, Python, Go, etc. The spike (Phase 2) must test against 3+ languages. Budget 2-3 days for prompt iteration.
- **RRF k-parameter tuning:** The standard k=60 may not be optimal for AST vs LLM score distributions. Needs experimentation with real dual-collection data in Phase 4.
- **Ollama VRAM requirements per model combination:** Research documents the risk but doesn't prescribe minimum VRAM for specific model pairs (e.g., qwen3:8b + nomic-embed-text). Needs measurement during the spike.
- **LLM chunking cost on very large codebases (>10K files):** Estimated at 2M-7M tokens but real-world measurement needed. Could reveal a practical ceiling for LLM chunking.
- **Dashboard search embedding provider initialization:** Research identifies the architectural concession (dashboard needs embedding provider) but doesn't finalize whether to lazy-load or pre-load. Decision during Phase 5 implementation.

## Sources

### Primary (HIGH confidence)

- Context7 `/ollama/ollama-js` (92 snippets) — chat API, structured output, format parameter, model management
- Context7 `/qdrant/qdrant-js` (98 snippets) — multi-collection, searchBatch, collection CRUD
- Context7 `/sindresorhus/p-queue` (135 snippets) — concurrency, rate limiting, interval caps, abort signals
- Context7 `/websites/zod_dev_v4` (1544 snippets) — `z.toJSONSchema()` built-in function
- Context7 `/recharts/recharts` (94 snippets) — ScatterChart, RadarChart, ComposedChart, custom Tooltip
- Context7 `/modelcontextprotocol/typescript-sdk` — duck-typed tool handlers, MCP server patterns
- Context7 `/websites/hono_dev` (757 snippets) — route composition, WebSocket, Node.js adapter
- Ollama FAQ (docs.ollama.com/faq) — concurrent requests, VRAM allocation, model loading
- Qdrant hybrid queries (qdrant.tech/documentation/concepts/hybrid-queries) — RRF, DBSF, cross-vector fusion

### Secondary (MEDIUM confidence)

- npm registry version checks — ollama@0.6.3, p-queue@9.1.2, zod@4.3.6 compatibility
- Existing codebase source analysis — pipeline.ts, search-engine.ts, qdrant.ts, ollama.ts, app.ts

### Tertiary (LOW confidence)

- LLM chunking latency estimates (1-5s/chunk) — based on general Ollama benchmarks, not measured on target hardware
- VRAM co-residency feasibility for model pairs — needs empirical validation during spike

---

_Research completed: 2026-04-09_
_Ready for roadmap: yes_
