# Phase 14: LLM Chunking Implementation & CLI - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Developer can index codebase using LLM-based semantic chunking via Ollama, with chunks stored in a dedicated `{project}-llm` Qdrant collection. CLI gains `--strategy ast|llm` flag for strategy selection, Ollama model verification and interactive selection, and content-hash caching to skip unchanged files. Default strategy remains AST (backward compatible). LLM chunking is sequential (one file at a time), embedding runs in parallel. Multi-collection search is Phase 15.

</domain>

<decisions>
## Implementation Decisions

### LLM-to-CodeChunk Mapping

- **D-01:** LLM provides semantic boundaries (startLine, endLine) and prose summaries only. No AST second pass — no imports/exports extraction on LLM chunks. Keeps LLM focused on what it's uniquely good at (per Phase 12 D-01).
- **D-02:** LLM chunks use `type='semantic'`. Chunk name is derived from the prose summary (short slug or first N words). `imports` and `exports` arrays are empty.
- **D-03:** LLM prose summary goes directly into the text vector embedding — replaces `chunkToDescription()` for LLM chunks. This is the key quality differentiator over AST.
- **D-04:** Prose summary is carried through the pipeline via a `description` field on `CodeChunk`. Pipeline logic: if `chunk.description` exists, use it for text embedding; otherwise fall back to `chunkToDescription()`.
- **D-05:** Port spike code (ollama-client.ts, chunker.ts, prompt.ts) from `spike/llm-chunking/src/` into `packages/indexer/src/strategies/` as a proper `LlmChunkingStrategy` implementing the `ChunkingStrategy` interface. Reuse Ollama generate client, prompt builder, windowing logic, and stitching.

### Multi-Collection Storage

- **D-06:** Existing AST collection keeps its current name (`{project}`, e.g., `payment-gateway`). LLM collection is named `{project}-llm` (e.g., `payment-gateway-llm`). No migration, no renaming, fully backward compatible.
- **D-07:** LLM collection is auto-created on first `--strategy llm` index run using the same `ensureCollection` pattern as AST. Same vector config (dimensions, distance metric).
- **D-08:** Each `--strategy` flag targets only its own collection. `--strategy llm` only touches `{project}-llm`; `--strategy ast` (or default) only touches `{project}`. Independent operations.
- **D-09:** Git diff incrementality applies to LLM collection, same mechanism as AST. Only files changed since last LLM index commit are re-processed.
- **D-10:** Two-stage pipeline for LLM: Stage 1 (Chunking) processes ALL files through Ollama sequentially (one file at a time — OOM constraint from Phase 12 spike). Stage 2 (Embedding) embeds all collected chunks in parallel via p-queue after all chunking completes. No interleaving.

### Content-Hash Caching

- **D-11:** LLM chunking results are cached in a JSON file at `.ia-framework/llm-chunk-cache.json`. Maps content hash to LLM output for each file. Persists across runs.
- **D-12:** Cache stores full LLM output: chunk boundaries (startLine, endLine) and prose summaries. On cache hit, `CodeChunk[]` is reconstructed from cached data + current file content (for `content` field) without calling Ollama.
- **D-13:** Cache key is `contentSHA256 + modelName`. If file content changes OR model changes, the cache entry is invalid and LLM is re-invoked.

### Ollama Model Management

- **D-14:** LLM chunking model is configured in a separate `llm` section under `indexing` in project.json: `{ indexing: { llm: { model, ollamaUrl } } }`. Separate from embedding config since chunking model (llama3.2) differs from embedding model (nomic-embed-text).
- **D-15:** Default chunking model is `llama3.2:latest` (spike-validated: GO verdict, mean latency ~24.6s/file, max 49.7s, 100% JSON validity, 100% determinism).
- **D-16:** CLI verifies Ollama connectivity before LLM indexing starts. If Ollama isn't running, fail fast with clear error: "Ollama is not running at {url}. Start it with: ollama serve".
- **D-17:** CLI checks configured model availability via `/api/tags`. If model is missing, show available models interactively and offer to pull the selected model. Reuse existing `isModelAvailable()` and `promptModelSelection()` patterns from the index command.
- **D-18:** Per-file progress during LLM chunking stage: file name, file count (e.g., "Chunking [3/50] src/auth/middleware.ts..."), elapsed time. Users need activity feedback given ~25s/file latency.
- **D-19:** If LLM chunking fails for a file (Ollama error, invalid JSON, timeout), retry once then skip that file, log a warning, and continue with remaining files. Summary at end lists skipped files. Same resilience pattern as Phase 13 embedding (D-07).

### Agent's Discretion

- Exact `LlmChunkingStrategy` constructor parameters and internal organization
- How to derive chunk `name` from prose summary (first N words, slugified, etc.)
- Exact JSON cache file format and serialization approach
- Temperature, seed, and numCtx values (spike used temperature=0, seed=42, clampedPow2 numCtx)
- Window overlap size for large files (spike used 20 lines default)
- Prompt template wording refinements
- Zod schema details for the new `llm` config section

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spike implementation (port source)

- `spike/llm-chunking/src/ollama-client.ts` -- Ollama /api/generate wrapper with JSON schema enforcement, generateChunks() and getModelInfo() functions
- `spike/llm-chunking/src/chunker.ts` -- Core chunking module: chunkFile() with auto-windowing, clampedPow2 numCtx, stitchChunks() for overlapping window merge
- `spike/llm-chunking/src/prompt.ts` -- buildPrompt() with line-numbered source code and chunking instructions
- `spike/llm-chunking/src/measurement.ts` -- Measurement harness (reference for metrics)

### ChunkingStrategy interface (target)

- `packages/indexer/src/strategies/types.ts` -- ChunkingStrategy interface (name, chunk method) and ChunkingConfig
- `packages/indexer/src/strategies/ast-strategy.ts` -- AstChunkingStrategy reference implementation (19 lines, wraps parseFile)
- `packages/indexer/src/strategies/index.ts` -- Strategy barrel exports

### Pipeline integration

- `packages/indexer/src/pipeline.ts` -- IndexingPipeline.run() accepts optional chunkingStrategy, defaults to AstChunkingStrategy. Walk/chunk/embed/store stages.
- `packages/indexer/src/chunk-description.ts` -- chunkToDescription() that LLM prose summaries replace for text vector

### CodeChunk type

- `packages/ast-parser/src/types.ts` -- CodeChunk interface (id, filePath, relativePath, language, type, name, content, startLine, endLine, imports, exports). Must add optional `description` field.

### CLI patterns

- `packages/cli/src/commands/index.command.ts` -- Existing index command with isModelAvailable(), promptModelSelection(), pullModel(), writeIndexingProgress() patterns

### Config schema

- `packages/core/src/config/schema.ts` -- IndexingConfigSchema (must add llm section), ProjectConfigSchema

### Vector store

- `packages/vector-store/src/qdrant.ts` -- QdrantVectorStore with collectionName config, ensureCollection pattern

### Spike results

- `.planning/phases/12-llm-chunking-spike/12-SPIKE-REPORT.md` -- GO verdict: llama3.2:latest, mean 24.6s/file, max 49.7s, 100% JSON validity, 100% determinism

### Requirements

- `.planning/REQUIREMENTS.md` INDX-10 -- LLM-based semantic chunking via Ollama
- `.planning/REQUIREMENTS.md` INDX-11 -- LLM identifies semantic boundaries and generates prose summaries in single pass
- `.planning/REQUIREMENTS.md` INDX-12 -- LLM results cached by file content hash
- `.planning/REQUIREMENTS.md` CLIE-01 -- CLI --strategy ast|llm flag
- `.planning/REQUIREMENTS.md` CLIE-02 -- CLI verifies Ollama model availability
- `.planning/REQUIREMENTS.md` CLIE-03 -- CLI interactive model selection
- `.planning/REQUIREMENTS.md` RETR-07 -- Separate collections per strategy

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `spike/llm-chunking/src/` -- Complete working LLM chunking implementation to port: Ollama client (generate + model info), chunker (windowing + stitching + clampedPow2), prompt builder. All spike-validated.
- `AstChunkingStrategy` -- Reference implementation of ChunkingStrategy interface (19 lines). LlmChunkingStrategy follows the same pattern.
- `isModelAvailable()` / `promptModelSelection()` / `pullModel()` in CLI index command -- Existing Ollama model management patterns for embedding models. Reuse for chunking model.
- `chunkToDescription()` in `packages/indexer/src/chunk-description.ts` -- Current prose generation. LLM chunks bypass this; pipeline checks `chunk.description` first.
- `QdrantVectorStore` with `ensureCollection` -- Collection creation pattern to reuse for `{project}-llm`.

### Established Patterns

- Ollama HTTP calls use native `fetch()` with JSON request/response (no SDK)
- Pipeline accepts strategy via `chunkingStrategy` config field, defaults to AST
- Retry-once-then-skip for resilience (Phase 13 D-07)
- Git diff incremental indexing via `saveLastIndexedCommit` / `getCurrentCommit`
- Progress callback with stage, completed, total fields (Phase 13)
- Config loaded via Zod schema validation in `packages/core`
- Chunk IDs via SHA256 hash of `filePath:startLine:endLine`

### Integration Points

- `ChunkingStrategy` interface in `packages/indexer/src/strategies/types.ts` -- LlmChunkingStrategy plugs in here
- `CodeChunk` type in `packages/ast-parser/src/types.ts` -- Must add optional `description?: string` field
- `IndexingConfigSchema` in `packages/core/src/config/schema.ts` -- Must add `llm` subsection
- `IndexingPipeline.run()` in `packages/indexer/src/pipeline.ts` -- Strategy selection already wired; needs collection name routing based on strategy
- CLI index command -- Must add `--strategy` option, chunking model verification, LLM-specific progress rendering
- `writeIndexingProgress()` in CLI -- Must include chunking-stage progress for dashboard

</code_context>

<specifics>
## Specific Ideas

- Two-stage pipeline: all chunking completes first (sequential), then all embedding runs (parallel). User explicitly requested this separation rather than interleaving.
- LLM prose summaries are the key quality differentiator — they go straight into text vectors, bypassing the template-based chunkToDescription(). This is what makes LLM chunking worth the latency cost.
- Spike code is production-quality enough to port rather than rewrite. The Ollama client, windowing, stitching, and prompt are all validated.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

_Phase: 14-llm-chunking-implementation-cli_
_Context gathered: 2026-04-10_
