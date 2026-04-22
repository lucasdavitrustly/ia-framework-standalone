---
status: resolved
trigger: 'search-badge-shows-ast: badge shows AST when LLM selected'
created: 2026-04-22T00:00:00Z
updated: 2026-04-22T15:16:00Z
---

## Current Focus

hypothesis: API fix is correct (proven by tests T3b/T3c). User likely running stale server process or Docker container with old code.
test: Added regression tests that mock engine returning NO source field, verify API response has correct source
expecting: User restarts server and confirms fix works
next_action: User verification — restart server process and test again

## Symptoms

expected: When LLM search is selected, results badges show "LLM"
actual: Badges show "AST" even when LLM is selected
errors: None
reproduction: Select LLM in search dropdown, search any query
started: Unknown

## Eliminated

(none)

## Evidence

- timestamp: 2026-04-22
  checked: packages/retrieval/src/search-engine.ts toRetrievalResult()
  found: Does NOT set `source` field on RetrievalResult
  implication: All results from SearchEngine.search() have source=undefined

- timestamp: 2026-04-22
  checked: packages/dashboard-api/src/routes/search.ts mapResult()
  found: Line 42: `source: r.source ?? 'ast'` — defaults undefined to 'ast'
  implication: Any result without explicit source tag shows as AST

- timestamp: 2026-04-22
  checked: packages/dashboard-api/src/routes/search.ts single-collection path (lines 92-103)
  found: Calls engineEntry.engine.search() directly without tagging source
  implication: Single-collection searches (ast-only or llm-only) never have source set

- timestamp: 2026-04-22
  checked: packages/retrieval/src/rrf.ts rrfMerge()
  found: Correctly tags source when merging (lines 40, 63)
  implication: Multi-collection ("both") path works correctly; only single-collection is broken

- timestamp: 2026-04-22T15:10
  checked: Frontend data flow end-to-end (SourceTag, SearchResultRow, SearchResultList, SearchPage, client.ts)
  found: Frontend renders result.source directly — no transformation, override, or cache
  implication: If API returns source='llm', frontend will show 'LLM' badge correctly

- timestamp: 2026-04-22T15:12
  checked: Added regression tests T3b and T3c in search.test.ts
  found: Tests mock engine returning results WITHOUT source field, verify API response has correct source
  implication: Both tests pass — API fix correctly tags single-collection results

- timestamp: 2026-04-22T15:14
  checked: Built dist output (packages/dashboard-api/dist/index.js lines 260-263)
  found: Compiled JS has `source: "llm"` in the wantLlm path
  implication: Fix survives tsup compilation correctly

- timestamp: 2026-04-22T15:15
  checked: No service workers, no response caching middleware, no data transformation layers
  found: Clean pass-through from API response to React rendering
  implication: Issue is environmental (stale server process or Docker container)

## Resolution

root_cause: When searching a single collection, the dashboard API calls engine.search() directly, which returns results without the `source` field. The mapResult function defaults undefined source to 'ast', so LLM results are mislabeled.
fix: Tag results with the correct source after single-collection search in the search route (both main search and replay paths). Added regression tests T3b/T3c that verify source tagging when engine returns results without source field.
verification: All 63 dashboard-api tests pass including 2 new regression tests. Compiled dist verified. Frontend code confirmed to render result.source directly with no overrides.
files_changed: [packages/dashboard-api/src/routes/search.ts, packages/dashboard-api/src/routes/search.test.ts]
