# Phase 21: Dashboard Tuning Views - Research

**Researched:** 2026-04-23
**Domain:** React dashboard views (Recharts, Hono API, Qdrant queries)
**Confidence:** HIGH

## Summary

Phase 21 adds four tuning views to the existing React dashboard: chunk inspector (DTUN-01), score distribution histogram with draggable threshold (DTUN-02), near-miss filtering diagnosis (DTUN-03), and prompt version attribution on MRR trends (DTUN-04). The existing codebase provides strong patterns to follow — Recharts charts, Hono API routes, typed client DTOs, reusable components (StatCard, SourceTag, ABComparisonLayout, SearchResultRow).

The main technical gaps are: (1) no API endpoint returns unfiltered/below-threshold results — the search engine applies `scoreThreshold` in Qdrant, so filtered results are never returned to the client; (2) `ConfigSnapshot` and `BenchmarkTrendPoint` don't carry `promptVersion`/`promptContentHash`; (3) no API to browse/filter chunks from Qdrant by quality score. All three require new API endpoints and minor data model extensions.

**Primary recommendation:** Add 3 new API route files (tuning-chunks, tuning-scores, tuning-prompts) following existing analytics route patterns, one new page (TuningPage.tsx) with tab navigation for the four views, and extend BenchmarkTrendPoint with prompt version fields.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Timeline chart (MRR over time) with comparison table below. Chart points color-coded per prompt version with legend showing version mapping.
- **D-02:** Prompt version + promptContentHash embedded in BenchmarkRun configSnapshot during benchmark execution. Retroactive runs show "unknown" version.
- **D-03:** Clicking a chart point opens a detail panel showing full benchmark run info (queries, scores, config).
- **D-04:** Color-coded points on the existing MRR trend line — different color/marker per prompt version.
- **D-05:** Histogram shows both retrieval scores (from search queries) and chunk quality scores (0-100 heuristic) in separate tabs/toggle.
- **D-06:** Interactive draggable threshold line on the histogram — moving it updates returned/filtered counts in real-time.
- **D-07:** Green bars for returned results (above threshold), red/orange bars for filtered results (below threshold) — clear visual split.
- **D-08:** Query selection via dropdown listing recent searches from search history. Pick one to load its top-50 scores.
- **D-09:** Side-by-side two-column layout — returned results on left, near-miss filtered results on right.
- **D-10:** Near-miss defined as results within a fixed percentage below threshold (e.g., 10% below).
- **D-11:** Near-miss results show same info as returned results — file path, line range, score, source tag, chunk type. Consistent display.
- **D-12:** Near-miss diagnosis is part of the score distribution page (shared query selector from search history), not a standalone page.

### Agent's Discretion

- Chunk inspector interaction design — how developers browse/filter chunks, file tree vs search vs quality filter, source code display alongside metadata.

### Deferred Ideas (OUT OF SCOPE)

None.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                      | Research Support                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DTUN-01 | Chunk inspector with line boundaries, prose summaries, quality scores, syntax-highlighted source | Qdrant ChunkPayload has all fields (qualityScore, content, startLine/endLine, name as description). Need new API to browse/filter chunks from Qdrant.                      |
| DTUN-02 | Score distribution histogram with threshold boundary line and returned/filtered zones            | Need new API endpoint that returns unfiltered top-50 candidate scores for a search query. Current search applies threshold in Qdrant — filtered results are lost.          |
| DTUN-03 | Filtering effectiveness: returned vs near-miss filtered results with score comparison            | Same unfiltered-scores API from DTUN-02. Near-miss = results within 10% below threshold (D-10). Reuse ABComparisonLayout pattern for side-by-side.                         |
| DTUN-04 | Prompt version comparison linking MRR to prompt versions over time                               | Extend ConfigSnapshot + BenchmarkTrendPoint with promptVersion/promptContentHash. LlmStrategy.getMetadata() already provides these. BenchmarkRunner needs to capture them. |

</phase_requirements>

## Standard Stack

### Core (already in project)

| Library          | Version    | Purpose      | Why Standard                          |
| ---------------- | ---------- | ------------ | ------------------------------------- |
| React            | ^19.x      | Dashboard UI | Already used                          |
| Recharts         | ^3.8.1     | Charts       | Already used for all dashboard charts |
| react-router-dom | (existing) | Routing      | Already used in App.tsx               |
| Hono             | ^4.12.9    | API routes   | Already used in dashboard-api         |

### New Components Needed

| Component                                    | Purpose                                              | Notes                                                         |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Recharts `ReferenceLine`                     | Draggable threshold line on histogram                | Part of recharts — already installed, just not imported yet   |
| Recharts `Cell`                              | Per-bar coloring (green above / red below threshold) | Part of recharts                                              |
| Recharts `ScatterChart` or dot customization | Color-coded points per prompt version                | Use custom `dot` render function on existing `Line` component |

No new npm packages needed.

## Architecture Patterns

### New Routes Structure

```
packages/dashboard-api/src/routes/
├── tuning.ts                    # New: /api/tuning/* endpoints
├── tuning-types.ts              # New: DTOs for tuning endpoints
apps/dashboard/src/
├── pages/
│   └── TuningPage.tsx           # New: tab container for all 4 views
├── components/tuning/
│   ├── ChunkInspector.tsx       # DTUN-01
│   ├── ScoreHistogram.tsx       # DTUN-02 + DTUN-03 (shared query selector)
│   ├── NearMissPanel.tsx        # DTUN-03 (embedded in ScoreHistogram view)
│   └── PromptVersionChart.tsx   # DTUN-04
```

### Pattern 1: API Route with Typed DTOs

**What:** Follow existing analytics.ts pattern — Hono router with deps interface, response types in separate `-types.ts` file.
**Example:** (from existing analytics.ts)

```typescript
export interface TuningDeps {
  vectorStore: { search(queryVector: number[], options: SearchOptions): Promise<SearchResult[]> };
  searchHistoryStore?: SearchHistoryStore;
  benchmarkStore: { listRuns(limit?: number): BenchmarkRun[] };
}
export function tuningRouter(deps: TuningDeps): Hono { ... }
```

### Pattern 2: Dashboard Client Extension

**What:** Add new methods to `DashboardClient` object in `api/client.ts` with matching TypeScript interfaces.
**Example:** (follows existing pattern)

```typescript
export const DashboardClient = {
  // ... existing methods
  getTuningChunks: (params) => get<ChunkBrowseResponse>(`/api/tuning/chunks?...`),
  getTuningScores: (historyId: string) =>
    get<ScoreAnalysisResponse>(`/api/tuning/scores/${historyId}`),
  getTuningPromptTrends: () => get<PromptTrendResponse>('/api/tuning/prompt-trends'),
};
```

### Pattern 3: Tab Navigation Within Page

**What:** TuningPage uses local state or URL hash for tab switching (Chunk Inspector | Score Distribution | Prompt Versions).
**Why:** Consistent with single-page sections. DTUN-03 near-miss is embedded within the Score Distribution tab per D-12.

### Pattern 4: Reusable Components

**What:** Reuse existing components for consistency:

- `SearchResultRow` / `SearchResultList` → for displaying returned and near-miss results in DTUN-03
- `ABComparisonLayout` pattern → side-by-side layout for DTUN-03 (D-09)
- `SourceTag` → AST/LLM pills in all tuning views
- `StatCard` → summary metrics (total chunks, avg quality score, etc.)
- `SectionCard` → card wrapper from AnalyticsPage
- `useFetch` hook → data loading pattern from AnalyticsPage

### Anti-Patterns to Avoid

- **Don't duplicate SearchResultRow:** Near-miss results use the same component, not a custom one (D-11).
- **Don't create separate pages for each view:** One TuningPage with tabs keeps navigation clean.
- **Don't put threshold logic in frontend only:** The unfiltered search must happen server-side (re-query Qdrant with no threshold) since frontend never sees filtered results.

## Don't Hand-Roll

| Problem                  | Don't Build           | Use Instead                                            | Why                                                                     |
| ------------------------ | --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Draggable line on chart  | Custom mouse handlers | Recharts `ReferenceLine` + `onMouseMove` on chart area | Recharts handles coordinate transforms                                  |
| Per-bar coloring         | Manual SVG            | Recharts `Cell` component with conditional fill        | Standard Recharts pattern                                               |
| Code syntax highlighting | Custom highlighter    | `<pre>` with monospace styling (existing pattern)      | SearchResultRow already does this; true syntax highlighting is deferred |
| Side-by-side comparison  | Custom grid           | Adapt ABComparisonLayout                               | Already handles two-column results with overlap detection               |

## Common Pitfalls

### Pitfall 1: Qdrant Threshold Filtering Is Server-Side

**What goes wrong:** Trying to get "filtered" results from existing search API — they don't exist in the response.
**Why it happens:** `vectorStore.search()` passes `scoreThreshold` to Qdrant, which filters before returning.
**How to avoid:** New tuning endpoint must query Qdrant with `scoreThreshold: 0` (or omitted) and `limit: 50` to get all candidates, then partition client-side or server-side into above/below threshold.
**Warning signs:** Empty "filtered" results despite knowing there should be near-misses.

### Pitfall 2: BenchmarkRun ConfigSnapshot Doesn't Have promptVersion Yet

**What goes wrong:** Dashboard tries to read `configSnapshot.promptVersion` but it's undefined for all existing runs.
**Why it happens:** Phase 20 added `LlmStrategy.getMetadata()` but BenchmarkRunner doesn't call it yet.
**How to avoid:** Extend BenchmarkRunner to capture prompt metadata in configSnapshot. Handle "unknown" for retroactive runs (D-02). Frontend must handle undefined gracefully.
**Warning signs:** All chart points are same color.

### Pitfall 3: Recharts ReferenceLine Not Draggable Out-of-Box

**What goes wrong:** Assuming ReferenceLine supports drag natively.
**Why it happens:** ReferenceLine is static positioning only.
**How to avoid:** Implement drag via `onMouseDown`/`onMouseMove`/`onMouseUp` on the chart's `ResponsiveContainer`, computing Y-axis value from mouse position using Recharts coordinate helpers. The threshold is stored in React state and passed to ReferenceLine's `y` prop.
**Warning signs:** Threshold line appears but can't be moved.

### Pitfall 4: Quality Score Only on LLM Chunks

**What goes wrong:** Chunk inspector shows `qualityScore: undefined` for AST chunks.
**Why it happens:** `qualityScore` is only set by `quality-scorer.ts` for LLM-chunked points (see ChunkPayload interface).
**How to avoid:** Display "N/A" for AST chunks. Filter/sort by quality score should only apply to LLM collection.

## Code Examples

### Unfiltered Score Query (New API Pattern)

```typescript
// In tuning router — query Qdrant without threshold to get all candidates
app.get('/scores/:historyId', async (c) => {
  const entry = deps.searchHistoryStore.getById(c.req.param('historyId'));
  // Re-run query with no threshold, limit 50
  const allCandidates = await engine.search({
    text: entry.query,
    limit: 50,
    scoreThreshold: 0, // no filtering
  });
  const threshold = entry.params.scoreThreshold;
  return c.json({
    threshold,
    candidates: allCandidates.map((r) => ({
      ...mapResult(r),
      aboveThreshold: r.score >= threshold,
    })),
  });
});
```

### Recharts Bar with Conditional Fill (Per-Bar Coloring)

```typescript
import { BarChart, Bar, Cell, ReferenceLine } from 'recharts';

<BarChart data={buckets}>
  <Bar dataKey="count">
    {buckets.map((entry, idx) => (
      <Cell key={idx} fill={entry.midpoint >= threshold ? '#22c55e' : '#f97316'} />
    ))}
  </Bar>
  <ReferenceLine y={threshold} stroke="#ef4444" strokeDasharray="3 3" label="Threshold" />
</BarChart>
```

### Custom Dot for Prompt Version Coloring (DTUN-04)

```typescript
const VERSION_COLORS: Record<string, string> = {
  '1': '#6366f1', '2': '#22c55e', '3': '#f59e0b', unknown: '#6b7280',
};

<Line
  dataKey="mrrPct"
  dot={(props) => {
    const version = props.payload.promptVersion ?? 'unknown';
    return <circle cx={props.cx} cy={props.cy} r={4} fill={VERSION_COLORS[version] ?? '#6b7280'} />;
  }}
/>
```

### Chunk Browse API (DTUN-01)

```typescript
app.get('/chunks', async (c) => {
  const collection = c.req.query('collection') ?? 'llm';
  const minQuality = parseInt(c.req.query('minQuality') ?? '0');
  const limit = parseInt(c.req.query('limit') ?? '50');
  const offset = parseInt(c.req.query('offset') ?? '0');

  // Use Qdrant scroll API to browse chunks with optional quality filter
  const filter =
    minQuality > 0 ? { must: [{ key: 'qualityScore', range: { gte: minQuality } }] } : undefined;
  // ... scroll/search with zero vector and filter
});
```

## Validation Architecture

### Test Framework

| Property           | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| Framework          | Vitest 4.1.2                                              |
| Config file        | packages/dashboard-api has tests; apps/dashboard has none |
| Quick run command  | `pnpm -F @ia-framework/dashboard-api test`                |
| Full suite command | `pnpm turbo test`                                         |

### Phase Requirements → Test Map

| Req ID  | Behavior                                                                  | Test Type | Automated Command                                                                         | File Exists? |
| ------- | ------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------- | ------------ |
| DTUN-01 | Chunk browse API returns chunks with quality scores                       | unit      | `pnpm -F @ia-framework/dashboard-api vitest run src/routes/tuning.test.ts -t "chunks"`    | ❌ Wave 0    |
| DTUN-02 | Score analysis API returns unfiltered candidates with threshold partition | unit      | `pnpm -F @ia-framework/dashboard-api vitest run src/routes/tuning.test.ts -t "scores"`    | ❌ Wave 0    |
| DTUN-03 | Near-miss results correctly identified within percentage threshold        | unit      | `pnpm -F @ia-framework/dashboard-api vitest run src/routes/tuning.test.ts -t "near-miss"` | ❌ Wave 0    |
| DTUN-04 | Prompt version data included in benchmark trend response                  | unit      | `pnpm -F @ia-framework/dashboard-api vitest run src/routes/analytics.test.ts -t "prompt"` | ❌ Wave 0    |

### Sampling Rate

- **Per task commit:** `pnpm -F @ia-framework/dashboard-api test`
- **Per wave merge:** `pnpm turbo test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/dashboard-api/src/routes/tuning.test.ts` — covers DTUN-01, DTUN-02, DTUN-03
- [ ] Update `packages/dashboard-api/src/routes/analytics.test.ts` — covers DTUN-04 prompt version extension

## Data Model Extensions Required

### ConfigSnapshot (packages/benchmark/src/types.ts)

```typescript
export interface ConfigSnapshot {
  // ... existing fields
  promptVersion?: number; // NEW — from LlmStrategy.getMetadata()
  promptContentHash?: string; // NEW — from LlmStrategy.getMetadata()
}
```

### BenchmarkTrendPoint (analytics-types.ts + client.ts)

```typescript
export interface BenchmarkTrendPoint {
  // ... existing fields
  promptVersion?: number; // NEW
  promptContentHash?: string; // NEW
}
```

### New Tuning DTOs (tuning-types.ts)

```typescript
export interface ChunkBrowseEntry {
  chunkId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  chunkType: string;
  source: 'ast' | 'llm';
  qualityScore?: number;
  name?: string; // prose summary
  content: string; // source code
}

export interface ScoreCandidate {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
  source: 'ast' | 'llm';
  chunkType: string;
  content: string;
  aboveThreshold: boolean;
}

export interface ScoreAnalysisResponse {
  query: string;
  threshold: number;
  candidates: ScoreCandidate[];
  returnedCount: number;
  filteredCount: number;
  nearMissCount: number;
}
```

## Open Questions

1. **Qdrant scroll/browse API access**
   - What we know: VectorStore interface has `search()` with zero vector for browse, and `deleteByFilter` shows filter works
   - What's unclear: Whether there's a paginated scroll method or if we need search with zero-vector + offset simulation
   - Recommendation: Use search with zero-vector and large limit for chunk browsing (matches existing `getFile()` pattern in SearchEngine). Add `scroll()` to VectorStore interface if pagination becomes necessary.

2. **Draggable threshold implementation complexity**
   - What we know: Recharts ReferenceLine is static; drag requires manual mouse event handling
   - What's unclear: Exact coordinate translation from pixel to Y-axis value
   - Recommendation: Use `onMouseMove` on chart wrapper, compute threshold from `(chartTop + chartHeight - mouseY) / chartHeight * yMax`. Start with simpler numeric input + slider as fallback if drag is complex.

## Sources

### Primary (HIGH confidence)

- Codebase inspection: All source files read directly from repository
- `packages/benchmark/src/types.ts` — ConfigSnapshot, BenchmarkRun types
- `packages/vector-store/src/interface.ts` — ChunkPayload with qualityScore
- `packages/indexer/src/strategies/llm-strategy.ts` — getMetadata() returns promptVersion + promptContentHash
- `packages/dashboard-api/src/routes/analytics.ts` — existing analytics patterns
- `apps/dashboard/src/api/client.ts` — full typed client API
- `apps/dashboard/src/components/analytics/BenchmarkTrendChart.tsx` — existing MRR trend chart
- `apps/dashboard/src/components/search/ABComparisonLayout.tsx` — reusable side-by-side layout

### Secondary (MEDIUM confidence)

- Recharts ReferenceLine and Cell components — standard documented features

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries already in use
- Architecture: HIGH — clear patterns from existing codebase
- Pitfalls: HIGH — identified from direct code inspection
- Data model gaps: HIGH — verified by reading types and API routes

**Research date:** 2026-04-23
**Valid until:** 2026-05-23
