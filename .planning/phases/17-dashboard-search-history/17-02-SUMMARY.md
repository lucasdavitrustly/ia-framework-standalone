---
phase: 17-dashboard-search-history
plan: 02
status: complete
commits:
  - 9bcdf0f feat(17-02): add search history page, table, filters, replay diff, and navigation
---

## Summary

Plan 17-02 delivered the full frontend search history experience on top of the backend from Plan 17-01.

### What was built

**Task 1: API client + History page + table + filter bar**

- `apps/dashboard/src/api/client.ts` — extended with `SearchHistoryEntry`, `SearchHistoryListResult`, `SearchHistoryFilters`, `ReplayResponse` types; added `historyId?` to `SearchResponse`; added 5 new `DashboardClient` methods: `getSearchHistory`, `getSearchHistoryEntry`, `replaySearch`, `deleteSearchHistoryEntry`, `clearSearchHistory`
- `apps/dashboard/src/App.tsx` — added route `rag/search/history` → `SearchHistoryPage`
- `apps/dashboard/src/components/Layout.tsx` — added History nav item indented under Search
- `apps/dashboard/src/components/search/HistoryFilterBar.tsx` — inline filter bar with query text (debounced 300ms), collection dropdown, date range pickers, min score input
- `apps/dashboard/src/components/search/HistoryTable.tsx` — sortable columns (Date, Query, Collection, Results, Top Score, Latency), expandable rows showing SavedResultList + MetricsPanel, Replay/Search again/Delete action buttons, pagination with Previous/Next
- `apps/dashboard/src/pages/SearchHistoryPage.tsx` — full page with filter bar, history table, loading/error/empty states, Clear all button (with confirm dialog), replay flow (loading skeleton → ReplayDiffLayout)

**Task 2: ReplayDiffLayout + SearchPage integration**

- `apps/dashboard/src/components/search/ReplayDiffLayout.tsx` — two-column layout (Original saved vs Current replay) with delta summary (latency Δ, results Δ, shared count), diff highlighting (removed results in original column, new results in fresh column via overlays), warning banner for unavailable collections
- `apps/dashboard/src/pages/SearchPage.tsx` — added `useSearchParams` for `?q=` prefill from "Search again" links, added "View history →" link shown after search completes

### Deviations

None — implemented as specified.

### TypeScript

`cd apps/dashboard && npx tsc --noEmit` — clean, no errors.

### Next step

Task 3 is a human-verify checkpoint (gate: blocking). Manual end-to-end verification required.
