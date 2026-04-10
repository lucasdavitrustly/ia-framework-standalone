# Phase 13: Pipeline Refactoring & Parallel Embedding - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the indexing pipeline faster and extensible. Add parallel embedding with provider-aware concurrency (via p-queue), extract a ChunkingStrategy interface so Phase 14 can plug in LLM chunking cleanly, and emit real-time progress events for CLI and dashboard consumption. One strategy active per indexing run. No LLM chunking implementation — that's Phase 14.

</domain>

<decisions>
## Implementation Decisions

### Progress Reporting

- **D-01:** Progress events fire at per-batch granularity — stage transitions AND when each embedding batch starts/completes, including chunk count per batch.
- **D-02:** Extend the existing `ProgressCallback` function with batch fields (`batchesTotal`, `batchesCompleted`). Keep the callback pattern — do NOT switch to EventEmitter. Backward compatible.
- **D-03:** CLI renders stage-specific progress: file name + file count during parsing, batch number + chunk count during embedding, points count during storing.
- **D-04:** CLI prints a summary line after indexing completes: total files, chunks, time elapsed, embedding batches processed.
- **D-05:** No ETA shown — just progress bar + counts + stage name.
- **D-06:** Dashboard keeps file-based JSON polling (`indexing-progress.json`) — no WebSocket/SSE. Poll-driven updates with CSS transitions for smooth stage changes (no jarring flicker).

### Error Behavior

- **D-07:** Retry once per failed embedding batch. If retry also fails, skip that batch and continue with remaining batches. No data loss — skipped chunks can be picked up on re-index.
- **D-08:** CLI prints warnings for skipped batches during indexing + a summary line at the end listing files/chunks that weren't embedded.
- **D-09:** Abort/cancel: cancel all queued p-queue tasks immediately, let in-flight embedding requests finish naturally. Clean shutdown — no force-cancel of active HTTP requests.

### Pipeline Extensibility

- **D-10:** Extract a `ChunkingStrategy` interface that Phase 14 will implement for LLM chunking. Break the monolithic `run()` method into composable stages: walk -> chunk -> embed -> store, as separate methods or stage functions.
- **D-11:** Wrap existing AST chunking as the first `ChunkingStrategy` implementation. AST and future LLM strategies are interchangeable — the pipeline orchestrates, strategies chunk.
- **D-12:** One strategy active per indexing run. Developer selects via CLI flag (`--strategy ast|llm`). Matches CLIE-01 requirement. Pipeline accepts the strategy at construction or via config.

### Concurrency Configuration

- **D-13:** Single `embeddingConcurrency` number in project.json under the `indexing` section. Overrides the provider-aware default. Simple flat config — no per-provider map.
- **D-14:** `embeddingBatchSize` stays as an internal default (50). Not exposed in project.json config — rarely needs tuning, it controls API payload size, not parallelism.
- **D-15:** Within each embedding batch, text and code embeddings run in parallel via `Promise.all`. Two concurrent API calls per batch instead of sequential — easy 2x per-batch speedup.
- **D-16:** Provider-aware concurrency defaults: Ollama = 3 concurrent batches, OpenAI = 10 concurrent batches. Developer can override with `embeddingConcurrency` in project.json.

### Agent's Discretion

- p-queue configuration details (timeout, throwOnTimeout, autoStart)
- Exact `ChunkingStrategy` interface method signatures
- Internal stage method decomposition within the pipeline class
- CSS transition specifics for dashboard progress rendering
- How the file-sentinel stop mechanism integrates with p-queue's cancellation
- Exact format of the CLI summary line

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current pipeline

- `packages/indexer/src/pipeline.ts` — The monolithic `IndexingPipeline.run()` method (306 lines). Walk/parse/embed/store flow. Sequential embedding loop at line ~179. `IndexingConfig` and `IndexingProgress` interfaces defined here.
- `packages/indexer/src/pipeline.test.ts` — 508 lines of pipeline tests. Mocks for embedBatch, vectorStore, parseFile. Must be updated for new interface.

### Embedding providers

- `packages/embedding/src/interface.ts` — `EmbeddingProvider` interface (embed, embedBatch, estimateTokens). Stateless fetch wrappers — safe for concurrent use.
- `packages/embedding/src/providers/ollama.ts` — Ollama provider. Uses native fetch to `/api/embed`. Accepts batch input.
- `packages/embedding/src/providers/openai.ts` — OpenAI provider. Uses native fetch to `/v1/embeddings`. Accepts batch input.
- `packages/embedding/src/factory.ts` — `createEmbeddingProvider(config)` factory. Switch on provider type.

### Config schema

- `packages/core/src/config/schema.ts` — `IndexingConfigSchema` Zod schema. Currently: includePatterns, excludePatterns, maxChunkLines, respectGitignore. Must add `embeddingConcurrency`.
- `packages/core/src/types/index.ts` — TypeScript types including `ContextSource` interface (extensibility precedent).

### CLI

- `packages/cli/src/commands/index.command.ts` — 414 lines. CLI index command. Creates pipeline, renders progress bar, writes indexing-progress.json. Stop mechanism via file sentinel.
- `packages/cli/src/commands/index-stop.command.ts` — Stop command writes sentinel file.

### Dashboard

- `packages/dashboard-api/src/routes/indexing.ts` — `GET /api/indexing/status` route. Reads in-memory state or falls back to indexing-progress.json file.
- `packages/dashboard-api/src/indexing-state.ts` — `IndexingStateManager` with observer pattern (subscribe/unsubscribe/notify). 95 lines.

### AST chunking (to be wrapped as strategy)

- `packages/ast-parser/src/chunker.ts` — `parseFile()` function. Current AST chunking flow (parse -> language parser -> splitOversizedChunks).
- `packages/ast-parser/src/types.ts` — `CodeChunk` interface that strategies must produce.
- `packages/indexer/src/chunk-description.ts` — `chunkToDescription()` generates prose from AST metadata.

### Requirements

- `.planning/REQUIREMENTS.md` INDX-14 — Embedding pipeline processes multiple batches concurrently via p-queue
- `.planning/REQUIREMENTS.md` INDX-15 — Embedding concurrency adapts to provider type
- `.planning/REQUIREMENTS.md` INDX-16 — Pipeline emits progress events (phase, completed, total)
- `.planning/REQUIREMENTS.md` INDX-17 — Embedding concurrency configurable via project.json
- `.planning/ROADMAP.md` Phase 13 — Success criteria SC-1 through SC-4

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `EmbeddingProvider` interface (`packages/embedding/src/interface.ts`): Clean async interface. Both providers are stateless fetch wrappers — safe for concurrent use without modification.
- `ContextSource` interface (`packages/core/src/types/index.ts`): Extensibility precedent. Pipeline already processes arbitrary chunk sources via this interface. ChunkingStrategy can follow the same pattern.
- `IndexingStateManager` (`packages/dashboard-api/src/indexing-state.ts`): Observer pattern for in-process indexing state. May need batch-level updates.
- `writeIndexingProgress()` in CLI index command: Writes JSON file for cross-process dashboard communication. Must include batch fields.

### Established Patterns

- All Ollama communication uses native `fetch()` with JSON request/response — no SDK overhead
- Pipeline uses `AbortSignal` for cancellation (checked at 2 points currently)
- CLI stop mechanism uses file-sentinel pattern (write file -> poll in callback)
- Chunk IDs: SHA1 hash of `filePath:startLine:endLine`
- Progress callback is synchronous and fire-and-forget

### Integration Points

- `IndexingConfig` interface: Must gain `embeddingConcurrency` field (wired from project.json)
- `IndexingProgress` type: Must gain `batchesTotal` + `batchesCompleted` fields
- `IndexingConfigSchema` in core: Must add `embeddingConcurrency` to Zod schema
- Pipeline `run()` method: Must be decomposed into walk/chunk/embed/store stages
- CLI index command: Must update progress rendering for stage-specific display + summary
- Dashboard indexing route: No changes needed (reads same JSON file, just has more fields now)

</code_context>

<specifics>
## Specific Ideas

- User wants more aggressive concurrency defaults than roadmap baseline: Ollama=3 (not 2), OpenAI=10 (not 5). Both are configurable so developers can dial back if needed.
- Dashboard stage transitions should be visually smooth — CSS transitions on the progress components, not jarring redraws on each poll cycle.
- The ChunkingStrategy extraction is in scope for Phase 13 (not Phase 14). Phase 14 implements the LLM strategy against this interface — it should be a clean plugin, not a pipeline rewrite.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 13-pipeline-refactoring-parallel-embedding_
_Context gathered: 2026-04-10_
