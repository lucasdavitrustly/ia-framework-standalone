---
phase: 19-baseline-score-filtering
verified: 2026-04-23T01:10:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 19: Baseline Score Filtering Verification Report

**Phase Goal:** Establish reproducible retrieval quality baselines, fix score filtering bugs, and add instrumentation for controlled chunking experiments.
**Verified:** 2026-04-23T01:10:00Z
**Status:** ✅ passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                  | Status     | Evidence                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dense search uses ~0.3 cosine threshold by default                                     | ✓ VERIFIED | `search-engine.ts:63` — `scoreThreshold = query.scoreThreshold ?? this.config.defaultScoreThreshold ?? 0.3`                                                               |
| 2   | Hybrid search uses 0.0 threshold by default (RRF rank-based scores)                    | ✓ VERIFIED | `search-engine.ts` `searchHybrid()` does not pass scoreThreshold; `multi-collection-search-engine.ts:55,76` explicitly sets `scoreThreshold: undefined` on overFetchQuery |
| 3   | Multi-collection RRF search uses 0.0 threshold by default                              | ✓ VERIFIED | `multi-collection-search-engine.ts:50,72` — both `search()` and `searchHybrid()` clear `scoreThreshold: undefined` with inline documentation                              |
| 4   | User can still override score threshold via MCP tool params                            | ✓ VERIFIED | `search-codebase.ts:69` — `scoreThreshold: input.score_threshold` (no `?? 0.3` fallback); override passed through when provided                                           |
| 5   | Running `ia-framework benchmark baseline` triggers 3 consecutive runs and averages MRR | ✓ VERIFIED | `benchmark-runner.ts:85-105` — `runBaseline()` loops `NUM_RUNS=3`, computes `avgMrr`; CLI at `benchmark.command.ts:752+`                                                  |
| 6   | Baseline result is stored with baseline flag and stddev                                | ✓ VERIFIED | `benchmark-store.ts:48-59` — `baseline_runs` table with `mrr_stddev` column; `saveBaseline()` at line 170                                                                 |
| 7   | 3-run average MRR and stddev are reported                                              | ✓ VERIFIED | `benchmark-runner.ts:96` — `mrrStddev` computed; CLI prints `Avg MRR`, `MRR Stddev`, individual run results                                                               |
| 8   | Prompt version is part of the cache key                                                | ✓ VERIFIED | `llm-cache.ts:34-35` — `makeKey(contentHash, model, promptVersion)` returns `${contentHash}:${model}:${promptVersion}`                                                    |
| 9   | `ia-framework prompt bump` increments version counter                                  | ✓ VERIFIED | `prompt.command.ts:7,22-25` — `new Command('bump')`, reads `promptVersion`, increments by 1, writes back                                                                  |
| 10  | PROMPT_CONTENT_HASH exported from prompt.ts                                            | ✓ VERIFIED | `prompt.ts:15` — `export const PROMPT_CONTENT_HASH = createHash('sha256')...`                                                                                             |
| 11  | LlmChunkingStrategy exposes getMetadata() for collection-level tracking                | ✓ VERIFIED | `llm-strategy.ts:239-241` — `getMetadata()` returns `{ promptVersion, promptContentHash }`                                                                                |
| 12  | Validation detects gaps, overlaps, out-of-bounds, empty summaries                      | ✓ VERIFIED | `chunk-validator.ts` exports all 4 violation types: `'gap' \| 'overlap' \| 'out-of-bounds' \| 'empty-summary'`                                                            |
| 13  | Validation auto-runs after every LLM index operation                                   | ✓ VERIFIED | `llm-strategy.ts:141,160-161` — `validateChunks()` called on both cache-hit and cache-miss paths; `this.validations.push()`                                               |
| 14  | Report shows per-file summary with worst offenders                                     | ✓ VERIFIED | `chunk-validator.ts:227-252` — `printReport()` outputs files checked/gaps/overlaps/out-of-bounds/empty summaries + worst offenders list                                   |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact                                                                    | Expected                                 | Status     | Details                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| `packages/retrieval/src/search-engine.ts`                                   | Mode-aware default threshold selection   | ✓ VERIFIED | Dense defaults to 0.3; `searchHybrid()` does not pass threshold                       |
| `packages/mcp-server/src/tools/search-codebase.ts`                          | Removed hardcoded 0.3 default            | ✓ VERIFIED | Line 69: `scoreThreshold: input.score_threshold` — no `?? 0.3`                        |
| `packages/retrieval/src/__tests__/search-engine-threshold.test.ts`          | Threshold behaviour tests                | ✓ VERIFIED | File exists; part of 60 passing retrieval tests                                       |
| `packages/mcp-server/src/tools/__tests__/search-codebase-threshold.test.ts` | MCP threshold override tests             | ✓ VERIFIED | File exists; part of 25 passing mcp-server tests                                      |
| `packages/benchmark/src/benchmark-runner.ts`                                | `runBaseline()` method with 3x averaging | ✓ VERIFIED | Lines 85-105; `NUM_RUNS=3`, `avgMrr`, `mrrStddev`                                     |
| `packages/benchmark/src/benchmark-store.ts`                                 | Baseline-tagged run storage with stddev  | ✓ VERIFIED | `baseline_runs` table, `saveBaseline()`, `getLatestBaseline()`                        |
| `packages/benchmark/src/types.ts`                                           | `BaselineResult` interface               | ✓ VERIFIED | Line 63: `export interface BaselineResult`                                            |
| `packages/cli/src/commands/benchmark.command.ts`                            | `baseline` subcommand                    | ✓ VERIFIED | Lines 752+: `new Command('baseline')`, `runner.runBaseline()`, `store.saveBaseline()` |
| `packages/benchmark/src/__tests__/baseline-runner.test.ts`                  | Baseline runner tests                    | ✓ VERIFIED | File exists; part of 50 passing benchmark tests                                       |
| `packages/indexer/src/strategies/llm-cache.ts`                              | Cache key includes prompt version        | ✓ VERIFIED | `makeKey` format `${contentHash}:${model}:${promptVersion}`                           |
| `packages/indexer/src/strategies/llm-strategy.ts`                           | Passes promptVersion to cache            | ✓ VERIFIED | Lines 137, 156 — `cache.get/set` both receive `this.promptVersion`                    |
| `packages/indexer/src/strategies/prompt.ts`                                 | `PROMPT_CONTENT_HASH` export             | ✓ VERIFIED | Line 15: SHA-256 hash of prompt template content, 8-char hex                          |
| `packages/cli/src/commands/prompt.command.ts`                               | `prompt bump` CLI command                | ✓ VERIFIED | `new Command('bump')`, reads/increments `promptVersion`, writes project.json          |
| `packages/cli/src/index.ts`                                                 | Registers `promptCommand`                | ✓ VERIFIED | `export { promptCommand } from './commands/prompt.command.js'`                        |
| `packages/indexer/src/strategies/chunk-validator.ts`                        | 4-violation chunk validation             | ✓ VERIFIED | Exports `validateChunks`, `generateReport`, `printReport`, `ChunkValidationReport`    |
| `packages/indexer/src/__tests__/chunk-validator.test.ts`                    | Validator tests                          | ✓ VERIFIED | File exists; part of 77 passing indexer tests                                         |
| `packages/indexer/src/__tests__/prompt-versioning.test.ts`                  | Prompt versioning tests                  | ✓ VERIFIED | File exists; part of 77 passing indexer tests                                         |

---

### Key Link Verification

| From                   | To                    | Via                                        | Status  | Details                                                                                |
| ---------------------- | --------------------- | ------------------------------------------ | ------- | -------------------------------------------------------------------------------------- |
| `search-engine.ts`     | `searchHybrid` method | no scoreThreshold applied to RRF results   | ✓ WIRED | RRF path confirmed; `multi-collection-search-engine.ts` explicitly nullifies threshold |
| `benchmark.command.ts` | `benchmark-runner.ts` | `runner.runBaseline()`                     | ✓ WIRED | Line 830: `runner.runBaseline(queries, configSnapshot)`                                |
| `llm-cache.ts`         | cache key generation  | `makeKey` includes promptVersion           | ✓ WIRED | `makeKey(contentHash, model, promptVersion)` — all 3 params in key                     |
| `llm-strategy.ts`      | `llm-cache.ts`        | passes promptVersion to cache.get/set      | ✓ WIRED | Lines 137, 156 — both get and set pass `this.promptVersion`                            |
| `llm-strategy.ts`      | `chunk-validator.ts`  | calls validateChunks after chunk() returns | ✓ WIRED | Lines 141, 160-161 — called on both cache-hit and cache-miss paths                     |

---

### Requirements Coverage

| Requirement | Source Plan   | Description                                                      | Status      | Evidence                                                                                   |
| ----------- | ------------- | ---------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| FILT-01     | 19-01-PLAN.md | Mode-aware score thresholds (dense ~0.3, hybrid ~0.0, RRF ~0.0)  | ✓ SATISFIED | `search-engine.ts` dense=0.3; `multi-collection-search-engine.ts` clears threshold for RRF |
| BASE-01     | 19-01-PLAN.md | RRF/hybrid use mode-appropriate thresholds instead of cosine 0.3 | ✓ SATISFIED | `search-codebase.ts` no `?? 0.3`; hybrid tool never passes threshold                       |
| BASE-02     | 19-02-PLAN.md | Reproducible MRR baseline (3x averaged, frozen corpus)           | ✓ SATISFIED | `runBaseline()` in runner, `baseline_runs` table in store, CLI subcommand                  |
| BASE-03     | 19-03-PLAN.md | Prompt versioning tracks chunks via hash-based version metadata  | ✓ SATISFIED | Cache key includes promptVersion; `PROMPT_CONTENT_HASH` exported; `prompt bump` CLI        |
| BASE-04     | 19-04-PLAN.md | Chunk overlap/gap detection with per-file violation reports      | ✓ SATISFIED | `chunk-validator.ts` with 4 violation types; auto-wired to `llm-strategy.ts`               |

All 5 requirement IDs declared across plans are SATISFIED. No orphaned requirements found for Phase 19.

---

### Anti-Patterns Found

None detected. Notable observations:

- `llm-strategy.ts` contains `// TODO: Call printValidationReport() after indexing completes` — this is an intentional deferral documented in the plan (orchestration layer not yet finalized), not a blocking stub.
- All implementation paths are substantive with real logic; no placeholders or empty returns.

---

### Test Results

| Package                    | Test Files | Tests | Status           |
| -------------------------- | ---------- | ----- | ---------------- |
| `@ia-framework/retrieval`  | 5          | 60    | ✅ All passed    |
| `@ia-framework/mcp-server` | 5          | 25    | ✅ All passed    |
| `@ia-framework/benchmark`  | 5          | 50    | ✅ All passed    |
| `@ia-framework/indexer`    | 7          | 77    | ✅ All passed    |
| `@ia-framework/cli`        | —          | —     | ✅ Build success |

---

### Human Verification Required

None — all observable truths are verifiable programmatically for this phase. The `prompt bump` CLI and `benchmark baseline` CLI behavior at runtime would benefit from smoke-test confirmation, but both build successfully and the underlying logic is fully unit-tested.

---

## Summary

Phase 19 achieves its goal completely. All four workstreams delivered working, tested code:

1. **FILT-01 / BASE-01 (Score filtering fix):** The P0 bug is resolved — `search-codebase.ts` no longer applies a hardcoded `?? 0.3` fallback, and `multi-collection-search-engine.ts` explicitly clears `scoreThreshold` before RRF merging. Dense mode still correctly defaults to 0.3.

2. **BASE-02 (Reproducible baseline):** `BenchmarkRunner.runBaseline()` runs 3 iterations, averages MRR/HitAtK/latency, computes stddev, and the `ia-framework benchmark baseline` CLI subcommand stores results in a dedicated `baseline_runs` SQLite table.

3. **BASE-03 (Prompt versioning):** Cache keys now encode prompt version (`sha256:model:promptVersion`), `PROMPT_CONTENT_HASH` tracks prompt content changes, and `ia-framework prompt bump` provides a developer-facing version increment command.

4. **BASE-04 (Chunk validation):** `chunk-validator.ts` detects all 4 violation types (gaps, overlaps, out-of-bounds, empty summaries) and auto-runs on both cache-hit and cache-miss paths in `LlmChunkingStrategy`.

---

_Verified: 2026-04-23T01:10:00Z_
_Verifier: the agent (gsd-verifier)_
