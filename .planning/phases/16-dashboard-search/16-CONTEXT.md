# Phase 16: Dashboard Search - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Developer can search the indexed codebase directly from the monitoring dashboard with per-query metrics and strategy comparison. This phase adds a search page with query input, collection selector, ranked results with code previews, per-query metrics panel, and A/B comparison between AST and LLM chunking strategies. Requirements: DASH-07, DASH-08, DASH-09, DASH-10.

</domain>

<decisions>
## Implementation Decisions

### Search Results Display

- **D-01:** List layout with expandable rows — click a row to expand and show code preview inline
- **D-02:** Code preview uses plain monospace `<pre>` block — no syntax highlighting library, no extra dependency
- **D-03:** Each result row shows: file path, line range (startLine–endLine), relevance score, source tag (ast/llm), chunk type, matched vector
- **D-04:** Source tags rendered as colored pill badges — blue for AST, purple for LLM

### Collection Selector & Controls

- **D-05:** Collection selector is a dropdown `<select>` inline on the same row as the search input
- **D-06:** Default selection is "Both" (merged via RRF from MultiCollectionSearchEngine)
- **D-07:** LLM option is disabled with tooltip when no LLM collection exists for the project
- **D-08:** If no collections exist at all, block the entire search UI with a clear message directing the user to run `ia-framework index`
- **D-09:** Explicit submit only — Enter key or search button triggers search, no auto-search/debounce
- **D-10:** Adjustable result limit via dropdown: 5, 10, 20, 50
- **D-11:** Adjustable score threshold control (default 0.3, matching Phase 11 benchmark-validated default)
- **D-12:** Single search mode only — no semantic/hybrid/keyword toggle; uses the default search method
- **D-13:** Pre-search state: placeholder text with example queries to guide the user
- **D-14:** No-results state: message with suggestions to broaden search (lower threshold, fewer filters)

### Metrics Panel

- **D-15:** Collapsible panel below results, shown by default after a search completes
- **D-16:** Metrics displayed: latency (ms), chunks scanned, results returned, score range (min–max)
- **D-17:** StatCard-style mini cards for numeric metrics values (reuse existing `StatCard` component pattern)
- **D-18:** Recharts bar chart below StatCards showing score distribution by result rank, color-coded by source (blue=AST, purple=LLM)

### A/B Comparison Mode

- **D-19:** Compare button placed next to the search button triggers A/B comparison mode
- **D-20:** Two-column split layout — AST results on the left, LLM results on the right
- **D-21:** Overlapping results (same file + overlapping line ranges) highlighted with a subtle badge/indicator
- **D-22:** Each column has its own metrics panel + a comparison summary row at the top showing key deltas

### API Contract & Endpoints

- **D-23:** Single `POST /api/search` endpoint with JSON body: `{ query, limit, scoreThreshold, collections }`
- **D-24:** Dashboard-specific DTO response — flatten `RetrievalResult` fields, drop raw `imports`/`exports` arrays, include a `metrics` object (latency, chunksScanned, scoreRange)
- **D-25:** Dedicated `GET /api/search/collections` endpoint for frontend to discover available collections at page load (returns collection names with metadata like chunk count, whether AST or LLM)
- **D-26:** A/B comparison uses two parallel `POST /api/search` calls from the frontend with different `collections` parameters — no special backend endpoint

### Loading & Error States

- **D-27:** Loading indicator: skeleton placeholders matching the shape of result rows (shimmer/pulse animation)
- **D-28:** Search errors (Qdrant down, network failure): inline error message replaces results area with retry button; query text preserved in input
- **D-29:** A/B partial failure: fail the entire comparison with a single error message (do not show partial results)
- **D-30:** Search controls (button, input) disabled while a request is in flight — no concurrent request cancellation

### Navigation Placement

- **D-31:** "Search" appears as the second sidebar item, immediately after "Overview"
- **D-32:** Route path is `/rag/search` (namespaced under `/rag/` anticipating future RAG sub-pages)
- **D-33:** Sidebar label is "Search"
- **D-34:** Overview remains the default landing page

### Agent's Discretion

- Exact skeleton placeholder dimensions and animation
- Score threshold control type (slider vs number input)
- Exact spacing, padding, and typography within result rows
- Comparison summary row layout details
- Icon choice for "Search" sidebar item
- Exact error message copy
- Whether score distribution chart uses bar or area chart variant

</decisions>

<specifics>
## Specific Ideas

- Source tag pill badges should be visually consistent with the existing dashboard's dark theme + indigo accent color scheme
- The expandable row pattern should reference `QueryEventTable` which already implements expand/collapse in the dashboard
- StatCard component from existing dashboard should be reused directly for metrics display
- The "no collections" blocking state should feel like a setup wizard step — helpful, not an error
- A/B comparison columns should clearly label which strategy each side represents (AST vs LLM header)

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Phase Definition

- `.planning/REQUIREMENTS.md` — DASH-07, DASH-08, DASH-09, DASH-10 requirement definitions
- `.planning/ROADMAP.md` §Phase 16 — Goal, dependencies, success criteria

### Prior Phase Decisions (carry-forward)

- `.planning/phases/15-multi-collection-search-mcp-integration/15-CONTEXT.md` — MultiCollectionSearchEngine design, RRF merge, source tagging (D-04), collection discovery
- `.planning/phases/14-llm-chunking-implementation-cli/14-CONTEXT.md` — Collection naming convention ({base} for AST, {base}-llm for LLM, D-06), LLM config

### Dashboard Frontend (existing patterns)

- `apps/dashboard/src/App.tsx` — Router setup, existing route definitions (extend with /rag/search)
- `apps/dashboard/src/components/Layout.tsx` — Sidebar navigation structure (add Search as 2nd item)
- `apps/dashboard/src/api/client.ts` — Typed API client pattern (extend with search endpoints)
- `apps/dashboard/src/components/StatCard.tsx` — Reusable stat card component (reuse for metrics)
- `apps/dashboard/src/components/QueryEventTable.tsx` — Expandable row table pattern (reference for result list)
- `apps/dashboard/src/pages/` — Existing page structure (Overview, TokenUsage, Benchmarks, Config)

### Dashboard API (existing patterns)

- `packages/dashboard-api/src/app.ts` — createApp() factory with dependency injection (wire search routes here)
- `packages/dashboard-api/src/routes/` — Existing route handler patterns (follow for /api/search routes)

### Search & Retrieval (backend integration)

- `packages/retrieval/src/multi-collection-search-engine.ts` — MultiCollectionSearchEngine API (search, searchHybrid, searchWithExpansion, getFile)
- `packages/retrieval/src/types.ts` — RetrievalResult and RetrievalQuery type definitions
- `packages/vector-store/src/qdrant.ts` — QdrantVectorStore, collection discovery methods
- `packages/mcp-server/src/bin.ts` — Reference wiring for collection discovery + MultiCollectionSearchEngine setup

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `StatCard` component (`apps/dashboard/src/components/StatCard.tsx`): Reuse directly for metrics panel numeric values
- `QueryEventTable` (`apps/dashboard/src/components/QueryEventTable.tsx`): Reference its expandable row pattern for search result list
- `Recharts` (already a project dependency): Use for score distribution bar chart
- Typed API client (`apps/dashboard/src/api/client.ts`): Extend with search endpoint methods following existing patterns

### Established Patterns

- **Dark theme + Tailwind CSS 4 + indigo accent**: All new UI must follow Phase 8 dashboard visual decisions
- **Hand-built components**: No UI library (no Shadcn, MUI) — build search components from scratch using Tailwind
- **Hono API with DI factory**: Dashboard API uses `createApp()` factory pattern — search routes must be wired through this
- **Re-declared types in frontend**: API client re-declares response types locally (no imports from backend packages)
- **useState + useEffect state management**: No state management library — use React hooks directly

### Integration Points

- `MultiCollectionSearchEngine` from `@ia-framework/retrieval`: Already listed as dashboard-api dependency but not wired to any route — this phase creates the first routes that use it
- `QdrantVectorStore` from `@ia-framework/vector-store`: Already listed as dashboard-api dependency — use for collection discovery endpoint
- `createApp()` in `packages/dashboard-api/src/app.ts`: Wire new search route handlers into the DI factory
- `apps/dashboard/src/App.tsx` router: Add `/rag/search` route pointing to new SearchPage component
- `Layout.tsx` sidebar: Add "Search" nav item as second entry after Overview

</code_context>

<deferred>
## Deferred Ideas

- Search history persistence and replay — Phase 17 (DASH-12, DASH-13, DASH-14)
- Strategy comparison analytics charts — Phase 18 (DASH-11, DASH-15 through DASH-18)
- Syntax highlighting in code previews — out of scope (would require a highlighting library dependency)
- Hybrid/semantic search mode toggle — out of scope (single search mode per D-12)

</deferred>

---

_Phase: 16-dashboard-search_
_Context gathered: 2026-04-14_
