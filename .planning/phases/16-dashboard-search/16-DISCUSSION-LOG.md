# Phase 16: Dashboard Search - Discussion Log

**Date:** 2026-04-14
**Participants:** Developer + GSD discuss-phase workflow
**Phase:** 16-dashboard-search
**Requirements:** DASH-07, DASH-08, DASH-09, DASH-10

## Pre-Discussion Discovery

Before discussion began, a codebase scout confirmed:

- Zero search-related code exists in the dashboard — building from scratch
- Existing pages: Overview, TokenUsage, Benchmarks, Config
- `@ia-framework/retrieval` and `@ia-framework/vector-store` are listed as dashboard-api dependencies but unused in routes
- MCP server has the reference wiring pattern for collection discovery and MultiCollectionSearchEngine

Carry-forward decisions from prior phases:

- Dark theme + Tailwind CSS 4 + indigo accent (Phase 8)
- Hand-built components, no UI library (Phase 8)
- Hono API with DI factory pattern (Phase 8)
- Re-declared types in frontend API client (Phase 8)
- useState + useEffect for state management (Phase 8)
- MultiCollectionSearchEngine with RRF merge (Phase 15)
- Source tagging: `source?: 'ast' | 'llm'` on RetrievalResult (Phase 15)
- Collection naming: `{base}` for AST, `{base}-llm` for LLM (Phase 14)
- Score threshold default 0.3 (Phase 11)
- Recharts already in project (Phase 8)

---

## Area 1: Search Results Display

### Q1: What layout for search results?

**Options:** Card grid | List with expandable rows (Recommended) | Compact table
**Answer:** List with expandable rows
**Decision:** D-01 — Click a row to expand and show code preview inline

### Q2: Code preview rendering?

**Options:** Plain monospace pre block (Recommended) | Syntax-highlighted with Prism/Shiki | Truncated raw text
**Answer:** Plain monospace pre block
**Decision:** D-02 — No syntax highlighting, no extra dependency

### Q3: What metadata on each result row?

**Options:** Full metadata set (Recommended) | Minimal (file path + score only) | Medium (path, score, source)
**Answer:** Full metadata set
**Decision:** D-03 — File path, line range, score, source tag, chunk type, matched vector

### Q4: How to distinguish AST vs LLM results?

**Options:** Colored pill badges (Recommended) | Icon prefix | Background color tint
**Answer:** Colored pill badges
**Decision:** D-04 — Blue for AST, purple for LLM

---

## Area 2: Collection Selector & Controls

### Q1: Collection selector UI element?

**Options:** Dropdown select inline with search (Recommended) | Radio button group below search | Tab bar above results
**Answer:** Dropdown select inline with search
**Decision:** D-05

### Q2: Default collection selection?

**Options:** Both (merged via RRF) (Recommended) | AST only | Whichever has more chunks
**Answer:** Both (merged via RRF)
**Decision:** D-06

### Q3: What if LLM collection doesn't exist?

**Options:** Disable with tooltip (Recommended) | Hide the option entirely | Show but error on selection
**Answer:** Disable with tooltip
**Decision:** D-07

### Q4: What if no collections exist at all?

**Options:** Block entire search UI with setup message (Recommended) | Show empty results with hint | Redirect to config page
**Answer:** Block entire search UI with setup message
**Decision:** D-08 — Direct user to run `ia-framework index`

### Q5: Search trigger behavior?

**Options:** Explicit submit (Enter or button) (Recommended) | Auto-search with debounce | Both
**Answer:** Explicit submit
**Decision:** D-09

### Q6: Adjustable result limit?

**Options:** Dropdown with presets: 5, 10, 20, 50 (Recommended) | Fixed at 10 | Free-form number input
**Answer:** Dropdown with presets
**Decision:** D-10

### Q7: Score threshold adjustable?

**Options:** Yes, adjustable (Recommended) | No, fixed at 0.3
**Answer:** Yes, adjustable
**Decision:** D-11 — Default 0.3

### Q8: Search mode toggle (semantic/hybrid)?

**Options:** Single mode, no toggle (Recommended) | Toggle between semantic and hybrid
**Answer:** Single mode, no toggle
**Decision:** D-12

### Q9: Pre-search empty state?

**Options:** Placeholder text with example queries (Recommended) | Blank area | Recent searches (Phase 17)
**Answer:** Placeholder text with example queries
**Decision:** D-13

### Q10: No-results state?

**Options:** Message with suggestions (Recommended) | Just "No results" | Auto-suggest broader search
**Answer:** Message with suggestions
**Decision:** D-14

---

## Area 3: Metrics Panel Design

### Q1: Metrics panel placement and visibility?

**Options:** Collapsible below results, shown by default (Recommended) | Always visible sidebar | Drawer/modal
**Answer:** Collapsible below results, shown by default
**Decision:** D-15

### Q2: Which metrics to display?

**Options:** Full set: latency, chunks scanned, results returned, score range (Recommended) | Minimal: latency + result count | Comprehensive with percentiles
**Answer:** Full set
**Decision:** D-16

### Q3: Metrics visualization style?

**Options:** StatCard mini cards for numbers (Recommended) | Inline text values | Custom gauge widgets
**Answer:** StatCard mini cards
**Decision:** D-17 — Reuse existing StatCard component

### Q4: Score distribution visualization?

**Options:** Recharts bar chart by rank, color-coded by source (Recommended) | Histogram of score buckets | Simple min/max/avg text
**Answer:** Recharts bar chart by rank, color-coded by source
**Decision:** D-18 — Blue=AST, purple=LLM

---

## Area 4: A/B Comparison Mode

### Q1: How to enter A/B mode?

**Options:** Compare button next to search button (Recommended) | Separate A/B tab | Toggle switch in controls
**Answer:** Compare button next to search button
**Decision:** D-19

### Q2: A/B layout?

**Options:** Two-column split, AST left, LLM right (Recommended) | Stacked (AST above, LLM below) | Tabbed (switch between)
**Answer:** Two-column split
**Decision:** D-20

### Q3: How to show overlapping results?

**Options:** Subtle badge/indicator on overlapping rows (Recommended) | Connected lines between columns | Color highlight on row background
**Answer:** Subtle badge/indicator
**Decision:** D-21 — Same file + overlapping line ranges = overlap

### Q4: A/B metrics display?

**Options:** Per-column metrics + comparison summary row at top (Recommended) | Single combined metrics panel | No per-column metrics
**Answer:** Per-column metrics + comparison summary row
**Decision:** D-22

---

## Area 5: API Contract & Endpoints

### Q1: How many search endpoints?

**Options:** Single POST /api/search (Recommended) | Separate endpoints per search type | GET with query params
**Answer:** Single POST /api/search
**Decision:** D-23 — Body: `{ query, limit, scoreThreshold, collections }`

### Q2: Response shape?

**Options:** Dashboard-specific DTO, flatten and filter fields (Recommended) | Return raw RetrievalResult | Wrap raw result with extra fields
**Answer:** Dashboard-specific DTO
**Decision:** D-24 — Flatten RetrievalResult, drop imports/exports, add metrics object

### Q3: How does frontend discover available collections?

**Options:** Dedicated GET /api/search/collections endpoint (Recommended) | Include in /api/status response | Hardcode in frontend
**Answer:** Dedicated GET /api/search/collections
**Decision:** D-25

### Q4: A/B comparison API approach?

**Options:** Frontend makes two parallel POST /api/search calls (Recommended) | Single POST /api/search/compare endpoint
**Answer:** Two parallel calls from frontend
**Decision:** D-26

---

## Area 6: Loading & Error States

### Q1: Loading indicator style?

**Options:** Skeleton placeholders (Recommended) | Simple spinner | Inline progress bar
**Answer:** Skeleton placeholders
**Decision:** D-27 — Shimmer/pulse matching result row shapes

### Q2: Error display approach?

**Options:** Inline error in results area (Recommended) | Toast notification
**Answer:** Inline error in results area
**Decision:** D-28 — Retry button, query preserved in input

### Q3: A/B partial failure handling?

**Options:** Show results on working side, error on failed side (Recommended) | Fail the entire comparison
**Answer:** Fail the entire comparison
**Decision:** D-29

### Q4: In-flight behavior?

**Options:** Disable search controls during loading (Recommended) | Allow new search, cancel previous
**Answer:** Disable search controls during loading
**Decision:** D-30

---

## Area 7: Navigation Placement

### Q1: Sidebar position?

**Options:** Second item, after Overview (Recommended) | After Benchmarks | Bottom of sidebar
**Answer:** Second item, after Overview
**Decision:** D-31

### Q2: Route path?

**Options:** /search (Recommended) | /rag/search
**Answer:** /rag/search
**Decision:** D-32 — Namespaced anticipating future RAG sub-pages

### Q3: Default page?

**Options:** Keep Overview as default (Recommended) | Make Search the default
**Answer:** Keep Overview as default
**Decision:** D-34

### Q4: Sidebar label?

**Options:** Search (Recommended) | RAG Search | Retrieval
**Answer:** Search
**Decision:** D-33

---

## Summary

- **7 areas discussed**, **34 decisions captured**
- **0 decisions deferred to agent discretion** (all answered directly, agent discretion section covers cosmetic details)
- **User deviated from recommendations on:** D-29 (chose "fail entire comparison" over partial results), D-32 (chose /rag/search over /search)

---

_Phase: 16-dashboard-search_
_Discussion completed: 2026-04-14_
