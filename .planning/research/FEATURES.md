# Feature Research: ia-framework v1.1 — RAG Quality & Observability

**Domain:** AI-Assisted Development Framework — RAG Pipeline Enhancement
**Researched:** 2026-04-09
**Confidence:** HIGH

## Scope

This document covers the **six new capability areas for v1.1**, not the existing v1.0 features. The v1.0 core pipeline (AST indexing, semantic search, MCP server, benchmark system, dashboard shell) is assumed complete and operational.

**v1.1 capability areas:**

1. LLM-Based Chunking (alternative indexing strategy)
2. Parallel Embedding Pipeline
3. Dashboard Search UI
4. A/B Collection Comparison
5. Search History
6. Analytics & RAG Quality Monitoring

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that are non-negotiable for v1.1. Without these, the release has no value.

| Feature                                    | Why Expected                                                                                                                                                                           | Complexity | Dependencies                                                                                      | Notes                                                                                                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LLM chunking: Ollama integration**       | v1.1's headline feature. Users upgrade specifically for LLM-based semantic chunking. If it doesn't work with Ollama, the milestone fails.                                              | HIGH       | Ollama running locally, `ollama` npm package (v0.6.3), `/api/generate` or `/api/chat` endpoint    | Use structured JSON output (`format` param with JSON schema). Model: `qwen2.5-coder:7b` or similar code-aware model. Must handle timeouts, retries, and model-not-found errors gracefully.                             |
| **LLM chunking: chunk boundary detection** | The core value — chunks aligned to semantic meaning, not AST syntax. Users expect chunks that group logically related code even across function boundaries.                            | HIGH       | LLM chunking Ollama integration                                                                   | Send code file + prompt asking LLM to identify semantic boundaries (start line, end line, purpose description). Single-pass approach: one LLM call per file returns structured array of chunk boundaries.              |
| **LLM chunking: chunk summaries**          | Each chunk gets an LLM-generated natural language summary. This is what makes LLM chunking superior to AST — the summary becomes the embedding text, capturing intent not just syntax. | HIGH       | Chunk boundary detection                                                                          | Summary generated in same LLM call as boundaries (single-pass). Summary becomes the `text` vector; raw code becomes the `code` vector. Mirrors existing dual-vector approach.                                          |
| **Multi-collection Qdrant storage**        | v1.1 creates separate collections per indexing strategy (e.g., `project-ast`, `project-llm`). Without this, A/B comparison is impossible.                                              | MEDIUM     | `@qdrant/js-client-rest` (v1.17.0), existing Qdrant Docker instance                               | Each collection has identical vector schema (text, code, code-bm25). Collection naming convention: `{project}-{strategy}`. Qdrant has no native cross-collection search — must query each and merge client-side.       |
| **MCP tools query both collections**       | `search_codebase` and `search_codebase_hybrid` must search ALL active collections and merge results. Breaking existing MCP behavior is unacceptable.                                   | MEDIUM     | Multi-collection storage, existing MCP tools (`search-codebase.ts`, `search-codebase-hybrid.ts`)  | Query each collection independently, merge via RRF or score normalization. Tag each result with `source: 'ast' \| 'llm'` so the AI client knows provenance. Must not degrade latency significantly (parallel queries). |
| **CLI strategy selection at index time**   | Developer runs `ia-framework index --strategy llm` or `--strategy ast`. Without this, there's no way to create LLM-indexed collections.                                                | LOW        | LLM chunking pipeline, existing CLI (`packages/cli/`)                                             | Default: `ast` (backward compatible). Options: `ast`, `llm`, `all`. `all` runs both strategies sequentially.                                                                                                           |
| **Parallel embedding: batch processing**   | The existing pipeline already batches (`embeddingBatchSize = 50`), but processes batches sequentially. v1.1 must process multiple batches concurrently for speed.                      | MEDIUM     | Existing `IndexingPipeline` (`packages/indexer/src/pipeline.ts`), `p-queue` (concurrency control) | Use `p-queue` with configurable concurrency (default: 3 concurrent batches). Respect provider rate limits. Cloud providers (OpenAI) need lower concurrency than local (Ollama).                                        |
| **Parallel embedding: progress reporting** | Long indexing jobs must show progress. Users expect to know how far along they are, especially with LLM chunking which is much slower than AST.                                        | LOW        | Parallel embedding pipeline                                                                       | Emit progress events: `{ phase: 'parsing' \| 'chunking' \| 'embedding' \| 'storing', completed: number, total: number, elapsed: number }`. CLI renders as progress bar. Dashboard receives via SSE/WebSocket.          |

### Differentiators (Competitive Advantage)

Features that make v1.1 genuinely valuable beyond "LLM chunking exists."

| Feature                                             | Value Proposition                                                                                                                                                                                                           | Complexity  | Dependencies                                                                                                       | Notes                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard: interactive search UI**                | No competitor offers a visual search testing interface. Developers can type queries, see results with scores, file paths, and chunk previews — then immediately understand what the AI "sees." Makes the invisible visible. | MEDIUM      | Dashboard app (`apps/dashboard/`), dashboard API (`packages/dashboard-api/`), SearchEngine (`packages/retrieval/`) | New dashboard page: `/search`. Components: query input, collection selector, results list with score badges and syntax-highlighted code previews. Each result shows: score, file path, chunk type (function/class/module), lines, source strategy (ast/llm). |
| **Dashboard: per-query metrics panel**              | After running a search, show retrieval metrics: latency, chunks scanned, vector similarity distribution, BM25 vs dense score breakdown. Developers can diagnose why retrieval quality is poor.                              | MEDIUM      | Dashboard search UI, MetricsStore (`packages/observability/`)                                                      | Sidebar panel next to results. Shows: query latency (ms), chunks returned vs total, score histogram, strategy comparison if both collections queried. Uses existing `RagEvent` logging.                                                                      |
| **A/B collection comparison: side-by-side results** | Run the same query against AST and LLM collections simultaneously. See results side-by-side. This is how developers empirically decide which chunking strategy works better for their codebase.                             | MEDIUM-HIGH | Multi-collection storage, Dashboard search UI                                                                      | Split-pane view: left = AST results, right = LLM results. Same query, same scoring display. Highlight differences: chunks that appear in one but not the other. Rank agreement/disagreement metric.                                                          |
| **A/B comparison: scoring visualization**           | Beyond side-by-side results, visualize aggregate scoring differences. Bar charts comparing MRR, precision@k, recall@k across strategies. Makes the benchmark data actionable.                                               | MEDIUM      | A/B side-by-side results, Recharts (`recharts` v3.8.1), benchmark data                                             | Radar chart or grouped bar chart: MRR, P@5, P@10, nDCG for each strategy. Overlay on the same axes. Requires benchmark runs for both collections to have comparable data.                                                                                    |
| **Search history: query persistence**               | Save every search query with its results, scores, and timestamp. Developers can replay past queries to see if re-indexing improved results.                                                                                 | LOW-MEDIUM  | MetricsStore (already logs `RagEvent`), Dashboard API                                                              | MetricsStore already captures: query text, chunksRetrieved, chunkIds, tokenCount, strategy, latencyMs via `logRagEvent()`. Extend to persist full result payloads (file paths, scores, snippet previews). New API endpoint: `GET /api/search-history`.       |
| **Search history: replay & compare**                | Select two historical queries and compare their results. Shows how retrieval changed after re-indexing, config changes, or strategy switches.                                                                               | MEDIUM      | Search history persistence, Dashboard search UI                                                                    | Select query A (from 3 days ago) and query B (same text, today) → diff view showing which chunks were added/removed/reranked. Critical for iterative RAG tuning.                                                                                             |
| **Search history: filtering & search**              | Filter history by date range, strategy, minimum score threshold, or query text substring. Makes history useful at scale.                                                                                                    | LOW         | Search history persistence                                                                                         | SQL queries against MetricsStore SQLite. Filters: `WHERE query LIKE '%auth%' AND strategy = 'llm' AND created_at > date('now', '-7 days')`. Paginated results.                                                                                               |
| **Analytics: RAG quality trends over time**         | Track MRR, retrieval latency, and chunk relevance scores as time-series. Show trend lines on the dashboard. Developers see if their RAG is getting better or worse.                                                         | MEDIUM      | MetricsStore, Recharts, benchmark data                                                                             | New dashboard page or section: `/analytics`. Line charts: MRR over time, average latency over time, indexing coverage %. Data from `getEventsByDay()` and benchmark history.                                                                                 |
| **Analytics: strategy comparison aggregates**       | Aggregate stats comparing AST vs LLM strategies: average score, average latency, average chunks returned. Persistent comparison, not per-query.                                                                             | MEDIUM      | Multi-collection storage, MetricsStore                                                                             | Cards or table: "AST: avg MRR 0.72, avg latency 45ms" vs "LLM: avg MRR 0.81, avg latency 52ms". Uses `getStrategyStats()` (already exists in MetricsStore).                                                                                                  |
| **Analytics: token usage breakdown by strategy**    | Show how much token budget each strategy consumes — both for embedding (indexing) and retrieval (query). LLM chunking uses tokens for chunk generation + embedding; AST uses tokens only for embedding.                     | LOW-MEDIUM  | MetricsStore token tracking, Dashboard                                                                             | Stacked bar chart: tokens by category (indexing-ast, indexing-llm, query-ast, query-llm). Helps developers understand the cost tradeoff of LLM chunking.                                                                                                     |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build in v1.1.

| Feature                                      | Why Requested                                       | Why Problematic                                                                                                                                                                                              | Alternative                                                                                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloud LLM chunking (OpenAI/Anthropic)**    | "Ollama is slow, let me use GPT-4 for chunking"     | Adds API key management, cost tracking, rate limiting, error handling for cloud providers. Doubles the integration surface for chunking. Ollama-only keeps v1.1 scope contained.                             | Defer to v3 per PROJECT.md milestone plan. Ollama with qwen2.5-coder:7b is fast enough on modern hardware.                                                                                           |
| **Real-time re-chunking on file save**       | "Re-chunk my file every time I save"                | LLM chunking is slow (seconds per file). Triggering on every save wastes resources and creates indexing queue congestion. AST chunking is fast enough for real-time; LLM is not.                             | Use existing incremental indexing (git-diff based). Re-chunk only on explicit `ia-framework index` or on significant changes (new files, renamed files). Debounce file watching.                     |
| **Custom prompt templates for LLM chunking** | "Let me write my own chunking prompts"              | Prompt engineering for chunking is a research problem. Exposing raw prompts creates a support burden ("my chunks are bad" → "what's your prompt?"). The framework should own the chunking prompt.            | Ship an optimized, tested chunking prompt. Allow minor config (e.g., max chunk size, language hints) but not full prompt override. Consider prompt versioning internally.                            |
| **Embedding model fine-tuning UI**           | "Fine-tune embeddings for my codebase"              | Fine-tuning requires ML infrastructure, training data curation, evaluation pipelines. Massive scope for marginal gain when off-the-shelf code embeddings (nomic-embed-text, voyage-code-3) are already good. | Support swapping embedding models via config. Benchmark different models. Don't build fine-tuning infrastructure.                                                                                    |
| **Graph database for code relationships**    | "Use Neo4j for the dependency graph"                | Adds another Docker service, another query language (Cypher), another data model to maintain. The dependency graph is small enough to hold in memory or store as Qdrant payloads.                            | Store dependency edges as payload metadata in Qdrant points. Expand graph in-memory during retrieval. Current `searchWithExpansion()` approach is sufficient.                                        |
| **Dashboard: real-time streaming search**    | "Show results as they come in from each collection" | WebSocket streaming for search adds complexity with minimal UX benefit — searches complete in <200ms. Streaming makes sense for LLM generation, not vector search.                                           | Show a simple loading spinner, then render all results at once. Parallel collection queries finish nearly simultaneously.                                                                            |
| **Automatic strategy recommendation**        | "Tell me which strategy is best for my codebase"    | Requires statistically significant benchmark data (many queries, labeled relevance). Most users won't have enough data for meaningful recommendations. Premature automation.                                 | Show the data (A/B comparison, analytics) and let the developer decide. Provide documentation on when LLM chunking tends to outperform AST (e.g., cross-cutting concerns, documentation-heavy code). |

---

## Feature Dependencies

```
LLM Chunking Pipeline
    ├── Ollama Integration (generate/chat API)
    │     └── Structured JSON Output (chunk boundaries + summaries)
    ├── Multi-Collection Qdrant Storage
    │     ├── Collection Naming Convention ({project}-{strategy})
    │     └── Identical Vector Schema per Collection
    └── CLI Strategy Selection (--strategy ast|llm|all)

Multi-Collection Qdrant Storage
    └── MCP Tools Multi-Collection Query
          ├── Parallel Collection Queries
          ├── Result Merging (RRF / score normalization)
          └── Source Strategy Tagging (ast|llm per result)

Parallel Embedding Pipeline
    ├── p-queue Concurrency Control
    ├── Provider Rate Limit Awareness
    └── Progress Event Emission
          └── Dashboard Progress Display (via SSE/WebSocket)

Dashboard Search UI
    ├── Query Input + Collection Selector
    ├── Results Display (scores, paths, previews)
    └── Per-Query Metrics Panel
          └── MetricsStore RagEvent Data

A/B Collection Comparison
    ├── Multi-Collection Storage (prerequisite)
    ├── Dashboard Search UI (prerequisite)
    ├── Side-by-Side Results View
    └── Scoring Visualization (Recharts)
          └── Benchmark Data for Both Collections

Search History
    ├── MetricsStore Extension (full result persistence)
    ├── Dashboard History Page
    ├── Replay & Compare View
    └── Filtering (date, strategy, query text)

Analytics & Monitoring
    ├── MetricsStore Aggregation Queries
    ├── RAG Quality Trend Charts (Recharts)
    ├── Strategy Comparison Aggregates
    └── Token Usage Breakdown by Strategy
```

### Dependency Notes

- **A/B Comparison requires Multi-Collection Storage:** You can't compare strategies without separate collections to compare. Multi-collection must ship before or alongside A/B comparison.
- **A/B Comparison requires Dashboard Search UI:** The side-by-side view is built on top of the search results component. Search UI must exist first.
- **Search History extends MetricsStore:** The existing `RagEvent` logging captures most of what's needed. Extension is additive (persist result payloads), not a rewrite.
- **Analytics depends on MetricsStore + Benchmarks:** Trend charts need time-series data. Without benchmark runs generating data points, analytics pages are empty.
- **LLM Chunking is independent of Parallel Embedding:** These are orthogonal improvements. LLM chunking changes _how_ chunks are created; parallel embedding changes _how fast_ they're embedded. Both can ship independently.
- **MCP multi-collection query depends on Multi-Collection Storage:** MCP tools must be updated after collections exist, but this is a thin adapter layer.
- **Progress Reporting is independent of Parallel Embedding:** Even sequential pipelines benefit from progress events. But parallel pipelines make progress reporting more important (longer jobs, more complex state).

---

## Detailed Feature Analysis

### 1. LLM-Based Chunking

**How it works:**

1. **File reading:** Read source file content (same as AST pipeline).
2. **LLM call:** Send file content to Ollama with a structured prompt:
   - "Analyze this code file. Identify semantically coherent chunks. For each chunk, provide: start line, end line, type (function/class/module/config/test), and a natural language summary describing what the code does and why."
   - Use Ollama's `format` parameter with a JSON schema to get structured output.
3. **Chunk extraction:** Parse LLM response into chunk objects with boundaries and summaries.
4. **Embedding:** Generate embeddings for each chunk — summary text → `text` vector, raw code → `code` vector, raw code → `code-bm25` sparse vector.
5. **Storage:** Store in a separate Qdrant collection (`{project}-llm`).

**Single-pass vs two-pass:**

| Approach                      | How                                                            | Pros                                          | Cons                                                             |
| ----------------------------- | -------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| **Single-pass (recommended)** | One LLM call returns boundaries + summaries                    | Faster, fewer tokens, simpler pipeline        | Summary quality may be slightly lower without dedicated focus    |
| **Two-pass**                  | First call: boundaries only. Second call: summarize each chunk | Better summaries, can parallelize second pass | 2x LLM calls, 2x tokens, 2x latency, more complex error handling |

**Recommendation:** Single-pass. The marginal summary quality improvement from two-pass doesn't justify doubling the LLM token cost and pipeline complexity. The summary only needs to be good enough for embedding — it's not user-facing text.

**Error handling considerations:**

- Model not found → clear error message with install instructions (`ollama pull qwen2.5-coder:7b`)
- Timeout → configurable per-file timeout (default: 30s), skip file on timeout, log warning
- Malformed JSON → retry once with simpler prompt, fall back to AST chunking for that file
- File too large for context window → split into sections (e.g., by top-level declarations), chunk each section independently

**Token budget:**

- qwen2.5-coder:7b context: 32K tokens (~24K words)
- Typical source file: 100-500 lines → 1K-5K tokens
- LLM response (boundaries + summaries): ~500-2K tokens per file
- Estimated cost: 2K-7K tokens per file (input + output)
- For a 1000-file project: ~2M-7M tokens total (all local via Ollama, no $ cost)

### 2. Parallel Embedding Pipeline

**Current state:** `IndexingPipeline.indexFiles()` processes embedding batches sequentially. Each batch of 50 chunks calls the embedding provider, waits for response, then proceeds to next batch.

**Target state:** Process N batches concurrently using `p-queue`.

**Batching strategy:**

```
Total chunks: 500
Batch size: 50 → 10 batches
Concurrency: 3 → ~3.3x speedup (minus overhead)

Queue: [B1, B2, B3, B4, B5, B6, B7, B8, B9, B10]
        ↓    ↓    ↓
     Processing 3 at a time
```

**Concurrency limits by provider:**

| Provider       | Recommended Concurrency | Rate Limit                        | Notes                                                                 |
| -------------- | ----------------------- | --------------------------------- | --------------------------------------------------------------------- |
| Ollama (local) | 3-5                     | No rate limit                     | Bounded by GPU/CPU. Higher concurrency may cause OOM on smaller GPUs. |
| OpenAI         | 2-3                     | 3000 RPM (text-embedding-3-small) | Use `p-queue` interval option for rate limiting.                      |
| Azure OpenAI   | 2-3                     | Varies by deployment              | Check deployment-specific limits.                                     |
| Custom/vLLM    | 3-5                     | Deployment-dependent              | Similar to Ollama — bounded by hardware.                              |

**Progress reporting events:**

```typescript
interface IndexingProgress {
  phase: 'scanning' | 'parsing' | 'chunking' | 'embedding' | 'storing';
  strategy: 'ast' | 'llm';
  completed: number; // chunks/files completed
  total: number; // total chunks/files
  failed: number; // chunks/files that errored
  elapsedMs: number; // time since phase started
  estimatedRemainingMs?: number; // based on rate so far
}
```

Emit via EventEmitter pattern. CLI subscribes for progress bar. Dashboard API subscribes for SSE/WebSocket push.

### 3. Dashboard Search UI

**Query input patterns:**

- Single text input with placeholder: "Search your codebase..."
- Collection selector dropdown: "All collections" (default), specific collection names
- Search mode toggle: "Semantic" (default), "Hybrid (BM25 + Semantic)", "Expansion (+ dependencies)"
- Optional: top-K slider (default 10, range 1-50)

**Result display per item:**

- **Score badge:** Colored by relevance (green ≥0.8, yellow ≥0.5, red <0.5)
- **File path:** Clickable (copies to clipboard — can't open files from Docker dashboard)
- **Line range:** e.g., "lines 45-78"
- **Chunk type:** Badge: `function` | `class` | `module` | `interface` | `type` | `test`
- **Source strategy:** Badge: `AST` | `LLM`
- **Code preview:** Syntax-highlighted snippet (first 10-15 lines of chunk), expandable to full
- **Summary:** If LLM-chunked, show the natural language summary above the code

**Per-query metrics panel (sidebar):**

- Query latency: "45ms"
- Collections searched: "project-ast, project-llm"
- Total chunks scanned: "1,247"
- Results returned: "10 of 1,247"
- Score distribution: Mini histogram of top-50 scores
- Strategy breakdown: "AST: 6 results, LLM: 4 results" (when searching all collections)

### 4. A/B Collection Comparison

**Side-by-side UX:**

```
┌─────────────────────────────────┐
│  Query: [authentication middleware]  [Compare] │
├────────────────┬────────────────┤
│  AST Strategy  │  LLM Strategy  │
├────────────────┼────────────────┤
│ 1. auth.ts:45  │ 1. auth.ts:42  │  ← Same file, different boundaries
│    Score: 0.89 │    Score: 0.92 │
│    [preview]   │    [preview]   │
│                │                │
│ 2. jwt.ts:12   │ 2. middleware/ │  ← LLM grouped cross-file concern
│    Score: 0.81 │    Score: 0.87 │
│    [preview]   │    [preview]   │
│ ...            │ ...            │
├────────────────┴────────────────┤
│  Agreement: 7/10 chunks overlap │
│  AST unique: 3  │  LLM unique: 3 │
│  Avg score: 0.74 vs 0.79       │
└─────────────────────────────────┘
```

**Scoring visualization:**

- **Grouped bar chart:** MRR, P@5, P@10 per strategy (from benchmark data)
- **Radar chart:** Multi-dimensional comparison (precision, recall, latency, coverage, token cost)
- **Score distribution overlay:** Two histograms on same axes — shows how score distributions differ

**Rank agreement metric:** Kendall's tau or simple overlap percentage at K. "8 of top-10 results appear in both strategies" is immediately understandable.

### 5. Search History

**What to persist (extending existing RagEvent):**

| Field           | Already Exists | New | Purpose                                           |
| --------------- | -------------- | --- | ------------------------------------------------- |
| query           | Yes            | —   | The search text                                   |
| timestamp       | Yes            | —   | When search happened                              |
| strategy        | Yes            | —   | Which search mode used                            |
| latencyMs       | Yes            | —   | Query performance                                 |
| chunksRetrieved | Yes            | —   | Result count                                      |
| chunkIds        | Yes            | —   | Which chunks returned                             |
| tokenCount      | Yes            | —   | Token budget consumed                             |
| resultPayloads  | —              | Yes | Full result objects (path, score, preview, lines) |
| collectionName  | —              | Yes | Which collection(s) queried                       |
| searchMode      | —              | Yes | semantic \| hybrid \| expansion                   |
| userSource      | —              | Yes | mcp \| dashboard \| benchmark                     |

**How to make history useful:**

1. **Replay:** Click any historical query → re-run it now → see current results side-by-side with historical results. Shows impact of re-indexing.
2. **Compare:** Select two entries (same query, different dates) → diff view highlighting added/removed/moved results.
3. **Filter:** By date range, strategy, query text, source (MCP vs dashboard), minimum score.
4. **Export:** Download as JSON for external analysis or benchmark dataset creation.

**Storage:** Extend MetricsStore SQLite schema. Add `search_results` table linked to `rag_events` by event ID. Index on query text and timestamp for fast filtering.

### 6. Analytics & RAG Quality Monitoring

**Aggregate metrics that matter:**

| Metric                       | What It Measures                         | How to Compute                                                             | Visualization                                        |
| ---------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| **MRR trend**                | Is retrieval getting better over time?   | From benchmark runs, plot MRR per run date                                 | Line chart with trend line                           |
| **Avg retrieval latency**    | Is search getting slower as index grows? | From RagEvents, avg latencyMs per day                                      | Line chart with threshold line (e.g., 200ms warning) |
| **Indexing coverage**        | What % of codebase is indexed?           | Indexed files / total files (from project scan)                            | Gauge or percentage bar                              |
| **Token consumption rate**   | How fast are we burning tokens?          | From RagEvents, sum tokenCount per day                                     | Stacked area chart (by strategy)                     |
| **Query volume**             | How much is RAG being used?              | Count RagEvents per day                                                    | Bar chart                                            |
| **Score distribution shift** | Are average relevance scores improving?  | From RagEvents, avg top-1 score per week                                   | Box plot or line chart with confidence band          |
| **Strategy win rate**        | Which strategy returns better results?   | When both collections are queried, which has higher top-1 score more often | Pie chart or percentage bar                          |
| **Chunk size distribution**  | Are chunks appropriately sized?          | From Qdrant payload, histogram of chunk token counts                       | Histogram per strategy                               |

**Dashboard layout for analytics:**

```
┌─────────────────────────────────────────┐
│  Analytics Dashboard                     │
├──────────────────┬──────────────────────┤
│  MRR Trend       │  Retrieval Latency   │
│  [line chart]    │  [line chart]        │
├──────────────────┼──────────────────────┤
│  Token Usage     │  Query Volume        │
│  [stacked area]  │  [bar chart]         │
├──────────────────┼──────────────────────┤
│  Strategy        │  Indexing Coverage   │
│  Comparison      │  AST: 100%           │
│  [grouped bars]  │  LLM: 87%            │
└──────────────────┴──────────────────────┘
```

---

## MVP Definition

### Launch With (v1.1 Core)

Minimum viable v1.1 — what's needed to validate LLM chunking and multi-collection search.

- [ ] **LLM chunking pipeline (Ollama, single-pass, structured output)** — The headline feature. Without this, v1.1 has no reason to exist.
- [ ] **Multi-collection Qdrant storage** — Required for LLM chunks to coexist with AST chunks.
- [ ] **MCP tools query both collections** — Required for the AI client to benefit from LLM chunks.
- [ ] **CLI `--strategy` flag** — Required for developers to trigger LLM indexing.
- [ ] **Parallel embedding with progress** — Quality-of-life for the slow LLM chunking pipeline.
- [ ] **Dashboard search UI (basic)** — Validates that LLM chunks produce good results. Query input + results list + scores.

### Add After Validation (v1.1.x)

Features to add once LLM chunking is proven to work.

- [ ] **A/B comparison side-by-side view** — Add when developers need to empirically compare strategies. Trigger: "both AST and LLM collections exist and have benchmark data."
- [ ] **Search history persistence + replay** — Add when developers are iterating on RAG config and need to track improvement. Trigger: "developers are re-indexing frequently."
- [ ] **Per-query metrics panel** — Add alongside or after search UI. Low incremental cost.
- [ ] **A/B scoring visualization** — Add when benchmark data exists for both strategies.

### Future Consideration (v1.2+)

Features to defer until v1.1 core is solid.

- [ ] **Analytics trend charts** — Needs accumulated time-series data. Not useful until v1.1 has been running for weeks.
- [ ] **Search history compare/diff view** — Complex UI for a power-user feature. Build after basic history proves useful.
- [ ] **Strategy win rate tracking** — Needs significant query volume to be statistically meaningful.
- [ ] **Token usage breakdown by strategy** — Nice-to-have, low urgency. MetricsStore already tracks tokens.
- [ ] **Cloud LLM chunking (v3)** — Explicitly deferred per PROJECT.md. Ollama-only for v1.1.

---

## Feature Prioritization Matrix

| Feature                                        | User Value | Implementation Cost | Priority |
| ---------------------------------------------- | ---------- | ------------------- | -------- |
| LLM chunking (Ollama + boundaries + summaries) | HIGH       | HIGH                | **P1**   |
| Multi-collection Qdrant storage                | HIGH       | MEDIUM              | **P1**   |
| MCP tools multi-collection query               | HIGH       | MEDIUM              | **P1**   |
| CLI strategy selection                         | HIGH       | LOW                 | **P1**   |
| Parallel embedding + progress                  | MEDIUM     | MEDIUM              | **P1**   |
| Dashboard search UI (basic)                    | HIGH       | MEDIUM              | **P1**   |
| Per-query metrics panel                        | MEDIUM     | LOW                 | **P2**   |
| A/B side-by-side comparison                    | HIGH       | MEDIUM-HIGH         | **P2**   |
| A/B scoring visualization                      | MEDIUM     | MEDIUM              | **P2**   |
| Search history persistence                     | MEDIUM     | LOW-MEDIUM          | **P2**   |
| Search history replay & compare                | MEDIUM     | MEDIUM              | **P2**   |
| Search history filtering                       | LOW        | LOW                 | **P3**   |
| Analytics: MRR trend chart                     | MEDIUM     | MEDIUM              | **P3**   |
| Analytics: strategy comparison aggregates      | MEDIUM     | LOW-MEDIUM          | **P3**   |
| Analytics: latency trend                       | LOW        | LOW                 | **P3**   |
| Analytics: token breakdown by strategy         | LOW        | LOW                 | **P3**   |

**Priority key:**

- **P1:** Must ship in v1.1 core. Without these, the milestone is incomplete.
- **P2:** Should ship in v1.1.x patches. High value, moderate cost.
- **P3:** Nice to have. Ship if time permits or defer to v1.2.

---

## Competitor Feature Analysis

| Feature Area            | Cursor              | Continue                           | Aider                  | Cody                            | ia-framework v1.1                                  |
| ----------------------- | ------------------- | ---------------------------------- | ---------------------- | ------------------------------- | -------------------------------------------------- |
| LLM-based chunking      | Unknown (black box) | Recommends AST in custom RAG guide | AST only (tree-sitter) | Sourcegraph-based (not chunked) | **Ollama-powered, single-pass, structured output** |
| Multi-strategy indexing | No                  | No                                 | No                     | No                              | **AST + LLM collections, user-selectable**         |
| A/B strategy comparison | No                  | No                                 | No                     | No                              | **Side-by-side results, scoring viz**              |
| Search testing UI       | No                  | No                                 | No                     | No                              | **Dashboard search with metrics**                  |
| Search history          | No                  | No                                 | No                     | No                              | **Persist, replay, compare**                       |
| RAG quality analytics   | No                  | Basic telemetry                    | Token costs only       | No                              | **Trend charts, strategy comparison**              |
| Parallel embedding      | Unknown             | Unknown                            | No                     | N/A                             | **p-queue concurrent batching**                    |
| Progress reporting      | No                  | No                                 | No                     | No                              | **Real-time progress events**                      |

**Key insight:** None of these features exist in any competitor. v1.1 is entirely in differentiator territory. The risk is not "someone else already does this" but "are developers willing to use a dashboard to tune RAG quality?" The bet is yes — developers who choose ia-framework over Cursor are already the type who want control and visibility.

---

## Sources

- **Ollama API:** Context7 `/ollama/ollama-js` — structured output via `format` parameter with JSON schema (HIGH confidence)
- **Qdrant multi-collection:** Context7 `/qdrant/qdrant-js` — `lookupFrom`, `queryBatch`, collection CRUD (HIGH confidence)
- **Existing codebase:** `IndexingPipeline`, `SearchEngine`, `MetricsStore`, MCP tools, Dashboard app (HIGH confidence — direct code inspection)
- **MRR-IMPROVEMENT-RESEARCH.md:** Retrieval quality patterns and chunking strategy analysis (HIGH confidence — ia-framework internal research)
- **Continue custom RAG guide:** AST chunking recommendation, embedding model selection (HIGH confidence — official docs)
- **p-queue:** npm package for promise-based concurrency control (HIGH confidence — widely used, 1M+ weekly downloads)
- **Recharts:** React charting library for dashboard visualizations (HIGH confidence — already in stack)

---

_Feature research for: ia-framework v1.1 — RAG Quality & Observability_
_Researched: 2026-04-09_
