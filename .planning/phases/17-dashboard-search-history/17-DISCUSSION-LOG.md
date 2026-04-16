# Phase 17: Dashboard Search History - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 17-dashboard-search-history
**Areas discussed:** History persistence & storage, Replay behavior, History browsing & filtering, Navigation & page structure

---

## History Persistence & Storage

| Option        | Description                                                                                                                               | Selected           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Full snapshot | Each search entry stores: query text, params (limit, threshold, collection), full results array (as JSON text), metrics object, timestamp | :white_check_mark: |
| Summary only  | Store only: query text, params, metrics summary. No results stored — replay re-executes live                                              |                    |

**User's choice:** Full snapshot
**Notes:** None — straightforward choice for complete data preservation.

---

| Option               | Description                                                                   | Selected           |
| -------------------- | ----------------------------------------------------------------------------- | ------------------ |
| Separate SQLite file | New file at .ia-framework/search-history.sqlite — each concern has its own DB | :white_check_mark: |
| Same metrics.sqlite  | Add search_history table to existing metrics.sqlite                           |                    |

**User's choice:** Separate SQLite file
**Notes:** Consistent with existing pattern (metrics.sqlite, benchmarks.sqlite).

---

| Option               | Description                                                                   | Selected           |
| -------------------- | ----------------------------------------------------------------------------- | ------------------ |
| No automatic limit   | Keep all searches indefinitely. SQLite handles thousands fine for single-user | :white_check_mark: |
| Rolling window       | Keep only last N entries, auto-prune oldest                                   |                    |
| Time-based retention | Auto-delete entries older than N days                                         |                    |

**User's choice:** No automatic limit
**Notes:** None.

---

| Option                 | Description                                              | Selected           |
| ---------------------- | -------------------------------------------------------- | ------------------ |
| Auto-save all searches | Every search saved automatically — no user action needed | :white_check_mark: |
| Explicit save          | Only save when user clicks "Save" button                 |                    |

**User's choice:** Auto-save all searches
**Notes:** Directly satisfies DASH-12: "every dashboard search is automatically persisted."

---

## Replay Behavior

| Option                   | Description                                                      | Selected           |
| ------------------------ | ---------------------------------------------------------------- | ------------------ |
| Re-execute + diff        | Re-execute same query live, show old vs new results side-by-side | :white_check_mark: |
| View saved snapshot only | Just load the saved snapshot, no live re-execution               |                    |
| Pre-fill search bar only | Pre-fill search bar with old query, user runs manually           |                    |

**User's choice:** Re-execute + diff
**Notes:** Satisfies DASH-13: "replay any past query to compare results before and after re-indexing."

---

| Option                 | Description                                                                             | Selected           |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------ |
| Side-by-side columns   | Two columns: left = original, right = fresh. Highlight new/removed/rank-changed results | :white_check_mark: |
| Unified annotated list | Single merged list with status annotations per row                                      |                    |

**User's choice:** Side-by-side columns
**Notes:** Follows existing ABComparisonLayout pattern from Phase 16.

---

| Option                 | Description                                                             | Selected           |
| ---------------------- | ----------------------------------------------------------------------- | ------------------ |
| Use original params    | Replay always uses exact original search parameters for fair comparison | :white_check_mark: |
| Allow param adjustment | Let user tweak params before replaying                                  |                    |

**User's choice:** Use original params
**Notes:** Ensures apples-to-apples comparison of index quality changes.

---

| Option           | Description                                                            | Selected           |
| ---------------- | ---------------------------------------------------------------------- | ------------------ |
| Warn and proceed | Show warning that collection is gone, proceed with current collections | :white_check_mark: |
| Block replay     | Block replay entirely if original collection missing                   |                    |

**User's choice:** Warn and proceed
**Notes:** Diff will naturally show "all results new" if source changed.

---

## History Browsing & Filtering

| Option                     | Description                                                                          | Selected           |
| -------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Table with expandable rows | Each row: timestamp, query, collection, result count, top score, latency. Expandable | :white_check_mark: |
| Timeline / card list       | Vertical timeline with cards. More visual, takes more space                          |                    |

**User's choice:** Table with expandable rows
**Notes:** Follows RunHistoryTable pattern from benchmarks page.

---

| Option                   | Description                                                         | Selected           |
| ------------------------ | ------------------------------------------------------------------- | ------------------ |
| Inline filter bar        | Filter bar above table: text input, dropdown, date range, min score | :white_check_mark: |
| Collapsible filter panel | Expands below header, more room but extra click                     |                    |

**User's choice:** Inline filter bar
**Notes:** Satisfies DASH-14 filter requirements.

---

| Option                   | Description                                          | Selected           |
| ------------------------ | ---------------------------------------------------- | ------------------ |
| Page-based (20 per page) | Previous/Next buttons at bottom, 20 entries per page | :white_check_mark: |
| Infinite scroll          | Load 20 initially, append more on scroll             |                    |
| Load all at once         | Load everything. Won't scale                         |                    |

**User's choice:** Page-based (20 per page)
**Notes:** Follows MetricsStore.listEvents() LIMIT/OFFSET pattern.

---

| Option                  | Description                                                                            | Selected           |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------ |
| Sortable columns        | Default newest-first. Clickable headers: date, query, result count, top score, latency | :white_check_mark: |
| Fixed newest-first only | No sorting flexibility                                                                 |                    |

**User's choice:** Sortable columns
**Notes:** None.

---

## Navigation & Page Structure

| Option             | Description                                                | Selected           |
| ------------------ | ---------------------------------------------------------- | ------------------ |
| Separate page      | New page at /rag/search/history with its own sidebar entry | :white_check_mark: |
| Tab on search page | Add tab bar to existing /rag/search page                   |                    |

**User's choice:** Separate page
**Notes:** Clean separation — Search page does searching, History page does browsing/replay.

---

| Option                 | Description                                       | Selected           |
| ---------------------- | ------------------------------------------------- | ------------------ |
| Sub-item under Search  | "History" indented under "Search" in sidebar      | :white_check_mark: |
| Top-level sidebar item | "Search History" as top-level item after "Search" |                    |

**User's choice:** Sub-item under Search
**Notes:** Groups related RAG pages together visually.

---

| Option                  | Description                                                                     | Selected           |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------ |
| Bidirectional links     | Search page shows "View history" link; History entries have "Search again" link | :white_check_mark: |
| Sidebar navigation only | No cross-linking between pages                                                  |                    |

**User's choice:** Bidirectional links
**Notes:** None.

---

| Option                 | Description                                                       | Selected           |
| ---------------------- | ----------------------------------------------------------------- | ------------------ |
| Individual + clear all | Delete icon per row + "Clear all" button with confirmation dialog | :white_check_mark: |
| No delete capability   | Append-only history                                               |                    |
| Clear all only         | Only bulk clear, no individual deletes                            |                    |

**User's choice:** Individual + clear all
**Notes:** None.

---

## Agent's Discretion

- SearchHistoryStore internal table schema details
- Exact row expansion animation and styling
- Filter debounce timing
- Replay diff highlight styling
- Pagination button styling
- Sort column toggle behavior
- Delete confirmation dialog implementation
- Query text truncation in table rows

## Deferred Ideas

- Analytics dashboard for search patterns — Phase 18
- Export search history to CSV/JSON — backlog
- Syntax highlighting in code previews — same deferral as Phase 16
- Comparing two historical searches against each other — future enhancement
