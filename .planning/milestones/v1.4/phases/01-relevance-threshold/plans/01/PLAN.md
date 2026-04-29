# Plan 01 — Hybrid RRF Relevance Threshold

## Goal

Hybrid search filters out low-relevance results using a post-retrieval RRF threshold, and both search paths produce consistent "no relevant context" responses with actionable suggestions.

## Context

- Dense search already has cosine threshold (default 0.3) passed server-side to Qdrant
- Hybrid search (RRF fusion) has NO threshold — always returns results regardless of relevance
- RRF scores range ~0.01–0.03; scores below ~0.015 are essentially random
- Fallback cascade (semantic → hybrid → keyword) already exists for dense path
- `FallbackSuggestion[]` mechanism already returns alternative suggestions

## Tasks

| #   | Task                                                                          | File(s)                                                   | TDD                            |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------ |
| 1   | Add `defaultRrfScoreThreshold` to `SearchEngineConfig` (default: 0.015)       | `packages/retrieval/src/types.ts`                         | Type test                      |
| 2   | Filter hybrid results below RRF threshold after reranking in `searchHybrid()` | `packages/retrieval/src/search-engine.ts:426-437`         | Test: below-threshold filtered |
| 3   | When hybrid returns 0 results post-filter, trigger fallback cascade           | `packages/retrieval/src/search-engine.ts`                 | Test: all-low-score → fallback |
| 4   | Expose `score_threshold` param on `search_codebase_hybrid` MCP tool           | `packages/mcp-server/src/tools/search-codebase-hybrid.ts` | Test: param passes through     |
| 5   | Verify hybrid fallback produces same `{found: false, suggestions}` envelope   | MCP tool handler                                          | Integration test               |
| 6   | Update `search-engine-threshold.test.ts` with RRF threshold specs             | `packages/retrieval/src/__tests__/`                       | —                              |

## Key Decisions

- **Post-retrieval filtering** — Qdrant RRF fusion doesn't support server-side `score_threshold`
- **Default 0.015** — Based on observed RRF range 0.01–0.03; below this is noise
- **Rerank bonuses apply before threshold** — Exact-match boosted chunks survive the filter

## Success Criteria Mapping

1. SC1 (irrelevant returns "no relevant context") → Tasks 2, 3
2. SC2 (configurable, respects score scales) → Tasks 1, 4
3. SC3 (suggests alternatives) → Task 5

## Verification

```bash
pnpm --filter @ia-framework/retrieval test
pnpm --filter @ia-framework/mcp-server test
```
