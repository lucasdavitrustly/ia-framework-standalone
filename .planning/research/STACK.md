# Technology Stack — v1.1 Additions

**Project:** ia-framework
**Milestone:** v1.1 — RAG Quality & Dashboard Evolution
**Researched:** 2026-04-09
**Overall Confidence:** HIGH

> This document covers **only new stack additions** for v1.1. The base stack (Node 22, TypeScript 5.9, pnpm 10, Turborepo, Vitest, Hono, React/Vite, Recharts, Qdrant, web-tree-sitter, better-sqlite3, MCP SDK) is validated and unchanged. See the v1.0 STACK.md in CLAUDE.md for the full base stack.

## New Dependencies

### LLM Interaction (Chunking via Ollama)

| Technology | Version | Purpose               | Why                                                                                                                                                                                                                                                                                                                                                                                                                                         | Confidence |
| ---------- | ------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| ollama     | ^0.6.3  | LLM chat for chunking | Official Ollama JS SDK. Provides typed `chat()` with system prompts, structured JSON output via `format` parameter, streaming, model management (`list`, `pull`, `show`). The embedding package currently uses raw `fetch()` for `/api/embed` — that's fine for embeddings, but LLM chunking needs `chat()` with structured output, conversation context, and streaming progress. The SDK handles all of this with proper TypeScript types. | HIGH       |

**Why the `ollama` package now when we didn't need it before:**

- v1.0 embedding only needed one HTTP call (`POST /api/embed`) — raw `fetch()` was simpler
- v1.1 LLM chunking needs `chat()` with system prompts, structured output schemas, streaming progress tracking, and model lifecycle management (`list`, `pull`, `show` for interactive selection)
- The SDK provides typed responses, proper error handling, and the `format` parameter for structured output — building this from scratch would duplicate the SDK

**Structured output pattern (verified via Context7, HIGH confidence):**

```typescript
import ollama from 'ollama';
import * as z from 'zod';

// Define chunk output schema with Zod
const ChunkBoundarySchema = z.object({
  chunks: z.array(
    z.object({
      startLine: z.number().describe('First line of this semantic chunk'),
      endLine: z.number().describe('Last line of this semantic chunk'),
      summary: z.string().describe('One-sentence prose description of what this chunk does'),
      chunkType: z.enum(['function', 'class', 'interface', 'module', 'block']),
      name: z.string().describe('Name of the primary symbol in this chunk'),
    }),
  ),
});

// Use Zod 4's built-in toJSONSchema — NO external library needed
const response = await ollama.chat({
  model: 'qwen3:8b',
  messages: [
    {
      role: 'system',
      content: 'You are a code analysis tool. Identify semantic chunk boundaries...',
    },
    { role: 'user', content: `Analyze this code and identify semantic chunks:\n\n${codeContent}` },
  ],
  format: z.toJSONSchema(ChunkBoundarySchema), // Zod 4 built-in!
  options: { temperature: 0 },
});

const parsed = ChunkBoundarySchema.parse(JSON.parse(response.message.content));
```

**Key integration point:** Zod 4 (already installed at `^4.3.6`) has built-in `z.toJSONSchema()`. This eliminates the need for `zod-to-json-schema` — one fewer dependency.

### Concurrency Control (Parallel Embedding)

| Technology | Version | Purpose                   | Why                                                                                                                                                                                                                                                                                                                                                                         | Confidence |
| ---------- | ------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| p-queue    | ^9.1.2  | Parallel batch processing | Promise queue with configurable concurrency, rate limiting (`intervalCap` + `interval`), priority support, and abort signals. Pure ESM, `type: "module"`, requires Node >=20 (we target Node 22). Currently the `IndexingPipeline` processes embedding batches sequentially in a for-loop — `p-queue` enables concurrent batch processing without worker thread complexity. | HIGH       |

**Why p-queue over alternatives:**

| Option                                   | Why Not                                                                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker threads (`node:worker_threads`)   | Embedding is I/O-bound (HTTP calls to Ollama/OpenAI), not CPU-bound. Worker threads add IPC serialization overhead for zero benefit. Async concurrency via p-queue is the correct pattern.   |
| `Promise.all()` / `Promise.allSettled()` | No concurrency limit — would overwhelm Ollama with 50+ simultaneous requests. p-queue caps concurrent requests to a safe number.                                                             |
| `p-limit`                                | Lower-level — just concurrency limiting. p-queue adds priority, rate limiting, queue events, abort signals. Worth it for embedding pipelines where we need rate control + progress tracking. |
| `p-map`                                  | Maps over an array with concurrency but no queue semantics, no rate limiting, no priority. p-queue is more appropriate for long-running pipeline work.                                       |
| Custom async queue                       | Why build what p-queue already does perfectly? 1.2M weekly downloads, battle-tested.                                                                                                         |

**Usage pattern for parallel embedding:**

```typescript
import PQueue from 'p-queue';

// Different concurrency defaults per provider:
// Ollama (local): 2-3 concurrent (GPU memory bound)
// OpenAI (cloud): 5-10 concurrent (API rate limit bound)
const queue = new PQueue({
  concurrency: provider === 'ollama' ? 2 : 5,
  intervalCap: provider === 'openai' ? 50 : undefined, // OpenAI: max 50 per interval
  interval: provider === 'openai' ? 60_000 : undefined, // OpenAI: per minute
});

// Enqueue all batches, p-queue manages concurrency
const batchPromises = batches.map((batch, i) =>
  queue.add(
    async ({ signal }) => {
      const vectors = await embeddingProvider.embedBatch(batch.texts);
      onProgress?.({ batchesCompleted: i + 1, totalBatches: batches.length });
      return vectors;
    },
    { signal: abortController.signal },
  ),
);

const allVectors = await Promise.all(batchPromises);
```

## Existing Dependencies — New Usage Patterns

These are already installed. No version changes needed. Documenting new usage patterns for v1.1.

### Zod 4 — Built-in JSON Schema Conversion

| Technology | Version                    | New Usage                                       | Integration Point                              |
| ---------- | -------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| zod        | ^4.3.6 (already installed) | `z.toJSONSchema()` for Ollama structured output | Replaces need for `zod-to-json-schema` package |

**Verified:** Zod 4 exports `z.toJSONSchema()` as a first-party function (confirmed via Context7, zod.dev/v4 docs). The Ollama JS SDK examples show `zod-to-json-schema` but that's because their docs target Zod 3 users — with Zod 4, it's built-in.

```typescript
import * as z from 'zod';

const schema = z.object({
  chunks: z.array(
    z.object({
      startLine: z.number(),
      endLine: z.number(),
      summary: z.string().describe('Prose description for embedding'),
    }),
  ),
});

// Zod 4 built-in — no external package
const jsonSchema = z.toJSONSchema(schema);
// Pass directly to ollama.chat({ format: jsonSchema })
```

### @qdrant/js-client-rest — Multi-Collection Patterns

| Technology             | Version                     | New Usage                                                         | Integration Point                                        |
| ---------------------- | --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| @qdrant/js-client-rest | ^1.17.0 (already installed) | Multiple collection instances, `searchBatch()` for A/B comparison | QdrantVectorStore needs refactoring for multi-collection |

**Current state:** `QdrantVectorStore` takes a single `collectionName` in its constructor. This already supports multi-collection — just create multiple instances.

**Multi-collection naming convention:**

```
{project}-ast     # AST-chunked collection (tree-sitter strategy)
{project}-llm     # LLM-chunked collection (Ollama strategy)
```

**Example: Default collection name `codebase` → `codebase-ast`, `codebase-llm`**

**A/B comparison search pattern (verified via Context7, HIGH confidence):**

```typescript
// Create two VectorStore instances pointing to different collections
const astStore = new QdrantVectorStore({ ...config, collectionName: 'codebase-ast' });
const llmStore = new QdrantVectorStore({ ...config, collectionName: 'codebase-llm' });

// Or use Qdrant batch search within a single collection (for internal A/B):
const batchResults = await client.searchBatch('my_collection', {
  searches: [
    {
      vector: queryVector,
      limit: 10,
      filter: { must: [{ key: 'strategy', match: { value: 'ast' } }] },
    },
    {
      vector: queryVector,
      limit: 10,
      filter: { must: [{ key: 'strategy', match: { value: 'llm' } }] },
    },
  ],
});
```

**Architecture decision — Separate collections vs. single collection with payload filter:**

| Approach                                                  | Pros                                                                                                                                           | Cons                                                                             | Recommendation |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| **Separate collections** (`codebase-ast`, `codebase-llm`) | Clean isolation, independent lifecycle (can re-index one without touching other), different vector dimensions per strategy, clear A/B boundary | Slightly more Qdrant overhead, two `initialize()` calls                          | **Use this**   |
| Single collection + payload filter                        | One collection to manage, simpler config                                                                                                       | Vectors must be same dimensions, can't independently re-index, muddled lifecycle | Don't use      |

**Recommendation: Separate collections.** LLM-chunked vectors may have different dimensions than AST-chunked ones (different content → different optimal models). Independent re-indexing is critical for experimentation.

### Recharts — Additional Chart Types for Analytics

| Technology | Version                    | New Chart Types Needed                  | Use Case                                                   |
| ---------- | -------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| recharts   | ^3.8.1 (already installed) | ScatterChart, ComposedChart, RadarChart | Score distributions, combined metrics, strategy comparison |

**Already verified via Context7 (HIGH confidence)** — Recharts 3.x supports all chart types needed:

| Dashboard Feature             | Chart Type     | Recharts Component                             |
| ----------------------------- | -------------- | ---------------------------------------------- |
| Score distribution per search | Scatter plot   | `ScatterChart` + `Scatter`                     |
| Latency vs chunk count        | Composed chart | `ComposedChart` + `Bar` + `Line`               |
| AST vs LLM strategy radar     | Radar chart    | `RadarChart` + `Radar`                         |
| Chunk stats over time         | Area chart     | `AreaChart` + `Area` (already used)            |
| Search history metrics        | Bar chart      | `BarChart` + `Bar` (already used)              |
| Per-search score breakdown    | Custom tooltip | `Tooltip` with `content={<CustomComponent />}` |

**No additional charting library needed.** Recharts covers scatter plots, radar charts, composed charts, and custom tooltips — all verified in Context7 docs.

### better-sqlite3 — Search History Storage

| Technology     | Version                     | New Usage                          | Integration Point             |
| -------------- | --------------------------- | ---------------------------------- | ----------------------------- |
| better-sqlite3 | ^12.8.0 (already installed) | Search history table for dashboard | Extends existing MetricsStore |

**Pattern:** Add a `search_history` table alongside existing `rag_events`:

```sql
CREATE TABLE IF NOT EXISTS search_history (
  id           TEXT PRIMARY KEY,
  query        TEXT NOT NULL,
  strategy     TEXT NOT NULL,         -- 'ast', 'llm', 'both'
  collection   TEXT NOT NULL,         -- collection name searched
  result_count INTEGER NOT NULL,
  top_score    REAL,
  avg_score    REAL,
  latency_ms   INTEGER NOT NULL,
  token_count  INTEGER NOT NULL,
  timestamp    TEXT NOT NULL,
  results_json TEXT                   -- serialized top results for replay
);
CREATE INDEX IF NOT EXISTS idx_search_history_ts ON search_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_search_history_strategy ON search_history(strategy);
```

No new dependency — extends existing `MetricsStore` pattern.

## What NOT to Add

| Rejected Library                                | Why Not                                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zod-to-json-schema`                            | Zod 4 has built-in `z.toJSONSchema()`. Adding this would be redundant.                                                                                                                       |
| `use-debounce` / `lodash.debounce`              | React 19's `useDeferredValue` + `useTransition` handle search input debouncing natively. For simple cases, a 10-line custom `useDebounce` hook suffices.                                     |
| `@tanstack/react-query`                         | The dashboard already uses `useEffect` + `fetch` for data loading. Adding React Query for one new search endpoint is over-engineering. Consider only if the dashboard grows significantly.   |
| `fuse.js` / `minisearch`                        | Client-side fuzzy search library. Search happens server-side via Qdrant — no client-side search needed.                                                                                      |
| `react-virtualized` / `@tanstack/react-virtual` | Virtualized list for search results. With typical result counts (10-50 items), virtualization is unnecessary overhead.                                                                       |
| `highlight.js` / `prism.js`                     | Code syntax highlighting for search results. The dashboard shows code snippets as preformatted text — full syntax highlighting adds bundle weight for marginal value in a metrics dashboard. |
| Worker threads (`node:worker_threads`)          | Embedding calls are I/O-bound HTTP requests. Worker threads only help CPU-bound work. Async concurrency via p-queue is correct for network I/O.                                              |
| LangChain / LlamaIndex.TS                       | 50+ transitive dependencies for what amounts to two API calls (Ollama chat + embed). The `ollama` SDK is 15KB and does exactly what we need.                                                 |
| Separate GraphQL layer                          | REST endpoints via Hono are sufficient for dashboard ↔ API communication. GraphQL adds complexity without benefit for a single-client internal tool.                                         |
| New React state management (Redux, Zustand)     | Dashboard state is simple (search query, results, history). React 19's built-in state + context handles this. Zustand would be premature.                                                    |
| New charting library (ECharts, Nivo, Victory)   | Recharts already has scatter, radar, composed charts, custom tooltips — verified in Context7. No gaps to fill.                                                                               |

## Installation

```bash
# New dependencies for v1.1 (add to relevant packages)

# packages/indexer — LLM chunking + parallel embedding
pnpm add ollama p-queue --filter @ia-framework/indexer

# OR if LLM chunking gets its own package:
# packages/llm-chunker
pnpm add ollama --filter @ia-framework/llm-chunker
pnpm add p-queue --filter @ia-framework/indexer

# No other new dependencies needed — all other capabilities come from
# existing stack (Zod 4, Qdrant client, Recharts, better-sqlite3)
```

## Version Compatibility Matrix (New Additions)

| Library               | Node.js | TypeScript     | ESM        | Notes                                                                      |
| --------------------- | ------- | -------------- | ---------- | -------------------------------------------------------------------------- |
| ollama ^0.6.3         | any     | ^5.3           | Yes (dual) | Minimal deps (whatwg-fetch). Already in v1.0 STACK.md but never installed. |
| p-queue ^9.1.2        | >=20    | Built-in types | Pure ESM   | Zero dependencies. Requires Node 20+ (we target 22).                       |
| zod ^4.3.6 (existing) | any     | any            | Yes (dual) | `z.toJSONSchema()` — built-in, no plugin needed.                           |

## Integration Architecture

### How New Additions Connect to Existing Stack

```
                    ┌──────────────────────────────────────────┐
                    │           CLI (commander)                 │
                    │   ia-framework index --strategy llm       │
                    └────────┬──────────────┬──────────────────┘
                             │              │
                    ┌────────▼──────┐ ┌─────▼──────────────┐
                    │  AST Chunker  │ │  LLM Chunker (NEW) │
                    │ (tree-sitter) │ │  (ollama SDK)       │
                    │  existing     │ │  + Zod schemas      │
                    └────────┬──────┘ └─────┬──────────────┘
                             │              │
                    ┌────────▼──────────────▼──────────────────┐
                    │         IndexingPipeline                  │
                    │   p-queue for parallel embedding (NEW)    │
                    │   embeddingProvider.embedBatch()          │
                    └────────┬──────────────┬──────────────────┘
                             │              │
                    ┌────────▼──────┐ ┌─────▼──────────────┐
                    │  codebase-ast │ │  codebase-llm       │
                    │  (Qdrant)     │ │  (Qdrant)           │
                    └────────┬──────┘ └─────┬──────────────┘
                             │              │
                    ┌────────▼──────────────▼──────────────────┐
                    │         SearchEngine                      │
                    │   Multi-collection search                 │
                    │   Results tagged with source strategy     │
                    └────────┬─────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼──────┐ ┌─────▼──────────┐
     │  MCP Server   │ │ Dashboard │ │  CLI search     │
     │  (dual coll.) │ │   API     │ │                 │
     └───────────────┘ │ + search  │ └────────────────┘
                       │   history │
                       │ (SQLite)  │
                       └────┬──────┘
                            │
                       ┌────▼──────────────────────────┐
                       │  Dashboard React App            │
                       │  Search UI + Analytics (NEW)    │
                       │  Recharts (scatter, radar, etc) │
                       └────────────────────────────────┘
```

### Ollama SDK vs. Raw Fetch Decision

The codebase has two Ollama interaction points:

| Use Case         | Current Approach              | v1.1 Approach                      | Why                                                                                                              |
| ---------------- | ----------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Embedding**    | Raw `fetch()` to `/api/embed` | Keep raw `fetch()` — it works fine | One endpoint, one call, typed response. SDK adds no value here.                                                  |
| **LLM Chunking** | N/A (new)                     | `ollama` SDK `chat()`              | Needs structured output (`format`), system prompts, streaming, model management. SDK provides all of this typed. |

**Do NOT refactor embedding to use the SDK.** Raw `fetch()` is simpler for the embedding use case and avoids an unnecessary dependency in the embedding package. The `ollama` SDK goes in the indexer (or new llm-chunker package) only.

### Recommended Ollama Models for Chunking

| Model          | Size  | Context | Speed  | Quality | Recommendation                                                           |
| -------------- | ----- | ------- | ------ | ------- | ------------------------------------------------------------------------ |
| qwen3:8b       | 4.9GB | 128K    | Medium | High    | **Primary choice** — strong instruction following, good at code analysis |
| llama3.1:8b    | 4.7GB | 128K    | Medium | High    | Good alternative — well-tested for structured output                     |
| phi4-mini:3.8b | 2.2GB | 128K    | Fast   | Medium  | Budget option — smaller GPU footprint, acceptable quality                |
| gemma3:4b      | 3.3GB | 128K    | Fast   | Medium  | Good balance of speed and quality                                        |

**Start with `qwen3:8b`** — it has strong instruction-following for structured output tasks. The chunking prompt should be kept under 4K tokens (code snippet + system prompt), well within context limits.

## Confidence Assessment

| Area                      | Confidence | Rationale                                                                                                                                           |
| ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama SDK for chunking   | HIGH       | Context7 docs verified `chat()` + `format` + Zod structured output. Package actively maintained (weekly npm releases).                              |
| p-queue for parallelism   | HIGH       | Context7 docs verified concurrency + rate limiting API. Pure ESM, Node >=20 compatible. 1.2M weekly downloads.                                      |
| Zod 4 toJSONSchema        | HIGH       | Context7 + official zod.dev/v4 docs confirm `z.toJSONSchema()` is built-in. Eliminates need for third-party converter.                              |
| Multi-collection Qdrant   | HIGH       | Context7 docs verified `searchBatch()`, multiple collection creation. Existing `QdrantVectorStore` already supports this via constructor parameter. |
| Recharts for analytics    | HIGH       | Context7 docs verified ScatterChart, RadarChart, ComposedChart, custom Tooltip — all needed chart types present in v3.x.                            |
| Dashboard: no new UI libs | HIGH       | React 19 built-in APIs (`useDeferredValue`, `useTransition`) + existing Tailwind + Recharts cover all needs. Verified via codebase inspection.      |

## Sources

- Ollama JS SDK: Context7 `/ollama/ollama-js` (HIGH reputation, 92 snippets) — verified `chat()`, `format`, `pull()`, `list()`, streaming
- Ollama JS structured output: Context7 docs showing Zod + `format` parameter pattern
- Qdrant JS client: Context7 `/qdrant/qdrant-js` (HIGH reputation, 98 snippets) — verified `searchBatch()`, `createCollection()`, `getCollections()`
- p-queue: Context7 `/sindresorhus/p-queue` (135 snippets) — verified concurrency, rate limiting, priority, abort signals
- Recharts: Context7 `/recharts/recharts` (HIGH reputation, 94 snippets) — verified ScatterChart, RadarChart, ComposedChart, custom Tooltip
- Zod 4 JSON Schema: Context7 `/websites/zod_dev_v4` (HIGH reputation, 1544 snippets) — verified `z.toJSONSchema()` built-in function
- npm registry: `ollama@0.6.3`, `p-queue@9.1.2`, `zod-to-json-schema@3.25.2` (peer dep `zod ^3.25.28 || ^4` — confirms Zod 4 compat, but NOT needed since Zod 4 has built-in)
- Codebase inspection: `packages/embedding/src/providers/ollama.ts` (raw fetch), `packages/vector-store/src/qdrant.ts` (single collection pattern), `packages/indexer/src/pipeline.ts` (sequential embedding loop)
