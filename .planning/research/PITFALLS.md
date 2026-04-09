# Domain Pitfalls — v1.1 Milestone

**Domain:** Adding LLM chunking, parallel embedding, multi-collection search, and dashboard analytics to an existing RAG/code intelligence system
**Researched:** 2026-04-09
**Confidence:** HIGH (Ollama docs via Context7, Qdrant docs via Context7, existing codebase analysis)

> **Context:** This document covers pitfalls specific to ADDING these features to the existing ia-framework v1.0 system. The system already has working AST-based chunking, dual-vector search (text+code), hybrid BM25+dense, MCP server with `search_codebase` and `search_codebase_hybrid` tools, a dashboard API, and an indexing pipeline. These pitfalls focus on integration risks, not greenfield mistakes.

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or fundamentally broken features.

---

### Pitfall 1: Ollama Resource Contention — Generation and Embedding Fight for the Same VRAM

**What goes wrong:**
LLM-based chunking uses Ollama's `/api/generate` or `/api/chat` endpoint (a generative model). Embedding uses `/api/embed` (an embedding model). When both run on the same Ollama instance — which they will during indexing — they compete for GPU VRAM. If the chunking model is loaded and an embedding request arrives for a different model, Ollama must unload the chunking model to load the embedding model, then unload it again when the next chunk needs processing. This constant model-swap thrashing makes indexing 10-100x slower than either operation alone.

**Why it happens:**
The existing pipeline (`packages/indexer/src/pipeline.ts`) processes files sequentially: parse → embed → store. With LLM chunking, the flow becomes: LLM-chunk → embed → store. If the chunking model (e.g., `qwen3:8b`) and the embedding model (e.g., `nomic-embed-text`) are different, Ollama unloads/loads models on each transition. Ollama's docs confirm: "If there is insufficient available memory to load a new model request while one or more models are already loaded, all new requests will be queued until the new model can be loaded. As prior models become idle, one or more will be unloaded to make room."

**Consequences:**

- Indexing time for 5K files goes from minutes (AST+embed) to hours (LLM-chunk + model swap + embed)
- Users abandon the process, thinking it's broken
- On machines with <8GB VRAM, both models may not fit simultaneously

**Prevention:**

- **Separate the phases completely:** Run ALL LLM chunking first (all files), THEN run ALL embedding as a second pass. Never interleave chunk-and-embed on a per-file basis. The pipeline already has `allChunks` collection before embedding — preserve this boundary.
- **Use the same model for both if possible:** Some models (e.g., `qwen3`) can do both generation and embedding. If the chunking model also supports `/api/embed`, use it for both to avoid model swaps.
- **Batch size matters differently:** For generation, batch size = 1 (one file at a time). For embedding, batch size = 50 (existing default). Don't try to parallelize across these two operations.
- **Add a model pre-check:** Before starting, verify both models are available and estimate if they fit in VRAM together. Ollama's `/api/show` endpoint reports model size.
- **Consider Ollama's `keep_alive` parameter:** Set `keep_alive: "0"` on chunking requests to release the model immediately after each batch, leaving VRAM free for the embedding model.

**Detection:**

- Indexing slows by 10x+ compared to AST-only pipeline
- `ollama ps` shows constant model loading/unloading during indexing
- GPU memory usage oscillates wildly

**Phase to address:** LLM Chunking Spike — this is the first thing to prototype and measure. If model contention makes indexing impractical, the entire strategy needs rethinking.

**Sources:** Ollama FAQ on concurrent requests (Context7, docs.ollama.com/faq). Confidence: HIGH.

---

### Pitfall 2: LLM Chunk Non-Determinism Breaks Incremental Indexing and Benchmarks

**What goes wrong:**
The existing incremental indexing system (`packages/indexer/src/incremental.ts`) works because AST parsing is deterministic: same file → same chunks → same chunk IDs (sha1 of `filePath:startLine:endLine`). LLM-based chunking is inherently non-deterministic. Running the same file through the same model twice produces slightly different chunk boundaries, different summaries, different names. This means:

1. Chunk IDs change on every run → incremental indexing deletes and re-creates all chunks → defeats the purpose
2. Benchmark results aren't reproducible → MRR measurements fluctuate between runs even with no code changes
3. A/B comparison between runs is meaningless if the LLM chunks themselves vary

**Why it happens:**
LLMs are stochastic by nature. Even with `temperature: 0` and `seed: 42`, minor variations in tokenization, batching, or model quantization can produce different outputs. The existing chunk ID generation uses content-based hashing — if the content (boundaries) change, the ID changes.

**Consequences:**

- Incremental re-indexing for LLM-chunked collections always does a full re-index
- Benchmark MRR numbers fluctuate ±0.05 between identical runs, masking real improvements
- Developers can't trust A/B comparisons because the baseline shifts

**Prevention:**

- **Accept non-determinism for LLM chunks — don't pretend it's incremental.** For the LLM collection, always do a full re-index when files change. Incremental indexing is an AST-collection optimization that doesn't apply to LLM chunks.
- **Use content-independent chunk IDs for LLM chunks:** Instead of hashing chunk boundaries, hash `filePath + chunkIndex` (ordinal position in the file's chunk list). This is stable if the file doesn't change.
- **Pin Ollama settings for reproducibility:** Use `temperature: 0`, `seed: <fixed>`, `top_p: 1.0`, `top_k: 1` in all chunking requests. This won't be perfectly deterministic but reduces variance significantly.
- **Benchmark multiple runs:** Run benchmarks 3x and report mean ± stddev. If stddev is >0.02 MRR, the chunking is too noisy.
- **Cache LLM chunk results:** Store the LLM's chunking output (raw JSON) alongside the file hash. On re-index, if the file hash hasn't changed, reuse the cached chunks instead of re-running the LLM.

**Detection:**

- Incremental indexing logs show "all chunks replaced" for unchanged files
- Benchmark scores fluctuate >5% between identical runs
- `chunksIndexed` count varies on re-runs of the same codebase

**Phase to address:** LLM Chunking Spike — must be measured during the spike. If non-determinism is unacceptable, caching is mandatory from the start.

**Sources:** Ollama structured output docs (Context7, docs.ollama.com/capabilities/structured-outputs), existing `incremental.ts` analysis. Confidence: HIGH.

---

### Pitfall 3: Cross-Collection Score Incomparability Makes Dual-Search Merging Unfair

**What goes wrong:**
When MCP tools search both AST and LLM collections, results from each have different score distributions. AST chunks are short, syntactically precise code units (a function body) — their embeddings cluster tightly. LLM chunks may include prose summaries, semantic annotations, or reorganized boundaries — their embeddings have different distributional properties. Simply interleaving results by raw score (e.g., "sort all results by similarity score descending") systematically favors whichever collection happens to produce higher scores, not which has better results.

**Why it happens:**
Cosine similarity scores are relative to the document population in each collection. A score of 0.85 in the AST collection (where all documents are short code functions) does NOT mean the same quality match as 0.85 in the LLM collection (where documents are enriched semantic descriptions). The existing `SearchEngine.search()` merges text+code vectors within ONE collection using max-score — but cross-collection merging is a fundamentally different problem.

**Consequences:**

- One collection consistently dominates search results regardless of query
- A/B comparison in dashboard shows "LLM is always better" (or worse) simply due to score scale
- Developers lose trust in the "best of both worlds" dual-search promise
- MRR improvement appears to regress when adding the second collection

**Prevention:**

- **Use Reciprocal Rank Fusion (RRF) for cross-collection merging, NOT raw score comparison.** RRF is rank-based (1/(k+rank)), so it normalizes away score distribution differences. Qdrant already uses RRF for within-collection hybrid search — apply the same principle client-side for cross-collection.
- **Alternative: Distribution-Based Score Fusion (DBSF)** — Qdrant supports this. Normalizes scores using mean ± 3σ, then sums. Can be computed client-side: for each collection's results, compute mean and stddev, normalize scores to [0,1], then merge.
- **Tag every result with its source collection** (`strategy: 'ast' | 'llm'`) so the dashboard and MCP response can show provenance.
- **Benchmark each collection independently AND together.** Run MRR benchmarks on AST-only, LLM-only, and merged. If merged is worse than the better individual, the fusion method is wrong.
- **Don't use `scoreThreshold` across collections.** A threshold of 0.3 might filter out good results from one collection while admitting bad ones from another. Apply thresholds per-collection before merging.

**Detection:**

- In dashboard A/B comparison, one strategy consistently gets 90%+ of top-ranked positions
- Adding the second collection to search makes MRR worse, not better
- Score histograms for the two collections have very different shapes

**Phase to address:** MCP Dual-Search (after both collections exist and have data). Must be designed before the MCP tool is updated.

**Sources:** Qdrant hybrid queries documentation on RRF and DBSF (Context7, qdrant.tech/documentation/concepts/hybrid-queries). Confidence: HIGH.

---

### Pitfall 4: Context Window Overflow When Sending Large Files to Ollama for Chunking

**What goes wrong:**
The LLM chunking strategy sends source code files to Ollama and asks the model to identify semantic chunk boundaries. But Ollama models have limited context windows: **default 4096 tokens**, adjustable but memory-constrained. A 500-line TypeScript file is ~2000-4000 tokens. A 1000-line file is ~4000-8000 tokens. Adding the system prompt and instructions easily exceeds the context window for any file over ~300 lines. The model silently truncates the input or hallucinates chunk boundaries for code it never saw.

**Why it happens:**
The existing AST parser handles any file size because tree-sitter is a streaming incremental parser. The LLM approach must fit the entire file (or meaningful section) into a single prompt. Ollama's docs confirm: "By default, Ollama uses a context window size of 4096 tokens." Even with `num_ctx: 32768`, larger context = more VRAM = slower generation. The `options.num_ctx` per-request setting helps but has hardware limits.

**Consequences:**

- Large files get silently truncated → LLM only chunks the first 30% of the file
- Chunks for the truncated portion are missing from the index entirely
- The model hallucinates function names or chunk boundaries that don't exist
- Large classes/modules (the most important code to index) are the ones most affected

**Prevention:**

- **Pre-split large files before sending to Ollama.** Use the existing AST parser to identify top-level constructs (classes, function groups), then send each construct individually to the LLM for semantic chunking. This is a two-stage approach: AST for coarse splitting, LLM for semantic enrichment.
- **Set `num_ctx` explicitly and measure.** Don't rely on defaults. Check available VRAM, set context appropriately, and VALIDATE that the model saw the full input by checking output coverage.
- **Implement a file-size gate:** Files under N tokens → send to LLM directly. Files over N tokens → pre-split via AST, then enrich each piece with LLM.
- **Track coverage:** After LLM chunking, verify that the union of all chunks covers the file's line range. If lines are missing, flag the file and fall back to AST chunking for uncovered sections.
- **Budget the context window:** system prompt (~200 tokens) + file content + response space. If file content alone exceeds 70% of `num_ctx`, pre-split is mandatory.

**Detection:**

- LLM-chunked collection has fewer total chunks than AST collection for the same codebase
- Files >300 lines have incomplete coverage (some functions/classes missing from index)
- Benchmark queries for code in the bottom half of large files return no results from LLM collection

**Phase to address:** LLM Chunking Spike — must be tested against the largest files in the target project immediately. This is a design-level decision (pure LLM vs AST+LLM hybrid).

**Sources:** Ollama context length documentation (Context7, docs.ollama.com/context-length), existing `splitter.ts` analysis. Confidence: HIGH.

---

## Moderate Pitfalls

Mistakes that cause significant debugging time, performance issues, or feature delays.

---

### Pitfall 5: Parallel Embedding Exhausting Ollama VRAM — Each Parallel Slot Costs Full Context Memory

**What goes wrong:**
To speed up indexing, the team adds parallel embedding calls (e.g., using `p-queue` with concurrency 4). But Ollama's parallelism model is: "Parallel request processing for a given model results in increasing the context size by the number of parallel requests. For example, a 2K context with 4 parallel requests will result in an 8K context and additional memory allocation." With 4 parallel embedding batches, Ollama allocates 4× the VRAM. On a developer machine with 8GB VRAM, this causes OOM, and Ollama silently falls back to CPU inference — making it SLOWER than sequential.

**Why it happens:**
The existing pipeline (`pipeline.ts`) runs embedding batches sequentially in a `for` loop. It already makes 2 `embedBatch()` calls per batch (text vectors + code vectors) — so there are already 2 concurrent requests. Adding "parallel embedding" on top means 4-8+ concurrent requests. Ollama doesn't refuse these — it either allocates more memory or queues them.

**Prevention:**

- **Profile before parallelizing.** Measure: how fast is sequential embedding? How much VRAM is free? The bottleneck for Ollama embedding may be compute, not I/O — parallelism won't help if the GPU is already saturated.
- **Use `OLLAMA_NUM_PARALLEL` environment variable** instead of application-level parallelism. This lets Ollama manage memory allocation. Default is typically 1; set to 2-4 only if VRAM allows.
- **For cloud providers (OpenAI), parallelize aggressively** (they handle concurrency server-side). For Ollama, limit to 2 concurrent requests max.
- **Make parallelism provider-aware:** The `EmbeddingProvider` interface should expose a `maxConcurrency: number` property. OpenAI → 10, Ollama → 1-2.
- **Implement backpressure:** If an embedding request takes >5s (indicating queueing), reduce concurrency dynamically.
- **The two existing embedBatch calls (text+code) should stay sequential** unless the model can handle them concurrently. They already provide implicit parallelism through Ollama's batch API.

**Detection:**

- Indexing with "parallel embedding" is slower than sequential on the same machine
- `nvidia-smi` shows VRAM at 100% with constant allocation churn
- Ollama logs show "model is loading" messages during embedding

**Phase to address:** Parallel Embedding implementation — benchmark sequential vs parallel on the actual developer machine before committing to a concurrency strategy.

**Sources:** Ollama FAQ on concurrent requests (Context7, docs.ollama.com/faq). Confidence: HIGH.

---

### Pitfall 6: Pipeline Abstraction Leak — IndexingPipeline Is Hardwired to AST Parsing

**What goes wrong:**
The current `IndexingPipeline.run()` method directly calls `parseFile()` from `@ia-framework/ast-parser`, which returns `CodeChunk[]`. Adding LLM chunking as an alternative strategy requires either: (a) forking the pipeline into two nearly-identical methods, (b) adding `if (strategy === 'llm')` branches throughout, or (c) refactoring the pipeline to accept a `ChunkingStrategy` interface. Options (a) and (b) create maintenance hell. Option (c) is the correct approach but requires touching the pipeline's core contract.

**Why it happens:**
The pipeline was correctly designed for v1.0 — it has one chunking strategy (AST). The line `const chunks = await parseFile(filePath, ...)` in `pipeline.ts` is a hard dependency on AST parsing. The `CodeChunk` type includes AST-specific fields (`chunkType: 'function' | 'class' | ...`), which LLM chunks might not produce cleanly.

**Consequences:**

- If you just add `if/else` for strategy, the pipeline becomes unmaintainable with 3+ strategies
- If you don't refactor, LLM indexing gets a separate, divergent pipeline — bugs get fixed in one but not the other
- Test coverage fragments across two codepaths

**Prevention:**

- **Extract a `ChunkingStrategy` interface** before implementing LLM chunking:
  ```typescript
  interface ChunkingStrategy {
    name: 'ast' | 'llm';
    chunkFile(filePath: string, options: ChunkingOptions): Promise<CodeChunk[]>;
  }
  ```
- **Make `IndexingConfig` accept a `ChunkingStrategy`** instead of implicitly using `parseFile`. The AST strategy wraps `parseFile()`. The LLM strategy calls Ollama.
- **Keep `CodeChunk` as the shared contract.** LLM chunks must produce valid `CodeChunk` objects — same fields, same ID generation, same types. If the LLM can't determine `chunkType`, default to `'module'` or `'other'`.
- **Don't add `strategy` awareness to the embedding stage.** The embedding stage receives `CodeChunk[]` and doesn't care where they came from. This is the clean boundary.
- **Add `strategy` metadata to `ChunkPayload`** so downstream consumers (MCP, dashboard) know the provenance. This is a single new field, not a structural change.

**Detection:**

- Pull request for LLM chunking touches >5 files outside the chunking code
- Pipeline tests need duplication for each strategy
- Bug fixes require changes in two places

**Phase to address:** LLM Chunking implementation (after spike). Refactor the pipeline first, then implement LLM strategy. The spike can use a standalone script.

**Sources:** Existing `pipeline.ts` analysis. Confidence: HIGH.

---

### Pitfall 7: Ollama Model Loading Thrash Between Chunking Model and Embedding Model

**What goes wrong:**
Even with properly separated chunking and embedding phases (Pitfall 1 prevention), the developer might use different Ollama models for chunking (e.g., `qwen3:8b` — a generative model) and embedding (e.g., `nomic-embed-text` — an embedding model). On machines where both models don't fit in VRAM simultaneously, starting the embedding phase after chunking requires unloading the chunking model and loading the embedding model. This takes 10-30 seconds per model swap, and it happens once per full indexing run. Worse, if the dashboard search runs an embedding query DURING chunking, it triggers a mid-chunking model swap.

**Why it happens:**
Ollama manages model lifecycle automatically. When a new model is requested and the current model must be evicted for VRAM, there's a blocking load operation. The existing system only uses one Ollama model (for embedding), so this was never an issue.

**Prevention:**

- **Document VRAM requirements clearly:** If using separate models for chunking and embedding, minimum VRAM = max(chunking_model, embedding_model), recommended = chunking_model + embedding_model.
- **Allow using the same model for both:** If the user selects a model like `qwen3` that supports both generation and embedding, use it for both. No model swap needed.
- **Add model warm-up:** Before starting the embedding phase, explicitly load the embedding model via `/api/pull` or a warm-up embed call. Log the expected wait time.
- **Implement a model status check:** Before each phase, call `ollama ps` to see what's loaded. Warn the user if a model swap will be needed.
- **Never run search queries during indexing** on the same Ollama instance — queue them or return "indexing in progress."

**Detection:**

- 30-second pause between "chunking complete" and "embedding started" in logs
- Dashboard search becomes very slow during indexing (model swap)
- Users report "Ollama is slow" but only during indexing

**Phase to address:** LLM Chunking implementation + CLI integration. Add model management awareness to the indexing pipeline.

**Sources:** Ollama FAQ (Context7). Confidence: HIGH.

---

### Pitfall 8: Dashboard Search Requires Embedding Provider It Doesn't Currently Have

**What goes wrong:**
The dashboard API (`packages/dashboard-api/src/app.ts`) is a Hono app that serves status, config, metrics, benchmarks, and indexing data. It reads from Qdrant and SQLite but does NOT have access to an `EmbeddingProvider` or `SearchEngine`. Adding interactive search to the dashboard means the dashboard-api needs to embed queries and search Qdrant — requiring the same `SearchEngine` instance or a separate search API endpoint.

**Why it happens:**
By design (ARCHITECTURE.md Anti-Pattern 3), the dashboard and MCP server are independent processes sharing data stores. The dashboard reads; the MCP server handles search. Adding search to the dashboard breaks this clean separation.

**Consequences:**

- The dashboard-api must instantiate its own `EmbeddingProvider`, duplicating configuration and model loading
- If using Ollama, the dashboard's embedding requests compete with MCP server's embedding requests
- The dashboard becomes a "second MCP server" — maintenance doubles

**Prevention:**

- **Add a search API route to dashboard-api** that instantiates a `SearchEngine` on startup, using the same config as the MCP server. Read the embedding config from `.ia-framework/project.json`.
- **DON'T duplicate the SearchEngine code.** Import `SearchEngine` from `@ia-framework/retrieval` as a dependency. The dashboard-api and MCP server use the same library but run as separate processes.
- **Lazy-initialize the embedding provider.** Only load it when the first search request arrives, not on dashboard startup. This avoids model-loading overhead for users who never use dashboard search.
- **Share config, not instances:** Both processes read from `project.json` for embedding config. This is the existing pattern for config sharing.
- **Accept the architectural concession:** Dashboard search is an intentional exception to the "dashboard is read-only" principle. Document this decision in ARCHITECTURE.md.

**Detection:**

- Dashboard search returns errors because embedding provider isn't configured
- Dashboard startup takes 30+ seconds (model loading)
- Config changes require restarting both dashboard and MCP server

**Phase to address:** Dashboard Search/Analytics implementation. Design the search route as a first-class dashboard-api concern.

**Sources:** Existing `app.ts` analysis, ARCHITECTURE.md. Confidence: HIGH.

---

### Pitfall 9: Config Schema Evolution Breaking Existing v1.0 Deployments

**What goes wrong:**
v1.1 adds new config fields: `chunkingStrategy` (ast/llm), `llmChunkingModel`, `llmCollectionName`, `parallelEmbedding`, `searchCollections[]`. If the config schema (`packages/core/src/config/schema.ts`) adds required fields, existing `.ia-framework/project.json` files from v1.0 fail validation on startup. Users who upgrade ia-framework see "config validation failed" and don't know what to add.

**Why it happens:**
The config loader uses Zod validation. Adding required fields to the schema is a breaking change for existing config files.

**Prevention:**

- **All new v1.1 config fields must be optional with sensible defaults:**
  ```typescript
  chunkingStrategy: z.enum(['ast', 'llm']).optional().default('ast');
  llmChunkingModel: z.string().optional();
  llmCollectionName: z.string().optional().default('codebase-llm');
  ```
- **Config migration:** Add a version field to project.json. On load, if version < current, run migration logic that adds missing fields with defaults. Log what was added.
- **Test with real v1.0 config files:** Before merging any config schema change, load an actual v1.0 project.json through the new schema. This must be an automated test.
- **Keep backward compatibility for at least one major version.** v1.0 configs must work in v1.1 without manual editing.

**Detection:**

- `ia-framework status` crashes after upgrading from v1.0
- Users report "schema validation error" in Discord/issues
- The installer re-runs detection instead of loading existing config

**Phase to address:** First phase that touches config schema — likely LLM Chunking CLI integration. Gate all subsequent phases on this being correct.

**Sources:** Existing `config/schema.ts` and `config/loader.ts` analysis. Confidence: HIGH.

---

## Minor Pitfalls

Cause friction and debugging time but not fundamental issues.

---

### Pitfall 10: Ollama Structured JSON Output Parsing Failures

**What goes wrong:**
LLM chunking asks Ollama to return structured JSON (chunk boundaries, names, types) via the `format` parameter. But local models, especially smaller ones (7B and below), frequently produce malformed JSON: trailing commas, unquoted keys, truncated output, or valid JSON that doesn't match the expected schema (missing required fields, wrong types, extra fields).

**Prevention:**

- **Always use Ollama's `format` parameter** with a JSON schema — don't rely on prompt instructions alone. Ollama's structured output constrains the tokenizer.
- **Validate and retry:** Parse the response with `JSON.parse()`, validate with Zod, retry up to 2x on failure with the error message appended to the prompt.
- **Set reasonable `num_predict` (max output tokens):** Too low → truncated JSON. Too high → wasted time. Estimate based on file size.
- **Have a fallback:** If the LLM fails 3x to produce valid JSON for a file, fall back to AST chunking for that file. Log the failure.
- **Test with your exact model:** Different quantization levels (q4_0 vs q8_0) have different JSON reliability. Test the production model, not a larger one.

**Phase to address:** LLM Chunking Spike — validate JSON output reliability with the target model.

---

### Pitfall 11: Metrics Storage Bloat From Search History

**What goes wrong:**
Dashboard search history stores every query, its results, latency, scores, and matched chunks in SQLite. With active development, hundreds of searches per day accumulate. The metrics database grows linearly, slowing dashboard startup and search history queries.

**Prevention:**

- **Set a retention policy:** Auto-delete search history older than 30 days. Or keep only the last 1000 searches.
- **Store search results as summary, not full content.** Save: query, timestamp, latency, result count, top-3 chunk IDs, strategy. Don't store full code content of every result.
- **Add a "clear history" button** in the dashboard.
- **Use SQLite `VACUUM` after bulk deletes** to reclaim space.

**Phase to address:** Dashboard Search History — implement retention from the start.

---

### Pitfall 12: Existing Test Suite Breakage From Interface Changes

**What goes wrong:**
Adding `strategy` metadata to `ChunkPayload`, multi-collection support to `VectorStore`, or dual-engine support to `SearchEngine` changes interfaces that existing tests mock. Tests in `mcp-server/*.test.ts`, `retrieval/*.test.ts`, and `indexer/*.test.ts` all mock these interfaces. Interface changes break all these mocks simultaneously, creating a cascade of test failures that obscure the actual changes.

**Prevention:**

- **Add new fields as optional** to existing interfaces. Never remove or rename existing fields.
- **Create factory functions for test mocks:** `createMockVectorStore()`, `createMockSearchEngine()`. Update the factory, not 20 individual tests.
- **When adding multi-collection support, extend the existing `VectorStore` interface** — don't create a new `MultiCollectionVectorStore`. Add an optional `collectionName` parameter to methods, defaulting to the existing collection.
- **Run the full test suite after every interface change** — don't defer to CI.

**Phase to address:** Every phase — this is a continuous discipline, not a single-phase fix.

---

### Pitfall 13: A/B Comparison Producing Misleading Results Due to Uncontrolled Variables

**What goes wrong:**
The dashboard A/B comparison runs the same query against AST and LLM collections and compares results. But the collections may differ in: (a) when they were last indexed, (b) how many files are indexed, (c) embedding model version, (d) chunking granularity. Comparing "AST with 5000 chunks from yesterday" vs "LLM with 3000 chunks from today" doesn't tell you which strategy is better — it tells you which index is more complete and current.

**Prevention:**

- **Enforce same-state comparisons:** A/B comparison should only work when both collections were indexed from the same git commit (stored in `indexedAt` metadata).
- **Show collection metadata alongside A/B results:** Point count, last indexed time, embedding model, chunking strategy. Let the user judge if the comparison is fair.
- **Compute coverage metrics per collection:** What percentage of files are indexed? If AST covers 100% and LLM covers 60%, the comparison is inherently unfair.
- **Run benchmarks, not ad-hoc A/B.** The benchmark system controls variables (same queries, same ground truth). Dashboard A/B is for exploration; benchmarks are for decisions.

**Phase to address:** Dashboard A/B Comparison — implement parity checks before showing comparison results.

---

## Integration Gotchas

| Integration Point                                       | Common Mistake                                                                                                                       | Correct Approach                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LLM chunking → `CodeChunk` interface**                | LLM output doesn't include `startLine`/`endLine` because the LLM doesn't track line numbers                                          | Post-process LLM chunks: find the chunk content in the original file to compute line numbers. Fall back to 0/0 if not found.                                       |
| **Two Qdrant collections → single `QdrantVectorStore`** | Creating a second `QdrantVectorStore` instance pointing to a different collection — works but doubles Qdrant client instances        | Make `QdrantVectorStore` accept a collection name per operation, or create a `MultiCollectionStore` that wraps one client with two collection names.               |
| **`SearchEngine` → dual collections**                   | Adding a second `vectorStore` parameter to the constructor — makes the interface asymmetric and confusing                            | Create a `DualCollectionSearchEngine` that wraps two `SearchEngine` instances and handles result merging via RRF. Keep the single `SearchEngine` unchanged.        |
| **Dashboard search → embedding provider**               | Importing the Ollama/OpenAI provider directly into dashboard-api, duplicating config parsing                                         | Use the `createEmbeddingProvider(config)` factory from `@ia-framework/embedding`. Read config from `project.json` via the existing config watcher.                 |
| **MCP tool results → strategy tagging**                 | Adding `strategy` field to `RetrievalResult` type — breaks all existing consumers                                                    | Add it as optional: `strategy?: 'ast' \| 'llm' \| undefined`. Existing code ignores it. New code uses it.                                                          |
| **Parallel embedding → progress callback**              | Progress callback counts chunks sequentially, but parallel batches complete out of order → progress bar jumps from 10% to 40% to 20% | Use atomic counter (`chunksIndexed += batch.length`), not sequential tracking. Report total completed, not per-batch.                                              |
| **LLM chunking → `chunkToDescription()`**               | Using the existing metadata-based description generator for LLM chunks that already have rich descriptions                           | If the LLM chunk includes its own summary, use that as the text vector input instead of `chunkToDescription()`. Add a `description?: string` field to `CodeChunk`. |
| **Config changes → MCP server + dashboard**             | Changing config requires restarting both processes — users restart one but not the other                                             | Implement config file watching in both processes (dashboard already has `config-watcher.ts`). Hot-reload is better than restart.                                   |

---

## Performance Traps Specific to v1.1

| Trap                                                                                | Symptoms                                                         | Prevention                                                                                                                                                                                                   | When It Breaks                |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| **LLM chunking one file at a time via `/api/generate`**                             | Indexing 5000 files takes 2-5 seconds per file = 3-7 hours total | Batch multiple small files into a single prompt (if they fit). Pre-filter: skip files that AST handles well (pure functions <50 lines). Only LLM-chunk files that benefit (complex classes, mixed concerns). | Any codebase >500 files       |
| **Querying two collections sequentially**                                           | Search latency doubles from 100ms to 200ms+                      | Query both collections in parallel (`Promise.all`). The `SearchEngine` already does this for text+code vectors — apply same pattern to AST+LLM collections.                                                  | Every search query            |
| **Dashboard A/B comparison runs 4 searches** (2 collections × 2 comparison queries) | Visible UI lag of 500ms+ per comparison                          | Run all 4 in parallel. Cache results for recent queries (5-minute TTL).                                                                                                                                      | Regular dashboard usage       |
| **Search history storing full chunk content**                                       | SQLite database grows to 100MB+ in weeks                         | Store only chunk IDs and metadata. Load full content on demand from Qdrant.                                                                                                                                  | After ~1000 searches          |
| **LLM chunk caching on disk**                                                       | Cache grows to GB for large codebases                            | Set cache size limit (500MB). Use file hash as key; evict LRU entries.                                                                                                                                       | Codebase >10K files           |
| **Embedding model staying loaded in Ollama**                                        | VRAM consumed even when not indexing                             | Set `keep_alive` to 5 minutes for embedding model. It auto-unloads when idle.                                                                                                                                | Always (background VRAM cost) |

---

## Phase-Specific Warnings

| Phase/Topic                     | Likely Pitfall                                                        | Mitigation                                                                                                                                             | Severity |
| ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| **LLM Chunking Spike**          | Underestimating latency — expecting LLM chunking to be as fast as AST | Set expectation: LLM chunking will be 100-1000x slower than AST per file. The value proposition is quality, not speed. Measure on real target project. | CRITICAL |
| **LLM Chunking Spike**          | Context window overflow on large files                                | Pre-split files >300 lines via AST before sending to LLM. Test with the largest 10 files in the target project.                                        | CRITICAL |
| **LLM Chunking Spike**          | Prompt engineering underestimation                                    | The prompt that works for a Python file may fail for TypeScript. Test against 3+ languages. Budget 2-3 days for prompt iteration.                      | MODERATE |
| **LLM Chunking Implementation** | Pipeline refactoring scope creep                                      | Extract `ChunkingStrategy` interface first. Then implement LLM strategy. Don't refactor pipeline AND add LLM in the same PR.                           | MODERATE |
| **Parallel Embedding**          | Parallelism on Ollama making things slower                            | Profile sequential baseline first. Only parallelize for cloud providers. For Ollama, optimize batch size instead.                                      | MODERATE |
| **Multi-Collection Qdrant**     | Collection drift — AST re-indexed but LLM not (or vice versa)         | Track indexed-at commit per collection. Show both in dashboard. Warn if they diverge.                                                                  | MODERATE |
| **MCP Dual-Search**             | Existing MCP tool tests break with interface changes                  | Add new tools (or optional parameters) rather than changing existing tool signatures. Backward-compatible changes only.                                | MINOR    |
| **Dashboard Search**            | Over-engineering search UI before validating it's useful              | Start with a plain text input + results list. No filters, no facets, no pagination until basic search works.                                           | MINOR    |
| **Dashboard A/B Comparison**    | Comparing collections indexed at different times/completeness         | Show collection metadata (point count, last indexed, coverage %) alongside comparison. Add "Stale" warning if collections are >1 commit apart.         | MODERATE |
| **Dashboard Analytics**         | Building every chart before knowing what metrics matter               | Ship 3 charts: chunk distribution (by type), embedding latency histogram, MRR trend. Add more based on what developers actually look at.               | MINOR    |
| **Config Schema**               | Adding required fields that break v1.0 configs                        | All new fields optional with defaults. Test with an actual v1.0 project.json.                                                                          | CRITICAL |

---

## "Looks Done But Isn't" Checklist — v1.1 Specific

- [ ] **LLM chunking:** Test with files >500 lines — verify the model sees the full file (not truncated)
- [ ] **LLM chunking:** Test with 3+ programming languages — verify prompt generalizes
- [ ] **LLM chunking:** Run the same file through chunking 5x — verify outputs are stable (or acceptably similar)
- [ ] **LLM chunking:** Verify `CodeChunk` objects from LLM have valid `startLine`/`endLine` (not zeros)
- [ ] **Parallel embedding:** Measure sequential vs parallel speed on Ollama — verify parallel is actually faster
- [ ] **Parallel embedding:** Check VRAM usage with `nvidia-smi` during parallel embedding — verify no OOM
- [ ] **Multi-collection:** Verify both collections can be re-indexed independently without affecting each other
- [ ] **Multi-collection:** Verify deleting one collection doesn't affect the other
- [ ] **MCP dual-search:** Run existing MCP tool tests unchanged — verify backward compatibility
- [ ] **MCP dual-search:** Compare merged results quality (MRR) against single-collection baseline
- [ ] **Dashboard search:** Verify search works when only one collection exists (graceful degradation)
- [ ] **Dashboard search:** Verify search works when Qdrant is down (show error, don't crash)
- [ ] **Dashboard A/B:** Verify A/B comparison handles "LLM collection doesn't exist yet" gracefully
- [ ] **Config:** Load a v1.0 project.json through v1.1 schema — verify no errors
- [ ] **Config:** Verify new config fields appear in dashboard project view

---

## Recovery Strategies

| Pitfall                                  | Recovery Cost | Recovery Steps                                                                                                   |
| ---------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| VRAM contention kills indexing perf (#1) | LOW           | Separate chunking and embedding phases in pipeline. Use `keep_alive: "0"` to release models between phases.      |
| Non-determinism breaks incremental (#2)  | MEDIUM        | Implement chunk result caching keyed by file hash. Disable incremental for LLM collection.                       |
| Score incomparability skews results (#3) | MEDIUM        | Switch to RRF-based merging (client-side). Requires changes in `SearchEngine` or a wrapper.                      |
| Context overflow misses large files (#4) | MEDIUM        | Add AST pre-splitting for files exceeding 70% of `num_ctx`. Requires pipeline change + testing.                  |
| Parallel embedding OOM (#5)              | LOW           | Set concurrency to 1 for Ollama, higher for cloud. Add `maxConcurrency` to `EmbeddingProvider`.                  |
| Pipeline refactoring escalates (#6)      | MEDIUM        | Timebox to 1 day. If refactoring exceeds 1 day, use the simpler approach (separate pipeline) and refactor later. |
| Config breaks existing users (#9)        | LOW           | Make all new fields optional. Add defaults. Ship a migration script if needed.                                   |
| A/B comparison is misleading (#13)       | LOW           | Add metadata display (point count, indexed-at commit, coverage). Users can judge fairness themselves.            |

---

## Sources

- **Ollama FAQ — Concurrent requests:** Context7 docs.ollama.com/faq — model loading, parallel processing, VRAM allocation. Confidence: HIGH.
- **Ollama — Context length:** Context7 docs.ollama.com/context-length — default 4096 tokens, VRAM-based auto-sizing. Confidence: HIGH.
- **Ollama — Structured outputs:** Context7 docs.ollama.com/capabilities/structured-outputs — JSON format parameter, schema constraints. Confidence: HIGH.
- **Qdrant — Hybrid queries:** Context7 qdrant.tech/documentation/concepts/hybrid-queries — RRF, DBSF, cross-vector fusion. Confidence: HIGH.
- **Qdrant — Multi-collection:** Verified from Qdrant docs — no cross-collection query API exists. Each query targets one collection. Confidence: HIGH.
- **Existing codebase analysis:** `pipeline.ts`, `search-engine.ts`, `qdrant.ts`, `ollama.ts`, `app.ts`, `interface.ts` — confirmed current architecture constraints. Confidence: HIGH.
- **v1.0 PITFALLS.md:** Previous research covering foundational pitfalls (AST chunking, dual-vector, model mismatch, MCP crashes). Still valid — v1.1 pitfalls are additive.

---

_Pitfalls research for: ia-framework v1.1 — RAG Quality & Dashboard Evolution_
_Researched: 2026-04-09_
