---
status: resolved
trigger: 'Dashboard API returns 500 error on GET /api/tuning/chunks?limit=20&offset=0'
created: 2026-04-23T00:00:00Z
updated: 2026-04-23T00:00:00Z
---

## Current Focus

hypothesis: MultiCollectionSearchEngine has no scrollChunks method; app.ts force-casts it with `as unknown as`, causing TypeError at runtime
test: Read MultiCollectionSearchEngine class — confirm scrollChunks is absent
expecting: No scrollChunks method exists → confirms root cause
next_action: Implement scrollChunks adapter in app.ts

## Symptoms

expected: The /api/tuning/chunks endpoint should return chunk data successfully (200).
actual: API returns 500 error on GET /api/tuning/chunks?limit=20&offset=0
errors: "Error: API error 500: /api/tuning/chunks?limit=20&offset=0"
reproduction: Open the dashboard tuning page, it tries to load chunks and fails with 500.
started: Possibly after recent merge.

## Eliminated

(none)

## Evidence

- timestamp: 2026-04-23T00:01:00Z
  checked: packages/dashboard-api/src/routes/tuning.ts — route handler
  found: Handler calls deps.vectorStore.scrollChunks() at line 66
  implication: Requires scrollChunks method on the vectorStore dep

- timestamp: 2026-04-23T00:02:00Z
  checked: packages/dashboard-api/src/app.ts lines 94-96
  found: vectorStore is set to `deps.search.multiSearchEngine as unknown as` — force-cast
  implication: The cast hides that MultiCollectionSearchEngine lacks scrollChunks

- timestamp: 2026-04-23T00:03:00Z
  checked: packages/retrieval/src/multi-collection-search-engine.ts
  found: Class has search(), searchHybrid(), searchWithExpansion(), getFile() — NO scrollChunks
  implication: Confirmed root cause — scrollChunks is undefined at runtime → TypeError → 500

- timestamp: 2026-04-23T00:04:00Z
  checked: grep for scrollChunks across entire codebase
  found: Only defined in tuning.ts interface and tuning.test.ts mocks — never implemented anywhere
  implication: This was a missing implementation from the start, hidden by `as unknown as` cast

## Resolution

root_cause: MultiCollectionSearchEngine does not implement scrollChunks(). app.ts force-casts it to TuningVectorStoreDep, so TypeScript doesn't catch the error. At runtime, calling undefined function throws TypeError → 500.
fix: (1) Added scroll() and countPoints() to VectorStore interface + QdrantVectorStore. (2) Built scrollChunks adapter in app.ts using real Qdrant scroll+count APIs instead of force-casting MultiCollectionSearchEngine. (3) Passed vectorStores map from server.ts through app deps.
verification: All 75 dashboard-api tests pass. All 14 vector-store tests pass. Build succeeds.
files_changed: [packages/vector-store/src/interface.ts, packages/vector-store/src/qdrant.ts, packages/dashboard-api/src/app.ts, packages/dashboard-api/src/server.ts]
