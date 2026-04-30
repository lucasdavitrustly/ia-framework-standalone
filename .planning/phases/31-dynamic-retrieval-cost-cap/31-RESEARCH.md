# Phase 31: Dynamic Retrieval Cost Cap - Research

**Date:** 2026-04-30
**Status:** Complete

## Summary

Token budget capping for the retrieval pipeline. No new libraries needed — pure internal logic using existing patterns.

## Architecture Analysis

### Current Pipeline Order

Both `searchCodebaseHandler` and `searchCodebaseHybridHandler` follow this flow:

```
1. searchWithExpansion() or searchHybrid() → raw results
2. expandHierarchy() (for search_codebase only) → additional hierarchy results
3. buildSearchResponse() → format + return
```

**Token cap insertion point:** After step 2 (all results gathered, ranked by search engine), before step 3 (formatting). This is where trimming makes sense — we have the final ranked list and can remove lowest-ranked items.

### Key Insight: No Central "Search Engine" Class

There is no `SearchEngine` class in `packages/mcp-server`. The search logic lives directly in the tool handler functions (`searchCodebaseHandler`, `searchCodebaseHybridHandler`). The `Engine` type is just an interface to whatever retrieval backend is injected.

This means the token cap logic should be a **utility function** that both handlers call on their results array before passing to `buildSearchResponse()`.

### Config Integration

`RetrievalConfigSchema` in `packages/core/src/config/schema.ts` already has `expansionHops` and `autoContextTopK`. Adding `maxTokensPerCall` follows the exact same pattern. The config is loaded via `loadConfig()` and passed to the MCP server at startup.

The `ObservabilityConfig` in `search-codebase.ts` already carries `defaultExpansionHops` from config → same pattern for `maxTokensPerCall`.

### expand_hops Budget Sharing (D-06)

The `searchCodebaseHandler` does expansion in two stages:

1. `searchWithExpansion()` → returns direct + neighbor results (phase 27)
2. `expandHierarchy()` → appends hierarchy results

For D-06 (70/30 budget split), we need to distinguish "direct" from "expanded" results. Currently `searchWithExpansion` returns them merged. However, the results from `expandHierarchy` are tagged with `expansionSource: 'hierarchy'`. The phase 27 expansion results don't have a distinguishing tag in the current code.

**Approach:** Tag-based split isn't reliable. Instead, apply the cap in two passes:

1. First, apply 70% budget to the results from `searchWithExpansion` (which already includes neighbor expansion)
2. Then, apply remaining 30% budget to `expandHierarchy` results

This is practical because `expandHierarchy` results are separate in the code flow.

For `search-codebase-hybrid.ts`, there's no separate hierarchy expansion — just `searchWithExpansion`. The 70/30 split doesn't apply here (no separate expansion step). Apply the full cap to all results.

## Token Estimation

`Math.ceil(content.length / 4)` — simple, no external dependency. The `content` field is always a string on `RetrievalResult`. Accurate enough for budgeting (real tokenizers give ~10% different results, but for a soft cap this is fine).

## Implementation Plan

1. **Token cap utility** (`packages/mcp-server/src/tools/token-cap.ts`): Pure function `applyTokenCap(results, maxTokens)` → trimmed results + metadata
2. **Config schema extension** (`packages/core/src/config/schema.ts`): Add `maxTokensPerCall` to `RetrievalConfigSchema`
3. **Wire into handlers**: Call `applyTokenCap()` in both handlers before `buildSearchResponse()`
4. **Response metadata**: Extend `structuredContent` with `token_cap_applied` and `results_trimmed`

## Validation Architecture

### Test Strategy

- Unit test for `applyTokenCap()`: deterministic inputs → verify trim count and metadata
- Integration: mock engine returning large result sets, verify cap applied
- Benchmark validation: re-run architecture queries, verify token count ≤ baseline

### Key Assertions

- 10 chunks × 800 chars (200 tokens each) with cap=1500 → 7 returned, metadata shows trimmed=3
- Cap=0 edge case → at least 1 result returned
- Single result exceeding cap → still returned (minimum 1 guarantee)
