---
phase: 12-llm-chunking-spike
verified: 2026-04-10T15:10:00Z
status: passed
score: 3/3 hard criteria verified
re_verification: false
---

# Phase 12: LLM Chunking Spike — Verification Report

**Phase Goal:** Validate via a standalone spike whether a local Ollama LLM (llama3.2:latest) can produce structured code chunks — semantic boundaries + prose summaries — from real Java source files with acceptable latency (≤60s/file), 100% JSON validity, and deterministic boundaries (identical across 5 runs with temperature=0). This is the GO/NO-GO gate for Phases 14-15.

**Verified:** 2026-04-10T15:10:00Z
**Status:** PASSED — **GO**
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                     | Status     | Evidence                                                                                              |
| --- | ------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| 1   | All 6 test files chunked in ≤ 60s each                                    | ✓ VERIFIED | Max latency 49,681ms (49.7s). All 6 records < 60,000ms confirmed in `spike-results.json`              |
| 2   | 100% JSON validity across all files                                       | ✓ VERIFIED | `jsonValidityRate: 1` in spike-results.json; 0 failed files; Ollama JSON schema enforcement in client |
| 3   | Deterministic boundaries: 5/5 identical runs for ≥ 3 representative files | ✓ VERIFIED | 3/3 files tested; each has `isIdentical: true` and 1 unique boundary set across 5 runs in JSON        |
| 4   | Spike implementation is complete and functional (not stub/placeholder)    | ✓ VERIFIED | 8 source files, 1,504 lines of non-stub TS; 6 git commits; real output artifacts produced             |
| 5   | GO/NO-GO report written to the correct location                           | ✓ VERIFIED | `12-SPIKE-REPORT.md` exists at `.planning/phases/12-llm-chunking-spike/12-SPIKE-REPORT.md`, 351 lines |

**Score:** 5/5 truths verified

---

## Hard Criteria Assessment

| Criterion                    | Threshold     | Measured Result                | Status |
| ---------------------------- | ------------- | ------------------------------ | ------ |
| **Latency ≤ 60s/file**       | < 60,000ms    | Max: 49,681ms (EntryCore.java) | ✓ PASS |
| **100% Valid JSON output**   | 1.0 (100%)    | 1.0 (6/6 files)                | ✓ PASS |
| **Deterministic Boundaries** | 3 files × 5/5 | 3/3 files, 5/5 runs identical  | ✓ PASS |

### Latency Detail (from `spike-results.json`)

| File Size Category | Lines | Duration     | Result                          |
| ------------------ | ----- | ------------ | ------------------------------- |
| small              | 50    | 4,484ms      | PASS                            |
| small              | 51    | 3,086ms      | PASS                            |
| medium             | 199   | 46,789ms     | PASS                            |
| medium             | 197   | 5,853ms      | PASS                            |
| large              | 499   | 37,660ms     | PASS                            |
| large              | 536   | **49,681ms** | PASS (16% margin below ceiling) |

### Determinism Detail (from `spike-results.json`)

Boundaries were verified programmatically by parsing the raw JSON and confirming each of the 3 determinism-tested files had exactly 1 unique boundary set across 5 sequential runs:

- `ResumeEntryReject.java` (small): 5/5 runs → `[{1,20}]` identical
- `ProcessReaderImplTest.java` (medium): 5/5 runs → 23-chunk boundary set identical
- `ReturnEntriesHandlerTest.java` (large): 5/5 runs → 13-chunk boundary set identical

### JSON Validity Mechanism

The `ollama-client.ts` enforces validity at two levels:

1. **Structural**: `format: CHUNK_OUTPUT_SCHEMA` sent to Ollama `/api/generate` — grammar-constrained JSON output
2. **Programmatic**: Post-parse validation checks `chunks` is an array and each item has `startLine` (number), `endLine` (number), `summary` (string)

`temperature: 0` and `seed: 42` are set in every call, satisfying the determinism precondition.

---

## Required Artifacts

| Artifact                                                    | Purpose                                    | Status     | Details                            |
| ----------------------------------------------------------- | ------------------------------------------ | ---------- | ---------------------------------- |
| `spike/llm-chunking/src/ollama-client.ts`                   | Ollama /api/generate wrapper + JSON schema | ✓ VERIFIED | 194 lines, substantive, wired      |
| `spike/llm-chunking/src/prompt.ts`                          | Prompt builder with line-number injection  | ✓ VERIFIED | 56 lines, imported by chunker      |
| `spike/llm-chunking/src/file-selector.ts`                   | Auto-selects small/medium/large test files | ✓ VERIFIED | 143 lines, imported by run-spike   |
| `spike/llm-chunking/src/chunker.ts`                         | chunkFile() with clampedPow2 + windowing   | ✓ VERIFIED | 224 lines, imported by measurement |
| `spike/llm-chunking/src/measurement.ts`                     | runDeterminismTest() + computeVerdict()    | ✓ VERIFIED | 190 lines, imported by run-spike   |
| `spike/llm-chunking/src/ast-comparison.ts`                  | AST vs LLM overlap comparison              | ✓ VERIFIED | 131 lines, imported by run-spike   |
| `spike/llm-chunking/src/report.ts`                          | generateReport() + writeReport()           | ✓ VERIFIED | 206 lines, imported by run-spike   |
| `spike/llm-chunking/src/run-spike.ts`                       | Main orchestrator — full spike flow        | ✓ VERIFIED | 360 lines, entry point             |
| `.planning/phases/12-llm-chunking-spike/12-SPIKE-REPORT.md` | GO/NO-GO verdict + evidence tables         | ✓ VERIFIED | 351 lines, written by run-spike    |
| `spike/llm-chunking/spike-output/spike-results.json`        | Raw spike data (919 lines)                 | ✓ VERIFIED | Written by run-spike, parseable    |
| `spike/llm-chunking/package.json`                           | Standalone package with workspace deps     | ✓ VERIFIED | Correct deps: ast-parser + core    |
| `spike/llm-chunking/tsconfig.json`                          | TS config extending monorepo base          | ✓ VERIFIED | Correct NodeNext module config     |

---

## Key Link Verification

| From           | To                   | Via                           | Status  | Details                                                  |
| -------------- | -------------------- | ----------------------------- | ------- | -------------------------------------------------------- |
| `run-spike.ts` | `ollama-client.ts`   | `getModelInfo()` import       | ✓ WIRED | Called at startup to verify model availability           |
| `chunker.ts`   | `ollama-client.ts`   | `generateChunks()` import     | ✓ WIRED | Core chunking call with JSON schema enforcement          |
| `chunker.ts`   | `prompt.ts`          | `buildPrompt()` import        | ✓ WIRED | Line-numbered source injection into every prompt         |
| `run-spike.ts` | `file-selector.ts`   | `selectTestFiles()` import    | ✓ WIRED | Selects 2 small/medium/large Java files from target      |
| `run-spike.ts` | `measurement.ts`     | `runDeterminismTest()` import | ✓ WIRED | Runs 5 sequential identical calls per file               |
| `run-spike.ts` | `measurement.ts`     | `computeVerdict()` import     | ✓ WIRED | Computes final GO/NO-GO from 3 hard criteria             |
| `run-spike.ts` | `ast-comparison.ts`  | `compareWithAST()` import     | ✓ WIRED | Compares LLM chunks to AST-parsed boundaries             |
| `run-spike.ts` | `report.ts`          | `writeReport()` import        | ✓ WIRED | Writes both JSON and 12-SPIKE-REPORT.md                  |
| `report.ts`    | `12-SPIKE-REPORT.md` | `writeFile()` to path         | ✓ WIRED | Resolved via `import.meta.url` relative to monorepo root |

---

## Anti-Patterns Assessment

| File           | Line | Pattern                                                 | Severity | Impact                                                                                                                                                                                               |
| -------------- | ---- | ------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run-spike.ts` | 327  | `verdict: 'GO', // placeholder for computeVerdict call` | ℹ️ Info  | Not a stub — TypeScript type-satisfaction pattern. `computeVerdict()` on line 325 computes and returns the real verdict, which overwrites this value in `results` on line 331. No functional impact. |

**No blockers or warnings found.**

---

## Concerns and Observations

### Notable but Non-Blocking

1. **Windowing code untested in practice** — `chunkFileWithWindowing()` exists and is well-implemented (224 lines), but was not exercised during the spike because no file exceeded the 32K context window with `llama3.2:latest`. The SUMMARY correctly notes this as a LOW risk mitigated in Phase 14.

2. **AST overlap coverage mostly `✗`** — 5 of 6 files show `coverageValid: false`. This is a measurement artifact: the LLM chunks don't start at line 1 for files where imports precede the class declaration, causing the strict contiguous-from-line-1 check to fail. The SUMMARY correctly identifies this as a non-blocking artifact not relevant to GO/NO-GO.

3. **Indexing time risk is HIGH** — The SUMMARY's risk register correctly flags that 24.6s/file mean latency projects to ~205 min for 500 files and ~820 min for 2,000 files. This is acknowledged; the recommendation is to make LLM chunking opt-in over AST as the default fast path.

4. **Model swap** — Switched from `qwen2.5-coder:14b` to `llama3.2:latest` during the spike after OOM crashes and latency failures. The spike comment in `run-spike.ts` line 7 still says `qwen2.5-coder:14b` in the usage comment (minor doc inconsistency). All actual logic uses `llama3.2:latest`.

---

## Human Verification Required

None — all three hard criteria were validated programmatically against the raw `spike-results.json` artifact, which was produced by actually running the spike against real Java source files.

---

## Gaps Summary

**No gaps found.** All three hard GO/NO-GO criteria (latency, JSON validity, determinism) are verified against both the report and the raw JSON evidence. All 8 spike implementation files exist, are substantive (1,504 total lines), and are fully wired. The spike was actually executed (real output produced with real Ollama/Java file measurements) and not merely scaffolded.

---

## Verdict

**PASS — GO**

Phase 12 goal is fully achieved. The GO verdict is valid and evidence-backed. Phases 14 (LLM-enhanced indexing) and 15 (semantic search improvements) are unblocked.

---

_Verified: 2026-04-10T15:10:00Z_
_Verifier: the agent (gsd-verifier)_
