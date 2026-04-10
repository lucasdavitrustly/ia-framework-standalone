# Phase 13: Pipeline Refactoring & Parallel Embedding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 13-pipeline-refactoring-parallel-embedding
**Areas discussed:** Progress reporting, Error behavior, Pipeline extensibility scope, Concurrency configuration

---

## Progress Reporting

### Q1: Progress event granularity

| Option                | Description                                                                                | Selected           |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------------ |
| Stage + counts        | Events at stage transitions + completed/total counts per stage                             |                    |
| Per-batch granularity | Add per-batch events within the embedding stage (batch started/completed with chunk count) | :heavy_check_mark: |
| Per-file granularity  | Events for every file parsed and every batch embedded                                      |                    |

**User's choice:** Per-batch granularity
**Notes:** None

### Q2: Dashboard progress updates

| Option            | Description                                      | Selected           |
| ----------------- | ------------------------------------------------ | ------------------ |
| Keep file polling | Keep current indexing-progress.json polling      | :heavy_check_mark: |
| Add SSE streaming | Add Server-Sent Events endpoint for live updates |                    |
| You decide        | Agent picks the approach                         |                    |

**User's choice:** Keep file polling
**Notes:** None

### Q3: CLI ETA display

| Option     | Description                                      | Selected           |
| ---------- | ------------------------------------------------ | ------------------ |
| No ETA     | Just progress bar + counts + current stage       | :heavy_check_mark: |
| Simple ETA | Estimate based on elapsed time / completed ratio |                    |
| You decide | Agent decides                                    |                    |

**User's choice:** No ETA
**Notes:** None

### Q4: Current file name in progress

| Option              | Description                                                               | Selected           |
| ------------------- | ------------------------------------------------------------------------- | ------------------ |
| Yes, during parsing | Show current file name during parsing stage, batch count during embedding | :heavy_check_mark: |
| Yes, everywhere     | Show file names during parsing AND which files are in the current batch   |                    |
| No, just counts     | Only stage + numeric counts                                               |                    |

**User's choice:** Yes, during parsing — but dashboard should have smooth transitions of the draw components
**Notes:** User specifically requested smooth dashboard transitions (CSS transitions) when stages change

### Q5: Progress callback pattern

| Option                   | Description                                                          | Selected           |
| ------------------------ | -------------------------------------------------------------------- | ------------------ |
| Extend existing callback | Add batch fields to IndexingProgress, keep ProgressCallback function | :heavy_check_mark: |
| EventEmitter pattern     | Switch to typed EventEmitter with multiple event types               |                    |
| You decide               | Agent picks                                                          |                    |

**User's choice:** Extend existing callback
**Notes:** None

### Q6: CLI stage rendering

| Option                   | Description                                                             | Selected           |
| ------------------------ | ----------------------------------------------------------------------- | ------------------ |
| Stage-specific rendering | Parsing: file name + count. Embedding: batch + chunks. Storing: points. | :heavy_check_mark: |
| Single unified line      | One line that changes content per stage                                 |                    |
| You decide               | Agent designs                                                           |                    |

**User's choice:** Stage-specific rendering
**Notes:** None

### Q7: CLI summary after completion

| Option         | Description                                          | Selected           |
| -------------- | ---------------------------------------------------- | ------------------ |
| Summary at end | Total files, chunks, time elapsed, batches processed | :heavy_check_mark: |
| No summary     | Progress bar is enough                               |                    |
| You decide     | Agent decides                                        |                    |

**User's choice:** Summary at end
**Notes:** None

### Q8: Dashboard transition smoothness

| Option                 | Description                                                   | Selected           |
| ---------------------- | ------------------------------------------------------------- | ------------------ |
| Poll-driven updates    | Dashboard reads JSON on existing poll interval                |                    |
| Poll + CSS transitions | Poll with CSS transitions/animations for smooth stage changes | :heavy_check_mark: |
| You decide             | Agent decides                                                 |                    |

**User's choice:** Poll + CSS transitions
**Notes:** None

---

## Error Behavior

### Q1: Failed batch handling

| Option                | Description                                                                | Selected           |
| --------------------- | -------------------------------------------------------------------------- | ------------------ |
| Retry once, then skip | Retry failed batch once. If still fails, skip and continue. Report at end. | :heavy_check_mark: |
| Fail fast, abort all  | Any failure aborts entire run                                              |                    |
| Retry 3x with backoff | Up to 3 retries with exponential backoff                                   |                    |
| You decide            | Agent picks                                                                |                    |

**User's choice:** Retry once, then skip
**Notes:** None

### Q2: Communicating skipped chunks

| Option               | Description                                   | Selected           |
| -------------------- | --------------------------------------------- | ------------------ |
| Warn + summary       | Log warnings during indexing + summary at end | :heavy_check_mark: |
| Exit with error code | Exit non-zero if any chunks were skipped      |                    |
| You decide           | Agent decides                                 |                    |

**User's choice:** Warn + summary
**Notes:** None

### Q3: Abort/cancellation with concurrency

| Option                              | Description                                                   | Selected           |
| ----------------------------------- | ------------------------------------------------------------- | ------------------ |
| Cancel queued, let in-flight finish | Cancel all queued p-queue tasks, let active requests complete | :heavy_check_mark: |
| Force cancel all                    | Force-cancel everything including in-flight requests          |                    |
| You decide                          | Agent decides                                                 |                    |

**User's choice:** Cancel queued, let in-flight finish
**Notes:** None

---

## Pipeline Extensibility Scope

### Q1: ChunkingStrategy extraction

| Option                             | Description                                                            | Selected           |
| ---------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| Extract interface + stages         | Extract ChunkingStrategy interface, break run() into composable stages | :heavy_check_mark: |
| Parallelize only, defer extraction | Just add parallelism, let Phase 14 handle extensibility                |                    |
| You decide                         | Agent decides                                                          |                    |

**User's choice:** Extract interface + stages
**Notes:** None

### Q2: AST as strategy

| Option                      | Description                                                | Selected           |
| --------------------------- | ---------------------------------------------------------- | ------------------ |
| Strategy wraps AST chunking | AST chunking becomes first ChunkingStrategy implementation | :heavy_check_mark: |
| Strategy is LLM-only        | AST stays inline, strategy only for future strategies      |                    |
| You decide                  | Agent decides                                              |                    |

**User's choice:** Strategy wraps AST chunking
**Notes:** None

### Q3: Strategy multiplicity

| Option                      | Description                                                          | Selected           |
| --------------------------- | -------------------------------------------------------------------- | ------------------ |
| One strategy per run        | Pipeline accepts one ChunkingStrategy. Developer picks via CLI flag. | :heavy_check_mark: |
| Multiple strategies per run | Run AST and LLM simultaneously in one indexing run                   |                    |
| You decide                  | Agent decides                                                        |                    |

**User's choice:** One strategy per run
**Notes:** None

---

## Concurrency Configuration

### Q1: Config shape

| Option           | Description                                                  | Selected           |
| ---------------- | ------------------------------------------------------------ | ------------------ |
| Single number    | Single `embeddingConcurrency` number in project.json         | :heavy_check_mark: |
| Per-provider map | Object with per-provider overrides: { ollama: 3, openai: 8 } |                    |
| You decide       | Agent decides                                                |                    |

**User's choice:** Single number
**Notes:** None

### Q2: Batch size configurability

| Option            | Description                                                            | Selected           |
| ----------------- | ---------------------------------------------------------------------- | ------------------ |
| Only concurrency  | Keep embeddingBatchSize=50 internal. Only expose embeddingConcurrency. | :heavy_check_mark: |
| Both configurable | Expose both batchSize and concurrency in config                        |                    |
| You decide        | Agent decides                                                          |                    |

**User's choice:** Only concurrency
**Notes:** None

### Q3: Text+code embedding parallelism

| Option             | Description                                                                | Selected           |
| ------------------ | -------------------------------------------------------------------------- | ------------------ |
| Parallel text+code | Text and code embeddings run in parallel via Promise.all within each batch | :heavy_check_mark: |
| Keep sequential    | Keep text then code sequential within batch                                |                    |
| You decide         | Agent decides                                                              |                    |

**User's choice:** Parallel text+code
**Notes:** None

### Q4: Default concurrency values

| Option              | Description                                                          | Selected           |
| ------------------- | -------------------------------------------------------------------- | ------------------ |
| Ollama=2, OpenAI=5  | Conservative defaults matching roadmap baseline                      |                    |
| Ollama=3, OpenAI=10 | More aggressive — faster but risks Ollama OOM and OpenAI rate limits | :heavy_check_mark: |
| You decide          | Agent picks based on benchmarks                                      |                    |

**User's choice:** Ollama=3, OpenAI=10
**Notes:** User chose more aggressive defaults than roadmap baseline. Both are configurable via project.json so developers can dial back.

---

## Agent's Discretion

- p-queue configuration (timeout, throwOnTimeout, autoStart)
- ChunkingStrategy interface method signatures
- Pipeline stage method decomposition
- CSS transition specifics for dashboard progress
- File-sentinel stop mechanism integration with p-queue
- CLI summary line format

## Deferred Ideas

None — discussion stayed within phase scope.
