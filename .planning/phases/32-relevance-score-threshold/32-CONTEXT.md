# Phase 32: Relevance Score Threshold - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a default score threshold (0.5) to MCP search tools so irrelevant results are automatically filtered. When no results pass the threshold, return an instructional "no relevant results" message instead of low-scoring chunks that cause hallucination. The `score_threshold` parameter already exists and is passed through to the engine — this phase adds a sensible default and clean no-results handling.

</domain>

<decisions>
## Implementation Decisions

### Default threshold value & behavior

- **D-01:** Default score threshold = 0.5 (balanced — filters most irrelevant queries while keeping tangentially related results)
- **D-02:** Hard cutoff — if no results pass 0.5, return zero results (no "always return at least 1" soft behavior)
- **D-03:** Pipeline order: score threshold filtering first → token cap (phase 31) second → response formatting. Token cap only trims from already-relevant results.

### No-results response design

- **D-04:** When no results pass threshold, show instructional anti-hallucination message: "No relevant code found for this query. Do not guess or hallucinate — inform the user that the codebase doesn't appear to contain relevant information."
- **D-05:** Fallback chain preserved: threshold filters → phase-23 fallback search (related concepts/suggestions) → instructional message if fallback also empty. Threshold does NOT bypass the existing fallback system.

### Override & escape hatches

- **D-06:** Per-query override via existing `score_threshold` tool parameter stays — LLM can pass any value including 0 to override the default
- **D-07:** Project-level config: `retrieval.scoreThreshold` in `.ia-framework/project.json` (alongside existing `retrieval.maxTokensPerCall`). Different embedding models may need different thresholds.
- **D-08:** `score_threshold=0` effectively disables filtering (all scores > 0). No separate enable/disable toggle needed.

### Agent's Discretion

- Exact wording of the instructional message (as long as it includes anti-hallucination guidance)
- Whether to log/observe threshold filtering events in observability layer
- Test fixture design for threshold behavior

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Search tool handlers (primary targets)

- `packages/mcp-server/src/tools/search-codebase.ts` — Main search tool handler; has existing `score_threshold` passthrough, `applyTokenCap`, and zero-result fallback logic
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` — Hybrid search handler; same structure as above

### Existing threshold test

- `packages/mcp-server/src/tools/__tests__/search-codebase-threshold.test.ts` — Verifies `score_threshold` passthrough (currently tests that undefined is passed when omitted)

### Token cap utility (phase 31 — pipeline integration point)

- `packages/mcp-server/src/search/token-cap.ts` — `applyTokenCap` function; threshold filtering goes BEFORE this in the pipeline

### Project config schema

- `packages/core/src/schemas/retrieval-config.ts` — `RetrievalConfigSchema` with `maxTokensPerCall`; add `scoreThreshold` here

### Prior phase context

- `.planning/phases/31-dynamic-retrieval-cost-cap/31-CONTEXT.md` — Token cap decisions, pipeline ordering, config pattern

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `score_threshold` parameter: Already defined in both tool schemas and passed to engine — no new parameter wiring needed
- `applyTokenCap`: Utility function pattern to follow for threshold filtering
- Zero-result fallback: Three-tier system (related concepts → suggestions → empty message) already exists in both handlers
- `RetrievalConfigSchema`: Zod schema in core package for project-level retrieval config

### Established Patterns

- Token cap pipeline: search → observability → `applyTokenCap` → fallback check → response formatting
- Config loading: `retrieval.maxTokensPerCall` loaded from project config, passed to handler — same pattern for `scoreThreshold`
- `structuredContent` metadata: `token_cap_applied`, `results_trimmed` fields — follow same pattern for threshold info

### Integration Points

- Score threshold filtering inserts BEFORE `applyTokenCap` in both handlers
- Default value sourced from project config (`retrieval.scoreThreshold`) with fallback to 0.5
- When threshold filters all results AND fallback returns nothing → new instructional message path
- `structuredContent.answered = false` already set on zero-result responses — reuse this

</code_context>

<specifics>
## Specific Ideas

- The A/B benchmark showed MCP is net negative (-3% quality) because irrelevant queries inject 2x tokens of irrelevant context causing hallucination. This phase directly addresses that.
- The instructional message should explicitly tell the LLM not to hallucinate — this is the key differentiator from just returning empty results.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 32-relevance-score-threshold_
_Context gathered: 2026-05-05_
