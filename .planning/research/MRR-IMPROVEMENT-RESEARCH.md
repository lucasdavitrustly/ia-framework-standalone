# MRR Improvement Research — ia-framework Code Retrieval

**Researched:** 2026-04-06
**Domain:** RAG retrieval quality — code search, vector similarity, hybrid search, reranking
**Confidence:** HIGH (architecture findings from source), MEDIUM–HIGH (Qdrant API from Context7 + official docs)

---

## Summary

The ia-framework already has a solid foundation: dual named vectors (`text` + `code`) in Qdrant, semantic deduplication by max-score merge, and dependency graph expansion. Despite this, MRR improvement opportunities are large because the system uses **pure dense vector search** with no keyword retrieval, the `text` vector likely encodes **raw source code** rather than a natural-language description of that code, and the benchmark corpus has **only 3 placeholder queries**.

Improving MRR requires changes across three layers, ordered by ROI:

1. **Fix what's indexed** (the `text` vector representation) — highest impact, zero infrastructure change
2. **Add hybrid search** (BM25 sparse vectors + RRF fusion in Qdrant) — high impact, requires re-index
3. **Build a real benchmark corpus** — foundational; without it you can't measure any improvement

Reranking via cross-encoder models provides the best absolute MRR ceiling but requires the most infrastructure work (Python sidecar or ONNX in Node.js). Treat it as Phase 2 after the above.

**Primary recommendation:** Fix the `text` vector representation first (textify function), add BM25 sparse vectors second, build a real corpus in parallel. These three together should move MRR by 15–40% on a realistic code search corpus before touching reranking.

---

## ROI-Ordered Improvement List

| #   | Improvement                                                  | Estimated MRR Lift                 | Effort | Requires Re-index |
| --- | ------------------------------------------------------------ | ---------------------------------- | ------ | ----------------- |
| 1   | Fix `text` vector: index textified description, not raw code | High (15–30%)                      | Low    | Yes               |
| 2   | Hybrid search: BM25 sparse + dense RRF fusion                | High (10–20%)                      | Medium | Yes               |
| 3   | Real benchmark corpus (30–50 queries)                        | Foundational — enables measurement | Medium | No                |
| 4   | Code-specific embedding model for `code` vector              | Medium (5–15%)                     | Low    | Yes               |
| 5   | Score threshold tuning (lower from 0.5 to 0.3)               | Medium (varies)                    | None   | No                |
| 6   | Query preprocessing (camelCase/snake_case tokenization)      | Low-Medium (5–10%)                 | Low    | No                |
| 7   | Cross-encoder reranking (local sidecar)                      | High absolute ceiling              | High   | No                |
| 8   | HNSW parameter tuning                                        | Negligible (<1%)                   | None   | No                |

---

## Current System Inventory

### What Exists

```
packages/
├── ast-parser/         # Tree-sitter chunker — extracts functions, classes, interfaces
│   ├── chunker.ts      # parseFile() → CodeChunk[] with content, imports, exports
│   └── types.ts        # CodeChunk: content (raw code), name, chunkType, imports, exports
├── retrieval/
│   └── search-engine.ts  # Dual-vector search (text+code), max-score merge, dep expansion
├── vector-store/
│   └── qdrant.ts       # initialize() creates {text: Cosine, code: Cosine} named vectors
│                       # search() uses client.search() — single vector, no hybrid
├── embedding/
│   └── factory.ts      # Supports ollama + openai providers
│                       # Known models: nomic-embed-text, mxbai-embed-large, all-minilm,
│                       #               qwen3-embedding:*, text-embedding-3-*
└── benchmark/
    ├── benchmark-runner.ts  # MRR = mean(1/rank), Hit@K, topK=10, scoreThreshold=0.5
    └── corpus.ts            # Loads JSON corpus — only 3 placeholder queries exist
```

### Key Gaps Identified

1. **`text` vector content**: `QdrantVectorStore.upsertBatch()` stores `p.textVector` — the indexer decides what to embed. If it embeds `chunk.content` (raw code) for the `text` named vector, NLP queries match poorly. Need to verify in `packages/indexer/`.
2. **No BM25**: `client.search()` with a single dense vector — no sparse vector, no hybrid fusion.
3. **No reranking**: Results are merged by max-score across two dense vectors — no cross-encoder pass.
4. **Corpus**: 3 placeholder queries is not a corpus. MRR of 0.333 or 0.667 on 3 queries is noise.

---

## Improvement 1: Fix the `text` Vector Representation (HIGHEST ROI)

### The Problem

The `text` named vector is supposed to be retrieved by **natural language queries** like _"function that validates JWT tokens"_. If this vector encodes raw source code like `function validateJwt(token: string): Promise<boolean> { ... }`, an NLP model trained on prose will not match it well.

### The Fix: Textify Before Embedding

Build a `textify(chunk: CodeChunk): string` function that converts code metadata into a natural-language sentence:

```typescript
// Source: Qdrant code-search tutorial pattern (verified via Context7 + official docs)
// https://qdrant.tech/documentation/tutorials/code-search/

function textify(chunk: CodeChunk): string {
  // Humanize camelCase/snake_case identifiers
  function humanize(name: string): string {
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → camel Case
      .replace(/_/g, ' ') // snake_case → snake case
      .toLowerCase();
  }

  const parts: string[] = [];

  // Name of the construct
  if (chunk.name) {
    parts.push(`${humanize(chunk.name)}`);
  }

  // Type of construct
  parts.push(`${chunk.chunkType} in ${chunk.language}`);

  // Module context (file path without extension, humanized)
  const fileContext = chunk.relativePath
    .replace(/\.(ts|js|tsx|jsx|java)$/, '')
    .split('/')
    .map(humanize)
    .join(' ');
  parts.push(`from ${fileContext}`);

  // Exports (what this provides)
  if (chunk.exports.length > 0) {
    parts.push(`exports ${chunk.exports.map(humanize).join(', ')}`);
  }

  // Imports (what this depends on)
  if (chunk.imports.length > 0) {
    const importNames = chunk.imports
      .map((spec) => spec.split('/').pop() ?? spec)
      .map(humanize)
      .slice(0, 5); // cap at 5 to avoid noise
    parts.push(`uses ${importNames.join(', ')}`);
  }

  return parts.join('. ') + '.';
}
```

**Embed this textified string into the `text` vector. Keep raw code in the `code` vector.**

### Why This Works

- NLP embedding models (all-MiniLM, nomic-embed-text, mxbai-embed-large) are trained on prose
- A query like _"JWT validation middleware"_ will match `"validate jwt. function in typescript. from middleware auth."` far better than raw TypeScript code
- The `code` vector already uses a general embedding model applied to raw code — this gets better matches for queries that use code syntax/identifiers

### Implementation Notes

- Add `textify()` to `packages/ast-parser/src/` as a pure function
- The indexer must call `textify(chunk)` and embed the result into the `text` named vector
- Requires a **full re-index** of the collection

---

## Improvement 2: Hybrid Search — BM25 Sparse + Dense RRF Fusion

### What Hybrid Search Provides

Dense vectors capture **semantic similarity** (synonyms, paraphrases). BM25 captures **exact lexical matches** (function names, error codes, specific identifiers). Combining them via Reciprocal Rank Fusion (RRF) consistently improves retrieval over either alone.

A query like _"ECONNREFUSED error handling"_ will fail dense-only retrieval but succeed with BM25 on the exact string.

### Qdrant Native BM25 Support

Qdrant supports sparse vectors with IDF weighting natively — this is BM25 without any external tokenizer:

```typescript
// Source: Qdrant documentation — verified via Context7 /qdrant/qdrant-js + official docs
// https://qdrant.tech/documentation/concepts/vectors/#sparse-vectors

// Collection setup: add a sparse vector alongside the existing dense vectors
await client.createCollection('code-chunks', {
  vectors: {
    text: { size: 768, distance: 'Cosine' }, // existing dense
    code: { size: 768, distance: 'Cosine' }, // existing dense
  },
  sparse_vectors: {
    'code-bm25': {
      index: {
        on_disk: false,
      },
      modifier: 'idf', // enables BM25-like IDF weighting
    },
  },
});
```

### Tokenization for Sparse Vectors

Qdrant sparse vectors require client-side tokenization. For code, tokenize on whitespace + punctuation + camelCase splitting:

```typescript
// Simple tokenizer for code content
function tokenize(text: string): Record<number, number> {
  const tokens = text
    .toLowerCase()
    // split camelCase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // split snake_case
    .replace(/_/g, ' ')
    // split on non-alphanumeric
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1); // remove single chars

  const freq: Record<string, number> = {};
  for (const token of tokens) {
    freq[token] = (freq[token] ?? 0) + 1;
  }

  // Map token strings to numeric indices using a stable hash
  const result: Record<number, number> = {};
  for (const [token, count] of Object.entries(freq)) {
    const idx = stableHash(token) % 30000; // vocabulary size cap
    result[idx] = (result[idx] ?? 0) + count;
  }
  return result;
}
```

**Note:** Qdrant's `modifier: 'idf'` applies IDF at query time; you only need to supply TF (term frequency) in the vector values.

### Hybrid Query with RRF Fusion

```typescript
// Source: Qdrant hybrid queries documentation
// https://qdrant.tech/documentation/concepts/hybrid-queries/

// At query time — use client.query() with prefetch + fusion
const results = await client.query(collectionName, {
  prefetch: [
    {
      query: { indices: sparseQueryVector.indices, values: sparseQueryVector.values },
      using: 'code-bm25',
      limit: 20,
    },
    {
      query: denseQueryVector, // number[]
      using: 'text',
      limit: 20,
    },
    {
      query: denseQueryVector,
      using: 'code',
      limit: 20,
    },
  ],
  query: { fusion: 'rrf' }, // Reciprocal Rank Fusion
  limit: 10,
  with_payload: true,
});
```

### Weighted RRF (Prioritize Semantic)

```typescript
// Weight semantic results 3x higher than keyword (tune empirically)
query: {
  fusion: 'rrf',
  rrf: { weights: [1.0, 3.0, 3.0] }  // [bm25, text-dense, code-dense]
}
```

### Implementation Changes Required

1. **`QdrantVectorStore.initialize()`** — add `sparse_vectors` to collection creation
2. **`QdrantVectorStore.upsertBatch()`** — add `'code-bm25'` sparse vector to each point
3. **`QdrantVectorStore.search()`** — new `hybridSearch()` method using `client.query()` with `prefetch` + `fusion: 'rrf'`
4. **`SearchEngine`** — call `hybridSearch()` instead of two separate `search()` calls
5. **Full re-index** required (add sparse vectors to existing collection or recreate it)

### Interface Change

The current `VectorStore` interface `search()` method is single-vector. A new method is needed:

```typescript
interface VectorStore {
  search(...): Promise<SearchResult[]>;  // keep for backward compat
  hybridSearch(options: HybridSearchOptions): Promise<SearchResult[]>;  // new
}

interface HybridSearchOptions {
  denseVector: number[];
  sparseVector: { indices: number[]; values: number[] };
  limit: number;
  scoreThreshold?: number;
  filter?: Record<string, unknown>;
}
```

---

## Improvement 3: Build a Real Benchmark Corpus

### Why This Is Foundational

With 3 queries, MRR variance is ±0.33 per query. You cannot measure whether any improvement works. A real corpus needs 30–50 queries minimum for statistically meaningful deltas.

### Query Taxonomy for Code Search

Build queries across these types:

| Type                  | Example Query                                         | Tests                       |
| --------------------- | ----------------------------------------------------- | --------------------------- |
| Semantic / intent     | "function that validates JWT tokens"                  | NLP vector quality          |
| Exact name lookup     | "BenchmarkRunner class"                               | Lexical / BM25              |
| Architectural         | "how database connection is initialized"              | Cross-file semantic         |
| Error handling        | "ENOENT file not found error handling"                | Keyword + semantic          |
| Cross-file dependency | "what imports SearchEngine"                           | Dependency expansion        |
| Negative              | "WebSocket reconnection logic" (expected: no results) | Precision — false positives |
| Multilingual          | "Java class that parses file"                         | Cross-language retrieval    |

### Corpus Format (current format, extend it)

```json
{
  "version": "1",
  "queries": [
    {
      "id": "benchmark-runner-class",
      "query": "class that runs retrieval benchmarks and computes MRR",
      "expectedFiles": ["packages/benchmark/src/benchmark-runner.ts"],
      "description": "Semantic intent lookup for benchmark runner",
      "queryType": "semantic"
    },
    {
      "id": "qdrant-initialize",
      "query": "initialize Qdrant collection with named vectors",
      "expectedFiles": ["packages/vector-store/src/qdrant.ts"],
      "description": "Semantic lookup for collection creation",
      "queryType": "semantic"
    },
    {
      "id": "tokenize-function",
      "query": "tokenize camelCase snake_case identifiers",
      "expectedFiles": ["packages/ast-parser/src/chunker.ts"],
      "description": "Keyword-heavy query — tests BM25",
      "queryType": "keyword"
    }
  ]
}
```

### Extend the `BenchmarkQuery` Type

Add `queryType` for stratified analysis:

```typescript
export interface BenchmarkQuery {
  id: string;
  query: string;
  expectedFiles: string[];
  description?: string;
  queryType?: 'semantic' | 'keyword' | 'architectural' | 'cross-file' | 'negative';
}
```

### Reporting: MRR by Query Type

The `BenchmarkRunner` should report MRR per query type — this lets you see if hybrid search improved keyword queries without hurting semantic ones.

---

## Improvement 4: Code-Specific Embedding Model

### Current Models

The factory supports: `nomic-embed-text` (768d), `mxbai-embed-large` (1024d), `all-minilm` (384d), `qwen3-embedding:*`. All are general-purpose text models.

### Code-Specific Alternative

**`jinaai/jina-embeddings-v2-base-code`** — purpose-built for code, supports 30+ programming languages, 8192-token context window (critical for large functions), 768 dimensions.

```bash
# Pull via Ollama (if Jina model is available as GGUF)
ollama pull jina-embeddings-v2-base-code

# Or via OpenAI-compatible API from Jina AI
# base_url: https://api.jina.ai/v1
# model: jina-embeddings-v2-base-code
```

**Verification needed:** As of 2026-04, Jina embeddings v2 base code may require the Jina API (not local Ollama). Check Ollama model library first.

**Alternative local code embedding models:**

- `nomic-embed-code` — Nomic's code-focused model (check Ollama availability)
- `qwen3-embedding:4b` (2560d) — large general model that performs well on code due to training data breadth

**Use different models for `text` and `code` vectors** — this is the pattern Qdrant's own tutorial uses:

- `text` vector: NLP model (nomic-embed-text, mxbai-embed-large) → embed textified description
- `code` vector: code model (jina-embeddings-v2-base-code) → embed raw code

This requires the embedding factory to support per-vector model configuration.

---

## Improvement 5: Score Threshold Tuning

### Current Behavior

`scoreThreshold: 0.5` (default). This filters out results below 0.5 cosine similarity.

**Problem:** For code retrieval with short, sparse queries, legitimate matches frequently score 0.4–0.5. The threshold is too aggressive, causing false negatives that directly hurt MRR.

### Recommendation

Lower to `0.3` for production queries. Add threshold to `BenchmarkConfig` (already exists). Run benchmark at multiple thresholds to find the knee:

```typescript
// Benchmark sweep — run at thresholds: [0.2, 0.3, 0.4, 0.5, 0.6]
// Plot MRR vs. precision@K to find optimal operating point
```

**Note:** Lowering threshold increases recall but reduces precision. With hybrid search + reranking, you can afford a lower threshold because irrelevant results get downranked by the reranker.

---

## Improvement 6: Query Preprocessing

### The Problem

A query like `"validateJwt function"` will not match a chunk named `validateJwt` if the embedding model didn't learn this token. Splitting camelCase and snake_case before embedding improves both BM25 and dense matching.

```typescript
// Source: local implementation — no off-the-shelf library needed
function preprocessQuery(query: string): string {
  return query
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // XMLParser → XML Parser
    .replace(/_/g, ' ') // snake_case → snake case
    .replace(/\./g, ' ') // dot.separated → dot separated
    .toLowerCase()
    .trim();
}
```

Apply this to `RetrievalQuery.text` in `SearchEngine.search()` before embedding.

---

## Improvement 7: Cross-Encoder Reranking (Phase 2)

### What It Does

After retrieving top-20 candidates via hybrid search, a cross-encoder re-scores each (query, document) pair jointly. Cross-encoders dramatically outperform bi-encoder similarity for ranking because they see both texts simultaneously (no approximation via vector space).

### Local-Only Constraint

**Ollama does NOT support cross-encoder/reranker models** — only embedding models. You need a separate approach.

### Option A: Python Sidecar (RECOMMENDED for Phase 2)

Run a lightweight FastAPI service alongside the framework:

```python
# reranker_sidecar.py
from fastapi import FastAPI
from sentence_transformers import CrossEncoder
import uvicorn

app = FastAPI()
model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')  # 22MB, fast

@app.post("/rerank")
def rerank(data: dict):
    query = data["query"]
    documents = data["documents"]  # list of strings
    pairs = [[query, doc] for doc in documents]
    scores = model.predict(pairs).tolist()
    return {"scores": scores}

uvicorn.run(app, host="0.0.0.0", port=8765)
```

TypeScript call:

```typescript
async function rerank(query: string, documents: string[]): Promise<number[]> {
  const res = await fetch('http://localhost:8765/rerank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, documents }),
  });
  const { scores } = (await res.json()) as { scores: number[] };
  return scores;
}
```

**Reranker models (local, best quality vs. size):**

| Model                                       | Size   | Speed  | Quality   | Notes                       |
| ------------------------------------------- | ------ | ------ | --------- | --------------------------- |
| `cross-encoder/ms-marco-MiniLM-L-6-v2`      | 22MB   | Fast   | Good      | Best for quick local use    |
| `cross-encoder/ms-marco-MiniLM-L-12-v2`     | 66MB   | Medium | Better    | Recommended default         |
| `BAAI/bge-reranker-v2-m3`                   | ~570MB | Slow   | Excellent | For highest quality offline |
| `jinaai/jina-reranker-v2-base-multilingual` | ~278MB | Medium | Excellent | Multilingual, code-aware    |

### Option B: Qdrant ColBERT Multivector (No Sidecar)

Qdrant supports late-interaction reranking (ColBERT) natively via multivector points. This requires indexing ColBERT multi-vectors at index time and querying with `query_many`:

```typescript
// This requires a ColBERT model to generate multi-vectors at index time
// Model: colbert-ir/colbertv2.0 or answerdotai/answerai-colbert-small-v1

// At query time — Qdrant handles the late-interaction scoring internally
const results = await client.query(collectionName, {
  prefetch: [
    { query: denseVector, using: 'text', limit: 20 },
    { query: sparseVector, using: 'code-bm25', limit: 20 },
  ],
  query: colbertMultiVector, // array of token vectors
  using: 'colbert',
  limit: 10,
});
```

**Tradeoff:** ColBERT multivectors increase index size significantly (128 vectors per document × vector dimensions). For a large codebase, this is substantial. The Python sidecar approach is simpler and more flexible.

### Option C: ONNX in Node.js (`@xenova/transformers`)

```typescript
import { pipeline } from '@xenova/transformers';

const reranker = await pipeline('text-classification', 'cross-encoder/ms-marco-MiniLM-L-6-v2');
const scores = await reranker(pairs);
```

**Confidence: MEDIUM** — `@xenova/transformers` (now `@huggingface/transformers`) supports some cross-encoders via ONNX Runtime in Node.js, but model availability and performance vary. Requires ONNX model conversion. The Python sidecar is more reliable.

---

## Don't Hand-Roll

| Problem                    | Don't Build                       | Use Instead                                                             | Why                                                                                         |
| -------------------------- | --------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| BM25 sparse vectors        | Custom tokenizer + inverted index | Qdrant `sparse_vectors` with `modifier: "idf"`                          | Qdrant handles IDF weighting, storage, and ANNS natively                                    |
| Hybrid fusion algorithm    | Custom RRF implementation         | Qdrant `query: { fusion: 'rrf' }`                                       | RRF has known edge cases (score normalization, tie-breaking); Qdrant's is battle-tested     |
| Cross-encoder model        | Custom neural ranker              | `cross-encoder/ms-marco-MiniLM-L-*` via sentence-transformers           | State of the art, 22MB, already fine-tuned on MS MARCO                                      |
| camelCase tokenization     | Custom regex                      | The 2-line regex pattern above — it's 6 lines, don't add a library      | No library needed — regex is sufficient                                                     |
| Embedding model comparison | A/B test framework                | Extend `BenchmarkConfig` + `ConfigSnapshot` — already designed for this | The existing `ConfigSnapshot` captures model/provider; just run multiple labeled benchmarks |

---

## Qdrant-Specific Implementation Notes

### Collection Recreation Required

The current `QdrantVectorStore.initialize()` only recreates if dimensions mismatch. Adding sparse vectors requires detection of the `sparse_vectors` config:

```typescript
// In initialize() — check if sparse vector config is missing
const sparseVectors = info.config?.params?.sparse_vectors;
const hasBm25 = sparseVectors && 'code-bm25' in sparseVectors;
if (!hasBm25) {
  // Recreate collection to add sparse vector
  await this.client.deleteCollection(this.collectionName);
  // ... recreate with sparse_vectors config
}
```

### `client.query()` vs `client.search()`

- `client.search()` — single vector, no prefetch, no fusion (current implementation)
- `client.query()` — supports `prefetch` arrays, `fusion`, multivector — USE THIS for hybrid search

The `QdrantVectorStore` currently only exposes `search()`. Add `hybridSearch()` that calls `client.query()`.

### Payload Filtering Still Works

Hybrid search via `client.query()` supports the same `filter` payload filtering as `client.search()`. Existing filter-based queries are unaffected.

### HNSW Parameters (Don't Bother Tuning)

Current defaults (m=16, ef_construct=100) give ~99.4% precision@5 vs. exact search. Increasing to m=32 gives ~99.7%. The 0.3% gap is not your MRR problem. **Don't tune HNSW before fixing the embedding content.**

---

## Architecture Patterns

### Recommended Layered Architecture

```
Query (natural language)
        ↓
[Query Preprocessing]    ← camelCase split, lowercase
        ↓
[Embed Query]            ← text: NLP model, sparse: tokenizer
        ↓
[Qdrant hybrid query]    ← prefetch [bm25, text-dense, code-dense] + RRF fusion
        ↓
[Top-20 candidates]
        ↓
[Reranker] (Phase 2)     ← cross-encoder scores each (query, chunk) pair
        ↓
[Top-K results]
        ↓
[Dependency expansion]   ← existing: add neighbor files from import graph
        ↓
[Final results]
```

### Single-Model vs. Dual-Model Architecture

**Current:** One embedding model for both `text` and `code` vectors.

**Recommended:** Two separate embedding models:

- `text` vector: general NLP model (nomic-embed-text, mxbai-embed-large) applied to `textify(chunk)` output
- `code` vector: code-specific model (jina-embeddings-v2-base-code, or general model applied to raw code)

This requires `SearchEngineConfig.embeddingProvider` to support per-vector providers:

```typescript
interface SearchEngineConfig {
  textEmbeddingProvider: EmbeddingProvider;  // NLP model
  codeEmbeddingProvider: EmbeddingProvider;  // code model (can be same as text)
  vectorStore: VectorStore;
  ...
}
```

---

## Common Pitfalls

### Pitfall 1: Measuring MRR on a Tiny Corpus

**What goes wrong:** MRR of 0.67 on 3 queries looks great. After adding 47 more queries, it drops to 0.31.
**Why it happens:** 3 queries have huge variance. Any single retrieval miss swings MRR ±0.33.
**How to avoid:** Build 30–50 queries before trusting any MRR number.
**Warning signs:** MRR values that are round numbers like 0.333, 0.667, 1.0.

### Pitfall 2: Indexing Raw Code in the `text` Vector

**What goes wrong:** Semantic queries like "function that authenticates users" don't match the chunk containing `authenticateUser()`.
**Why it happens:** NLP embedding models are trained on prose, not code. Cosine similarity between a prose query and raw code is low.
**How to avoid:** Use `textify()` to convert code chunks to natural-language descriptions before embedding into the `text` vector.
**Warning signs:** Low MRR on semantic/intent queries; high MRR only on exact-name queries.

### Pitfall 3: Re-indexing Without Detecting Dimension/Config Changes

**What goes wrong:** After adding sparse vectors, old collection exists without sparse vector config. New code tries to upsert with a sparse vector and gets a 400 error.
**Why it happens:** `initialize()` only checks dimension mismatch, not sparse vector presence.
**How to avoid:** Extend `initialize()` to detect missing sparse vector configuration and recreate if needed.
**Warning signs:** Qdrant 400 Bad Request on upsert after adding sparse vector support.

### Pitfall 4: Using `client.search()` for Hybrid Queries

**What goes wrong:** You add sparse vectors to the index but queries still return dense-only results.
**Why it happens:** `client.search()` doesn't support `prefetch` or `fusion`. Hybrid search requires `client.query()`.
**How to avoid:** Add a `hybridSearch()` method to `QdrantVectorStore` using `client.query()`.
**Warning signs:** Sparse vectors are stored correctly but keyword queries still miss exact identifiers.

### Pitfall 5: Reranker Increases Latency Disproportionately

**What goes wrong:** Adding a cross-encoder reranker increases p99 latency from 80ms to 2000ms.
**Why it happens:** Cross-encoders score each (query, document) pair independently — 20 candidates × 50ms = 1000ms.
**How to avoid:** Use a small reranker model (MiniLM-L-6, 22MB). Limit candidates fed to reranker to top-15. Cache reranker scores for repeated queries.
**Warning signs:** Average latency >500ms after adding reranking.

### Pitfall 6: Score Threshold Too High After Hybrid Search

**What goes wrong:** Hybrid search with RRF returns scores in a different range than dense-only cosine similarity. Applying `scoreThreshold: 0.5` filters out most hybrid results.
**Why it happens:** RRF scores are based on rank position, not cosine similarity. They are not in the [0, 1] cosine range.
**How to avoid:** For hybrid queries via `client.query()` with RRF, remove the score threshold or set it very low (0.01). Rely on `limit` to control result count.

---

## State of the Art (2026)

| Old Approach                            | Current Approach                                             | Impact                                                             |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Dense-only vector search                | Hybrid: dense + sparse (BM25) + RRF fusion                   | 10–20% MRR improvement on typical code corpora                     |
| Single embedding model for everything   | Dual model: NLP model for description, code model for syntax | 5–15% MRR improvement                                              |
| Raw code in text vector                 | Textified natural-language description in text vector        | 15–30% MRR improvement                                             |
| Cross-encoder as mandatory step         | Cross-encoder as optional post-processing                    | Cross-encoders now lightweight enough (22MB) to run locally        |
| HyDE (hypothetical document embeddings) | Not recommended for code retrieval                           | HyDE is unreliable for code; query preprocessing is more effective |

**Deprecated/Outdated:**

- `client.search()` for hybrid search — use `client.query()` with `prefetch` + `fusion`
- Single-vector search for code retrieval — dual-model + hybrid is now standard

---

## Open Questions

1. **What does the indexer embed into the `text` vector today?**
   - What we know: `QdrantVectorStore.upsertBatch()` stores `p.textVector`. The indexer package determines the input text.
   - What's unclear: Is `chunk.content` (raw code) or something else embedded for the `text` vector?
   - Recommendation: Read `packages/indexer/src/` before implementing Improvement 1. If it already textifies, skip.

2. **Is `jina-embeddings-v2-base-code` available locally via Ollama?**
   - What we know: Jina AI has published GGUF/Ollama-compatible models; availability changes.
   - What's unclear: Current Ollama library status for code-specific models.
   - Recommendation: Check `ollama list` and Ollama model hub before committing to Jina. `qwen3-embedding:4b` is a reliable fallback.

3. **What's the target MRR?**
   - What we know: System benchmarks against a 3-query placeholder corpus.
   - What's unclear: What MRR is "good enough" for this use case? 0.5? 0.7? 0.9?
   - Recommendation: Define a target before implementing. A common production target for code search is MRR@10 ≥ 0.6.

4. **Should BM25 tokenization use a shared vocabulary?**
   - What we know: Qdrant's `modifier: 'idf'` computes IDF from the indexed corpus automatically.
   - What's unclear: Whether the simple hash-based token-to-index mapping causes enough collisions to hurt BM25 quality.
   - Recommendation: Start with hash-based mapping. If BM25 quality seems poor, switch to a fixed vocabulary built from the indexed corpus.

---

## Sources

### Primary (HIGH confidence)

- Context7 `/qdrant/qdrant-js` — Qdrant TypeScript client: sparse vectors, hybridSearch, prefetch API
- Qdrant official docs: https://qdrant.tech/documentation/concepts/hybrid-queries/ — RRF fusion, weighted RRF, DBSF
- Qdrant official docs: https://qdrant.tech/documentation/tutorials/code-search/ — textify pattern, dual-model strategy
- Qdrant official docs: https://qdrant.tech/documentation/tutorials/retrieval-quality/ — HNSW tuning, precision@K
- Source code (all files read): `packages/benchmark/`, `packages/retrieval/`, `packages/vector-store/`, `packages/embedding/`, `packages/ast-parser/`

### Secondary (MEDIUM confidence)

- Sentence-transformers documentation: `cross-encoder/ms-marco-MiniLM-L-6-v2` model card
- Qdrant blog: hybrid search tutorial (FastEmbed Python sidecar pattern for reranking)
- BAAI model hub: `BAAI/bge-reranker-v2-m3` model card

### Tertiary (LOW confidence — flag for validation)

- `@xenova/transformers` ONNX cross-encoder support in Node.js — needs hands-on verification
- `jina-embeddings-v2-base-code` Ollama availability — check `ollama list` at implementation time

---

## Metadata

**Confidence breakdown:**

- Current system architecture: HIGH — read from source
- Hybrid search (BM25 + RRF): HIGH — verified via Context7 + official Qdrant docs
- Textify pattern: HIGH — from Qdrant's own code-search tutorial
- Cross-encoder reranking: MEDIUM — Python sidecar pattern verified; Node.js ONNX path LOW
- Code embedding models: MEDIUM — Ollama availability not verified live
- Corpus design: HIGH — measurement theory, not library-specific

**Research date:** 2026-04-06
**Valid until:** 2026-07-06 (Qdrant API stable; embedding model landscape changes faster)
