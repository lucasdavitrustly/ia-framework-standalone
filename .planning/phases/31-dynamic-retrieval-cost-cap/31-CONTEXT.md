# Phase 31: Dynamic Retrieval Cost Cap - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a soft token budget cap and token-cost awareness to the retrieval pipeline in `packages/mcp-server`. Prevent over-retrieval on broad architecture queries from spiking context window usage. The benchmark observed that architecture queries went from 67k tokens (no MCP) to 71k tokens (with MCP) — a 6% increase despite MCP supposedly improving focus. The root cause is unconstrained `limit` and expand_hops retrieving too many chunks.

Package in scope: `packages/mcp-server` (retrieval layer and MCP tool handlers).

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark token analysis)

- `nonexistent-negative`: 66k tokens (no MCP) → 5.6k tokens (with MCP + caching). Excellent.
- Architecture queries: 67k tokens (no MCP) → 71k tokens (with MCP). Regressed — MCP added chunks without displacing hallucinated context.

The MCP tools currently have no upper bound on total tokens returned. The `limit` parameter controls chunk count but not chunk size × count = token budget. A query with `limit=10` on an LLM-chunked collection can return 10 × 800-token chunks = 8,000 tokens in one tool call.

### Token Estimation

- **D-01:** Estimate tokens for each chunk as `Math.ceil(content.length / 4)` (rough 4-chars-per-token heuristic). This is fast and requires no external call.
- **D-02:** The default soft cap is `MAX_RETRIEVAL_TOKENS = 6000` tokens total per search tool call. This is a soft cap: if the top-k results exceed the cap, trim from the bottom (lowest-ranked results removed first) until under the cap. At least 1 result is always returned even if it exceeds the cap alone.
- **D-03:** The cap is configurable via `.ia-framework/project.json` as `retrieval.maxTokensPerCall` (default: 6000). Allows per-project tuning.
- **D-04:** When trimming occurs, the tool response includes a metadata note: `"token_cap_applied": true, "results_trimmed": N` in the response envelope.
- **D-05:** The cap applies after MMR re-ranking (phase 28). MMR selects the most diverse top-k; the cap then trims the lowest-ranked survivors.

### expand_hops Budget Sharing

- **D-06:** When `expand_hops > 0` (phase 27), the token budget is shared between direct results and expanded neighbors. Direct results get 70% of the budget; neighbor expansion gets 30%. If direct results already exceed 70%, neighbors are suppressed.

### Agent's Discretion

- Exact default cap value (6000 is a starting point; tune against benchmark)
- Whether to expose `max_tokens` as a per-call parameter on MCP tools
- Whether to count system prompt tokens in the budget (likely no — only retrieved chunk tokens)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Search engine (primary target)

- `packages/mcp-server/src/search/search-engine.ts` — Results trimming goes here, after MMR re-ranking, before returning to the tool handler.

### MCP tool handlers

- `packages/mcp-server/src/tools/search_codebase.ts` — The `token_cap_applied` metadata note goes in the response envelope.
- `packages/mcp-server/src/tools/search_codebase_hybrid.ts` — Same.

### Config loader

- `packages/core/src/config/` — `retrieval.maxTokensPerCall` config field addition. Follow the existing Zod schema pattern.

### Phase 27 (expand_hops) — budget sharing

- Phase 27 CONTEXT (this milestone) — `expand_hops` neighbor results share the token budget at 70/30 split.

### Phase 28 (MMR) — ordering dependency

- Phase 28 CONTEXT (this milestone) — The cap applies after MMR. Implementation must ensure correct ordering: `retrieve → fuse → MMR → token cap → return`.

### Benchmark token data

- `.ia-framework/benchmark-reports/` — Run reports contain per-query token counts. Validation: after this fix, architecture query token usage must not exceed the baseline (no-MCP) token count.

</canonical_refs>

<code_context>

## Existing Code Insights

### Current search pipeline order

`SearchEngine.searchWithFallback()` → RRF fusion → return. MMR (phase 28) inserts before return. Token cap (this phase) inserts after MMR. The ordering must be enforced.

### Chunk content size distribution

From the tuning dashboard (ChunkInspector), LLM-strategy chunks average ~600-900 characters (~150-225 tokens). AST-strategy chunks average ~200-400 characters (~50-100 tokens). The 6000-token default cap at LLM-strategy = ~27-40 chunks before trimming, which is more than the typical `limit=10`. The cap primarily constrains expand_hops expansion where dozens of neighbor chunks could be appended.

### FallbackSearchResult envelope

Already has `fallbackUsed` and `keywordSuggestions`. The `token_cap_applied` and `results_trimmed` fields extend this envelope following the same pattern.

</code_context>

<specifics>
## Specific Ideas

- Log at INFO level when cap trims: `token cap: 12 results → 8 results (6200 → 5980 tokens)` using pino.
- Unit test: construct 10 chunks of 800 tokens each, call with cap=6000, verify exactly 7 are returned (7 × 857 ≈ 6000) and `token_cap_applied: true`.
- Consider exposing token count in the tool response metadata so the calling model can see how many tokens it consumed per search call.

</specifics>

<deferred>
## Deferred Ideas

- Cross-call token budget (track cumulative tokens across multiple tool calls in a session) — requires session state, deferred to v1.5
- LLM-based chunk compression when over budget — too expensive, deferred
- Dashboard chart of per-query token usage over time — nice-to-have, deferred

</deferred>

---

_Phase: 31-dynamic-retrieval-cost-cap_
_Context gathered: 2026-04-29_
_Source: Milestone planning — RAG Retrieval Quality Improvements v1.4_
