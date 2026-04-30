# Phase 28: Query-Aware MMR Re-ranking - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement Maximal Marginal Relevance (MMR) re-ranking in the retrieval pipeline (`packages/mcp-server`) to reduce redundant chunks in the top-k results returned to the model. Currently, semantic search can return multiple near-identical chunks from the same file or class, wasting context window space and reducing the diversity of information surfaced on architecture/synthesis queries.

Package in scope: `packages/mcp-server` (retrieval layer, specifically `SearchEngine` and search tool handlers).

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark results)

Architecture and synthesis queries (arch-semantic, synthesis-multi-hop) retrieved multiple high-similarity chunks from the same file, filling the context window with redundant information. Technical Depth and Completeness scores suffered because the model received 4 near-identical `OrderService` method chunks instead of 1 `OrderService` chunk + 1 `OrderRepository` chunk + 1 `OrderDTO` chunk.

### MMR Algorithm

- **D-01:** Implement MMR as a post-retrieval re-ranking step. Given top-k candidates from Qdrant, re-rank them to maximize: `λ · relevance(chunk, query) - (1-λ) · max_similarity(chunk, already_selected)`.
- **D-02:** `λ` (lambda) is query-type-aware: for architecture/synthesis queries λ=0.5 (strong diversity), for specific-lookup queries λ=0.8 (relevance-first). Query type is inferred from the presence of keywords like "how", "architecture", "pattern", "overview", "communicate" vs "where is", "find", "show me", "class", "method".
- **D-03:** MMR operates on embedding vectors. The existing search returns vectors in Qdrant results (via `with_vectors: true`). If vectors are not returned, fall back to string-based Jaccard similarity between chunk content.
- **D-04:** MMR is applied to the final merged result set from all retrieval modes (semantic + hybrid + fallback). It runs after RRF fusion, before returning results to the MCP tool handler.
- **D-05:** `mmr_enabled` config flag in the search config (default: `true`). Can be disabled for benchmarking comparisons.
- **D-06:** Final result count is the requested `limit`. MMR fetches `limit * 3` candidates from Qdrant and re-ranks down to `limit`.

### Integration Point

- **D-07:** MMR is implemented as a pure function `mmrRerank(candidates, query, λ, limit): RankedChunk[]` in `packages/mcp-server/src/retrieval/mmr.ts`. This keeps it testable in isolation.
- **D-08:** `SearchEngine.search()` calls `mmrRerank()` after all retrieval and fusion steps, before returning results.

### Agent's Discretion

- Exact λ threshold values and keyword detection heuristic
- Whether to expose λ as a per-call parameter on MCP tools
- Similarity metric for fallback when vectors are unavailable (Jaccard, cosine on TF-IDF, etc.)
- Whether to log MMR diversity gain (pre/post redundancy score) for debugging

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Search engine (primary target)

- `packages/mcp-server/src/search/search-engine.ts` — `SearchEngine` class with `searchWithFallback()` and RRF fusion. MMR re-ranking is the final step before returning results.

### MCP tool handlers

- `packages/mcp-server/src/tools/search_codebase.ts` — search_codebase tool handler. The `limit` parameter becomes the final count after MMR (pre-MMR fetch is `limit * 3`).
- `packages/mcp-server/src/tools/search_codebase_hybrid.ts` — same pattern.

### Benchmark regression prompts

- `.ia-framework/benchmark-queries.json` — `arch-semantic` and `synthesis-multi-hop` entries are the validation targets. After MMR, results for these queries must show chunks from at least 3 distinct files.

</canonical_refs>

<code_context>

## Existing Code Insights

### RRF fusion already in place

Phase 15 implemented Reciprocal Rank Fusion merging results from semantic + hybrid + BM25 keyword streams. MMR slots in after this fusion step: it receives the fused list as input, not individual stream results.

### Qdrant returns vectors optionally

Qdrant's JS client supports `with_vectors: true` in search requests. Enabling this allows cosine similarity between chunk vectors during MMR — the most accurate metric. If the collection uses named vectors (textVector + codeVector), both can be requested; use textVector for MMR similarity comparison.

### P0 fix context (phase 15)

The RRF score fix (0.3 threshold removed for rank-based scores) is production code. MMR must not reintroduce any score filtering that would discard low-ranked but diverse results.

</code_context>

<specifics>
## Specific Ideas

- Log a one-line summary per query: `MMR: 15 candidates → 5 results, diversity gain: 0.34` at DEBUG level using pino.
- Unit tests: verify that given 5 near-identical chunks and 2 diverse chunks, MMR selects the 2 diverse chunks in the top results at λ=0.5.
- Consider exposing `mmr_lambda` as an optional parameter on `search_codebase` / `search_codebase_hybrid` MCP tools so the caller (the model) can tune diversity vs relevance per query.

</specifics>

<deferred>
## Deferred Ideas

- Learned λ from benchmark feedback (adaptive λ tuned on MRR delta) — too complex for v1.4
- Cross-collection MMR (deduplication across multiple collections) — deferred
- Dashboard visualization of pre/post-MMR result sets — nice-to-have, deferred

</deferred>

---

_Phase: 28-query-aware-mmr-reranking_
_Context gathered: 2026-04-29_
_Source: Milestone planning — RAG Retrieval Quality Improvements v1.4_
