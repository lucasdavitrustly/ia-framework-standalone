# Phase 37: Query Complexity Classifier - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Simple keyword/symbol lookups bypass vector search and go directly to file access tools (getFile, searchKeyword/BM25), eliminating the -3pt regression on keyword queries while preserving the +4pt gain on architectural queries. Classification is rule-based, adding <5ms overhead.

Package: `packages/mcp-server`

</domain>

<decisions>
## Implementation Decisions

### Classification rules & signals

- **D-01:** Pattern-based heuristics — PascalCase/camelCase symbol detection, quoted strings, lookup verbs ("find", "where", "locate"), short query length (<8 words). No LLM call.
- **D-02:** Binary output: `keyword` (skip RAG) vs `semantic` (full RAG). No middle "hybrid" category.
- **D-03:** New standalone module in `packages/mcp-server` (e.g., `src/classification/query-classifier.ts`). Does NOT extend existing `analyzeRetrievalQuery()` in packages/retrieval — separate concern from reranking signals.
- **D-04:** Classification rules configurable via `retrieval.classificationRules` in `.ia-framework/project.json`. Users can tune patterns without code changes.

### Routing behavior & tool selection

- **D-05:** Keyword route uses existing infrastructure: `SearchEngine.getFile()` for exact file paths, `searchKeyword()` (BM25 sparse search from Phase 23) for symbol name lookups. No new search mechanisms.
- **D-06:** Keyword-to-semantic fallback: if keyword route returns 0 results, fall back to full semantic search. Safety net for misspelled symbols or ambiguous queries.
- **D-07:** Transparent response format — keyword-routed responses use the same code chunk format as semantic results. The LLM does not know the routing changed.

### Integration point in MCP pipeline

- **D-08:** Classification runs at the top of `searchCodebaseHandler()` and `searchCodebaseHybridHandler()`, before calling any engine.search\*() method. Keyword queries take an alternate code path within the same handler.
- **D-09:** Both `search_codebase` and `search_codebase_hybrid` tools apply classification. Consistent behavior regardless of which tool the LLM invokes.
- **D-10:** Keyword-routed results skip score threshold filtering (Phase 32) and token cap (Phase 31) — keyword results are already targeted and don't need post-filtering. Goes straight to response formatting.
- **D-11:** Classification decisions logged as structured log entries (pino): query text, classification result, confidence, route taken, latency. Feeds observability per QCC-04.

### Agent's Discretion

- Exact regex patterns for symbol detection (PascalCase, camelCase, dot-notation)
- Specific verb lists for lookup detection
- Config schema shape for `retrieval.classificationRules`
- Whether to add classification metadata to structuredContent (optional, in addition to logging)
- Test fixture design and edge case coverage

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP tool handlers (primary modification targets)

- `packages/mcp-server/src/tools/search-codebase.ts` — `searchCodebaseHandler` (L241-394), `buildSearchResponse` (L64-176). Classification inserts at handler entry.
- `packages/mcp-server/src/tools/search-codebase-hybrid.ts` — `searchCodebaseHybridHandler` (L59-241). Same classification insertion.

### Existing classification/intent code (adjacent, do not merge)

- `packages/mcp-server/src/templates/intent-detector.ts` — `detectIntent()` for template injection. Separate concern — do not combine with query routing.
- `packages/retrieval/src/query-intelligence.ts` — `analyzeRetrievalQuery()` for reranking signals. Separate concern.

### Search engine (routing targets)

- `packages/retrieval/src/search-engine.ts` — `getFile()` (L444-467), `searchWithFallback()` (L316-439). These are the keyword route destinations.

### Pipeline stages (keyword route skips these)

- `packages/mcp-server/src/tools/token-cap.ts` — `applyTokenCap()`. Skipped on keyword route (D-10).
- Phase 32 threshold filtering — score_threshold default 0.5. Skipped on keyword route (D-10).

### Fallback chain (keyword-to-semantic fallback connects here)

- Phase 23 fallback cascade: `searchWithFallback()` — if keyword route returns 0, fall through to this.

### Benchmark baseline

- `.opencode/benchmark/reports/benchmark-2026-05-15-143022.md` — Prompt 2 (function-keyword): 22/25 without MCP, 19/25 with MCP. Target: >= 22/25 with classifier.

### Requirements

- `.planning/milestones/v1.6-REQUIREMENTS.md` §QCC — QCC-01 through QCC-05

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `SearchEngine.getFile(relativePath)`: Direct file chunk retrieval — perfect for exact path lookups
- `SearchEngine.searchWithFallback()`: Cascade search with BM25 keyword step — reusable for keyword route
- `analyzeRetrievalQuery()`: Already extracts `symbolTerms` (PascalCase) and `packageTerms` (dot-notation) — patterns can inform classifier rules
- `detectIntent()`: Keyword matching patterns for "find", "impact", "depends" — reference for verb classification

### Established Patterns

- MCP tools use pino logger for structured logging (used throughout packages/mcp-server)
- Project config via Zod-validated schema in `packages/core` (`retrieval.*` namespace)
- Tool handlers return `CallToolResult` with `content` + optional `structuredContent`

### Integration Points

- Handler entry point: top of `searchCodebaseHandler()` before `engine.searchWithExpansion()` call
- Config loading: `loadConfig()` from `@ia-framework/core` — add `retrieval.classificationRules`
- Logging: existing pino logger instance in tool handlers

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

_Phase: 37-query-complexity-classifier_
_Context gathered: 2026-05-15_
