---
phase: 11-mrr-optimization
verified: 2026-04-07T14:27:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: 'Run live benchmark sweep against a real Qdrant instance'
    expected: 'MRR >= 0.45 and Hit@10 >= 0.65 at threshold 0.3 against the 30-query corpus'
    why_human: 'Requires Docker + Qdrant running + indexed codebase; cannot verify against live embeddings programmatically'
  - test: 'Exercise search_codebase_hybrid MCP tool from OpenCode'
    expected: 'Returns ranked results using hybrid RRF fusion, not just dense vector search'
    why_human: 'Requires live MCP server + Qdrant with sparse_vectors collection; wiring verifiable in code but runtime behavior needs live test'
---

# Phase 11: MRR Optimization Verification Report

**Phase Goal:** Improve retrieval quality through corpus expansion and threshold tuning  
**Verified:** 2026-04-07T14:27:00Z  
**Status:** ✅ PASSED  
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                               | Status     | Evidence                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Benchmark corpus has exactly 30 queries across 6 categories                         | ✓ VERIFIED | `.ia-framework/benchmark-queries.json` — 30 items, IDs: `sem-01..05`, `kw-01..05`, `xf-01..05`, `cx-01..05`, `neg-01..05`, `edge-01..05`                                     |
| 2   | `validateCorpus()` catches invalid expectedFiles paths before benchmark runs        | ✓ VERIFIED | `packages/benchmark/src/corpus.ts:131` — `validateCorpus()` implemented; CLI calls it at line 88 and exits 1 on errors                                                       |
| 3   | Text descriptions are used as separate vectors alongside code vectors               | ✓ VERIFIED | `packages/indexer/src/pipeline.ts` — separate `textDescriptions`/`textVectors` and `codeTexts`/`codeVectors` embed loops; `chunkToDescription()` from `chunk-description.ts` |
| 4   | Qdrant collection is initialized with a sparse vector field using IDF modifier      | ✓ VERIFIED | `packages/vector-store/src/qdrant.ts:87-89` — `sparse_vectors: { sparse: { modifier: 'idf' } }`                                                                              |
| 5   | `searchHybrid()` uses 3-prefetch RRF fusion (dense code + dense text + sparse BM25) | ✓ VERIFIED | `packages/vector-store/src/qdrant.ts` — 3-prefetch RRF; `packages/retrieval/src/search-engine.ts:245-249` — sparse query built + passed                                      |
| 6   | Hash collision bug in `computeTermFrequencySparseVector` is fixed via `indexMap`    | ✓ VERIFIED | `packages/retrieval/src/search-engine.ts:291-298` — `Map<number, number>` with `indexMap.set(idx, (indexMap.get(idx) ?? 0) + count)`                                         |
| 7   | Default score threshold updated to 0.3 (optimal from sweep)                         | ✓ VERIFIED | `packages/mcp-server/src/tools/search-codebase.ts:68` — `scoreThreshold: input.score_threshold ?? 0.3`                                                                       |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact                                                       | Description                                                                              | Status     | Details                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| `.ia-framework/benchmark-queries.json`                         | 30-query flat JSON corpus                                                                | ✓ VERIFIED | 30 queries, 6 category prefixes × 5, all `expectedFiles` paths verified to exist                          |
| `packages/benchmark/src/corpus.ts`                             | `validateCorpus()` + `CorpusValidationError`                                             | ✓ VERIFIED | ~160 lines; both flat and wrapped JSON formats handled                                                    |
| `packages/benchmark/src/corpus.test.ts`                        | 7 validateCorpus tests (Tests 7–13)                                                      | ✓ VERIFIED | 26 tests total in package, all pass                                                                       |
| `packages/benchmark/src/index.ts`                              | Exports `validateCorpus`, `CorpusValidationError`, `loadCorpus`, `scaffoldExampleCorpus` | ✓ VERIFIED | All 4 symbols exported                                                                                    |
| `packages/indexer/src/chunk-description.ts`                    | `chunkToDescription()` for prose text embeddings                                         | ✓ VERIFIED | Covers all chunkTypes, parentName, exports/imports                                                        |
| `packages/indexer/src/chunk-description.test.ts`               | 12 tests                                                                                 | ✓ VERIFIED | 29 tests total in indexer package, all pass                                                               |
| `packages/indexer/src/pipeline.ts`                             | Dual embed loops + sparse vector on upsert                                               | ✓ VERIFIED | `textDescriptions`/`textVectors` loop + `codeTexts`/`codeVectors` loop; `sparseVector` on both push sites |
| `packages/vector-store/src/interface.ts`                       | `SparseVector`, `HybridSearchOptions`, `VectorStore.searchHybrid()`                      | ✓ VERIFIED | All 5 additions present                                                                                   |
| `packages/vector-store/src/qdrant.ts`                          | `initialize()` sparse config, `upsertBatch()` sparse, `searchHybrid()` RRF               | ✓ VERIFIED | Sparse IDF modifier at line 87; RRF fusion in `searchHybrid()`                                            |
| `packages/vector-store/src/qdrant.test.ts`                     | 6 new sparse/hybrid tests (Tests 9–14)                                                   | ✓ VERIFIED | 14 tests total, all pass                                                                                  |
| `packages/retrieval/src/search-engine.ts`                      | `searchHybrid()`, `computeTermFrequencySparseVector()`, `djb2Hash()`, `indexMap` fix     | ✓ VERIFIED | All 4 functions present; collision fix at lines 291–298                                                   |
| `packages/retrieval/src/search-engine.test.ts`                 | 30 tests (5 new for hybrid/sparse)                                                       | ✓ VERIFIED | 30 tests total, all pass                                                                                  |
| `packages/retrieval/src/index.ts`                              | Exports `computeTermFrequencySparseVector`                                               | ✓ VERIFIED | Export present                                                                                            |
| `packages/mcp-server/src/tools/search-codebase-hybrid.ts`      | `registerSearchCodebaseHybridTool()` + handler                                           | ✓ VERIFIED | Tool and handler implemented                                                                              |
| `packages/mcp-server/src/tools/search-codebase-hybrid.test.ts` | 4 tests                                                                                  | ✓ VERIFIED | 21 tests total in mcp-server package, all pass                                                            |
| `packages/mcp-server/src/server.ts`                            | `registerSearchCodebaseHybridTool` called                                                | ✓ VERIFIED | Import at line 3; call at line 43                                                                         |
| `packages/mcp-server/src/tools/search-codebase.ts`             | Default threshold updated to 0.3                                                         | ✓ VERIFIED | Line 68: `scoreThreshold: input.score_threshold ?? 0.3`                                                   |
| `packages/cli/src/commands/benchmark.command.ts`               | `validateCorpus()` called pre-run, exits 1 on error                                      | ✓ VERIFIED | Lines 74, 88 — load then validate with early exit                                                         |

---

### Key Link Verification

| From                                | To                                   | Via                                                             | Status  | Details                                |
| ----------------------------------- | ------------------------------------ | --------------------------------------------------------------- | ------- | -------------------------------------- |
| `benchmark.command.ts`              | `validateCorpus()`                   | import + call at line 88                                        | ✓ WIRED | Exits 1 on `CorpusValidationError`     |
| `pipeline.ts`                       | `chunkToDescription()`               | import + call in textDescriptions loop                          | ✓ WIRED | Used on both function and class chunks |
| `pipeline.ts`                       | `computeTermFrequencySparseVector()` | import from retrieval + call on upsert                          | ✓ WIRED | `sparseVector` on both push sites      |
| `qdrant.ts` `upsertBatch()`         | sparse vector field                  | `vectors.sparse` in Qdrant point                                | ✓ WIRED | Included in each upserted point        |
| `search-engine.ts` `searchHybrid()` | `VectorStore.searchHybrid()`         | call with 3 query vectors                                       | ✓ WIRED | Dense code + dense text + sparse BM25  |
| `server.ts`                         | `search-codebase-hybrid` tool        | `registerSearchCodebaseHybridTool(server, config.searchEngine)` | ✓ WIRED | Line 43                                |
| `search-codebase.ts`                | threshold 0.3                        | `scoreThreshold: input.score_threshold ?? 0.3`                  | ✓ WIRED | Default applied at tool boundary       |

---

### Requirements Coverage

| Requirement | Plans        | Description                                                          | Status      | Evidence                                                                                                                     |
| ----------- | ------------ | -------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `BNCH-01`   | 11-01, 11-04 | Benchmark corpus with 30 queries + MRR measurement + threshold sweep | ✓ SATISFIED | 30-query corpus validated; `validateCorpus()` guards CLI; threshold sweep in 11-04 selected 0.3 (MRR 0.50, Hit@10 0.73)      |
| `RETR-01`   | 11-02, 11-03 | Retrieval quality improvement via text vectors + hybrid BM25 search  | ✓ SATISFIED | `chunkToDescription()` prose vectors; Qdrant sparse IDF collection; RRF 3-prefetch hybrid search; MRR improved from baseline |

**Note — REQUIREMENTS.md documentation gap:** The phase-requirement table in `REQUIREMENTS.md` still shows `BNCH-01 | Phase 7 | Partial (retrieval quality only)`. This was not updated to reflect Phase 11's completion of the 30-query corpus + threshold sweep. The checkbox itself is `[x]`. This is a **documentation-only gap** — not a code gap — and does not affect goal achievement.

---

### Anti-Patterns Found

| File       | Line | Pattern | Severity | Impact |
| ---------- | ---- | ------- | -------- | ------ |
| None found | —    | —       | —        | —      |

Scanned: all 17 artifact files. No TODO/FIXME stubs, no placeholder returns, no unwired handlers, no hardcoded empty arrays flowing to user-visible output.

---

### Human Verification Required

#### 1. Live benchmark sweep

**Test:** Start Docker + Qdrant, index the ia-framework codebase, run `ia-framework benchmark --corpus .ia-framework/benchmark-queries.json`  
**Expected:** MRR ≥ 0.45 and Hit@10 ≥ 0.65 at threshold 0.3 (matching the 11-04 sweep results: MRR 0.50, Hit@10 0.73)  
**Why human:** Requires a running Qdrant instance with actual embeddings — cannot reproduce with grep/file checks alone

#### 2. Hybrid MCP tool end-to-end

**Test:** From OpenCode, invoke the `search_codebase_hybrid` tool with a query like "how does sparse vector indexing work"  
**Expected:** Returns ranked results using RRF fusion; results differ from pure dense search and include files contributing to BM25 term overlap  
**Why human:** Runtime Qdrant behavior with live sparse vectors; code wiring is verified but fusion quality requires live execution

---

### Gaps Summary

No gaps found. All 7 observable truths verified. All 17 artifacts exist, are substantive, and are correctly wired. Both requirements (`BNCH-01`, `RETR-01`) are satisfied with direct code evidence.

The only open item is a minor documentation inconsistency in the `REQUIREMENTS.md` phase-requirement table (not updated to reflect Phase 11's BNCH-01 completion). This does not block phase sign-off.

---

## Test Suite Summary (All Packages Affected by Phase 11)

| Package                      | Test Files | Tests   | Result          |
| ---------------------------- | ---------- | ------- | --------------- |
| `@ia-framework/benchmark`    | 3          | 26      | ✅ All pass     |
| `@ia-framework/indexer`      | 2          | 29      | ✅ All pass     |
| `@ia-framework/vector-store` | 1          | 14      | ✅ All pass     |
| `@ia-framework/retrieval`    | 2          | 30      | ✅ All pass     |
| `@ia-framework/mcp-server`   | 4          | 21      | ✅ All pass     |
| **Total**                    | **12**     | **120** | **✅ All pass** |

---

## Benchmark Sweep Results (From 11-04 Execution)

| Threshold | Hit@10 | MRR  | Avg Latency | Selected |
| --------- | ------ | ---- | ----------- | -------- |
| 0.3       | 0.73   | 0.50 | 92ms        | ✅ Yes   |
| 0.4       | 0.73   | 0.50 | 91ms        | —        |
| 0.5       | 0.73   | 0.50 | 95ms        | —        |
| 0.6       | 0.67   | 0.46 | 94ms        | —        |

Threshold 0.3 selected: tied MRR with 0.4/0.5 but maximises recall (no over-filtering).

---

_Verified: 2026-04-07T14:27:00Z_  
_Verifier: the agent (gsd-verifier)_
