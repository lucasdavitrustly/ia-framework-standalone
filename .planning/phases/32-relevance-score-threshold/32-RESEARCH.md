# Phase 32: Relevance Score Threshold — Research

**Date:** 2026-05-05
**Level:** 1 (Quick Verification)
**Status:** Complete

## Summary

Phase 32 adds a default score threshold (0.5) to MCP search tools so irrelevant results are filtered before token cap. The codebase already has `score_threshold` passthrough — we're adding a default value and clean no-results handling.

## Findings

### Current Pipeline (both handlers)

```
search → observability logging → applyTokenCap → fallback check → response formatting
```

**After this phase:**

```
search → SCORE THRESHOLD FILTER → observability logging → applyTokenCap → fallback check → response formatting
```

### Key Implementation Points

1. **Default threshold source:** `ObservabilityConfig` in `search-codebase.ts` already carries `maxTokensPerCall` — add `defaultScoreThreshold` same way.

2. **Filtering location:** After engine returns results, BEFORE `applyTokenCap`. Simple `results.filter(r => r.score >= threshold)`.

3. **Threshold resolution order:** `input.score_threshold` (per-query) → `observability.defaultScoreThreshold` (config) → `0.5` (hardcoded fallback).

4. **Hybrid handler difference:** RRF scores are ~0.01-0.03, not 0.0-1.0. Default threshold for hybrid should be lower or use a separate default. The CONTEXT.md decisions say 0.5 — this applies to semantic search only. Hybrid already has its own default of 0.015 in the tool description.

5. **No-results message:** When threshold filters all results AND fallback also returns nothing → return instructional anti-hallucination message. The existing zero-result path at line 129 in search-codebase.ts is the insertion point.

6. **Config schema:** Add `scoreThreshold` to `RetrievalConfigSchema` in `packages/core/src/config/schema.ts` (alongside `maxTokensPerCall`).

7. **Type update:** Add `scoreThreshold?: number` to `RetrievalConfig` interface in `packages/core/src/types/index.ts`.

### Existing Test Impact

`search-codebase-threshold.test.ts` currently asserts `scoreThreshold: undefined` when user provides no input. This test must be updated — with the default, the handler will now pass `0.5` instead of `undefined` to the engine (or filter client-side after results return).

**Better approach:** Filter client-side (after engine returns) rather than changing what's passed to engine. This preserves existing tests and avoids coupling the default to Qdrant's server-side filtering.

### Decision: Client-side vs Server-side Filtering

- **Client-side (recommended):** Filter `results.filter(r => r.score >= threshold)` after engine returns. Simpler, doesn't change engine interface, works with all engine implementations.
- **Server-side:** Pass threshold to engine (already supported). But then we can't log/observe how many results were filtered.

**Recommendation:** Client-side filtering. Don't change what's passed to the engine — filter the returned results. This means existing tests stay valid (engine still receives `input.score_threshold` which may be undefined if user didn't specify).

## Validation Architecture

### Test Strategy

1. **Unit:** Filter function with various score arrays and thresholds
2. **Integration:** Handler tests verifying default filters low-score results
3. **Anti-hallucination message:** Verify exact message content when no results pass threshold

### Key Assertions

- Results with score < 0.5 excluded from response when no override
- `score_threshold=0` returns all results (no filtering)
- Instructional message contains "Do not guess or hallucinate"
- Config `scoreThreshold` overrides hardcoded 0.5
- Token cap still applied AFTER threshold filtering
