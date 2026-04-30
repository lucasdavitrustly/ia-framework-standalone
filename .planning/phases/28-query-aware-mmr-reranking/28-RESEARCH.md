# Phase 28: Query-Aware MMR Re-ranking - Research

**Date:** 2026-04-30
**Status:** Complete

## Summary

MMR (Maximal Marginal Relevance) is a well-established re-ranking algorithm from IR literature (Carbonell & Goldstein, 1998). Implementation is straightforward: iteratively select the candidate that maximizes `λ * sim(candidate, query) - (1-λ) * max(sim(candidate, already_selected))`.

## Key Findings

### 1. Algorithm Implementation

The MMR greedy selection algorithm:

```
Selected = []
While |Selected| < limit:
  best = argmax over remaining candidates:
    λ * relevance(candidate, query) - (1-λ) * max_sim(candidate, selected)
  Selected.append(best)
```

**Cosine similarity** between vectors: `dot(a, b) / (norm(a) * norm(b))`. Since Qdrant stores normalized vectors (cosine distance mode), dot product = cosine similarity.

### 2. Integration Point in This Codebase

The `SearchEngine` class is in `packages/retrieval/src/search-engine.ts`. It has:

- `search()` → returns merged text+code vector results, passed through `rerankResults()`, sliced to limit
- `searchHybrid()` → RRF fusion via Qdrant, then `rerankResults()`, then threshold filter
- `searchWithExpansion()` → calls `search()` then expands via dependency graph
- `searchWithFallback()` → tries search, then hybrid, then keyword fallback

**MMR insertion point:** After `rerankResults()` but before final `.slice(0, limit)`. The key change:

1. Fetch `limit * 3` candidates (over-fetch)
2. Apply existing `rerankResults()` (score-boosting for symbol/package matches)
3. Apply MMR to select diverse top-`limit` from the over-fetched set

**Note:** CONTEXT.md says `packages/mcp-server/src/retrieval/mmr.ts` but no such directory exists. The correct location is `packages/retrieval/src/mmr.ts` since the `SearchEngine` lives in `packages/retrieval/`.

### 3. Vector Access

Qdrant's search results already include the score but NOT the raw vector by default. To compute inter-chunk similarity for MMR, two options:

1. **Request vectors from Qdrant** — `with_vectors: true` in search params. This returns the dense vector for each result. Best accuracy but increases payload size.
2. **Content-based fallback** — Jaccard similarity on tokenized content. Fast but approximate.

The `VectorSearchResult` type currently has `id, score, vectorName, payload` — no `vector` field. We need to extend the vector store interface to optionally return vectors, OR pre-compute pairwise similarity differently.

**Recommended approach:** Since the query vector is already available (it's embedded in `search()`), use it for `relevance(candidate, query)` = the Qdrant score (already computed). For inter-candidate similarity, use content-based Jaccard as primary (avoids needing vector access for v1), with an option to use vectors later.

Actually, re-reading D-03: "MMR operates on embedding vectors... fall back to Jaccard". So the design wants vectors first, Jaccard fallback. We'll need to modify the vector store search to optionally return vectors.

### 4. Query-Type Classification for Lambda

Per D-02, lambda varies by query type:

- Architecture/synthesis queries (λ=0.5): "how", "architecture", "pattern", "overview", "communicate"
- Specific-lookup queries (λ=0.8): "where is", "find", "show me", "class", "method"

The existing `analyzeRetrievalQuery()` in `query-intelligence.ts` already detects `architectureQuery` and `dataFlowQuery`. We can extend this or create a parallel classifier for MMR lambda selection.

### 5. Config Integration

The `SearchEngineConfig` type in `types.ts` can be extended with:

```typescript
mmrEnabled?: boolean;   // default true
mmrLambda?: number;     // default override (normally query-type-aware)
mmrCandidateMultiplier?: number; // default 3
```

## Validation Architecture

### Test Strategy

- **Unit tests for MMR function:** Given known vectors/similarities, verify selection order
- **Integration test:** Run search with MMR on → verify results from ≥3 distinct files for architecture queries
- **Benchmark regression:** arch-semantic and synthesis-multi-hop queries must show diversity improvement

### Key Behaviors to Verify

1. MMR with λ=0.5 and 5 near-identical chunks + 2 diverse → diverse chunks appear in top results
2. MMR with λ=0.8 → relevance dominates, minimal reordering
3. MMR disabled → original behavior preserved (backward compatible)
4. Jaccard fallback when vectors unavailable → still provides diversity

## Risks & Mitigations

| Risk                                        | Mitigation                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Performance overhead of pairwise similarity | O(k\*n) where k=limit, n=candidates. With limit=10, candidates=30, this is 300 comparisons — negligible |
| Vector store interface change               | Keep it backward-compatible (optional `withVectors` param)                                              |
| Regression on specific-lookup queries       | λ=0.8 ensures relevance-first for these; benchmark validates                                            |

## Recommendations

1. Place MMR in `packages/retrieval/src/mmr.ts` as a pure function
2. Extend `VectorStore` interface to support `withVectors: true` option
3. Use Jaccard similarity as initial implementation (simpler), add vector-based in same PR
4. Extend `QueryIntent` or create `classifyQueryForMmr()` that returns lambda value
5. Apply MMR inside `SearchEngine.search()` and `SearchEngine.searchHybrid()` before returning
