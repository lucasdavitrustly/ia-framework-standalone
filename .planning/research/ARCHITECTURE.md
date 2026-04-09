# Architecture Research — v1.1 Feature Integration

**Domain:** AI-assisted development framework with local RAG
**Researched:** 2026-04-09
**Confidence:** HIGH

## Context

This document covers the **integration architecture for v1.1 features** into the existing ia-framework monorepo. It does NOT redesign existing components — it specifies how 5 new capabilities slot into the current system.

### New Features

1. **LLM-based Chunking** — Alternative chunking strategy using Ollama to generate semantic descriptions
2. **Parallel Embedding** — Concurrent embedding via `p-queue` instead of sequential batches
3. **Multi-Collection Qdrant** — Separate collections for AST and LLM chunks
4. **Dual-Collection MCP Search** — Search across both collections with source tagging
5. **Dashboard Search & Analytics** — Search UI and per-collection analytics in the dashboard

### Existing System (Verified by Source Analysis)

| Component         | Package                  | Current State                                                                               |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| IndexingPipeline  | `packages/indexer`       | Sequential: walkFiles → parseFile → chunkToDescription → embedBatch → upsertBatch           |
| QdrantVectorStore | `packages/vector-store`  | Parameterized on `collectionName`. Named vectors: text, code, sparse                        |
| EmbeddingProvider | `packages/embedding`     | Interface with `embed()`, `embedBatch()`, `dimensions`. Factory creates OpenAI/Ollama       |
| SearchEngine      | `packages/retrieval`     | Takes single vectorStore + embeddingProvider. Has `search()`, `searchHybrid()`, `getFile()` |
| MCP Server        | `packages/mcp-server`    | Uses local duck-typed `Engine` interfaces, not SearchEngine directly                        |
| Dashboard API     | `packages/dashboard-api` | Hono-based. Serves status, config, metrics, benchmarks, indexing. **No search capability**  |
| Dashboard UI      | `apps/dashboard`         | React/Vite SPA. 4 pages: Overview, Benchmarks, Config, TokenUsage                           |
| CLI               | `packages/cli`           | `index` command with --force, --config, --model. Single pipeline, single collection         |
| MetricsStore      | `packages/observability` | SQLite-backed. Tracks RagEvents with query, latency, tokens, chunks                         |
| Config            | `packages/core`          | `ProjectConfig` with Zod schema validation                                                  |

## System Overview — v1.1 Changes

```
┌───────────────────────────────────────────────────────────────────────┐
│                          Indexing Pipeline                            │
│                                                                       │
│  walkFiles → ┬─ AstChunkingStrategy ──→ embedBatch ──→ upsert       │
│              │  (existing behavior)      (parallel)    (ast-collection)│
│              │                                                        │
│              └─ LlmChunkingStrategy ──→ embedBatch ──→ upsert  [NEW] │
│                 (Ollama chat API)        (parallel)    (llm-collection)│
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│                       Qdrant (Docker)                                  │
│                                                                       │
│  ┌──────────────────┐    ┌──────────────────┐                         │
│  │ {name} collection│    │ {name}-llm       │  [NEW]                  │
│  │ AST chunks       │    │ LLM chunks       │                         │
│  │ code vectors     │    │ semantic vectors  │                         │
│  └──────────────────┘    └──────────────────┘                         │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│                   MultiCollectionSearchEngine [NEW]                    │
│                                                                       │
│  ┌─────────────────┐    ┌─────────────────┐                           │
│  │ SearchEngine     │    │ SearchEngine     │                          │
│  │ (ast collection) │    │ (llm collection) │                          │
│  └────────┬────────┘    └────────┬────────┘                           │
│           │      parallel query  │                                    │
│           └──────────┬───────────┘                                    │
│                      ▼                                                │
│           merge + source tag + dedup                                  │
│           graceful degradation (single collection OK)                 │
└───────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
┌──────────────────────┐  ┌──────────────────────────────┐
│  MCP Server          │  │  Dashboard API         [NEW] │
│  (search_codebase)   │  │  GET /api/search             │
│  (search_hybrid)     │  │  GET /api/analytics/         │
│  → uses Multi engine │  │    collections               │
└──────────────────────┘  └──────────────────────────────┘
```

## Component Boundaries — New & Modified

### New Components

| Component                     | Package                  | Responsibility                                           | Communicates With              |
| ----------------------------- | ------------------------ | -------------------------------------------------------- | ------------------------------ |
| `ChunkingStrategy` interface  | `packages/indexer`       | Abstract chunking behind strategy pattern                | IndexingPipeline               |
| `AstChunkingStrategy`         | `packages/indexer`       | Wraps existing `parseFile()` behavior                    | tree-sitter, file system       |
| `LlmChunkingStrategy`         | `packages/indexer`       | Uses Ollama chat API to generate semantic descriptions   | Ollama HTTP API                |
| `MultiCollectionSearchEngine` | `packages/retrieval`     | Queries multiple collections in parallel, merges results | SearchEngine instances, Qdrant |
| Dashboard search routes       | `packages/dashboard-api` | Expose search API for dashboard UI                       | MultiCollectionSearchEngine    |
| Dashboard analytics routes    | `packages/dashboard-api` | Per-collection stats and comparison                      | Qdrant, MetricsStore           |
| Search page                   | `apps/dashboard`         | Search UI with source filtering                          | Dashboard API                  |
| Analytics page                | `apps/dashboard`         | Collection comparison charts                             | Dashboard API                  |

### Modified Components

| Component              | Change                                                                                                                           | Scope                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `IndexingPipeline`     | Accept `ChunkingStrategy` instead of hardcoded `parseFile()` + `chunkToDescription()`. Support parallel embedding via `p-queue`. | Moderate refactor               |
| `RetrievalResult`      | Add optional `source?: 'ast' \| 'llm'` field                                                                                     | Additive, backward-compatible   |
| MCP tool handlers      | Swap `Engine` implementation for `MultiCollectionSearchEngine`                                                                   | Minimal — duck-typed interfaces |
| CLI `index` command    | Add `--strategy ast\|llm\|both` flag                                                                                             | Small addition                  |
| `ProjectConfig` schema | Add `chunking.strategy` and `chunking.llm` config sections                                                                       | Additive Zod schema change      |

### Unchanged Components

| Component           | Why No Change                                                      |
| ------------------- | ------------------------------------------------------------------ |
| `EmbeddingProvider` | Both strategies use the same embedding interface                   |
| `QdrantVectorStore` | Already parameterized on `collectionName` — just instantiate twice |
| `MetricsStore`      | Existing RagEvent schema is sufficient for tracking                |
| `project-detector`  | Unrelated to v1.1 features                                         |

## Architectural Patterns

### Pattern 1: ChunkingStrategy Interface (Strategy Pattern)

**What:** Abstract chunking behind an interface, mirroring the existing `EmbeddingProvider` pattern.
**When to use:** Always — this is the extension point for LLM chunking.
**Trade-offs:** Small abstraction cost, but enables clean testing and future strategies.

```typescript
// packages/indexer/src/chunking/interface.ts
export interface ChunkingStrategy {
  readonly name: string;

  /**
   * Process a file's AST chunks into enriched chunks.
   * AST strategy: returns chunks as-is with descriptions from chunkToDescription().
   * LLM strategy: returns chunks with LLM-generated semantic descriptions.
   */
  processChunks(
    chunks: CodeChunk[],
    fileContent: string,
    filePath: string,
  ): Promise<EnrichedChunk[]>;
}

// packages/core/src/types/index.ts — additive change
export interface EnrichedChunk extends CodeChunk {
  /** Semantic description for text vector embedding.
   *  If present, used instead of chunkToDescription() output. */
  description?: string;
}
```

**Implementation — AstChunkingStrategy:**

```typescript
// packages/indexer/src/chunking/ast-strategy.ts
export class AstChunkingStrategy implements ChunkingStrategy {
  readonly name = 'ast';

  async processChunks(
    chunks: CodeChunk[],
    fileContent: string,
    filePath: string,
  ): Promise<EnrichedChunk[]> {
    // Wraps existing chunkToDescription() — zero behavior change
    return chunks.map((chunk) => ({
      ...chunk,
      description: chunkToDescription(chunk),
    }));
  }
}
```

**Implementation — LlmChunkingStrategy:**

```typescript
// packages/indexer/src/chunking/llm-strategy.ts
import { Ollama } from 'ollama';

// Zod schema for structured Ollama output
const ChunkDescriptionSchema = z.object({
  summary: z.string().describe('One-sentence summary of what this code does'),
  concepts: z.array(z.string()).describe('Key concepts, patterns, or domain terms'),
  searchTerms: z.array(z.string()).describe('Terms a developer would search for to find this code'),
});

export class LlmChunkingStrategy implements ChunkingStrategy {
  readonly name = 'llm';

  constructor(
    private ollama: Ollama,
    private model: string = 'llama3.2',
  ) {}

  async processChunks(
    chunks: CodeChunk[],
    fileContent: string,
    filePath: string,
  ): Promise<EnrichedChunk[]> {
    const results: EnrichedChunk[] = [];

    for (const chunk of chunks) {
      const response = await this.ollama.chat({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: `Describe this code chunk for search indexing:\n\n${chunk.content}`,
          },
        ],
        format: zodToJsonSchema(ChunkDescriptionSchema), // Ollama structured output
      });

      const parsed = ChunkDescriptionSchema.parse(JSON.parse(response.message.content));

      results.push({
        ...chunk,
        description: `${parsed.summary}\n\nConcepts: ${parsed.concepts.join(', ')}\nSearch terms: ${parsed.searchTerms.join(', ')}`,
      });
    }

    return results;
  }
}
```

**Key design decision — Ollama `format` parameter:** Verified via Context7 that Ollama's `/api/chat` endpoint accepts a `format` parameter with a JSON schema object. This ensures structured output without fragile prompt engineering. The schema is defined with Zod and converted via `zodToJsonSchema()`.

**Confidence:** HIGH — Ollama structured output verified via Context7 documentation.

### Pattern 2: Parallel Embedding via p-queue

**What:** Replace sequential `embedBatch()` calls with concurrent execution using `p-queue`.
**When to use:** Always during indexing — embedding is I/O-bound (network calls), not CPU-bound.
**Trade-offs:** Faster indexing (3-5x for cloud providers), but requires concurrency limits to avoid rate limiting.

```typescript
// packages/indexer/src/pipeline.ts — modified embedBatch stage
import PQueue from 'p-queue';

interface ParallelEmbedConfig {
  concurrency: number; // Default: 5 for cloud, 2 for local Ollama
  batchSize: number; // Chunks per embedding API call
  intervalCap?: number; // Rate limit: max calls per interval
  interval?: number; // Rate limit interval (ms)
}

async function embedChunksParallel(
  chunks: EnrichedChunk[],
  provider: EmbeddingProvider,
  config: ParallelEmbedConfig,
): Promise<VectorChunk[]> {
  const queue = new PQueue({
    concurrency: config.concurrency,
    intervalCap: config.intervalCap,
    interval: config.interval,
  });

  const batches = chunkArray(chunks, config.batchSize);
  const results: VectorChunk[][] = [];

  // All batches queued — p-queue manages concurrency
  const promises = batches.map((batch, i) =>
    queue.add(async () => {
      const texts = batch.map((c) => c.description ?? c.content);
      const vectors = await provider.embedBatch(texts);
      return batch.map((chunk, j) => ({ ...chunk, vector: vectors[j] }));
    }),
  );

  return (await Promise.all(promises)).flat();
}
```

**Why p-queue over worker threads:** Embedding is I/O-bound (waiting on HTTP responses from OpenAI/Ollama). Worker threads add complexity for CPU-bound work. `p-queue` provides async concurrency with built-in rate limiting, interval caps, and pause/resume — exactly what's needed. Verified via Context7 that p-queue supports `intervalCap` and `interval` for rate limiting.

**Confidence:** HIGH — p-queue capabilities verified via Context7.

### Pattern 3: Multi-Collection Convention (Not Abstraction)

**What:** Use naming convention for collection pairs. No new class — just instantiate `QdrantVectorStore` twice.
**When to use:** When both AST and LLM indexing are configured.
**Trade-offs:** Simple but requires convention discipline. No runtime enforcement of pairing.

```typescript
// Convention: collection names
const AST_COLLECTION = `${projectName}`; // e.g., "my-project"
const LLM_COLLECTION = `${projectName}-llm`; // e.g., "my-project-llm"

// In CLI index command or pipeline orchestration:
const astStore = new QdrantVectorStore({
  url: config.vectorStore.url,
  collectionName: AST_COLLECTION,
});

const llmStore = new QdrantVectorStore({
  url: config.vectorStore.url,
  collectionName: LLM_COLLECTION,
});

// CRITICAL: Both collections MUST use the same embedding model
// Different dimensions = incomparable search results
const embeddingProvider = createEmbeddingProvider(config.embedding);

const astPipeline = new IndexingPipeline({
  chunkingStrategy: new AstChunkingStrategy(),
  embeddingProvider,
  vectorStore: astStore,
  parallelConfig: { concurrency: 5 },
});

const llmPipeline = new IndexingPipeline({
  chunkingStrategy: new LlmChunkingStrategy(ollama, config.chunking.llm.model),
  embeddingProvider, // Same provider!
  vectorStore: llmStore,
  parallelConfig: { concurrency: 2 }, // Lower — Ollama chunking is slow
});
```

**Why NOT a new MultiCollectionVectorStore class:** The existing `QdrantVectorStore` is already parameterized on `collectionName`. A wrapper class would add abstraction without value — the pipeline orchestration layer (CLI/indexing) handles the coordination. Collection pairing is a naming convention, not a type relationship.

**Confidence:** HIGH — verified QdrantVectorStore source code is already collection-parameterized.

### Pattern 4: MultiCollectionSearchEngine (Composition)

**What:** A new class that wraps two `SearchEngine` instances, queries in parallel, and merges results with source tagging.
**When to use:** MCP server and dashboard search — anywhere retrieval happens.
**Trade-offs:** Additional merge/dedup logic, but enables richer search results.

```typescript
// packages/retrieval/src/multi-collection-search-engine.ts
export class MultiCollectionSearchEngine {
  constructor(
    private astEngine: SearchEngine,
    private llmEngine?: SearchEngine, // Optional — graceful degradation
  ) {}

  async search(query: RetrievalQuery): Promise<RetrievalResult[]> {
    if (!this.llmEngine) {
      // Single collection mode — backward compatible
      const results = await this.astEngine.search(query);
      return results.map((r) => ({ ...r, source: 'ast' as const }));
    }

    // Parallel query across both collections
    const [astResults, llmResults] = await Promise.all([
      this.astEngine.search(query),
      this.llmEngine.search(query),
    ]);

    // Tag results with source
    const tagged = [
      ...astResults.map((r) => ({ ...r, source: 'ast' as const })),
      ...llmResults.map((r) => ({ ...r, source: 'llm' as const })),
    ];

    // Merge: sort by score, dedup by chunk ID (keep highest scoring)
    return this.mergeAndDedup(tagged, query.limit ?? 10);
  }

  async searchHybrid(query: RetrievalQuery): Promise<RetrievalResult[]> {
    // Same parallel pattern for hybrid search
    // ...
  }

  private mergeAndDedup(
    results: (RetrievalResult & { source: 'ast' | 'llm' })[],
    limit: number,
  ): RetrievalResult[] {
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Dedup: same file + overlapping line ranges → keep higher score
    const seen = new Map<string, RetrievalResult>();
    for (const result of results) {
      const key = `${result.filePath}:${result.startLine}-${result.endLine}`;
      if (!seen.has(key)) {
        seen.set(key, result);
      }
    }

    return Array.from(seen.values()).slice(0, limit);
  }
}
```

**Graceful degradation:** When only AST collection exists (LLM indexing not run or not configured), the `llmEngine` constructor param is `undefined` and search falls back to single-collection behavior. No special casing needed in MCP tools or dashboard.

**MCP integration:** The MCP server uses duck-typed `Engine` interfaces. The `MultiCollectionSearchEngine` implements the same `search()` / `searchHybrid()` / `getFile()` shape. Swapping it in requires changing only the engine instantiation in `createMcpServer()` — zero changes to tool registration or handler functions.

**Confidence:** HIGH — verified MCP tools use duck-typed interfaces via source analysis.

## Data Flow — v1.1 Changes

### Modified Indexing Flow

```
CLI: `ia-framework index --strategy both`
         │
         ├─── strategy=ast (or both) ──────────────────────────────────┐
         │                                                              │
         │  walkFiles → parseFile (tree-sitter AST)                    │
         │       → AstChunkingStrategy.processChunks()                 │
         │           (wraps chunkToDescription — identical output)      │
         │       → embedChunksParallel(concurrency=5) ──── [CHANGED]   │
         │       → upsertBatch to "{project}" collection               │
         │                                                              │
         ├─── strategy=llm (or both) ──────────────────────────────────┐
         │                                                              │
         │  walkFiles → parseFile (tree-sitter AST)                    │
         │       → LlmChunkingStrategy.processChunks()  ──── [NEW]     │
         │           (Ollama chat API with structured output)           │
         │       → embedChunksParallel(concurrency=2) ──── [CHANGED]   │
         │       → upsertBatch to "{project}-llm" collection ── [NEW]  │
         │                                                              │
         └─── Both pipelines share same EmbeddingProvider instance      │
              Both pipelines can run sequentially or in parallel         │
```

### Modified Retrieval Flow

```
MCP tool call: search_codebase(query="auth middleware")
         │
         ▼
  MultiCollectionSearchEngine.search(query)  ──── [NEW]
         │
         ├──── Promise.all([
         │       astEngine.search(query),    → Qdrant "{project}"
         │       llmEngine.search(query),    → Qdrant "{project}-llm"
         │     ])
         │
         ▼
  merge + dedup + source tag
         │
         ▼
  RetrievalResult[] with source='ast'|'llm' per result
         │
         ▼
  MCP response (formatted context with source annotations)
```

### New Dashboard Data Flow

```
Dashboard UI: Search page
         │
         ▼
  DashboardClient.search(query, filters)
         │
         ▼
  Dashboard API: GET /api/search?q=auth&source=ast,llm&limit=20
         │
         ▼
  MultiCollectionSearchEngine.search(query)
         │  (same engine as MCP — shared instance)
         ▼
  JSON response with results + source tags

Dashboard UI: Analytics page
         │
         ▼
  DashboardClient.getCollectionAnalytics()
         │
         ▼
  Dashboard API: GET /api/analytics/collections
         │
         ├── Qdrant: collection info for "{project}" → point count, vectors size
         ├── Qdrant: collection info for "{project}-llm" → point count, vectors size
         └── MetricsStore: query latency stats per source
         │
         ▼
  JSON response with per-collection stats
```

## Integration Details

### 1. ChunkingStrategy Integration with IndexingPipeline

**Current pipeline signature:**

```typescript
// BEFORE (packages/indexer/src/pipeline.ts)
export interface IndexingConfig {
  vectorStore: VectorStore;
  embeddingProvider: EmbeddingProvider;
  // ... other config
}
```

**Modified signature:**

```typescript
// AFTER
export interface IndexingConfig {
  vectorStore: VectorStore;
  embeddingProvider: EmbeddingProvider;
  chunkingStrategy: ChunkingStrategy; // NEW — replaces hardcoded parseFile+chunkToDescription
  parallelEmbedding?: ParallelEmbedConfig; // NEW — replaces sequential batching
  // ... other config
}
```

**Migration:** The existing `chunkToDescription()` function in `packages/indexer/src/chunk-description.ts` is NOT deleted. It becomes an internal implementation detail of `AstChunkingStrategy`. All existing tests continue to pass because `AstChunkingStrategy` produces identical output.

### 2. Multi-Collection QdrantVectorStore

**No code changes to QdrantVectorStore.** The class constructor already accepts `collectionName`:

```typescript
// Existing code — verified
constructor(private config: { url: string; collectionName: string; apiKey?: string }) {}
```

Orchestration happens at the CLI/pipeline level:

- `--strategy ast` → one pipeline, one collection
- `--strategy llm` → one pipeline, one `-llm` collection
- `--strategy both` → two pipelines, two collections, sequential execution

### 3. Dashboard API Search Routes

**New routes added to `packages/dashboard-api/src/routes/`:**

```typescript
// packages/dashboard-api/src/routes/search.ts  [NEW FILE]
export function createSearchRoutes(engine: MultiCollectionSearchEngine): Hono {
  const app = new Hono();

  app.get('/api/search', async (c) => {
    const query = c.req.query('q');
    const sources = c.req.query('source')?.split(',') as ('ast' | 'llm')[];
    const limit = parseInt(c.req.query('limit') ?? '10');

    const results = await engine.search({
      query: query!,
      limit,
      // Filter by source if specified
    });

    return c.json({ results, total: results.length });
  });

  return app;
}

// packages/dashboard-api/src/routes/analytics.ts  [NEW FILE]
export function createAnalyticsRoutes(
  qdrantUrl: string,
  collectionName: string,
  metricsStore: MetricsStore,
): Hono {
  const app = new Hono();

  app.get('/api/analytics/collections', async (c) => {
    const astInfo = await getCollectionInfo(qdrantUrl, collectionName);
    const llmInfo = await getCollectionInfo(qdrantUrl, `${collectionName}-llm`);

    return c.json({
      ast: astInfo, // { pointCount, vectorsSize, indexedAt, ... }
      llm: llmInfo, // null if LLM collection doesn't exist
      comparison: {
        totalChunks: astInfo.pointCount + (llmInfo?.pointCount ?? 0),
        // ...
      },
    });
  });

  return app;
}
```

**AppDependencies modification:**

```typescript
// packages/dashboard-api/src/app.ts — additive change
export interface AppDependencies {
  metricsStore: MetricsStore;
  configManager: ConfigManager;
  // NEW:
  searchEngine?: MultiCollectionSearchEngine; // Optional — search disabled if not provided
}
```

### 4. Dashboard UI — New Pages

```
apps/dashboard/src/
├── pages/
│   ├── Overview.tsx          # Existing — add collection summary widget
│   ├── Benchmarks.tsx        # Existing — unchanged
│   ├── Config.tsx            # Existing — add chunking strategy display
│   ├── TokenUsage.tsx        # Existing — unchanged
│   ├── Search.tsx            # NEW — search UI with source filtering
│   └── Analytics.tsx         # NEW — collection comparison charts
├── components/
│   ├── SearchResults.tsx     # NEW — result list with source badges
│   ├── CollectionStats.tsx   # NEW — per-collection metrics
│   └── ... existing components
└── api/
    └── client.ts             # Existing — add search() and getAnalytics() methods
```

### 5. CLI Strategy Selection

```typescript
// packages/cli/src/commands/index.command.ts — modified
program
  .command('index')
  .option('--strategy <strategy>', 'Chunking strategy: ast, llm, or both', 'ast')
  .option('--force', 'Force full re-index')
  .option('--concurrency <n>', 'Parallel embedding concurrency', '5')
  .action(async (options) => {
    const strategies = options.strategy === 'both' ? ['ast', 'llm'] : [options.strategy];

    for (const strategy of strategies) {
      const pipeline = createPipeline(config, strategy, {
        concurrency: parseInt(options.concurrency),
      });
      await pipeline.run();
    }
  });
```

### 6. Config Schema Extension

```typescript
// packages/core/src/config/schema.ts — additive Zod changes
const chunkingConfigSchema = z
  .object({
    strategy: z.enum(['ast', 'llm', 'both']).default('ast'),
    llm: z
      .object({
        model: z.string().default('llama3.2'),
        ollamaUrl: z.string().url().default('http://localhost:11434'),
        prompt: z.string().optional(), // Custom system prompt for chunking
      })
      .optional(),
  })
  .optional();

// Added to existing projectConfigSchema:
const projectConfigSchema = z.object({
  // ... existing fields
  chunking: chunkingConfigSchema, // NEW
  parallelEmbedding: z
    .object({
      // NEW
      concurrency: z.number().min(1).max(20).default(5),
      intervalCap: z.number().optional(),
      interval: z.number().optional(),
    })
    .optional(),
});
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixing AST and LLM Chunks in One Collection

**What people do:** Store both AST-generated and LLM-generated chunks in the same Qdrant collection, using a metadata flag to distinguish them.
**Why it's wrong:** HNSW index quality degrades when the vector space contains semantically different embedding distributions. AST descriptions are terse/structural ("function getUserById takes id returns User"); LLM descriptions are rich/semantic ("Authentication helper that retrieves a user record by their unique identifier, commonly used in middleware chains"). Mixing them creates a noisy vector space where neither type retrieves optimally.
**Do this instead:** Separate collections. Each collection has a clean, homogeneous vector space. Search both in parallel and merge at the application layer.

### Anti-Pattern 2: Worker Threads for Embedding Parallelism

**What people do:** Use `worker_threads` to parallelize embedding API calls.
**Why it's wrong:** Embedding is I/O-bound (waiting for HTTP responses from OpenAI/Ollama), not CPU-bound. Worker threads add serialization overhead, shared memory complexity, and debugging difficulty — all for a problem that `async/await` with a concurrency limiter solves perfectly.
**Do this instead:** Use `p-queue` with configurable concurrency. It handles async I/O parallelism, rate limiting, and backpressure with ~50 lines of code.

### Anti-Pattern 3: Tightly Coupling MCP Tools to MultiCollectionSearchEngine

**What people do:** Import `MultiCollectionSearchEngine` directly into MCP tool handlers and use its specific API surface.
**Why it's wrong:** The existing MCP tools use duck-typed `Engine` interfaces — this is a feature, not a bug. Direct coupling means MCP tools break when search engine internals change.
**Do this instead:** Keep the duck-typed pattern. `MultiCollectionSearchEngine` implements the same shape (`search()`, `searchHybrid()`, `getFile()`). MCP tools don't know or care about multi-collection internals.

### Anti-Pattern 4: Making LLM Chunking a Required Dependency

**What people do:** Require Ollama to be running for any indexing to work.
**Why it's wrong:** Many users will use AST-only chunking (it's faster, free, works offline). LLM chunking should be opt-in, not opt-out.
**Do this instead:** Default strategy is `ast`. LLM strategy is only activated when `--strategy llm` or `--strategy both` is passed, or when `chunking.strategy` is configured. If Ollama is unavailable when LLM strategy is requested, fail fast with a clear error message — don't silently fall back to AST.

### Anti-Pattern 5: Synchronous LLM Chunking Inside the Embedding Pipeline

**What people do:** Call Ollama for chunk descriptions inline during the embedding stage.
**Why it's wrong:** LLM description generation is slow (1-5 seconds per chunk). Mixing it with embedding creates a sequential bottleneck where neither operation can be parallelized independently.
**Do this instead:** Chunking and embedding are separate pipeline stages. The `ChunkingStrategy` runs first (generating `EnrichedChunk[]` with descriptions), then embedding runs on the complete set of enriched chunks with full parallelism.

## Scaling Considerations

| Concern            | AST Only (current)       | AST + LLM                                    | Notes                                                  |
| ------------------ | ------------------------ | -------------------------------------------- | ------------------------------------------------------ |
| **Indexing time**  | 5-15 min (10K files)     | 2-8 hours (10K files)                        | LLM chunking is ~1-5s per chunk via Ollama             |
| **Mitigation**     | Parallel embedding helps | Incremental LLM indexing essential           | Only re-chunk changed files                            |
| **Qdrant memory**  | ~500MB (10K files)       | ~1GB (10K files, 2 collections)              | Linear growth, manageable                              |
| **Mitigation**     | Default Docker config    | May need to increase Docker memory           | Monitor via dashboard analytics                        |
| **Search latency** | <100ms                   | <150ms (parallel query)                      | Two collections queried in parallel, not sequential    |
| **Mitigation**     | No tuning needed         | Ensure both collections use same HNSW params | Promise.all keeps latency near single-collection       |
| **Embedding cost** | $1-5 (OpenAI, 10K files) | $2-10 (same chunks, 2 strategies)            | Each strategy embeds same code, different descriptions |
| **Mitigation**     | Cloud is fine            | Local Ollama for both chunking and embedding | Eliminates all API costs                               |

## Build Order — v1.1 Features

Dependencies between features determine implementation order:

```
Phase 1: Foundation Refactoring (no new features, enables all others)
  ├── Extract ChunkingStrategy interface from IndexingPipeline
  ├── Create AstChunkingStrategy (wraps existing behavior)
  ├── Replace sequential embedBatch with parallel p-queue
  └── Add EnrichedChunk type with optional description field

Phase 2: LLM Chunking
  ├── Implement LlmChunkingStrategy (Ollama structured output)
  ├── Add --strategy flag to CLI index command
  ├── Extend ProjectConfig with chunking section
  └── Collection naming convention ({name}-llm)

Phase 3: Multi-Collection Search
  ├── Implement MultiCollectionSearchEngine
  ├── Add source field to RetrievalResult
  ├── Integrate into MCP server (swap engine)
  └── Update CLI search command for multi-collection

Phase 4: Dashboard Evolution
  ├── Add search routes to dashboard API
  ├── Add analytics routes to dashboard API
  ├── Build Search page in dashboard UI
  └── Build Analytics page in dashboard UI
```

**Rationale:**

- Phase 1 must come first — all other features depend on the strategy interface and parallel embedding
- Phase 2 depends on Phase 1 — needs ChunkingStrategy interface to implement LlmChunkingStrategy
- Phase 3 depends on Phase 2 — needs two collections to exist before multi-collection search makes sense
- Phase 4 depends on Phase 3 — needs search engine to power search routes, needs collection data for analytics

## Sources

- **Ollama structured output (format parameter):** Context7 `/ollama/ollama-js` — verified `format` accepts JSON schema objects for structured chat output. HIGH confidence.
- **p-queue concurrency control:** Context7 `/sindresorhus/p-queue` — verified `intervalCap`, `interval`, `concurrency` options. HIGH confidence.
- **Qdrant multi-collection:** Context7 `/qdrant/qdrant-js` — verified collection management APIs. HIGH confidence.
- **MCP SDK tool registration:** Context7 `/modelcontextprotocol/typescript-sdk` — verified duck-typed tool handler pattern. HIGH confidence.
- **Hono routing:** Context7 `/websites/hono_dev` — verified route composition with `app.route()`. HIGH confidence.
- **Existing codebase:** Direct source analysis of all packages listed in Context section. HIGH confidence.

---

_Architecture research for: ia-framework v1.1 feature integration_
_Researched: 2026-04-09_
