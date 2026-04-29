# Phase 23: Zero-result Fallback Search Strategy - Context

**Gathered:** 2026-04-24
**Updated:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

When `search_codebase` or `search_codebase_hybrid` returns 0 results, the search engine automatically retries with progressively broader strategies (hybrid BM25+semantic, then BM25 keyword-only), surfacing a structured "not found" response with closest-match suggestions. The LLM receives actionable context instead of silence.

Package: packages/retrieval (engine layer), packages/mcp-server (tool layer consumes)

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark run 2026-04-24)

When `search_codebase` returns no results (e.g. for non-existent classes like `CryptoPaymentAdapter`), the MCP server returns an empty result set and the LLM gives a terse answer. The benchmark judge penalized brevity even when the answer was factually correct ("this class doesn't exist"). Score: 7/25 for the correct answer vs 11/25 for a fully hallucinated response.

### Expected Impact

Prevents judge penalty for correct "not found" answers. Improves Actionability scores by +2 to +3 on negative/edge-case queries.

### Design Decisions

- **D-01:** Fallback sequence for semantic search: semantic (0 results) → hybrid BM25+semantic → if still 0, BM25 keyword-only for top-3 nearest suggestions.
- **D-02:** Response envelope shape when no results found:
  ```json
  {
    "found": false,
    "fallback_used": true,
    "fallback_mode": "hybrid" | "keyword",
    "suggestions": [{ "file": "...", "name": "...", "snippet": "..." }],
    "message": "No exact match found. Closest related code:"
  }
  ```
- **D-03:** `fallback_used: true` flag allows the LLM to adjust its phrasing ("I couldn't find an exact match, but the closest related code is...").
- **D-04:** Suggestions capped at 3 entries to avoid context bloat.
- **D-05:** Fallback is transparent to the caller — same MCP tool, same input, richer output on empty result.
- **D-06:** Fallback behavior can be disabled via MCP tool param `fallback: false` (default: true) for cases where callers want raw empty results.
- **D-07:** Fallback steps ignore user-supplied `score_threshold`. Each fallback step uses mode-appropriate defaults (0.0 for hybrid, 0.0 for BM25). The user threshold only gates the primary search.
- **D-08:** Fallback orchestration lives in the engine layer — add `searchWithFallback()` method to `SearchEngine` in `packages/retrieval`. Reusable by MCP tools, dashboard, and benchmarks. MCP tools call this instead of orchestrating retries themselves.
- **D-09:** Add `searchKeyword()` to the vector store interface for BM25-only (sparse-only) retrieval. This enables the third fallback step. Requires a Qdrant sparse-only query.
- **D-10:** Hybrid tool also gets fallback: `searchHybrid()` (0 results) → `searchKeyword()` (BM25-only, limit 3) for suggestions. Same structured envelope.
- **D-11:** Suggestion entries do NOT include numeric scores — scores are meaningless cross-mode and the LLM doesn't use them. Only `file`, `name`, `snippet` fields.
- **D-12:** Fallback triggers after threshold filtering — any time the final result set is empty (post-filtering), fallback activates. This covers both "Qdrant returned nothing" and "results existed but all below threshold."

### Agent's Discretion

- Internal implementation of `searchKeyword()` in the Qdrant vector store adapter
- Whether to add fallback telemetry to the metrics store (optional, but valuable)
- Exact error handling if `searchKeyword()` itself fails (graceful degrade to empty envelope)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP search tools

- `packages/mcp-server/src/tools/search-codebase.ts` — Calls `searchWithFallback()` from engine
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` — Calls engine with hybrid fallback
- `packages/retrieval/src/search-engine.ts` — Home of `searchWithFallback()` orchestration

### Vector store interface

- `packages/retrieval/src/types.ts` — `SearchEngineConfig`, `RetrievalResult`, vector store interface (add `searchKeyword()` here)

### Response shaping

- `packages/mcp-server/src/tools/` — All tools for response shape conventions
- Existing `structuredContent.answered` field is the hook point

### Prior phase decisions

- Phase 15 CONTEXT: Multi-collection engine interfaces (duck-typed Engine/HybridEngine)
- Phase 19 CONTEXT: Mode-aware score threshold defaults (dense=0.3, hybrid=0.0)

### Benchmark corpus (negative queries)

- `.ia-framework/benchmark-queries.json` — Negative/edge-case queries that test non-existent entity lookup

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `searchHybrid()` in `SearchEngine`: Already implemented — used as second fallback step
- `structuredContent.answered: false`: Already set on zero results — clean hook for fallback trigger
- MCP tool response pattern: All tools return structured JSON objects; extend with `found`/`fallback_used`/`fallback_mode` fields
- Infrastructure error fallbacks already exist (expansion→plain, hybrid→semantic) — same pattern, different trigger

### Integration Points

- `SearchEngine`: Add `searchWithFallback()` that orchestrates the retry sequence
- Vector store interface: Add `searchKeyword()` for sparse-only queries
- `search-codebase.ts`: Replace `engine.searchWithExpansion()` call with `engine.searchWithFallback()` (or wrap it)
- `search-codebase-hybrid.ts`: Add fallback to BM25-only on zero results
- Unit tests: Mock vector store to return `[]`, verify fallback triggers, correct envelope shape, threshold ignored in fallback

### Current Zero-Result Behavior (to be replaced)

- `search-codebase.ts` L63-72: Returns `{ answered: false }` with text "No results found"
- `search-codebase-hybrid.ts` L69-86: Same pattern
- No cross-tool retry, no suggestions, no structured envelope

</code_context>

<specifics>
## Specific Ideas

- Log fallback activations to `MetricsStore` as a new event type `rag_fallback` — lets the dashboard track how often fallback fires, which indicates query/index quality issues worth investigating.
- `searchWithFallback()` should accept an options object: `{ enableFallback: boolean, maxSuggestions: number }` to support the `fallback: false` MCP param.

</specifics>

<deferred>
## Deferred Ideas

- Spell-correction / fuzzy entity name matching (deferred; BM25 keyword proximity is sufficient for v1.3)
- Streaming "did you mean?" suggestions (deferred; MCP stdio transport doesn't support streaming yet)
- Score normalization across modes (deferred; dropped scores from suggestions makes this moot for now)
- Query reformulation / term relaxation (deferred; BM25 keyword fallback covers the main case)

</deferred>

---

_Phase: 23-zero-result-fallback-search_
_Context gathered: 2026-04-24_
_Context updated: 2026-04-28_
_Source: 2026-04-24 benchmark run findings + 2026-04-28 discussion session_
