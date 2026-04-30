# Phase 29: Negative-Result Citation Strategy - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

When the MCP search tools return zero results (or the model determines a queried entity does not exist in the codebase), the tool response should surface the actual communication mechanisms or related entities that ARE present rather than a bare "no results" response. This is a targeted improvement to the `search_codebase` and `search_codebase_hybrid` tool response format in `packages/mcp-server`.

Package in scope: `packages/mcp-server` (tool response format, specifically the empty-result and fallback envelope).

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark results)

The `nonexistent-negative` prompt asked about a feature that doesn't exist (e.g., WebSocket communication). The model correctly identified it as absent but scored low on Code References (+1 pt improvement potential) because the tool response returned an empty results array with no context about what communication mechanisms ARE present (RabbitMQ, SFTP, JMS). The judge noted: "correct negation but no pointers to what exists."

### Enhancement to `FallbackSearchResult`

- **D-01:** When the keyword fallback (BM25) also returns zero results, perform a broad "related concepts" search using a set of domain-adjacent terms extracted from the original query. E.g., for "WebSocket" → try "message", "queue", "event", "publish", "subscribe", "channel", "broker" as fallback terms.
- **D-02:** The `FallbackSearchResult` envelope already has `keywordSuggestions: string[]`. Extend it with a `relatedResults` field containing up to 3 chunks from the broad fallback search.
- **D-03:** Related term expansion is a hardcoded map of common architectural concept synonyms: `{ websocket: ["message", "queue", "event", "broker"], rest: ["http", "controller", "endpoint", "handler"], graphql: ["query", "resolver", "schema"], ... }`. Keep it small and focused on the benchmark's domain (Spring Boot / enterprise Java).
- **D-04:** The `relatedResults` field is only populated when the primary + keyword fallback both return zero results. When primary search succeeds, `relatedResults` is absent (no overhead).
- **D-05:** Tool response format update: when `relatedResults` is populated, prepend a note to the response text: `"No results for '{query}'. Related communication mechanisms found:"` followed by the chunk summaries.

### Agent's Discretion

- Exact synonym map contents (start small, expand based on benchmark feedback)
- Whether to expose `related_search_enabled` as a config flag
- Format of the related results in the tool response text (inline vs structured list)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fallback search (primary target)

- `packages/mcp-server/src/search/search-engine.ts` — `searchWithFallback()` method and `FallbackSearchResult` type. The `relatedResults` extension goes here.

### MCP tool handlers

- `packages/mcp-server/src/tools/search_codebase.ts` — Formats the `FallbackSearchResult` envelope for the model. The "no results + related" message goes in the text response.
- `packages/mcp-server/src/tools/search_codebase_hybrid.ts` — Same pattern.

### Benchmark corpus

- `.ia-framework/benchmark-queries.json` — `nonexistent-negative` entry is the validation target. After this fix, the model should receive 2-3 chunks about RabbitMQ/SFTP/JMS when querying for the non-existent WebSocket feature.

### Hallucination penalty (phase 26)

- `.opencode/agents/benchmark-judge.md` — The judge now penalizes hallucination. Related results MUST only include chunks that actually exist in the index — no synthetic or inferred content.

</canonical_refs>

<code_context>

## Existing Code Insights

### FallbackSearchResult already defined

Phase 24/25 (searchWithFallback) introduced `FallbackSearchResult` with `results`, `fallbackUsed`, and `keywordSuggestions`. The `relatedResults` field is a natural extension of this envelope.

### Zero-result path

The current zero-result path returns `{ results: [], fallbackUsed: 'keyword', keywordSuggestions: ['foo', 'bar'] }`. The tool handler converts this to a text message like "No results found. Try: foo, bar." The new path adds a second attempt before giving up.

### Benchmark corpus context

The `nonexistent-negative` prompt specifically queries a Spring Boot codebase for WebSocket-like communication. The codebase has RabbitMQ (`@RabbitListener`, `RabbitTemplate`), SFTP (`SftpOutboundGateway`), and JMS (`@JmsListener`). These are the entities the model should cite.

</code_context>

<specifics>
## Specific Ideas

- Synonym map initial set (covers Spring Boot enterprise patterns):
  ```
  websocket → message, queue, event, broker, listener, publish
  grpc → protobuf, stub, channel, service, rpc
  rest_api → controller, endpoint, handler, mapping, RequestMapping
  cache → redis, caffeine, evict, CacheEvict, Cacheable
  ```
- Keep the synonym map in a JSON config file (`.ia-framework/search-synonyms.json`) so developers can extend it without code changes.
- Unit test: given a mock SearchEngine that returns empty for "websocket" but returns 2 results for "message", verify that `searchWithFallback("websocket")` returns `relatedResults` with those 2 chunks.

</specifics>

<deferred>
## Deferred Ideas

- LLM-based query expansion (ask the model to suggest related terms) — too slow/expensive for per-query use
- Learning synonym map from benchmark negative runs — deferred to v1.5
- Dashboard view of negative-query fallback rates — deferred

</deferred>

---

_Phase: 29-negative-result-citation_
_Context gathered: 2026-04-29_
_Source: Milestone planning — RAG Retrieval Quality Improvements v1.4_
