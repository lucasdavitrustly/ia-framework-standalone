# Phase 39: Confidence-Based Early Exit - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Skip vector search when the query classifier (Phase 37) indicates keyword type with high confidence, reducing simple query latency from 57s to <12s. Return a "no relevant context" signal when retrieval produces only low-quality results. All early exit decisions are logged for observability.

Package: `packages/mcp-server`

</domain>

<decisions>
## Implementation Decisions

### Confidence threshold for keyword early exit

- **D-01:** High confidence threshold (>= 0.8) triggers early exit. Quoted strings (1.0), symbol patterns (1.0), and lookup verbs (0.8) qualify. Short-identifiers (0.6) still go through vector search as safety net.
- **D-02:** Keep the existing keyword-to-semantic fallback (Phase 37 D-06). High-confidence keyword queries that return 0 results still fall back to semantic search. Safety net preserved.
- **D-03:** Single configurable threshold: `retrieval.earlyExitConfidence` (default 0.8) in project.json. Applies to all keyword classifications. No per-reason or per-type granularity needed.

### Low-confidence response signal

- **D-04:** Reuse the existing anti-hallucination message (search-codebase.ts:135). When all results are filtered by score threshold, the "No relevant code found...do not guess" message already fires. This IS the CEX-02 mechanism — no new signal format needed.
- **D-05:** The existing Phase 32 score threshold (default 0.5) serves as the retrieval confidence gate. No separate "retrieval confidence" metric needed.

### Early exit logging

- **D-06:** Extend the existing `query_classification` log event (search-codebase.ts:256) with `earlyExit: boolean` and `earlyExitReason: string` fields. Single log entry per query with all classification and exit info in one place.

### Agent's Discretion

- Exact `earlyExitReason` code strings (e.g., `'confidence-above-threshold'`, `'keyword-skip'`)
- Whether to add early exit metadata to structuredContent (optional)
- Test fixture design

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 37 classifier (dependency — already implemented)

- `packages/mcp-server/src/classification/query-classifier.ts` — `classifyQuery()` returns `{ type, reason, confidence }`. Confidence values: quoted=1.0, symbol=1.0, verb=0.8, short-id=0.6, semantic=0.5
- `.planning/phases/37-query-complexity-classifier/37-CONTEXT.md` — All Phase 37 decisions (D-01 through D-11)

### MCP tool handlers (modification targets)

- `packages/mcp-server/src/tools/search-codebase.ts` — `searchCodebaseHandler()` (L275+). Classification gate at L282-284. Logging at L250-268. Anti-hallucination message at L135.
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` — `searchCodebaseHybridHandler()` (L87+). Same classification pattern.

### Existing threshold/filtering (CEX-02 mechanism)

- Phase 32 score threshold filtering — client-side score filtering with 0.5 default. Already produces anti-hallucination message when all results filtered.

### Requirements

- `.planning/milestones/v1.6-REQUIREMENTS.md` §CEX — CEX-01 through CEX-04

### Benchmark baseline

- `.opencode/benchmark/reports/benchmark-2026-05-15-143022.md` — Prompt 2: 57s latency with MCP. Target: <12s.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `classifyQuery()` — Already returns confidence scores. Early exit just adds a threshold check on the existing value.
- Anti-hallucination message — Already exists at search-codebase.ts:135. Reuse for CEX-02.
- `logClassification()` — Already logs query_classification events. Extend with earlyExit fields.
- Project config loading — `loadConfig()` from `@ia-framework/core` with Zod validation. Add `retrieval.earlyExitConfidence`.

### Established Patterns

- Phase 37 keyword routing — `if (classification.type === 'keyword')` gate already in both handlers. Early exit adds confidence check within this gate.
- Structured pino logging — Same pattern as Phase 37's query_classification event.
- Config via project.json — Same namespace (`retrieval.*`) as Phase 37's classificationRules.

### Integration Points

- Inside existing `if (classification.type === 'keyword')` block at search-codebase.ts:286. Add `&& classification.confidence >= threshold`.
- `logClassification()` at search-codebase.ts:254 — extend the log entry object.
- Config schema in `packages/core` — add `earlyExitConfidence` field.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 39-confidence-based-early-exit_
_Context gathered: 2026-05-15_
