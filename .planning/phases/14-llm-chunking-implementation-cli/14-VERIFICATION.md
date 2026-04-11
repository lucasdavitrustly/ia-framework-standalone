---
phase: 14-llm-chunking-implementation-cli
verified: 2026-04-11T03:05:00Z
status: gaps_found
score: 7/9 must-haves verified
re_verification: false
gaps:
  - truth: "Running 'ia-framework index --strategy llm' invokes LlmChunkingStrategy and stores in {project}-llm collection"
    status: failed
    reason: 'QdrantVectorStore is constructed with the original collection name (config.vectorStore.collectionName) at line 227-232 BEFORE collection routing happens at line 294-296. The routed collectionName variable with -llm suffix is only used for console output, pipeline config (which only passes it to saveLastIndexedCommit), and state tracking — but NOT for the actual QdrantVectorStore. LLM chunks would be stored in the same collection as AST chunks.'
    artifacts:
      - path: 'packages/cli/src/commands/index.command.ts'
        issue: 'Line 230: vectorStore created with config.vectorStore.collectionName (original). Line 295: collectionName computed with -llm suffix. But vectorStore is not re-created with the routed collectionName. QdrantVectorStore uses its internal this.collectionName for all Qdrant operations.'
    missing:
      - "Move QdrantVectorStore creation AFTER collection routing, or create a new QdrantVectorStore with the routed collectionName when strategy is 'llm'"
      - 'Mismatch detection block (line 234-276) should also use the routed collection name'
  - truth: 'Per-file progress displays file name and count during LLM chunking stage'
    status: partial
    reason: "onFileProgress callback is defined in LlmChunkingOptions, stored in constructor, but never invoked in LlmChunkingStrategy.chunk(). The CLI creates the callback (line 342-348) but it's dead code. Per-file progress IS shown during the parsing stage via the pipeline's onProgress callback, but the dedicated LLM chunking progress (with chunking-specific bar) is non-functional."
    artifacts:
      - path: 'packages/indexer/src/strategies/llm-strategy.ts'
        issue: 'onFileProgress stored at line 112 but never called. No this.onFileProgress() invocation anywhere in chunk() method.'
    missing:
      - 'LlmChunkingStrategy should not own per-file progress — it processes one file at a time via chunk(). The pipeline calls chunk() per file and already emits progress. Either: (a) remove onFileProgress from the strategy and rely on pipeline progress, or (b) have the pipeline call onFileProgress before each chunk() call when using LLM strategy.'
human_verification:
  - test: 'Run ia-framework index --strategy llm with Ollama running'
    expected: 'Command connects to Ollama, chunks files with LLM, stores in {project}-llm collection'
    why_human: 'Requires running Ollama instance and Qdrant to verify end-to-end'
  - test: 'Run ia-framework index --strategy llm when Ollama is not running'
    expected: "CLI exits with clear error: 'Ollama is not running at ... Start it with: ollama serve'"
    why_human: 'Requires testing with Ollama stopped'
  - test: 'Run ia-framework index (no --strategy flag)'
    expected: 'Defaults to AST strategy, uses original collection name, identical behavior to pre-Phase 14'
    why_human: 'Backward compatibility test requiring running infrastructure'
---

# Phase 14: LLM Chunking Implementation & CLI Verification Report

**Phase Goal:** Developer can index codebase using LLM-based semantic chunking via Ollama, with chunks stored in a dedicated collection
**Verified:** 2026-04-11T03:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                          | Status     | Evidence                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | CodeChunk type includes optional description field for LLM prose summaries                                     | ✓ VERIFIED | `packages/ast-parser/src/types.ts` line 31: `description?: string \| undefined;`                                                                                                     |
| 2   | CodeChunk chunkType union includes 'semantic' for LLM-produced chunks                                          | ✓ VERIFIED | `packages/ast-parser/src/types.ts` line 15: union includes `'semantic'`                                                                                                              |
| 3   | IndexingConfigSchema validates an optional llm section with model and ollamaUrl                                | ✓ VERIFIED | `packages/core/src/config/schema.ts` lines 18-33: LlmConfigSchema + `llm: LlmConfigSchema.optional()`                                                                                |
| 4   | Pipeline uses chunk.description for text embedding when available, falls back to chunkToDescription()          | ✓ VERIFIED | `packages/indexer/src/pipeline.ts` line 102: `c.description ?? chunkToDescription(c)`                                                                                                |
| 5   | LlmChunkingStrategy implements ChunkingStrategy and calls Ollama to produce CodeChunks with prose summaries    | ✓ VERIFIED | `packages/indexer/src/strategies/llm-strategy.ts`: class with `name = 'llm'`, `chunkType: 'semantic'`, `description: entry.summary`                                                  |
| 6   | Content-hash cache skips Ollama when file content + model haven't changed                                      | ✓ VERIFIED | `llm-cache.ts` with `makeKey(contentHash, model)`, `llm-strategy.ts` checks cache before calling Ollama                                                                              |
| 7   | Running 'ia-framework index --strategy llm' invokes LlmChunkingStrategy and stores in {project}-llm collection | ✗ FAILED   | CLI computes `collectionName` with -llm suffix but QdrantVectorStore is constructed BEFORE routing with original name. LLM chunks go to wrong collection.                            |
| 8   | Running 'ia-framework index' (no flag) defaults to AST strategy in existing {project} collection               | ✓ VERIFIED | `--strategy` option defaults to 'ast' (line 163). Pipeline defaults to AstChunkingStrategy when `chunkingStrategy` is undefined.                                                     |
| 9   | Per-file progress displays file name and count during LLM chunking stage                                       | ? PARTIAL  | `onFileProgress` callback defined but never invoked in strategy. Pipeline's main progress shows per-file during parsing stage, but dedicated LLM chunking progress bar is dead code. |

**Score:** 7/9 truths verified (1 failed, 1 partial)

### Required Artifacts

| Artifact                                           | Expected                                              | Status     | Details                                                                           |
| -------------------------------------------------- | ----------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `packages/ast-parser/src/types.ts`                 | CodeChunk with description + semantic chunkType       | ✓ VERIFIED | description field at line 31, 'semantic' in union at line 15                      |
| `packages/core/src/config/schema.ts`               | LlmConfigSchema under indexing                        | ✓ VERIFIED | Lines 18-33, exported and wired into IndexingConfigSchema                         |
| `packages/core/src/types/index.ts`                 | llm field on IndexingConfig                           | ✓ VERIFIED | Line 132: `llm?: { model: string; ollamaUrl: string }`                            |
| `packages/indexer/src/pipeline.ts`                 | Description-aware text embedding                      | ✓ VERIFIED | Line 102: `c.description ?? chunkToDescription(c)`                                |
| `packages/indexer/src/strategies/llm-strategy.ts`  | LlmChunkingStrategy class                             | ✓ VERIFIED | 213 lines, implements ChunkingStrategy, name='llm', full implementation           |
| `packages/indexer/src/strategies/ollama-client.ts` | Ollama wrapper                                        | ✓ VERIFIED | 211 lines, exports generateChunks, getModelInfo, isOllamaReachable                |
| `packages/indexer/src/strategies/prompt.ts`        | Prompt builder                                        | ✓ VERIFIED | 58 lines, exports buildPrompt and CHUNK_JSON_SCHEMA                               |
| `packages/indexer/src/strategies/llm-chunker.ts`   | Core chunking with windowing                          | ✓ VERIFIED | 226 lines, exports chunkFile with auto-windowing and stitching                    |
| `packages/indexer/src/strategies/llm-cache.ts`     | Content-hash cache                                    | ✓ VERIFIED | 75 lines, exports LlmChunkCache with SHA-256 + model key                          |
| `packages/cli/src/commands/index.command.ts`       | --strategy flag, Ollama verification, LLM integration | ⚠️ PARTIAL | Strategy flag and Ollama verification work. Collection routing has bug (see gap). |

### Key Link Verification

| From                  | To                    | Via                                                   | Status      | Details                                                                                                                               |
| --------------------- | --------------------- | ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `llm-strategy.ts`     | `llm-chunker.ts`      | `chunkFile()` call                                    | ✓ WIRED     | Line 165: `await chunkFile(params)`                                                                                                   |
| `llm-strategy.ts`     | `llm-cache.ts`        | `cache.get/set`                                       | ✓ WIRED     | Lines 127, 142: `this.cache.get()`, `this.cache.set()`                                                                                |
| `llm-chunker.ts`      | `ollama-client.ts`    | `generateChunks()`                                    | ✓ WIRED     | Line 8: import, line 50: `return generateChunks(generateParams)`                                                                      |
| `llm-strategy.ts`     | `ast-parser/types.ts` | `CodeChunk` type                                      | ✓ WIRED     | Line 13: `import type { CodeChunk }`, returns CodeChunk[] with semantic type                                                          |
| `index.command.ts`    | `llm-strategy.ts`     | `new LlmChunkingStrategy()`                           | ✓ WIRED     | Line 8: import, line 338: `new LlmChunkingStrategy({...})`                                                                            |
| `index.command.ts`    | `ollama-client.ts`    | `isOllamaReachable()`                                 | ✓ WIRED     | Line 8: import, line 304: `await isOllamaReachable(ollamaUrl)`                                                                        |
| `index.command.ts`    | QdrantVectorStore     | `collectionName.*-llm`                                | ✗ NOT_WIRED | Line 295: `collectionName` computed with -llm suffix, but QdrantVectorStore at line 230 uses original name. Routing is cosmetic only. |
| `strategies/index.ts` | barrel exports        | LlmChunkingStrategy, LlmChunkCache, isOllamaReachable | ✓ WIRED     | Lines 3-7: all exported                                                                                                               |
| `indexer/index.ts`    | barrel exports        | re-exports from strategies                            | ✓ WIRED     | Lines 13-24: LlmChunkingStrategy, LlmChunkCache, isOllamaReachable re-exported                                                        |

### Requirements Coverage

| Requirement | Source Plan  | Description                                                                                          | Status      | Evidence                                                                                                                                                                 |
| ----------- | ------------ | ---------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INDX-10     | 14-02        | Developer can index codebase using LLM-based semantic chunking via Ollama as alternative to AST      | ✓ SATISFIED | LlmChunkingStrategy implements ChunkingStrategy, calls Ollama via ollama-client, produces semantic chunks                                                                |
| INDX-11     | 14-02        | LLM chunking identifies semantic boundaries and generates prose summaries per chunk in a single pass | ✓ SATISFIED | prompt.ts builds prompt requesting boundaries + summaries, ollama-client enforces JSON schema output                                                                     |
| INDX-12     | 14-02        | LLM chunking results are cached by file content hash to avoid re-processing unchanged files          | ✓ SATISFIED | LlmChunkCache uses SHA-256(content):model key, checked before Ollama calls in strategy                                                                                   |
| CLIE-01     | 14-03        | Developer can select indexing strategy via `--strategy ast\|llm` flag at index time                  | ✓ SATISFIED | Line 163: `.option('-s, --strategy <type>', ...)`, defaults to 'ast'                                                                                                     |
| CLIE-02     | 14-03        | CLI verifies configured Ollama model is available before starting LLM indexing                       | ✓ SATISFIED | Lines 302-310: isOllamaReachable check, lines 316: isModelAvailable check                                                                                                |
| CLIE-03     | 14-03        | CLI prompts interactive Ollama model selection when configured model is missing                      | ✓ SATISFIED | Lines 317-333: prompt to pull or select alternative model                                                                                                                |
| RETR-07     | 14-01, 14-03 | Each indexing strategy stores chunks in a separate Qdrant collection ({project}-ast, {project}-llm)  | ✗ BLOCKED   | Collection name routing computed correctly (line 295) but QdrantVectorStore constructed with original name before routing (line 230). LLM chunks go to wrong collection. |

### Anti-Patterns Found

| File              | Line     | Pattern                                              | Severity   | Impact                                                                                                   |
| ----------------- | -------- | ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `llm-strategy.ts` | 106, 112 | `onFileProgress` stored but never called — dead code | ⚠️ Warning | CLI LLM progress callback is non-functional. Per-file progress still works via pipeline's main progress. |
| `llm-chunker.ts`  | 188      | `return []` for empty chunks input                   | ℹ️ Info    | Valid guard clause, not a stub                                                                           |

### Human Verification Required

### 1. End-to-End LLM Indexing

**Test:** Run `ia-framework index --strategy llm` with Ollama running and a model available
**Expected:** Files are chunked via LLM, prose summaries generated, chunks stored in Qdrant {project}-llm collection
**Why human:** Requires running Ollama and Qdrant services

### 2. Ollama Fail-Fast

**Test:** Stop Ollama, then run `ia-framework index --strategy llm`
**Expected:** CLI exits immediately with `✗ Ollama is not running at ... Start it with: ollama serve`
**Why human:** Requires controlling Ollama service state

### 3. Backward Compatibility

**Test:** Run `ia-framework index` without --strategy flag
**Expected:** Uses AST strategy, stores in original collection, identical to pre-Phase 14 behavior
**Why human:** Requires running infrastructure for full end-to-end test

### Gaps Summary

**1 blocker, 1 warning found:**

**🛑 BLOCKER: Collection routing is broken for LLM strategy (RETR-07 failed)**

The `QdrantVectorStore` is constructed at line 227-232 with `config.vectorStore.collectionName` (the original collection name, e.g., "myproject"). Collection routing happens later at line 294-296 where `collectionName` gets the `-llm` suffix — but this variable is only used for:

- Console output display
- Pipeline config (which passes it to `saveLastIndexedCommit` only)
- State tracking

The actual Qdrant operations (`initialize()`, `upsertBatch()`, `deleteByFilter()`) all go through `QdrantVectorStore.this.collectionName`, which is the original name. LLM chunks would be stored in the same collection as AST chunks, defeating the purpose of multi-collection storage.

**Fix:** Move `QdrantVectorStore` creation AFTER the collection routing, using the routed `collectionName`. The mismatch detection block should also operate on the routed collection name.

**⚠️ WARNING: onFileProgress callback is dead code**

`onFileProgress` is defined in `LlmChunkingOptions`, stored in the strategy constructor, but never called anywhere in `chunk()`. The CLI creates a callback with a progress bar at lines 342-348, but it's never triggered. Per-file progress still works through the pipeline's main `onProgress` callback (which sets `currentFile` during parsing stage), but the dedicated LLM chunking progress display is cosmetic-only in the code.

---

_Verified: 2026-04-11T03:05:00Z_
_Verifier: the agent (gsd-verifier)_
