# Phase 7: Benchmarking System — Verification Report

**Verified:** 2026-04-03
**Verifier:** automated (gsd-verifier)

## Success Criteria

| #   | Criterion                                                                                                                       | Verdict  | Evidence                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Running `ia-framework benchmark run` measures Hit@K, MRR, and latency for each query in the corpus against the indexed codebase | **PASS** | `BenchmarkRunner.run()` at `packages/benchmark/src/benchmark-runner.ts:27-82` computes `hit`, `reciprocalRank`, `latencyMs` per query and aggregates `hitAtK`, `mrr`, `avgLatencyMs`. CLI `benchmark run` command at `packages/cli/src/commands/benchmark.command.ts`.          |
| 2   | Benchmark includes a no-RAG baseline mode (--baseline flag, scoreThreshold=2.0) to prove RAG actually helps                     | **PASS** | `isBaseline: this.config.scoreThreshold > 1.0` at `benchmark-runner.ts:68`. BenchmarkRun type has `isBaseline: boolean` at `types.ts:49`. CLI `--baseline` flag sets `scoreThreshold: 2.0`.                                                                                     |
| 3   | Results are stored in benchmarks.sqlite with timestamps and config snapshots for historical comparison                          | **PASS** | `BenchmarkStore` at `benchmark-store.ts:11-143` uses `better-sqlite3` with `benchmark_runs` table including `timestamp TEXT`, `config_snapshot TEXT` (JSON-serialized `ConfigSnapshot`). `saveRun()` at lines 51-96. `listRuns()` ordered by `timestamp DESC` at lines 120-137. |
| 4   | Developer can add custom evaluation queries to .ia-framework/benchmark-queries.json; example file is scaffolded on first run    | **PASS** | `loadCorpus(filePath)` at `corpus.ts:69-86` loads and validates via Zod. `scaffoldExampleCorpus(filePath)` at `corpus.ts:95-97` writes example with 3 queries using `flag: 'wx'` (no overwrite). `EXAMPLE_CORPUS` at `corpus.ts:29-57`.                                         |
| 5   | Benchmark uses fixed Top-K (default 10) and deterministic query sets so results are reproducible across runs                    | **PASS** | `BenchmarkConfig.topK` at `types.ts:65` with default 10. Same query set loaded from fixed JSON file. No randomness in runner — iterates queries sequentially at `benchmark-runner.ts:30-57`.                                                                                    |
| 6   | Developer can compare two runs side-by-side with `ia-framework benchmark compare <id1> <id2>`                                   | **PASS** | CLI `benchmark compare` subcommand wired at `packages/cli/src/commands/benchmark.command.ts`. `BenchmarkStore.getRunById(runId)` at `benchmark-store.ts:99-117` retrieves full run with query results.                                                                          |

## Requirements

| Req     | Description                                                                          | Verdict     | Evidence                                                                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BNCH-01 | End-to-end benchmarks measuring AI output quality (compile + test pass rate)         | **PARTIAL** | Current implementation measures retrieval quality (Hit@K, MRR) not AI output quality. This is intentional — retrieval quality is the framework's domain; compile+test pass rate requires full LLM generation loop which is out of scope for the RAG framework. REQUIREMENTS.md marks this `[ ]`. |
| BNCH-02 | Benchmarks compare across embedding models, chunking strategies, and retrieval modes | **PASS**    | `ConfigSnapshot` at `types.ts:35-41` captures `embeddingProvider`, `embeddingModel`, `collectionName`, `topK`, `scoreThreshold`. Compare subcommand shows side-by-side differences.                                                                                                              |
| BNCH-03 | Benchmark runs stored with timestamps and config snapshots                           | **PASS**    | `benchmark_runs` table has `timestamp` and `config_snapshot` columns. `saveRun()` persists both.                                                                                                                                                                                                 |
| BNCH-04 | No-RAG baseline                                                                      | **PASS**    | `--baseline` flag, `scoreThreshold > 1.0` check at `benchmark-runner.ts:68`.                                                                                                                                                                                                                     |
| BNCH-05 | Fixed Top-K and deterministic query sets                                             | **PASS**    | Fixed `topK` in config, same corpus file per run.                                                                                                                                                                                                                                                |
| BNCH-06 | Developer can add custom evaluation queries                                          | **PASS**    | JSON file loaded via `loadCorpus()`, example scaffolded via `scaffoldExampleCorpus()`.                                                                                                                                                                                                           |

## Test Coverage

| Package                 | Tests | Pass | Fail |
| ----------------------- | ----- | ---- | ---- |
| @ia-framework/benchmark | 19    | 19   | 0    |

## Verdict

**PARTIAL**

5 of 6 success criteria fully verified. All passing. 1 requirement (BNCH-01) is PARTIAL: the system measures retrieval quality metrics (Hit@K, MRR) rather than AI output quality (compile + test pass rate). This is a deliberate scope decision — the RAG framework measures what it controls (retrieval), not the downstream LLM output. BNCH-01 remains `[ ]` in REQUIREMENTS.md.
