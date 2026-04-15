# Phase 15: Multi-Collection Search & MCP Integration - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

MCP search tools (`search_codebase`, `search_codebase_hybrid`) seamlessly query both AST and LLM Qdrant collections for a project, merge results via Reciprocal Rank Fusion (RRF), and tag each result with its source strategy (`ast` or `llm`). Single-collection projects work unchanged — no LLM collection means AST-only results with no errors. No dashboard changes, no CLI changes, no new MCP tools — this phase is purely search engine and MCP wiring.

</domain>

<decisions>
## Design Decisions & Open Questions

### D-01: Multi-Collection Search Architecture

**Decision needed:** How to layer multi-collection search on top of the existing `SearchEngine`.

**Current state:** `SearchEngine` takes a single `vectorStore` (one Qdrant collection). The MCP server `bin.ts` creates one `QdrantVectorStore` pointing at the base collection name from config (`config.vectorStore.collectionName`). The LLM collection (`{project}-llm`) is only accessed at index time.

**Options:**

- **Option A: Wrap SearchEngine (Recommended).** Create a `MultiCollectionSearchEngine` class that holds multiple `{ name: 'ast' | 'llm', engine: SearchEngine }` pairs. For each search call, it queries all engines in parallel and merges via client-side RRF. Implements the same duck-typed interface the MCP tools expect (`Engine` type in `search-codebase.ts`, `HybridEngine` type in `search-codebase-hybrid.ts`). SearchEngine itself stays unchanged.

- **Option B: Extend SearchEngine.** Add a `vectorStores` array to `SearchEngineConfig`. This modifies the core class and complicates the single-collection case.

- **Option C: MCP-layer merging.** Have the MCP tool handlers create multiple engines and merge results themselves. This duplicates logic and violates separation of concerns.

**Recommendation:** Option A — wrapping keeps SearchEngine clean, is testable in isolation, and the duck-typed `Engine`/`HybridEngine` interfaces mean zero MCP tool code changes beyond wiring.

### D-02: Collection Discovery

**Decision needed:** How to discover which collections are active for a project at MCP server startup.

**Options:**

- **Option A: Convention-based with existence check (Recommended).** At startup, derive candidate collection names from the base config name (`{base}` for AST, `{base}-llm` for LLM). Use Qdrant's `collectionExists()` API to check which actually exist. Only create vector stores for existing collections. Simple, deterministic, no config changes needed.

- **Option B: List all collections via Qdrant API, filter by prefix.** Uses `getCollections()` to enumerate all. More flexible but over-engineered for two known suffixes.

- **Option C: Explicit config.** Add `activeCollections` to project.json. Requires manual config management, fragile.

**Recommendation:** Option A — convention + existence check. The naming convention is already established (Phase 14 D-06: `{base}` for AST, `{base}-llm` for LLM). Just check if each exists before wiring.

### D-03: Cross-Collection RRF Merging

**Decision needed:** RRF implementation approach for cross-collection result merging.

**Context:** Within a single collection, `searchHybrid()` already uses Qdrant server-side RRF to merge text+code+sparse vectors. Cross-collection merging must happen client-side since Qdrant cannot query across collections.

**Approach:**

- RRF formula: `score(d) = SUM(1 / (k + rank_i(d)))` where `k=60` (standard constant)
- Each collection produces a ranked result list
- Each result gets an RRF score based on its rank position within its source collection
- If a result appears in only one collection's results (typical case since AST and LLM chunks have different boundaries/chunkIds), it still gets a valid RRF score from that single list
- Results are merged and re-ranked by RRF score

**Key insight:** AST and LLM chunks for the same file have different chunk boundaries and different chunkIds. They are independent results, not duplicates. RRF naturally handles this — it's designed for merging results from heterogeneous retrieval systems.

**For `search()` (semantic only):** Each collection's SearchEngine.search() returns results ranked by max-score merge of text+code vectors. RRF merges these rank lists.

**For `searchHybrid()`:** Each collection's SearchEngine.searchHybrid() returns results already RRF-fused (text+code+sparse) by Qdrant. The cross-collection merge applies RRF a second time on these pre-fused rank lists. This "RRF of RRF" is mathematically sound — it's rank-based, so nesting doesn't distort scores.

**For `searchWithExpansion()`:** Run the base multi-collection search, then expand from the merged results' file paths using the single shared dependency graph. Expansion chunks get score=0 as before.

### D-04: Source Tagging on Results

**Decision needed:** How to tag each result with its source collection.

**Approach:**

- Add an optional `source?: 'ast' | 'llm'` field to `RetrievalResult`
- The `MultiCollectionSearchEngine` sets this field based on which named collection produced the result
- MCP tools include the source tag in formatted output (e.g., `[ast]` or `[llm]` in the result header)
- Optional field ensures backward compatibility — single-collection SearchEngine results have `source` undefined

### D-05: Backward Compatibility (RETR-11)

**Constraint:** Projects with only an AST collection (no LLM indexing) must work identically to today.

**Approach:**

- At MCP server startup, if only the AST collection exists, the `MultiCollectionSearchEngine` wraps a single engine — functionally equivalent to today's behavior
- If no collections exist at all, fail gracefully with an informative error
- The `source` tag defaults to `'ast'` for the base collection, so existing results gain a tag but no other behavioral change
- The `MultiCollectionSearchEngine` with a single collection should produce identical results to the bare `SearchEngine` (no RRF needed for a single list — just pass through)

### D-06: get_file and get_dependencies Across Collections

**Decision needed:** Should `get_file` and `get_dependencies` query multiple collections?

**Analysis:**

- `get_file` retrieves all chunks for a specific file. AST and LLM produce different chunks for the same file. Returning both gives a more complete picture.
- `get_dependencies` extracts import/export relationships. LLM chunks have empty imports/exports (Phase 14 D-02). So only AST chunks contribute dependency data.

**Recommendation:**

- `get_file`: Query all collections, combine results with source tagging. User gets AST-boundary chunks AND LLM-boundary chunks for the same file.
- `get_dependencies`: Query AST collection only (LLM chunks have no dependency data). No change needed.

### D-07: Over-Fetching for RRF Quality

**Decision needed:** How many results to request from each collection before RRF merge.

**Approach:** Request `limit * 2` from each collection (matching current over-fetch pattern in `SearchEngine.search()` which uses `limit * 2` for dedup headroom). After RRF merge, truncate to the requested `limit`.

### D-08: Embedding Provider Sharing

**Observation:** Both AST and LLM collections use the same embedding model and dimensions (same `embeddingProvider`). The query embedding only needs to happen once, and the same vector is sent to both collections. This is already the case since `SearchEngine.search()` embeds once.

The `MultiCollectionSearchEngine` should embed the query once, then pass the vector to both underlying engines. However, since SearchEngine.search() embeds internally, we either:

- Let each engine re-embed (wastes one embedding call) — simple but wasteful
- Pre-embed and pass vectors down — requires SearchEngine API changes

**Recommendation:** Accept the double-embed for Phase 15 simplicity. The embedding is fast (~10ms for local Ollama) and adding a pre-embed path adds complexity. Can optimize in a future phase if needed.

**Alternative (better):** Add an internal `searchWithVector()` method to SearchEngine that accepts a pre-computed vector. The MultiCollectionSearchEngine embeds once and calls `searchWithVector()` on each sub-engine. This avoids redundant embedding without breaking the public API.

### D-09: MCP Tool Parameters — No Collection Selector

**Decision:** MCP tools in Phase 15 do NOT gain a collection selector parameter. They always query all active collections automatically. Per-collection selection is deferred to Phase 16 (Dashboard Search, DASH-08).

**Rationale:** The MCP tools are for AI agent consumption (OpenCode). The agent should always get the best merged results. Collection selection is a dashboard/developer debug concern.

### Agent's Discretion

- Exact `MultiCollectionSearchEngine` constructor signature and internal organization
- Whether `searchWithVector()` is a separate method or an overload
- RRF k parameter value (60 is standard, but could be configurable)
- Error handling when one collection is temporarily unavailable (fail entire search vs degrade gracefully)
- How to handle the `scoreThreshold` parameter in cross-collection context (apply per-collection before merge? after merge? RRF scores are in a different scale than cosine similarity)
- Exact `source` tag format in MCP output (e.g., `[ast]`, `[source:ast]`, `(ast)`)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Search Engine (modify target)

- `packages/retrieval/src/search-engine.ts` -- Current SearchEngine with search(), searchHybrid(), searchWithExpansion(), getFile(). Single vectorStore. Will be wrapped, not modified.
- `packages/retrieval/src/types.ts` -- RetrievalResult (needs `source` field), SearchEngineConfig, RetrievalQuery

### MCP Server (wiring changes)

- `packages/mcp-server/src/bin.ts` -- MCP server entry point. Creates ONE QdrantVectorStore and ONE SearchEngine. Must change to discover collections, create multiple stores, and wrap in MultiCollectionSearchEngine.
- `packages/mcp-server/src/server.ts` -- createMcpServer(). Takes `searchEngine: SearchEngine`. The duck-typed Engine/HybridEngine interfaces mean MultiCollectionSearchEngine can be passed here if it implements the same methods.
- `packages/mcp-server/src/tools/search-codebase.ts` -- search_codebase tool. Uses loose `Engine` type. formatResult() needs source tag rendering.
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` -- search_codebase_hybrid tool. Uses loose `HybridEngine` type.

### Vector Store (read for interface)

- `packages/vector-store/src/qdrant.ts` -- QdrantVectorStore class. `collectionExists()` check is in `initialize()` method (uses `this.client.collectionExists()`). Need direct access to Qdrant client for collection discovery, or add a static/helper method.
- `packages/vector-store/src/interface.ts` -- VectorStore interface, SearchResult, ChunkPayload, HybridSearchOptions

### Phase 14 Collection Routing (established convention)

- `packages/cli/src/commands/index.command.ts:228-231` -- Collection name routing: AST = `{base}`, LLM = `{base}-llm`. This convention is the contract for Phase 15 collection discovery.

### CLI Search (may need updates)

- `packages/cli/src/commands/search.command.ts` -- CLI `search` command creates its own SearchEngine with single vectorStore. Should also benefit from multi-collection search. Needs same wiring as MCP bin.ts.

### Requirements

- `.planning/REQUIREMENTS.md` RETR-08 -- MCP search tools query all active collections
- `.planning/REQUIREMENTS.md` RETR-09 -- Cross-collection results merged via RRF
- `.planning/REQUIREMENTS.md` RETR-10 -- Results tagged with source strategy
- `.planning/REQUIREMENTS.md` RETR-11 -- Single-collection backward compatibility

### Prior Phase Context

- `.planning/phases/14-llm-chunking-implementation-cli/14-CONTEXT.md` -- Phase 14 decisions, especially D-06 (collection naming), D-08 (independent operations per strategy)
- `.planning/phases/14-llm-chunking-implementation-cli/14-VERIFICATION.md` -- Phase 14 verification confirming RETR-07 (separate collections) is satisfied

</canonical_refs>

<code_context>

## Existing Code Insights

### Current Wiring (MCP bin.ts)

```
config → collectionName → QdrantVectorStore → SearchEngine → createMcpServer
```

Only the base collection name is used. The LLM collection is invisible to search.

### Target Wiring (Phase 15)

```
config → baseCollectionName
       → check existence: {base} (AST), {base}-llm (LLM)
       → QdrantVectorStore per existing collection
       → SearchEngine per collection
       → MultiCollectionSearchEngine wrapping all
       → createMcpServer (unchanged interface)
```

### Key Interfaces to Satisfy

MCP tools use duck-typed interfaces, not the `SearchEngine` class directly:

```typescript
// search-codebase.ts
type Engine = {
  search(query: { text: string; limit?: number; scoreThreshold?: number }): Promise<RetrievalResult[]>;
  searchWithExpansion(query: {...}, options?: { hops?: 0 | 1 | 2 }): Promise<RetrievalResult[]>;
};

// search-codebase-hybrid.ts
type HybridEngine = {
  searchHybrid(query: { text: string; limit?: number; filter?: ... }): Promise<RetrievalResult[]>;
};
```

`MultiCollectionSearchEngine` must implement both `Engine` and `HybridEngine` interfaces.

### Qdrant Client Collection Discovery

The `@qdrant/js-client-rest` `QdrantClient` has `collectionExists(name)` which returns `{ exists: boolean }`. The client also has `getCollections()` which returns a list of all collections. Either can be used for discovery.

Currently, `QdrantVectorStore` wraps the client but only exposes collection-specific methods. Collection-level discovery (listing/checking existence of OTHER collections) requires either:

- A new utility function that takes Qdrant connection config and checks existence
- Direct `QdrantClient` usage in `bin.ts` before creating vector stores
- A static method on `QdrantVectorStore`

### RetrievalResult Type Extension

```typescript
// packages/retrieval/src/types.ts — current
export interface RetrievalResult {
  chunkId: string;
  filePath: string;
  // ... existing fields ...
  score: number;
  matchedVector: 'text' | 'code' | 'both';
}

// Phase 15 addition:
export interface RetrievalResult {
  // ... existing fields ...
  score: number;
  matchedVector: 'text' | 'code' | 'both';
  /** Which collection/strategy produced this result */
  source?: 'ast' | 'llm' | undefined;
}
```

### RRF Implementation Reference

The codebase already uses RRF in two places:

1. **Qdrant server-side:** `searchHybrid()` in `qdrant.ts` uses `{ query: { fusion: 'rrf' } }` for text+code+sparse merge
2. **Client-side sparse vector:** `computeTermFrequencySparseVector()` in `search-engine.ts` prepares the BM25 input

Phase 15 adds a third RRF layer: client-side cross-collection merge. This is a standalone function that takes ranked lists and produces a merged ranked list.

```typescript
// Pseudocode for cross-collection RRF
function rrfMerge(
  lists: Array<{ source: 'ast' | 'llm'; results: RetrievalResult[] }>,
  k: number = 60,
  limit: number = 10,
): RetrievalResult[] {
  const scores = new Map<string, { result: RetrievalResult; rrfScore: number }>();

  for (const { source, results } of lists) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      const rrfContribution = 1 / (k + rank + 1); // rank is 0-indexed
      const key = result.chunkId;
      const existing = scores.get(key);
      if (existing) {
        existing.rrfScore += rrfContribution;
      } else {
        scores.set(key, {
          result: { ...result, source },
          rrfScore: rrfContribution,
        });
      }
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(({ result, rrfScore }) => ({ ...result, score: rrfScore }));
}
```

</code_context>

<specifics>

## Specific Considerations

### Score Semantics Change

**Important:** When multi-collection RRF is applied, the `score` field in `RetrievalResult` changes semantics:

- **Single collection (current):** Score is cosine similarity (0-1) or Qdrant RRF score (for hybrid)
- **Multi-collection RRF:** Score is the RRF fusion score (much smaller values, e.g., 0.016)

This affects:

- `scoreThreshold` parameter: Must be applied per-collection BEFORE RRF merge, not after (RRF scores are on a different scale)
- Display formatting: `.toFixed(2)` may need `.toFixed(3)` for RRF scores (already the case in hybrid tool)
- Benchmark comparisons: Scores from different search modes are not directly comparable (this is already true today with hybrid vs semantic)

### Dependencies on Phase 14

Phase 14 must be complete (confirmed ✅ as of 2026-04-14):

- [x] Collection naming convention: `{base}` for AST, `{base}-llm` for LLM (D-06)
- [x] Independent collection operations (D-08)
- [x] Same vector config for both collections (D-07)
- [x] CLI collection routing at index time (line 228-231)

### Benchmark Impact

Multi-collection search will affect benchmark scores since results now come from two sources. The benchmark runner (`packages/cli/src/commands/benchmark.command.ts`) creates its own SearchEngine — it would also need multi-collection wiring to benchmark the combined search accurately. However, this may be out of Phase 15 scope (benchmark updates could be Phase 18 work).

### Performance Consideration

Multi-collection search doubles the number of Qdrant queries per search call:

- `search()`: 2 vector searches per collection × 2 collections = 4 Qdrant queries (vs 2 today)
- `searchHybrid()`: 1 query API call per collection × 2 = 2 (vs 1 today)

All queries run in parallel (Promise.all), so latency impact is minimal — dominated by the slowest single query. Network RTT is negligible (localhost to Docker Qdrant).

</specifics>

<deferred>

## Deferred Ideas

- **Collection selector in MCP tools** — deferred to Phase 16 (DASH-08 requires it for dashboard search)
- **Benchmark multi-collection wiring** — deferred to Phase 18 (analytics) or separate plan
- **Pre-embed optimization** — if embedding overhead from double-embed is measurable, optimize with `searchWithVector()` in a future phase
- **Configurable RRF k parameter** — use standard k=60 for now, make configurable if tuning is needed
- **Strategy-weighted RRF** — allow giving higher weight to one collection's results (e.g., 1.5x weight for LLM results). Deferred until benchmark data shows whether LLM chunks are consistently higher quality.

</deferred>

## Requirements Summary

| Requirement | Description                                   | Implementation Approach                                                                               |
| ----------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| RETR-08     | MCP search tools query all active collections | MultiCollectionSearchEngine wraps multiple SearchEngines; MCP bin.ts discovers collections at startup |
| RETR-09     | Cross-collection RRF merging                  | Client-side RRF function merges ranked lists from each collection (k=60)                              |
| RETR-10     | Source strategy tagging                       | `source?: 'ast' \| 'llm'` field on RetrievalResult; set by MultiCollectionSearchEngine                |
| RETR-11     | Single-collection backward compatibility      | If only one collection exists, MultiCollectionSearchEngine passes through with no RRF overhead        |

## Estimated Plan Count

3 plans:

1. **Core RRF + MultiCollectionSearchEngine** — RRF merge function, MultiCollectionSearchEngine class with search/searchHybrid/searchWithExpansion/getFile (TDD)
2. **MCP + CLI wiring** — Collection discovery in bin.ts, source tag rendering in MCP output, CLI search command update
3. **Integration verification** — Build, typecheck, test, verify all 4 success criteria against running Qdrant

---

_Phase: 15-multi-collection-search-mcp-integration_
_Context gathered: 2026-04-14_
