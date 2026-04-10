# Phase 14: LLM Chunking Implementation & CLI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 14-llm-chunking-implementation-cli
**Areas discussed:** LLM-to-CodeChunk Mapping, Multi-Collection Storage, Content-Hash Caching, Ollama Model Management UX

---

## LLM-to-CodeChunk Mapping

### Q1: What should LLM chunks contain vs AST chunks?

| Option                      | Description                                                                                          | Selected |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Boundaries + summaries only | LLM provides semantic startLine/endLine and prose summaries. No AST second pass for imports/exports. | ✓        |
| Boundaries + AST enrichment | LLM provides boundaries, then AST extracts imports/exports from those ranges.                        |          |
| Full AST parity             | LLM chunks match AST chunk structure exactly with all fields populated.                              |          |

**User's choice:** Boundaries + summaries only
**Notes:** Keeps LLM focused on what it's uniquely good at (semantic understanding), per Phase 12 D-01. No need to duplicate AST's strengths.

### Q2: What `type` should LLM chunks use?

| Option             | Description                                                                     | Selected |
| ------------------ | ------------------------------------------------------------------------------- | -------- |
| `semantic`         | New type value distinguishing LLM chunks from AST types (function, class, etc.) | ✓        |
| Inferred AST types | LLM guesses function/class/module based on content                              |          |
| `llm`              | Generic LLM marker type                                                         |          |

**User's choice:** `semantic` type
**Notes:** Chunk name derived from prose summary (short slug or first N words). `imports` and `exports` arrays are empty.

### Q3: How should LLM prose summaries be used in embeddings?

| Option                                | Description                                                                                  | Selected |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| Replace chunkToDescription()          | Prose summary goes directly into text vector embedding, bypassing template-based description | ✓        |
| Concatenate with chunkToDescription() | Append LLM prose to existing template output                                                 |          |
| Separate vector field                 | Store prose in a third vector alongside code and text                                        |          |

**User's choice:** Replace chunkToDescription()
**Notes:** This is the key quality differentiator over AST. LLM prose summaries are why LLM chunking is worth the latency cost.

### Q4: How should prose summaries flow through the pipeline?

| Option                           | Description                                                                                                | Selected |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| `description` field on CodeChunk | Optional field; pipeline checks if present, uses it for text embedding, falls back to chunkToDescription() | ✓        |
| Separate metadata map            | Side-channel mapping chunk ID to description                                                               |          |
| Wrapper type                     | LlmCodeChunk extends CodeChunk with description                                                            |          |

**User's choice:** `description` field on CodeChunk
**Notes:** Clean, backward-compatible approach. Pipeline logic: if `chunk.description` exists, use it; otherwise fall back to `chunkToDescription()`.

### Q5: How should the LLM strategy be implemented?

| Option                   | Description                                                                                                          | Selected |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------- |
| Port spike code          | Port ollama-client.ts, chunker.ts, prompt.ts from spike into packages/indexer/src/strategies/ as LlmChunkingStrategy | ✓        |
| Rewrite from scratch     | Build new implementation using spike learnings but fresh code                                                        |          |
| Wrap spike as dependency | Import spike code directly as internal package                                                                       |          |

**User's choice:** Port spike code
**Notes:** Spike code (Ollama client, windowing, stitching, prompt builder) is validated and production-quality enough to port rather than rewrite.

---

## Multi-Collection Storage

### Q1: How should collections be named?

| Option                            | Description                                                           | Selected |
| --------------------------------- | --------------------------------------------------------------------- | -------- |
| `{project}-llm` suffix            | AST keeps `{project}`, LLM gets `{project}-llm`. No migration needed. | ✓        |
| `{project}-ast` / `{project}-llm` | Both get explicit suffixes, rename existing collection                |          |
| Single collection with metadata   | One collection, filter by strategy via payload field                  |          |

**User's choice:** `{project}-llm` suffix
**Notes:** Fully backward compatible. No migration, no renaming of existing AST collection.

### Q2: How should the LLM collection be created?

| Option                      | Description                                                                     | Selected |
| --------------------------- | ------------------------------------------------------------------------------- | -------- |
| Auto-create on first use    | Created on first `--strategy llm` run using existing `ensureCollection` pattern | ✓        |
| Explicit setup command      | Separate CLI command to initialize LLM collection                               |          |
| Created during project init | Always create both collections at project initialization                        |          |

**User's choice:** Auto-create on first use
**Notes:** Same `ensureCollection` pattern as AST. Same vector config (dimensions, distance metric).

### Q3: Should strategies share collections or be independent?

| Option                  | Description                                                                                | Selected |
| ----------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Independent collections | Each `--strategy` flag targets only its own collection. Completely independent operations. | ✓        |
| Shared with merge       | Both strategies write to same collection, search merges results                            |          |
| Primary + secondary     | AST is primary, LLM augments the same collection                                           |          |

**User's choice:** Independent collections
**Notes:** `--strategy llm` only touches `{project}-llm`; `--strategy ast` (or default) only touches `{project}`. Clean separation.

### Q4: How should incrementality work for LLM collection?

| Option                  | Description                                                              | Selected |
| ----------------------- | ------------------------------------------------------------------------ | -------- |
| Same git diff mechanism | Git diff incrementality applies to LLM collection, same mechanism as AST | ✓        |
| Content-hash only       | Skip git diff, rely entirely on content-hash cache                       |          |
| Full re-index always    | Re-process all files every LLM run                                       |          |

**User's choice:** Same git diff mechanism
**Notes:** Only files changed since last LLM index commit are re-processed.

### Q5: How should the LLM pipeline stages be organized?

| Option               | Description                                                                                                | Selected |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| Two-stage sequential | Stage 1: ALL files through Ollama sequentially. Stage 2: ALL chunks embedded in parallel. No interleaving. | ✓        |
| Interleaved per-file | Chunk one file, embed its chunks, then next file                                                           |          |
| Batch interleaved    | Chunk N files, embed that batch, then next N                                                               |          |

**User's choice:** Two-stage sequential
**Notes:** User explicitly requested this separation. Sequential chunking (OOM constraint from Phase 12 spike), then parallel embedding via p-queue.

---

## Content-Hash Caching

### Q1: Where should the LLM chunk cache be stored?

| Option         | Description                                                                         | Selected |
| -------------- | ----------------------------------------------------------------------------------- | -------- |
| JSON file      | `.ia-framework/llm-chunk-cache.json`. Simple, human-readable, persists across runs. | ✓        |
| SQLite table   | Add table to existing metrics.sqlite database                                       |          |
| In-memory only | Cache only within a single indexing run                                             |          |

**User's choice:** JSON file
**Notes:** Maps content hash to LLM output for each file. Simple persistence mechanism.

### Q2: What should the cache store?

| Option               | Description                                                                                                           | Selected |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| Full LLM output      | Chunk boundaries (startLine, endLine) and prose summaries. Reconstruct CodeChunk[] from cache + current file content. | ✓        |
| Raw LLM response     | Store raw JSON response from Ollama                                                                                   |          |
| Complete CodeChunk[] | Store fully constructed chunks including content                                                                      |          |

**User's choice:** Full LLM output
**Notes:** On cache hit, CodeChunk[] is reconstructed from cached boundaries/summaries + current file content (for `content` field) without calling Ollama.

### Q3: What should the cache key be?

| Option                    | Description                                    | Selected |
| ------------------------- | ---------------------------------------------- | -------- |
| contentSHA256 + modelName | Invalid if file content OR model changes       | ✓        |
| contentSHA256 only        | Invalid only if file content changes           |          |
| filePath + mtime          | Fast but fragile (git operations change mtime) |          |

**User's choice:** contentSHA256 + modelName
**Notes:** If file content changes OR model changes, cache entry is invalid and LLM is re-invoked. Ensures consistency when switching models.

---

## Ollama Model Management UX

### Q1: Where should the chunking model be configured?

| Option                          | Description                                                                                          | Selected |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Separate `llm` section          | `{ indexing: { llm: { model, ollamaUrl } } }` under indexing config. Separate from embedding config. | ✓        |
| Under existing embedding config | Reuse embedding's Ollama config with extra field                                                     |          |
| Top-level config                | `{ llm: { model, ollamaUrl } }` at project root config level                                         |          |

**User's choice:** Separate `llm` section under indexing
**Notes:** Chunking model (llama3.2) differs from embedding model (nomic-embed-text), so they need separate config.

### Q2: What should the default chunking model be?

| Option            | Description                                                                                    | Selected |
| ----------------- | ---------------------------------------------------------------------------------------------- | -------- |
| `llama3.2:latest` | Spike-validated: GO verdict, mean ~24.6s/file, max 49.7s, 100% JSON validity, 100% determinism | ✓        |
| `llama3.1:latest` | Larger model, potentially better quality but slower                                            |          |
| No default        | Require explicit model selection on first use                                                  |          |

**User's choice:** `llama3.2:latest`
**Notes:** Validated by Phase 12 spike with strong results across all metrics.

### Q3: What should happen when Ollama isn't running?

| Option                     | Description                                                                                                                | Selected |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| Fail fast with clear error | Check connectivity before starting, show actionable message: "Ollama is not running at {url}. Start it with: ollama serve" | ✓        |
| Fallback to AST            | Silently fall back to AST chunking strategy                                                                                |          |
| Retry with timeout         | Wait and retry connection for N seconds                                                                                    |          |

**User's choice:** Fail fast with clear error
**Notes:** Clear, actionable error message. No silent fallbacks.

### Q4: What should happen when the configured model is missing?

| Option                       | Description                                                                                        | Selected |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Interactive selection + pull | Check via /api/tags, show available models, offer to pull selected model. Reuse existing patterns. | ✓        |
| Auto-pull default            | Automatically pull the default model without asking                                                |          |
| Error with instructions      | Show error with manual pull command                                                                |          |

**User's choice:** Interactive selection + pull
**Notes:** Reuse existing `isModelAvailable()`, `promptModelSelection()`, and `pullModel()` patterns from the index command's embedding model management.

### Q5: What progress feedback should be shown during LLM chunking?

| Option                          | Description                                                                             | Selected |
| ------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Per-file with count and elapsed | File name, file count (e.g., "Chunking [3/50] src/auth/middleware.ts..."), elapsed time | ✓        |
| Simple spinner                  | Just a spinner with current file name                                                   |          |
| Percentage bar                  | Traditional progress bar with percentage                                                |          |

**User's choice:** Per-file with count and elapsed
**Notes:** Users need activity feedback given ~25s/file latency. Showing file count and elapsed time sets expectations.

### Q6: What should happen when LLM chunking fails for a file?

| Option                  | Description                                                                            | Selected |
| ----------------------- | -------------------------------------------------------------------------------------- | -------- |
| Retry once, then skip   | Retry once, then skip file, log warning, continue. Summary at end lists skipped files. | ✓        |
| Fail entire run         | Stop indexing on first error                                                           |          |
| Retry 3 times then skip | More aggressive retry before skipping                                                  |          |

**User's choice:** Retry once, then skip
**Notes:** Same resilience pattern as Phase 13 embedding (D-07). Handles Ollama errors, invalid JSON, and timeouts gracefully.

---

## Agent's Discretion

The following implementation details were left to the agent's discretion:

- Exact `LlmChunkingStrategy` constructor parameters and internal organization
- How to derive chunk `name` from prose summary (first N words, slugified, etc.)
- Exact JSON cache file format and serialization approach
- Temperature, seed, and numCtx values (spike used temperature=0, seed=42, clampedPow2 numCtx)
- Window overlap size for large files (spike used 20 lines default)
- Prompt template wording refinements
- Zod schema details for the new `llm` config section

## Deferred Ideas

None — discussion stayed within phase scope.
