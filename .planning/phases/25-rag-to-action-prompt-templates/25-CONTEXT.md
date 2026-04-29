# Phase 25: RAG-to-action Prompt Templates - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add structured prompt templates to the MCP server that wrap retrieved context with action-oriented scaffolding for impact/change-analysis queries. Templates are injected as system context when the query pattern matches known intent categories.

Package: packages/mcp-server

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark run 2026-04-24)

MCP responses on impact analysis prompts (e.g. "what files need updating if I change X?") returned good file lists but weak ordering rationale. The LLM needed better scaffolding to produce ranked, actionable change plans. Benchmark judge penalized low Actionability and Completeness scores on these queries.

### Expected Impact

+2 to +3 on Actionability and Completeness for impact-analysis queries.

### Design Decisions

- **D-01:** Intent detection via keyword matching on the query string before search execution. Patterns:
  - Impact/change: "what files", "what changes", "need to update", "affects", "impact of", "if I change", "breaking change"
  - Dependency trace: "depends on", "dependency chain", "what uses", "callers of"
- **D-02:** Template injected as a leading system block in the MCP tool response — prepended before code chunks, not appended after. LLM reads instructions first, then evidence.
- **D-03:** Impact analysis template:
  ```
  You are analyzing change impact. Using the code references below:
  1. List affected files in dependency order (most directly affected first)
  2. For each file, explain WHY it needs updating (interface change, data contract, logic dependency)
  3. Estimate effort: S (<1h), M (1-4h), L (>4h)
  4. Note any files that are safe to leave unchanged and why
  ```
- **D-04:** Templates are defined as static strings in `packages/mcp-server/src/templates/`. One file per intent category.
- **D-05:** Template injection is opt-in per-query via `use_template: true` (default) parameter; power users can disable with `use_template: false`.
- **D-06:** No ML-based intent classification — keyword heuristics are sufficient and deterministic (no LLM round-trip for intent detection).

### Agent's Discretion

- Whether to add a third template category beyond impact-analysis and dependency-trace (suggest holding at two for v1.3 scope)
- Exact keyword list tuning (can be adjusted based on corpus query patterns)
- Whether to store template version alongside benchmark results for attribution

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP tool where template injection happens

- `packages/mcp-server/src/tools/search-codebase.ts` — Primary injection point; query string available before search
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` — Same pattern applies

### Response formatting

- `packages/mcp-server/src/tools/` — All tools for existing response shape; template prepends to result `context` field

### Benchmark corpus (impact queries)

- `.ia-framework/benchmark-queries.json` — Impact analysis queries from 2026-04-24 run; use to verify improvement

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- MCP tool response object: Already returns `{ results: [...] }`; add `system_template` field containing the injected instructions
- Query string is already available in all search tool handlers — no architectural change needed

### Integration Points

- `search-codebase.ts`: Add `detectIntent(query)` helper → if intent detected, prepend template to response
- Unit tests: Test intent detection heuristics with representative query strings; test that template appears in response when triggered

</code_context>

<specifics>
## Specific Ideas

- Emit an `intent_detected` field in the response alongside `system_template` so callers (and the dashboard) can log which template fired — useful for quality analysis.
- Consider a `templates/registry.ts` that maps intent names to template strings, making it easy to add new templates in future phases.

</specifics>

<deferred>
## Deferred Ideas

- LLM-based intent classification (overkill for current query volume; keyword heuristics are sufficient)
- User-defined custom templates (deferred to v1.4; requires config schema changes)

</deferred>

---

_Phase: 25-rag-to-action-prompt-templates_
_Context gathered: 2026-04-24_
_Source: 2026-04-24 benchmark run findings_
