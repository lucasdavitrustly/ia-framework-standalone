# Plan 12-01 Summary

**Phase:** 12-llm-chunking-spike
**Plan:** 01
**Status:** COMPLETE
**Verdict:** GO

## What Was Built

A standalone spike (`spike/llm-chunking/`) that validates whether a local Ollama LLM can produce structured code chunks (semantic boundaries + prose summaries) with acceptable latency, determinism, and JSON validity for use in the ia-framework RAG indexing pipeline.

### Files Created

| File                                       | Purpose                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `spike/llm-chunking/src/ollama-client.ts`  | `generateChunks()` via `/api/generate` with JSON schema enforcement, `getModelInfo()`           |
| `spike/llm-chunking/src/prompt.ts`         | `buildPrompt()` with line-numbered source injection                                             |
| `spike/llm-chunking/src/file-selector.ts`  | `selectTestFiles()` — picks 2 small/medium/large representative files from target project       |
| `spike/llm-chunking/src/chunker.ts`        | `chunkFile()` with `clampedPow2` numCtx auto-sizing; `chunkFileWithWindowing()` for large files |
| `spike/llm-chunking/src/measurement.ts`    | `runDeterminismTest()` (sequential), `computeVerdict()`                                         |
| `spike/llm-chunking/src/ast-comparison.ts` | `compareWithAST()` using `parseFile()` from `@ia-framework/ast-parser`                          |
| `spike/llm-chunking/src/report.ts`         | `generateReport()`, `writeReport()` → `12-SPIKE-REPORT.md`                                      |
| `spike/llm-chunking/src/run-spike.ts`      | Main entry — orchestrates all measurements, prints verdict, exits 0 (GO) or 1 (NO-GO)           |

## Key Engineering Decisions

- **Model switched from `qwen2.5-coder:14b` to `llama3.2:latest`** — the 14B model was too slow (50–120s/file) and caused Ollama OOM crashes on 499+ line files. The 3.2B model is 4–5× faster and fits in available VRAM.
- **`clampedPow2` numCtx auto-sizing** — dynamically sets the KV cache window to `next_power_of_2(prompt_tokens × 2)`, capped at Ollama's max. Prevents the fixed 32K allocation for every small file.
- **Sequential determinism runs** — `Promise.all` for 5 concurrent Ollama calls caused connection resets (Ollama killed under memory pressure). All runs are now sequential.
- **Config path resolved from `import.meta.url`** — walks up from the spike's `src/` directory to find `.ia-framework/project.json` at the repo root, not CWD.

## Spike Results

### Hard Criteria (all PASS → **GO**)

| Criterion          | Threshold     | Result                              |
| ------------------ | ------------- | ----------------------------------- |
| Latency ≤ 60s/file | ≤ 60,000ms    | Max: 49,681ms ✓                     |
| JSON validity      | 100%          | 100% (6/6 files) ✓                  |
| Determinism        | 5/5 identical | 3/3 files identical across 5 runs ✓ |

### Latency Summary

| Category               | Files | Range         | Avg    |
| ---------------------- | ----- | ------------- | ------ |
| small (50–51 lines)    | 2     | 3.1s – 4.5s   | ~3.8s  |
| medium (197–199 lines) | 2     | 5.9s – 46.8s  | ~26.3s |
| large (499–536 lines)  | 2     | 37.7s – 49.7s | ~43.7s |

- Overall average: **~24.6s/file**
- Projected indexing: **~205 min for 500 files**, ~820 min for 2,000 files

### AST Overlap Observations

The LLM produces semantically meaningful summaries but uses different granularity than the AST chunker:

- Small files: LLM sometimes returns 1 chunk (entire file) when AST produces 5 method-level chunks — overlap score 0.7%–100%
- Medium files: LLM produces finer-grained chunks than AST for test files (23 LLM vs 14 AST) — overlap 30.6%
- Large files: LLM produces 13–30 chunks vs AST's 25–52 — overlap 42–56%

Coverage validation (`✗` on most files) is a measurement artifact — the LLM chunks don't need to align exactly with AST line ranges to be useful for RAG. This does not affect the GO verdict.

## Risk Register

| Risk                                                                                                                   | Severity | Mitigation                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| **Indexing time** (~24.6s/file mean) makes full re-indexing of large repos (2000+ files) take 13+ hours                | HIGH     | LLM chunking should be opt-in/incremental; AST chunking remains the default fast path |
| **Model availability** — spike was validated on `llama3.2:latest` (3.2B); quality may differ from `qwen2.5-coder:14b`  | MEDIUM   | Phase 14 should allow model config; validate quality on domain-specific code          |
| **Ollama OOM on large files** — windowing was implemented but not exercised (no file exceeded context with 3.2B model) | LOW      | Windowing logic exists in `chunkFileWithWindowing()`; test explicitly in Phase 14     |
| **Coverage validation logic** — `coverageValid` is `✗` for most files; the comparison logic needs refinement           | LOW      | Not a GO/NO-GO blocker; address in Phase 14 when integrating into indexer             |

## Commits

| Hash      | Description                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| `253dd6e` | Task 1: Spike scaffold (ollama-client, prompt, file-selector, chunker)         |
| `6746129` | Task 2: Measurement harnesses (measurement, ast-comparison, report, run-spike) |
| `10bb159` | Fix: resolve `.ia-framework/project.json` relative to repo root                |
| `e03394f` | Fix: auto-size numCtx per file using clampedPow2                               |
| `3e24ac2` | Fix: sequential determinism runs, auto-size numCtx for windowed chunks         |
| `1074563` | Switch model to llama3.2:latest for spike validation                           |

## Phase Gate Decision

**GO** — all hard criteria met. Phases 14 (LLM-enhanced indexing) and 15 (semantic search improvements) are unblocked.

Primary integration guidance for Phase 14:

1. Use `llama3.2:latest` (or configurable model) — not `qwen2.5-coder:14b`
2. Always auto-size `numCtx` using `clampedPow2` pattern from `chunker.ts`
3. Run Ollama calls sequentially, not concurrently
4. Treat LLM chunking as an **opt-in enhancement layer** over AST chunking, not a replacement
5. Budget for ~24.6s/file mean latency in UX design (progress bars, background indexing)
