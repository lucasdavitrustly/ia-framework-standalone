---
plan: 16-03
phase: 16-dashboard-search
status: completed
completed_at: '2026-04-14T22:30:00.000Z'
commits:
  - 46533a4: 'feat(16-03): add metrics panel, score chart, and A/B comparison layout'
---

# Plan 16-03 Summary

## What Was Done

Added per-query metrics visualization and A/B comparison layout.

### Task 1: MetricsPanel + ScoreDistributionChart

- Created `ScoreDistributionChart` — Recharts `BarChart` with per-bar `Cell` coloring (blue `#3b82f6` for AST, purple `#a855f7` for LLM), 200px height, inline legend when both sources present. Fixed Recharts `Formatter` type by using runtime type guard `typeof value === 'number'`.
- Created `MetricsPanel` — collapsible panel (expanded by default). Header toggles `▾`/`▸`. Expanded section shows 4 `StatCard`s (Latency, Chunks Scanned, Results, Score Range) in a responsive `grid-cols-2 lg:grid-cols-4`, then `ScoreDistributionChart`.

### Task 2: ABComparisonLayout + ABComparisonSummary + SearchPage wiring

- Created `ABComparisonSummary` — 3 delta cards (Latency Δ, Results Δ, Shared Results) in `grid-cols-3`. Latency and Results Δ show sign prefix.
- Created `ABComparisonLayout` — two-column `grid-cols-1 lg:grid-cols-2` layout with AST left, LLM right. Each column has column header, `SearchResultList`, `MetricsPanel`. Includes `computeOverlaps()` function that detects same-file overlapping line ranges and marks them with amber "shared" badge via the `overlaps` Set prop.
- Updated `SearchPage` — added imports for `MetricsPanel` and `ABComparisonLayout`. Replaced `state === 'results'` block with fragment containing `SearchResultList` + conditional `MetricsPanel`. Replaced `compared` state placeholder with `ABComparisonLayout` render.
