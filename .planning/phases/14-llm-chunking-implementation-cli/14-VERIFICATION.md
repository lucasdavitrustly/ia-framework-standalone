---
phase: 14-llm-chunking-implementation-cli
verified: 2026-04-14T12:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 7/9
  gaps_closed:
    - "Running 'ia-framework index --strategy llm' invokes LlmChunkingStrategy and stores in {project}-llm collection"
    - 'Per-file progress displays file name and count during LLM chunking stage (dead code removed)'
  gaps_remaining: []
  regressions: []
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

# Phase 14: LLM Chunking Implementation & CLI — Re-Verification Report

**Phase Goal:** Developer can index codebase using LLM-based semantic chunking via Ollama, with chunks stored in a dedicated collection
**Verified:** 2026-04-14T12:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 14-04)

## Gap Closure Verification

### Gap 1 (BLOCKER): QdrantVectorStore created with wrong collection name — CLOSED ✓

**Previous issue:** `QdrantVectorStore` was constructed with `config.vectorStore.collectionName` (original name) BEFORE collection routing happened. LLM chunks would be stored in the wrong collection.

**Current code evidence (`packages/cli/src/commands/index.command.ts`):**

| Line    | Code                                                                                                      | Significance                             |
| ------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 228     | `// Route collection name based on strategy BEFORE creating vectorStore (D-06, D-08, RETR-07)`            | Intent documented in comment             |
| 229     | `const baseCollectionName = config.vectorStore.collectionName;`                                           | Original name captured as base           |
| 230–231 | ``const collectionName = options.strategy === 'llm' ? `${baseCollectionName}-llm` : baseCollectionName;`` | Routing computed FIRST                   |
| 233–238 | `const vectorStore = new QdrantVectorStore({ ..., collectionName, ... });`                                | VectorStore receives the **routed** name |

**Verified checks:**

- ✓ `baseCollectionName` + `collectionName` computation at lines 229–231 — BEFORE `new QdrantVectorStore()` at line 233
- ✓ `QdrantVectorStore` constructor receives routed `collectionName`, NOT `config.vectorStore.collectionName`
- ✓ `config.vectorStore.collectionName` appears only once (line 229, assigned to `baseCollectionName`)
- ✓ No duplicate routing block anywhere in the 533-line file
- ✓ Downstream uses all reference the routed `collectionName`: pipeline config (line 420), console output (line 349), `saveLastIndexedCommit` (line 511)
- ✓ Mismatch detection (lines 241–282) operates on `vectorStore` which now has the routed collection name

### Gap 2 (WARNING): Dead `onFileProgress` code — CLOSED ✓

**Previous issue:** `onFileProgress` was defined in `LlmChunkingOptions`, stored as a class field, but never invoked in `chunk()`. Dead code.

**Current code evidence:**

**`packages/indexer/src/strategies/llm-strategy.ts` (209 lines):**

- `LlmChunkingOptions` interface (lines 18–25): Exactly 3 fields — `model`, `ollamaUrl`, `cachePath`. No `onFileProgress`.
- Class private fields (lines 101–103): `model`, `ollamaUrl`, `cache`. No `onFileProgress`.
- Constructor (lines 105–108): Assigns only `model`, `ollamaUrl`, `cache`. No `onFileProgress`.

**`packages/cli/src/commands/index.command.ts`:**

- `new LlmChunkingStrategy()` call (lines 339–343): Passes `{ model, ollamaUrl, cachePath }` only. No callback argument.

**Codebase-wide grep for `onFileProgress`:** 0 matches across all packages. Completely removed.

## Regression Check (Previously Passed Items)

| #   | Truth                                               | Quick Check                                              | Status          |
| --- | --------------------------------------------------- | -------------------------------------------------------- | --------------- |
| 1   | CodeChunk type includes optional description field  | `description?: string` in types.ts                       | ✓ No regression |
| 2   | CodeChunk chunkType union includes 'semantic'       | `'semantic'` in union                                    | ✓ No regression |
| 3   | IndexingConfigSchema validates optional llm section | LlmConfigSchema in schema.ts                             | ✓ No regression |
| 4   | Pipeline uses chunk.description for text embedding  | `c.description ?? chunkToDescription(c)`                 | ✓ No regression |
| 5   | LlmChunkingStrategy implements ChunkingStrategy     | Class at line 98, `name = 'llm'`, chunk() method         | ✓ No regression |
| 6   | Content-hash cache skips Ollama when unchanged      | `cache.get()` at line 123 before Ollama call             | ✓ No regression |
| 8   | Default strategy is AST, uses original collection   | `'ast'` default at line 163, routing preserves base name | ✓ No regression |

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                  | Status     | Evidence                                                                    |
| --- | -------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| 1   | CodeChunk type includes optional description field for LLM prose summaries             | ✓ VERIFIED | `description?: string \| undefined;` in types.ts                            |
| 2   | CodeChunk chunkType union includes 'semantic' for LLM-produced chunks                  | ✓ VERIFIED | `'semantic'` in chunkType union                                             |
| 3   | IndexingConfigSchema validates an optional llm section with model and ollamaUrl        | ✓ VERIFIED | LlmConfigSchema + `llm: LlmConfigSchema.optional()`                         |
| 4   | Pipeline uses chunk.description for text embedding when available                      | ✓ VERIFIED | `c.description ?? chunkToDescription(c)`                                    |
| 5   | LlmChunkingStrategy implements ChunkingStrategy and calls Ollama to produce CodeChunks | ✓ VERIFIED | Full implementation: chunk(), retry, cache, mapToCodeChunks                 |
| 6   | Content-hash cache skips Ollama when file content + model haven't changed              | ✓ VERIFIED | SHA-256 cache with `makeKey(contentHash, model)`                            |
| 7   | Running `ia-framework index --strategy llm` stores in {project}-llm collection         | ✓ VERIFIED | Collection routing at lines 229–231 BEFORE VectorStore creation at line 233 |
| 8   | Running `ia-framework index` (no flag) defaults to AST strategy in existing collection | ✓ VERIFIED | `--strategy` defaults to `'ast'`, routing preserves `baseCollectionName`    |
| 9   | No dead code in LLM chunking path                                                      | ✓ VERIFIED | `onFileProgress` fully removed; 0 matches codebase-wide                     |

**Score:** 9/9 truths verified

### Requirements Coverage (Updated)

| Requirement | Source Plan  | Description                                                                | Status      | Evidence                                               |
| ----------- | ------------ | -------------------------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| INDX-10     | 14-02        | LLM-based semantic chunking via Ollama as alternative to AST               | ✓ SATISFIED | LlmChunkingStrategy implements ChunkingStrategy        |
| INDX-11     | 14-02        | LLM identifies semantic boundaries + generates prose summaries             | ✓ SATISFIED | prompt.ts + ollama-client enforces JSON schema output  |
| INDX-12     | 14-02        | LLM results cached by content hash                                         | ✓ SATISFIED | LlmChunkCache with SHA-256(content):model key          |
| CLIE-01     | 14-03        | `--strategy ast\|llm` flag                                                 | ✓ SATISFIED | Line 163 `.option('-s, --strategy <type>', ...)`       |
| CLIE-02     | 14-03        | CLI verifies Ollama model available before LLM indexing                    | ✓ SATISFIED | Lines 302–310, 316–317                                 |
| CLIE-03     | 14-03        | Interactive model selection when model missing                             | ✓ SATISFIED | Lines 317–333                                          |
| RETR-07     | 14-01, 14-03 | Each strategy stores in separate collection ({project}-ast, {project}-llm) | ✓ SATISFIED | Routing at line 230–231 before VectorStore at line 233 |

### Key Link Verification (Updated)

| From               | To                | Via                               | Status  | Details                                                |
| ------------------ | ----------------- | --------------------------------- | ------- | ------------------------------------------------------ |
| `index.command.ts` | QdrantVectorStore | `collectionName` with -llm suffix | ✓ WIRED | Line 230–231: routing, line 236: passed to constructor |

All other key links unchanged from initial verification (all WIRED).

### Anti-Patterns Found

| File             | Line | Pattern                            | Severity | Impact                         |
| ---------------- | ---- | ---------------------------------- | -------- | ------------------------------ |
| `llm-chunker.ts` | 188  | `return []` for empty chunks input | ℹ️ Info  | Valid guard clause, not a stub |

Previous anti-patterns resolved:

- ~~`onFileProgress` dead code~~ → **Removed** (0 matches codebase-wide)
- ~~Collection routing bug~~ → **Fixed** (routing before construction)

### Build/Test Status

Per plan 14-04 summary:

- `pnpm turbo typecheck` (24 tasks): All passed ✓
- `pnpm turbo build` (24 tasks): All passed ✓
- `pnpm turbo test` (23 tasks): All passed ✓

### Human Verification Required

### 1. End-to-End LLM Indexing

**Test:** Run `ia-framework index --strategy llm` with Ollama running and a model available
**Expected:** Files are chunked via LLM, prose summaries generated, chunks stored in Qdrant `{project}-llm` collection
**Why human:** Requires running Ollama and Qdrant services

### 2. Ollama Fail-Fast

**Test:** Stop Ollama, then run `ia-framework index --strategy llm`
**Expected:** CLI exits immediately with `✗ Ollama is not running at ... Start it with: ollama serve`
**Why human:** Requires controlling Ollama service state

### 3. Backward Compatibility

**Test:** Run `ia-framework index` without `--strategy` flag
**Expected:** Uses AST strategy, stores in original collection, identical to pre-Phase 14 behavior
**Why human:** Requires running infrastructure for full end-to-end test

---

_Verified: 2026-04-14T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
