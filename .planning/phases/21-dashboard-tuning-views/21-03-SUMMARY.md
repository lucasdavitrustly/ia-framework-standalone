---
phase: 21-dashboard-tuning-views
plan: 03
subsystem: ui
tags: [react, recharts, tuning, histogram, score-distribution, near-miss]

requires:
  - phase: 21-dashboard-tuning-views
    provides: ScoreAnalysisResponse API endpoint, ChunkBrowse API, SearchHistory API, client.ts method stubs
provides:
  - ScoreHistogram component with interactive threshold and query selector
  - NearMissPanel side-by-side returned vs near-miss comparison
  - Score Distribution tab fully wired in TuningPage
affects:
  - future phases using tuning views

tech-stack:
  added: []
  patterns:
    - 'Recharts BarChart with Cell per-bar coloring for threshold visualization'
    - 'Real-time filtering by re-computing from candidates array on threshold change (no re-fetch)'
    - 'Side-by-side comparison layout using CSS grid cols-2'

key-files:
  created:
    - apps/dashboard/src/components/tuning/ScoreHistogram.tsx
    - apps/dashboard/src/components/tuning/NearMissPanel.tsx
  modified:
    - apps/dashboard/src/api/client.ts
    - apps/dashboard/src/pages/TuningPage.tsx

key-decisions:
  - 'Fixed client.ts getTuningScores to return ScoreAnalysisResponse (candidates[]) instead of TuningScoresResponse (buckets[]) to match actual API shape'
  - 'Threshold drag implemented via slider for reliability; ReferenceLine shows position visually'
  - 'NearMissPanel near-miss range is threshold*0.9 to threshold (mirrors backend NEAR_MISS_MARGIN=0.1)'

requirements-completed:
  - DTUN-02
  - DTUN-03

duration: 7min
completed: 2026-04-23
---

# Phase 21 Plan 03: Score Distribution & Near-Miss Panel Summary

**Recharts histogram with interactive threshold slider, query selector, and side-by-side near-miss comparison panel completing the Score Distribution tab**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-23T14:00:10Z
- **Completed:** 2026-04-23T14:06:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- ScoreHistogram: top-50 candidates bucketed into 10 bins with green/orange Cell coloring above/below threshold
- Interactive threshold slider updating bar colors and Returned/Filtered/Near-miss counts in real-time
- Query selector dropdown loading recent searches from search history API
- Score type toggle: Retrieval Scores (from getTuningScores) vs Chunk Quality Scores (from getTuningChunks)
- NearMissPanel: left column returned results, right column near-miss (within 10% below threshold)
- Gap indicator showing score diff between lowest returned and highest near-miss
- TuningPage "coming soon" placeholder replaced with fully wired ScoreHistogram

## Task Commits

1. **Task 1: ScoreHistogram with draggable threshold** - `75d6c4a` (feat)
2. **Task 2: NearMissPanel + wire into TuningPage** - `22627a9` (feat)

## Files Created/Modified

- `apps/dashboard/src/components/tuning/ScoreHistogram.tsx` - Histogram with query selector, score toggle, threshold slider, summary stats
- `apps/dashboard/src/components/tuning/NearMissPanel.tsx` - Side-by-side returned vs near-miss comparison
- `apps/dashboard/src/api/client.ts` - Fixed getTuningScores return type; added ScoreCandidate/ScoreAnalysisResponse types
- `apps/dashboard/src/pages/TuningPage.tsx` - Wired ScoreHistogram into Score Distribution tab

## Decisions Made

- **client.ts type mismatch fixed**: `TuningScoresResponse` had `buckets[]` (old shape) but actual API returns `ScoreAnalysisResponse` with `candidates[]`. Fixed as Rule 1 deviation to match backend reality.
- **Threshold interaction**: Used slider + ReferenceLine combo rather than pure drag-on-chart because Recharts drag on ReferenceLine requires complex coordinate math. Slider is reliable; plan noted "also show slider below chart for precise threshold control" as a fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] client.ts getTuningScores had wrong return type**

- **Found during:** Task 1 (reading client.ts before coding)
- **Issue:** `getTuningScores` returned `TuningScoresResponse` (pre-bucketed `{ historyId, buckets[] }`) but actual API `/api/tuning/scores/:historyId` returns `ScoreAnalysisResponse` (candidates array). Frontend would fail at runtime.
- **Fix:** Replaced `TuningScoresResponse` with `ScoreCandidate` + `ScoreAnalysisResponse` interfaces matching `tuning-types.ts`, updated `getTuningScores` return type.
- **Files modified:** `apps/dashboard/src/api/client.ts`
- **Verification:** `pnpm turbo typecheck` — 24 tasks all successful
- **Committed in:** `75d6c4a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix was essential — without it ScoreHistogram would fail at runtime accessing `.candidates`. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three tuning views now complete: Chunk Inspector (21-01), Prompt Versions (21-02), Score Distribution (21-03)
- Phase 21 is complete — ready for next milestone or phase

---

_Phase: 21-dashboard-tuning-views_
_Completed: 2026-04-23_
