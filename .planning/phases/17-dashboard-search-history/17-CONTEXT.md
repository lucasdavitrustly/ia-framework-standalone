# Phase 17: Dashboard Search History - Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Developer can review, replay, and compare past searches with a persistent searchable log. Every dashboard search is automatically persisted with query text, results, scores, strategy, and timestamp. Developer can replay any past query to compare results before and after re-indexing. Search history is filterable by date range, strategy used, query text substring, and minimum relevance score. Requirements: DASH-12, DASH-13, DASH-14.

</domain>

<decisions>
## Implementation Decisions

### History Persistence & Storage

- **D-01:** Full snapshot persisted per search — query text, search parameters (limit, scoreThreshold, collection), complete results array (as JSON text column), metrics object (latency, chunks scanned, score range), and timestamp
- **D-02:** Separate SQLite file at `.ia-framework/search-history.sqlite` — consistent with existing pattern where each concern has its own DB (metrics.sqlite, benchmarks.sqlite)
- **D-03:** No automatic retention limits — keep all search history indefinitely. SQLite handles thousands of rows fine for a single-user tool
- **D-04:** Auto-save every dashboard search — no user action required. Backend persists the search entry when returning results from `POST /api/search`

### Replay Behavior

- **D-05:** "Replay" re-executes the saved query with the same parameters against the current index state, then shows a side-by-side diff of old results (from snapshot) vs new results (fresh execution)
- **D-06:** Replay always uses the exact original search parameters (limit, threshold, collection) for a fair apples-to-apples comparison — parameters are not adjustable before replay
- **D-07:** If the original collection no longer exists when replaying, show a warning banner but proceed with whatever collections currently exist. The diff will naturally show the divergence
- **D-08:** Side-by-side column layout for replay diff: left column = original saved results, right column = fresh results. Highlight results that are new, removed, or changed rank position

### History Browsing & Filtering

- **D-09:** Table layout with expandable rows — each row shows timestamp, query text (truncated), collection used, result count, top score, latency. Expand to see full saved results. Follows `RunHistoryTable` component pattern
- **D-10:** Inline filter bar above the table with: text input for query substring search, dropdown for collection/strategy filter, from/to date inputs for date range, number input for minimum score. Filters apply on change
- **D-11:** Page-based pagination with 20 entries per page — Previous/Next buttons at the bottom. Follows `MetricsStore.listEvents()` LIMIT/OFFSET pattern
- **D-12:** Sortable columns — default sort is newest-first. Clickable column headers to sort by: date, query text, result count, top score, latency

### Navigation & Page Structure

- **D-13:** Separate page at `/rag/search/history` — clean separation from the search page at `/rag/search`
- **D-14:** "History" appears as a sub-item indented under "Search" in the sidebar — groups related RAG pages together visually
- **D-15:** Bidirectional links between search and history pages — search page shows a "View history" link after search completes; history page entries have a "Search again" link that navigates to `/rag/search` with the query pre-filled
- **D-16:** Individual delete via icon on each row + "Clear all history" button with confirmation dialog

### API Contract

- **D-17:** `POST /api/search` auto-saves and returns a `historyId` field in the response alongside existing results/metrics — frontend can use this for "View in history" link
- **D-18:** `GET /api/search/history` — list history entries with query params for filtering (q, collection, dateFrom, dateTo, minScore), sorting (sortBy, sortOrder), and pagination (page, pageSize)
- **D-19:** `GET /api/search/history/:id` — get a single history entry with full saved results
- **D-20:** `POST /api/search/history/:id/replay` — re-execute the saved query, return both original and fresh results for diff display
- **D-21:** `DELETE /api/search/history/:id` — delete a single history entry
- **D-22:** `DELETE /api/search/history` — clear all history entries (requires confirmation on frontend, no special backend guard)

### Agent's Discretion

- SearchHistoryStore internal table schema column names and indexes
- Exact row expansion animation and styling
- Filter debounce timing for text input
- How "changed rank" is visually highlighted in replay diff (color, icon, badge)
- Exact pagination button styling
- Whether sortable columns use ascending/descending toggle or tri-state (asc/desc/default)
- Delete confirmation dialog implementation details
- How query text is truncated in table rows (character limit, ellipsis)

</decisions>

<specifics>
## Specific Ideas

- History table should follow the `RunHistoryTable` pattern from the benchmarks page — familiar visual language within the dashboard
- Replay diff should feel similar to the existing A/B comparison layout from Phase 16 (ABComparisonLayout) — side-by-side columns with summary deltas
- Source tag badges (blue AST, purple LLM) should be consistent with the search page styling
- "Clear all" confirmation should be a simple dialog — nothing heavy

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Phase Definition

- `.planning/REQUIREMENTS.md` — DASH-12, DASH-13, DASH-14 requirement definitions
- `.planning/ROADMAP.md` §Phase 17 — Goal, dependencies, success criteria

### Prior Phase Decisions (carry-forward)

- `.planning/phases/16-dashboard-search/16-CONTEXT.md` — Search page decisions: POST /api/search contract (D-23/D-24), collection selector (D-05–D-08), metrics panel (D-15–D-18), A/B comparison (D-19–D-22), navigation (D-31–D-34)
- `.planning/phases/15-multi-collection-search-mcp-integration/15-CONTEXT.md` — MultiCollectionSearchEngine, RRF merge, source tagging, collection discovery

### Dashboard Frontend (existing patterns)

- `apps/dashboard/src/pages/SearchPage.tsx` — Existing search page (auto-save hooks into this)
- `apps/dashboard/src/components/search/` — All search components (reuse SourceTag, MetricsPanel patterns)
- `apps/dashboard/src/components/search/ABComparisonLayout.tsx` — Side-by-side layout pattern (reference for replay diff)
- `apps/dashboard/src/components/RunHistoryTable.tsx` — History table pattern (primary reference for history table)
- `apps/dashboard/src/api/client.ts` — Typed API client (extend with history endpoints)
- `apps/dashboard/src/components/Layout.tsx` — Sidebar navigation (add History sub-item)
- `apps/dashboard/src/App.tsx` — Router (add /rag/search/history route)

### Dashboard API (existing patterns)

- `packages/dashboard-api/src/app.ts` — createApp() DI factory, AppDependencies interface (add SearchHistoryStoreDep)
- `packages/dashboard-api/src/server.ts` — Store instantiation and SIGTERM shutdown (add SearchHistoryStore)
- `packages/dashboard-api/src/routes/search.ts` — Existing search route (modify to auto-save, add history routes)

### SQLite Storage Patterns

- `packages/benchmark/src/benchmark-store.ts` — BenchmarkStore pattern: constructor, initialize(), close(), JSON columns, transaction(), row mappers
- `packages/observability/src/metrics-store.ts` — MetricsStore pattern: listEvents() with LIMIT/OFFSET pagination, prepared statements

### Search & Retrieval Types

- `packages/retrieval/src/types.ts` — RetrievalResult, RetrievalQuery type definitions
- `packages/retrieval/src/multi-collection-search-engine.ts` — MultiCollectionSearchEngine API

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `RunHistoryTable` (`apps/dashboard/src/components/RunHistoryTable.tsx`): Primary reference for history table — expandable rows, date formatting, column layout
- `ABComparisonLayout` (`apps/dashboard/src/components/search/ABComparisonLayout.tsx`): Reference for replay diff side-by-side layout
- `ABComparisonSummary` (`apps/dashboard/src/components/search/ABComparisonSummary.tsx`): Reference for delta summary row in replay diff
- `SourceTag` (`apps/dashboard/src/components/search/SourceTag.tsx`): Reuse directly for collection badges in history table
- `SearchResultList` / `SearchResultRow`: Reuse for rendering saved results in expanded history rows
- `MetricsPanel` / `ScoreDistributionChart`: Reuse for showing saved metrics per history entry
- `StatCard` component: Reuse for summary stats on history page (total searches, avg latency, etc.)
- `BenchmarkStore` pattern: Direct template for `SearchHistoryStore` class (constructor, initialize, close, JSON columns, transactions)
- `MetricsStore.listEvents()`: Reference for pagination with LIMIT/OFFSET + COUNT(\*)

### Established Patterns

- **DI factory**: `createApp(deps)` with interface-typed dependencies — add `SearchHistoryStoreDep` interface
- **Route factory**: Each route module exports a function that takes deps and returns a Hono instance
- **SQLite storage**: Each concern in its own `.sqlite` file, snake_case columns, camelCase TypeScript, row mapper functions
- **Dark theme + Tailwind + hand-built components**: No UI library — build all components from scratch
- **useState + useEffect state management**: React hooks only, no state management library
- **API client**: `DashboardClient` object with typed fetch methods — extend with history methods

### Integration Points

- `POST /api/search` route in `packages/dashboard-api/src/routes/search.ts`: Modify to auto-save search entry and return `historyId`
- `SearchPage.tsx`: Add "View history" link after search completes, using returned `historyId`
- `Layout.tsx` sidebar: Add "History" sub-item under "Search"
- `App.tsx` router: Add `/rag/search/history` route
- `server.ts`: Instantiate `SearchHistoryStore`, add to deps, register `.close()` on SIGTERM
- `app.ts` `AppDependencies`: Add `searchHistoryStore` field (optional, like `search`)

</code_context>

<deferred>
## Deferred Ideas

- Analytics dashboard for search patterns (most frequent queries, score trends over time) — Phase 18 (DASH-15 through DASH-18)
- Export search history to CSV/JSON — not in requirements, add to backlog if needed
- Syntax highlighting in code previews within history — same deferral as Phase 16
- Comparing two historical searches against each other (not just old vs current) — possible future enhancement

</deferred>

---

_Phase: 17-dashboard-search-history_
_Context gathered: 2026-04-15_
