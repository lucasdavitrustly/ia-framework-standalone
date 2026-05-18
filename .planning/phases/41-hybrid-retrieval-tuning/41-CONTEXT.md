---
phase: 41
name: hybrid-retrieval-tuning
status: context-gathered
decisions:
  - id: HRT-D01
    title: Configurable prefetch multipliers per vector branch
    decision: Add `keywordPrefetchMultiplier` and `semanticPrefetchMultiplier` to config, controlling how many candidates each Qdrant prefetch branch retrieves relative to the requested limit. Higher keyword multiplier = keyword results rank higher in RRF output.
    rationale: Qdrant's built-in RRF gives equal weight to all branches. The only way to bias results toward keyword or semantic without moving to client-side fusion is to adjust how many candidates each branch contributes. This is a well-known technique in IR literature.
  - id: HRT-D02
    title: Expose rrfK and rrfScoreThreshold in project.json schema
    decision: Wire existing SearchEngineConfig fields (defaultRrfScoreThreshold, mmrLambda) and add new rrfK to the ProjectConfigSchema so they are tunable via project.json.
    rationale: These already exist in the runtime config type but have no schema representation, meaning users can't configure them without code changes.
  - id: HRT-D03
    title: Pass multipliers through to QdrantVectorStore.searchHybrid()
    decision: Extend the searchHybrid options interface to accept optional `keywordPrefetchMultiplier` and `semanticPrefetchMultiplier`, defaulting to 3 (current behavior). SearchEngine passes config values through.
    rationale: Clean layered approach — config → SearchEngine → VectorStore. No breaking changes since fields are optional with same defaults.
  - id: HRT-D04
    title: Default multipliers preserve current behavior
    decision: keywordPrefetchMultiplier defaults to 3, semanticPrefetchMultiplier defaults to 3 (current hardcoded value). No behavior change unless explicitly configured.
    rationale: Non-breaking. Users opt in to tuning.
---

# Phase 41 Context: Hybrid Retrieval Tuning

## Current State

- Qdrant's `searchHybrid` uses 3 equal prefetch branches (text dense, code dense, sparse BM25), each with `limit * 3`
- Server-side RRF fusion (Qdrant) merges them with equal weight — no alpha/weight API
- Client-side has `defaultRrfScoreThreshold` (0.015) and `mmrLambda` but neither is in project.json schema
- `rrfMerge()` k=60 is a function default, not configurable
- Cross-file queries lost -1pt in benchmark — hybrid should help but needs tuning

## What This Phase Adds

1. Config schema fields: `rrfK`, `rrfScoreThreshold`, `keywordPrefetchMultiplier`, `semanticPrefetchMultiplier`
2. Wire config → SearchEngine → VectorStore searchHybrid
3. Qdrant uses per-branch prefetch limits based on multipliers
4. Tests proving different configs produce different rankings
