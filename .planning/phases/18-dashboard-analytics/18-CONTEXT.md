# Phase 18 Context: Dashboard Analytics

## Goal

Developer has full analytics visibility into RAG quality trends, strategy performance, token costs, and score distributions.

## Requirements

- DASH-11: Strategy comparison scores (MRR, P@K) via radar or bar charts from benchmark data
- DASH-15: RAG quality trend charts tracking MRR, average latency, and chunk relevance over time
- DASH-16: Aggregate strategy comparison table with average MRR, average latency, and average chunks per strategy
- DASH-17: Token usage breakdown by strategy (indexing tokens vs query tokens, broken down per AST/LLM)
- DASH-18: Score distribution histograms across queries and strategies for distribution shape analysis

## Success Criteria

1. Dashboard shows strategy comparison scores (MRR, P@K) via radar or bar charts from benchmark data
2. Dashboard shows RAG quality trend charts tracking MRR, average latency, and chunk relevance over time
3. Dashboard shows aggregate strategy comparison table with average MRR, average latency, and average chunks per strategy
4. Dashboard shows token usage breakdown by strategy (indexing tokens vs query tokens, broken down per AST/LLM)
5. Dashboard shows score distribution histograms across queries and strategies for distribution shape analysis

## Data Sources

### BenchmarkStore (`packages/benchmark/src/benchmark-store.ts`)

- `listRuns(limit?)` → `BenchmarkRun[]` sorted by timestamp DESC
- Each `BenchmarkRun` has: `runId`, `label`, `isBaseline`, `configSnapshot` (embeddingProvider, embeddingModel, collectionName, topK, scoreThreshold), `queries` (array of `QueryResult`), `hitAtK`, `mrr`, `avgLatencyMs`, `timestamp`
- Each `QueryResult` has: `queryId`, `query`, `hit`, `rank`, `reciprocalRank`, `latencyMs`, `retrievedFiles`, `expectedFiles`

### MetricsStore (`packages/observability/src/metrics-store.ts`)

- `getTotalStats()` → `TotalStats`
- `getStrategyStats()` → `StrategyStats[]` — per strategy: totalQueries, totalTokens, avgTokensPerQuery
- `getEventsByDay()` → `DailyTokenUsage[]` — per-day totals

### Existing API Routes

- `GET /api/benchmarks` — list runs (limit param)
- `GET /api/benchmarks/:runId` — single run detail
- `GET /api/metrics` — totals, byStrategy, byDay

## Key Insight: "Strategy" Means Collection

In the context of Phase 18, "strategy" maps to `configSnapshot.collectionName` in benchmark runs. For analytics comparisons:

- AST strategy → runs where collectionName ends with `-ast` or is the default collection
- LLM strategy → runs where collectionName ends with `-llm`
- Multi-collection → runs labeled `multi` or similar

Score distribution histograms will use `reciprocalRank` values from `QueryResult` arrays grouped by configSnapshot.

## New API Endpoints Needed (Plan 18-01)

1. `GET /api/analytics/benchmark-trends` — MRR, hitAtK, avgLatencyMs over time (all runs sorted by timestamp)
2. `GET /api/analytics/strategy-comparison` — aggregate table: per configSnapshot.collectionName, avg MRR, avg latency, avg chunks (approximated from topK)
3. `GET /api/analytics/score-distribution` — histogram data: bucket reciprocalRank values into bins [0, 0.1, 0.2, ..., 1.0] per strategy
4. `GET /api/analytics/token-breakdown` — extend existing StrategyStats with indexing vs query token split (or derive from existing data)

## Frontend Pages/Components Needed (Plan 18-02)

New page: `AnalyticsPage.tsx` at route `/analytics`

Components:

- `BenchmarkTrendChart.tsx` — Recharts LineChart with MRR + hitAtK trends over time
- `StrategyComparisonChart.tsx` — Recharts BarChart or RadarChart comparing strategies by MRR/latency
- `StrategyComparisonTable.tsx` — sortable table: strategy, avg MRR, avg latency, run count
- `ScoreDistributionChart.tsx` — Recharts BarChart histogram of reciprocalRank buckets
- `TokenBreakdownChart.tsx` — Recharts BarChart stacked: tokens by strategy

## Plans

- **18-01**: Backend analytics endpoints (new `/api/analytics` router, BenchmarkStore query methods, tests)
- **18-02**: Frontend analytics page (AnalyticsPage, charts, navigation, checkpoint)

## Dependencies

- Phase 15 (multi-collection collections exist) — data source
- Phase 16 (search infrastructure) — no direct dep but shares dashboard infrastructure
- Phase 17 (search history) — already complete, no dep

## Branch

Work on: `gsd/phase-18-dashboard-analytics`
