---
status: awaiting_human_verify
trigger: 'mcp-search-returns-empty — search_codebase_hybrid returns empty results for ALL semantic queries'
created: 2026-04-07T00:00:00Z
updated: 2026-04-08T13:00:00Z
symptoms_prefilled: true
---

## Current Focus

<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: VERIFIED — wrong property key `result` → should be `points` in searchHybrid result unwrapping
test: Live test confirmed: searchHybrid now returns 3 results instead of 0; all 69 tests pass
expecting: User confirms search_codebase_hybrid works in MCP client
next_action: Await human verification that search_codebase_hybrid tool returns results via MCP

## Symptoms

<!-- Written during gathering, then IMMUTABLE -->

expected: search_codebase_hybrid returns matching code chunks from the indexed codebase
actual: Empty results array — no results returned for any query, including "entrycommand"
errors: Silent empty response — no errors or exceptions, just empty array
reproduction: Call search_codebase_hybrid with any query via the ia-framework MCP server
started: Never worked — first time trying
indexing: User reports codebase was indexed successfully via the indexer

## Eliminated

<!-- APPEND only - prevents re-investigating -->

- hypothesis: Qdrant collection is empty or not indexed
  evidence: Collection "codebase" has 3,671 points with all three vectors (text, code, sparse)
  timestamp: 2026-04-07T01:00:00Z

- hypothesis: Embedding model failure or dimension mismatch
  evidence: qwen3-embedding:0.6b generates 1024-dim vectors matching collection config; Qdrant direct search returns results
  timestamp: 2026-04-07T01:00:00Z

- hypothesis: Collection name mismatch
  evidence: Both indexer and MCP server use "codebase" from project.json
  timestamp: 2026-04-07T01:00:00Z

- hypothesis: Score threshold filtering too strict
  evidence: searchHybrid does NOT apply scoreThreshold (uses RRF fusion which doesn't threshold) — but results were already []
  timestamp: 2026-04-07T01:00:00Z

## Evidence

<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-07T01:00:00Z
  checked: Qdrant REST API directly via curl
  found: Collection has 3671 points, sparse_vectors.sparse with modifier:idf configured, status green
  implication: Data is indexed correctly

- timestamp: 2026-04-07T01:00:00Z
  checked: Manual Qdrant /points/query call with real embedding
  found: Returns actual results from EntryService.java etc — Qdrant is working fine
  implication: Problem is in the JS layer, not Qdrant

- timestamp: 2026-04-07T01:00:00Z
  checked: @qdrant/js-client-rest v1.17.0 SDK — client.query() return type
  found: Returns Schemas['QueryResponse'] = { points: ScoredPoint[] } (not { result: [...] })
  implication: The JS client returns an object with .points, NOT .result

- timestamp: 2026-04-07T01:00:00Z
  checked: packages/vector-store/src/qdrant.ts line 186-189 (searchHybrid method)
  found: Code does (results as { result: unknown[] }).result ?? [] but .result is always undefined
  implication: THIS IS THE BUG — wrong property name causes empty array every time

- timestamp: 2026-04-07T01:00:00Z
  checked: Node.js live test confirming the bug
  found: results.result = undefined → [] (bug); results.points = [{...}] (correct fix)
  implication: Simple one-line fix needed

- timestamp: 2026-04-08T13:00:00Z
  checked: After fix — live searchHybrid call against codebase collection
  found: Returns 3 results for sparse query — no longer returning empty array
  implication: Fix is confirmed correct end-to-end

- timestamp: 2026-04-08T13:00:00Z
  checked: Full test suite (vector-store 14, retrieval 30, mcp-server 21)
  found: All 65 tests pass — no regressions
  implication: Fix is safe

## Resolution

<!-- OVERWRITE as understanding evolves -->

root_cause: QdrantVectorStore.searchHybrid() in packages/vector-store/src/qdrant.ts incorrectly reads `results.result` to unwrap the client.query() response. The @qdrant/js-client-rest SDK v1.17.0 returns Schemas['QueryResponse'] = `{ points: ScoredPoint[] }`, NOT `{ result: [...] }`. Since `results.result` is always undefined, the `?? []` fallback returns an empty array for every hybrid search call. The test for this code path also mocked the wrong return shape (`{ result: [...] }` instead of `{ points: [...] }`), so the bug was never caught by tests.
fix: Changed line 187 in qdrant.ts from `(results as { result: unknown[] }).result ?? []` to `(results as { points: unknown[] }).points ?? []`. Also updated the two test mock calls in qdrant.test.ts (Tests 12 and 13) to use `{ points: [...] }` to match the real SDK shape.
verification: Live test with real Qdrant returns 3 results for sparse query; all 65 tests pass
files_changed: [packages/vector-store/src/qdrant.ts, packages/vector-store/src/qdrant.test.ts]
