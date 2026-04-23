# Phase 21: Dashboard Tuning Views - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Developer has visual tools to inspect chunking quality, analyze score distributions, and attribute MRR improvements to specific prompt versions. Four views: chunk inspector (DTUN-01), score distribution histogram (DTUN-02), filtering effectiveness / near-miss diagnosis (DTUN-03), and prompt version comparison (DTUN-04).

</domain>

<decisions>
## Implementation Decisions

### Prompt version attribution (DTUN-04)

- **D-01:** Timeline chart (MRR over time) with comparison table below. Chart points color-coded per prompt version with legend showing version mapping.
- **D-02:** Prompt version + promptContentHash embedded in BenchmarkRun configSnapshot during benchmark execution. Retroactive runs show "unknown" version.
- **D-03:** Clicking a chart point opens a detail panel showing full benchmark run info (queries, scores, config).
- **D-04:** Color-coded points on the existing MRR trend line — different color/marker per prompt version.

### Score threshold visualization (DTUN-02)

- **D-05:** Histogram shows both retrieval scores (from search queries) and chunk quality scores (0-100 heuristic) in separate tabs/toggle.
- **D-06:** Interactive draggable threshold line on the histogram — moving it updates returned/filtered counts in real-time.
- **D-07:** Green bars for returned results (above threshold), red/orange bars for filtered results (below threshold) — clear visual split.
- **D-08:** Query selection via dropdown listing recent searches from search history. Pick one to load its top-50 scores.

### Near-miss diagnosis flow (DTUN-03)

- **D-09:** Side-by-side two-column layout — returned results on left, near-miss filtered results on right.
- **D-10:** Near-miss defined as results within a fixed percentage below threshold (e.g., 10% below).
- **D-11:** Near-miss results show same info as returned results — file path, line range, score, source tag, chunk type. Consistent display.
- **D-12:** Near-miss diagnosis is part of the score distribution page (shared query selector from search history), not a standalone page.

### Chunk inspector (DTUN-01)

- **Agent's Discretion:** Chunk inspector interaction design — how developers browse/filter chunks, file tree vs search vs quality filter, source code display alongside metadata. User did not select this area for discussion; agent has flexibility during planning.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md` §DTUN-01 through DTUN-04 — Dashboard tuning view requirements

### Prior dashboard context

- `.planning/phases/16-dashboard-search/16-CONTEXT.md` — Search results display patterns (list layout, expandable rows, monospace code preview, colored pill badges, StatCard pattern, A/B comparison layout)
- `.planning/phases/18-dashboard-analytics/18-CONTEXT.md` — Analytics API endpoints, Recharts chart patterns, score distribution histograms, strategy comparison approach

### Data sources

- `packages/benchmark/src/benchmark-store.ts` — BenchmarkStore: listRuns, run detail with QueryResult[]
- `packages/benchmark/src/types.ts` — BenchmarkRun, QueryResult, ConfigSnapshot types
- `packages/indexer/src/strategies/quality-scorer.ts` — scoreChunkSummary (0-100 quality score)
- `packages/indexer/src/strategies/llm-strategy.ts` — getQualityReport(), getMetadata() (promptVersion, promptContentHash)
- `packages/vector-store/src/interface.ts` — Qdrant payload includes qualityScore field

### Existing API routes

- `packages/dashboard-api/src/routes/analytics.ts` — /benchmark-trends, /strategy-comparison, /score-distribution, /token-breakdown
- `packages/dashboard-api/src/routes/benchmarks.ts` — /api/benchmarks, /api/benchmarks/:runId
- `packages/dashboard-api/src/routes/search.ts` — POST /api/search (returns per-result chunk data), GET /api/search/history

### Existing reusable components

- `apps/dashboard/src/components/analytics/ScoreDistributionChart.tsx` — Existing histogram (reciprocalRank buckets) — needs adaptation for retrieval scores
- `apps/dashboard/src/components/analytics/BenchmarkTrendChart.tsx` — MRR trend line — needs prompt version color-coding
- `apps/dashboard/src/components/StatCard.tsx` — Reusable metric card
- `apps/dashboard/src/components/search/SourceTag.tsx` — AST/LLM pill badges
- `apps/dashboard/src/components/search/ABComparisonLayout.tsx` — Side-by-side comparison layout (reusable for near-miss view)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `StatCard` component: metric display cards with label, value, tooltip, loading states
- `ScoreDistributionChart` (analytics): Recharts bar histogram — adapt for retrieval score bins
- `BenchmarkTrendChart`: Recharts line chart of MRR over time — extend with per-version coloring
- `ABComparisonLayout`: Side-by-side column layout from search page — reuse for near-miss view
- `SourceTag`: AST/LLM colored pill badges — reuse in all tuning views
- `SearchResultRow` / `SearchResultList`: Result display with file path, line range, score — reuse for near-miss results

### Established Patterns

- Recharts for all charts (line, bar, histogram) — consistent across analytics page
- Hono API routes with typed DTOs in `analytics-types.ts`
- Search history stored in SQLite with full result snapshots — query selector can use this
- Dashboard API client in `apps/dashboard/src/api/client.ts` — typed fetch wrapper

### Integration Points

- New API endpoints needed: chunk browse/filter (Qdrant query), prompt version data (embed in benchmark configSnapshot), top-50 candidate scores with threshold info
- New dashboard page(s): tuning views page with tabs for score distribution + near-miss (shared), prompt version attribution, chunk inspector
- Layout.tsx navigation: add tuning views entry
- BenchmarkRunner: extend to capture promptVersion in configSnapshot at run time

</code_context>

<specifics>
## Specific Ideas

No specific references — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 21-dashboard-tuning-views_
_Context gathered: 2026-04-23_
