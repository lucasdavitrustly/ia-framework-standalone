# Architecture Patterns

**Domain:** AI-assisted development framework with local RAG
**Researched:** 2026-03-31

## Recommended Architecture

### High-Level System Overview

The ia-framework is a **pipeline-oriented system** with three runtime modes:

1. **Batch mode** (Indexing): Walk codebase files, parse ASTs, generate embeddings, store in Qdrant
2. **Interactive mode** (MCP Server): Receive queries from OpenCode via stdio, retrieve context from Qdrant, return formatted results
3. **Monitoring mode** (Dashboard): Serve web UI showing indexing health, token usage, and benchmark trends

These modes share core libraries but run as separate processes. The MCP server is spawned by OpenCode as a subprocess. The dashboard runs as a Docker container alongside Qdrant. Indexing runs as a CLI command or is triggered by file watchers.

```
                         ┌─────────────────────────────┐
                         │        Developer             │
                         │     (uses OpenCode)          │
                         └──────────┬──────────────────┘
                                    │ stdio (JSON-RPC 2.0)
                                    ▼
                         ┌──────────────────────┐
                         │     MCP Server        │
                         │  (spawned subprocess) │
                         │                      │
                         │  Tools:              │
                         │  - search_codebase   │
                         │  - get_context       │
                         │  - index_status      │
                         │                      │
                         │  Resources:          │
                         │  - project_config    │
                         └───────┬──────────────┘
                                 │ in-process calls
                                 ▼
                    ┌────────────────────────┐
                    │      RAG Engine         │
                    │                        │
                    │  1. Embed query        │
                    │  2. Semantic search    │
                    │  3. Dependency expand  │
                    │  4. Re-rank & format   │
                    └───┬────────────┬───────┘
                        │            │
            ┌───────────▼──┐   ┌────▼──────────────┐
            │   Qdrant      │   │ Embedding Provider │
            │  (Docker)     │   │ (OpenAI / Ollama)  │
            │  localhost:   │   │                    │
            │  6333         │   └────────────────────┘
            └───────▲───────┘
                    │ HTTP REST
     ┌──────────────┼──────────────┐
     │              │              │
┌────┴─────┐  ┌────┴─────┐  ┌────┴──────┐
│ Indexing  │  │Dashboard │  │ Benchmark │
│ Pipeline  │  │ (Docker) │  │  Runner   │
│           │  │          │  │           │
│ parse →   │  │ reads    │  │ runs AI   │
│ chunk →   │  │ stats +  │  │ tasks →   │
│ embed →   │  │ metrics  │  │ measures  │
│ store     │  │          │  │ pass rate │
└───────────┘  └──────────┘  └───────────┘
```

### Monorepo Structure

Use Turborepo with pnpm workspaces. Organize by the standard `apps/` + `packages/` convention.

```
ia-framework/
├── apps/
│   ├── mcp-server/              # OpenCode MCP server (stdio entry point)
│   │   ├── src/
│   │   │   ├── index.ts         # McpServer setup, tool registration
│   │   │   ├── tools/           # Individual MCP tool handlers
│   │   │   └── resources/       # MCP resource handlers
│   │   └── package.json
│   │
│   ├── dashboard/               # Monitoring web application (Docker)
│   │   ├── src/
│   │   │   ├── server.ts        # Fastify backend
│   │   │   ├── routes/          # API routes
│   │   │   └── public/          # Static frontend assets
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── cli/                     # CLI commands (index, benchmark, status)
│       ├── src/
│       │   ├── index.ts         # CLI entry point
│       │   └── commands/        # Individual commands
│       └── package.json
│
├── packages/
│   ├── core/                    # Shared types, config loader, utilities
│   │   ├── src/
│   │   │   ├── types/           # Shared TypeScript interfaces
│   │   │   ├── config.ts        # Config file read/write
│   │   │   └── logger.ts        # Structured logging
│   │   └── package.json
│   │
│   ├── project-detector/        # Auto-detect project language, framework, etc.
│   │   ├── src/
│   │   │   ├── detectors/       # Per-language/framework detectors
│   │   │   └── index.ts         # Orchestrates detection
│   │   └── package.json
│   │
│   ├── ast-parser/              # Tree-sitter abstraction layer
│   │   ├── src/
│   │   │   ├── parsers/         # Per-language parser strategies
│   │   │   ├── chunker.ts       # AST-aware chunk generation
│   │   │   └── index.ts         # Parser factory
│   │   └── package.json
│   │
│   ├── embedding/               # Provider-agnostic embedding abstraction
│   │   ├── src/
│   │   │   ├── providers/       # OpenAI, Ollama, etc.
│   │   │   ├── interface.ts     # EmbeddingProvider interface
│   │   │   └── index.ts         # Provider factory
│   │   └── package.json
│   │
│   ├── indexer/                 # Codebase indexing pipeline
│   │   ├── src/
│   │   │   ├── pipeline.ts      # Orchestrates index stages
│   │   │   ├── file-walker.ts   # Discovers source files
│   │   │   ├── incremental.ts   # Git-based change detection
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── rag/                     # Retrieval + context assembly
│   │   ├── src/
│   │   │   ├── retriever.ts     # Semantic search + expansion
│   │   │   ├── dependency-graph.ts  # Import/export graph traversal
│   │   │   ├── context-builder.ts   # Format context for LLM
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── metrics/                 # Token tracking + benchmark storage
│   │   ├── src/
│   │   │   ├── token-tracker.ts
│   │   │   ├── benchmark-store.ts
│   │   │   ├── storage.ts       # SQLite abstraction
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── vector-store/            # Qdrant client abstraction
│       ├── src/
│       │   ├── qdrant.ts        # Qdrant-specific implementation
│       │   ├── interface.ts     # VectorStore interface
│       │   └── index.ts
│       └── package.json
│
├── installer/                   # install.sh + TypeScript installer logic
│   ├── install.sh               # Entry point (bash bootstrap)
│   ├── src/
│   │   ├── index.ts             # Main installer orchestration
│   │   ├── checks.ts            # Environment verification
│   │   └── setup.ts             # Docker, config, integration setup
│   └── package.json
│
├── docker/
│   ├── docker-compose.yml       # Qdrant + Dashboard
│   └── qdrant/
│       └── config.yaml          # Qdrant configuration
│
├── turbo.json                   # Turborepo pipeline config
├── pnpm-workspace.yaml          # Workspace definition
├── package.json                 # Root package.json
└── tsconfig.base.json           # Shared TypeScript config
```

### Component Boundaries

| Component | Responsibility | Communicates With | Communication Method |
|-----------|---------------|-------------------|---------------------|
| **core** | Shared types, config, logging | All other packages | In-process imports |
| **project-detector** | Detect language, framework, tools | core, filesystem | In-process + file reads |
| **ast-parser** | Parse source → AST nodes → semantic chunks | core, tree-sitter grammars | In-process + WASM/native |
| **embedding** | Convert text → vectors | core, external APIs | HTTP to OpenAI/Ollama |
| **vector-store** | Store/search vectors in Qdrant | core, Qdrant Docker | HTTP REST to localhost:6333 |
| **indexer** | Orchestrate: walk → parse → embed → store | ast-parser, embedding, vector-store | In-process pipeline |
| **rag** | Retrieve relevant context for queries | embedding, vector-store, core | In-process + HTTP to Qdrant |
| **metrics** | Track tokens, store benchmark results | core, SQLite | In-process + file I/O |
| **mcp-server** | Expose RAG tools to OpenCode | rag, metrics, core | stdio (JSON-RPC) to OpenCode |
| **dashboard** | Web UI for monitoring | vector-store, metrics | HTTP to Qdrant + SQLite reads |
| **cli** | CLI commands for indexing, benchmarks | indexer, rag, metrics | In-process |
| **installer** | Setup environment, Docker, config | project-detector, core | Bash + child processes |

### Data Flow

#### Indexing Flow (Batch)

```
Developer runs: `ia-framework index`
         │
         ▼
┌─── File Walker ───────────────────────────────────────────────┐
│  • Reads .ia-framework/project.json for include/exclude       │
│  • Walks project directory, respects .gitignore                │
│  • For incremental: git diff to find changed files             │
│  • Output: list of file paths                                  │
└───────────────────────┬───────────────────────────────────────┘
                        │ file paths
                        ▼
┌─── AST Parser ────────────────────────────────────────────────┐
│  • Loads tree-sitter grammar for detected language             │
│  • Parses each file into AST                                   │
│  • Extracts semantic units:                                    │
│    - Functions/methods (with signatures)                       │
│    - Classes/interfaces/types                                  │
│    - Module-level exports                                      │
│    - Import declarations (for dependency graph)                │
│  • Output: CodeChunk[] with metadata                           │
└───────────────────────┬───────────────────────────────────────┘
                        │ CodeChunk[]
                        ▼
┌─── Metadata Enricher ─────────────────────────────────────────┐
│  • Adds file path, line numbers                                │
│  • Resolves import paths to absolute references                │
│  • Computes chunk ID (hash of file path + AST node position)   │
│  • Output: EnrichedChunk[]                                     │
└───────────────────────┬───────────────────────────────────────┘
                        │ EnrichedChunk[]
                        ▼
┌─── Embedding Generator ──────────────────────────────────────┐
│  • Batches chunks (provider-specific batch sizes)              │
│  • Calls embedding provider API                                │
│  • Handles rate limits and retries                             │
│  • Tracks token usage → metrics store                          │
│  • Output: VectorChunk[] (chunk + vector)                      │
└───────────────────────┬───────────────────────────────────────┘
                        │ VectorChunk[]
                        ▼
┌─── Qdrant Upserter ──────────────────────────────────────────┐
│  • Upserts points in batches                                   │
│  • Payload includes: file_path, language, chunk_type,          │
│    line_start, line_end, imports, exports, raw_code             │
│  • Creates collection if not exists (dimension auto-detected)  │
│  • Reports progress events                                     │
└───────────────────────────────────────────────────────────────┘
```

#### Retrieval Flow (Interactive)

```
OpenCode sends query via MCP tool call
         │
         ▼ (stdio JSON-RPC)
┌─── MCP Server ────────────────────────────────────────────────┐
│  • Receives tools/call for "search_codebase"                   │
│  • Extracts query text and optional filters                    │
│  • Delegates to RAG engine                                     │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌─── RAG Engine ────────────────────────────────────────────────┐
│                                                                │
│  Step 1: Query Embedding                                       │
│  • Embed query text using same provider as indexing             │
│                                                                │
│  Step 2: Semantic Search                                       │
│  • Search Qdrant with query vector                             │
│  • Apply filters (language, file path patterns)                │
│  • Return top-K results (K configurable, default 10)           │
│                                                                │
│  Step 3: Dependency Graph Expansion                            │
│  • For each result, look at its imports                         │
│  • If an import target has an indexed chunk, include it         │
│  • Expand up to N levels (configurable, default 1)             │
│  • This ensures AI sees types/interfaces the code depends on   │
│                                                                │
│  Step 4: Re-ranking                                            │
│  • Score by: semantic similarity + structural importance        │
│  • Structural importance: exports rank higher than internals    │
│  • De-duplicate overlapping chunks                             │
│                                                                │
│  Step 5: Context Assembly                                      │
│  • Format chunks as structured context blocks                  │
│  • Include file path, line numbers, language                   │
│  • Respect token budget (truncate least relevant first)        │
│  • Output: formatted context string                            │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌─── MCP Response ──────────────────────────────────────────────┐
│  • Return content as MCP text content block                    │
│  • OpenCode injects into LLM conversation                      │
└───────────────────────────────────────────────────────────────┘
```

#### Auto-Context Flow (Alternative Retrieval Mode)

```
Developer types prompt in OpenCode
         │
         ▼
┌─── Auto-Context Injector ────────────────────────────────────┐
│  • Intercepts prompt before it reaches LLM                     │
│  • Calls RAG engine with prompt text as query                  │
│  • Prepends retrieved context to prompt                        │
│  • Configurable: MCP-only, auto-context, or both              │
│                                                                │
│  Implementation: This is an OpenCode integration concern.      │
│  Could be implemented as:                                      │
│  (a) MCP prompt template that OpenCode auto-applies            │
│  (b) Custom OpenCode middleware/hook                           │
│  (c) Wrapper script that pipes through context injection       │
└───────────────────────────────────────────────────────────────┘
```

#### Dashboard Data Flow

```
┌─── Dashboard Backend (Fastify) ──────────────────────────────┐
│                                                                │
│  GET /api/index-status                                         │
│  → Queries Qdrant: collection info, point count                │
│  → Returns: total chunks, last indexed time, collection size   │
│                                                                │
│  GET /api/token-usage                                          │
│  → Reads metrics SQLite: token consumption by date/provider    │
│  → Returns: time series of token usage                         │
│                                                                │
│  GET /api/benchmarks                                           │
│  → Reads metrics SQLite: benchmark run results                 │
│  → Returns: score trends by embedding model / chunking config  │
│                                                                │
│  GET /api/project                                              │
│  → Reads .ia-framework/project.json                            │
│  → Returns: detected project profile                           │
│                                                                │
│  Data sources:                                                 │
│  • Qdrant (HTTP REST) → index health                           │
│  • SQLite (.ia-framework/metrics.db) → token + benchmark data  │
│  • project.json file → project config                          │
└───────────────────────────────────────────────────────────────┘
```

## Patterns to Follow

### Pattern 1: Strategy Pattern for Embedding Providers

**What:** Abstract embedding behind an interface so providers are swappable via configuration.
**When:** Always. This is a core requirement — provider-agnostic embeddings.
**Why:** Developers choose between cloud (OpenAI, Anthropic) and local (Ollama) based on privacy/cost/quality tradeoffs. Benchmarks compare providers directly.

```typescript
// packages/embedding/src/interface.ts
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;

  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;

  // Token counting for usage tracking
  estimateTokens(text: string): number;
}

// packages/embedding/src/providers/openai.ts
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions: number; // e.g., 1536 for text-embedding-3-small

  constructor(private config: OpenAIConfig) {
    this.dimensions = config.dimensions;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Batch API call with rate limiting
  }
}

// packages/embedding/src/providers/ollama.ts
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  readonly dimensions: number;

  constructor(private config: OllamaConfig) {
    this.dimensions = config.dimensions;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Local Ollama API calls — no rate limiting needed
  }
}

// packages/embedding/src/index.ts
export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case 'openai': return new OpenAIEmbeddingProvider(config.openai);
    case 'ollama': return new OllamaEmbeddingProvider(config.ollama);
    default: throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}
```

### Pattern 2: Pipeline Pattern for Indexing

**What:** Composable, stage-based processing pipeline with clear data contracts between stages.
**When:** Indexing. Each stage transforms data and passes it to the next.
**Why:** Testable in isolation, easy to add/modify stages, supports progress reporting.

```typescript
// packages/indexer/src/pipeline.ts
export interface PipelineStage<TInput, TOutput> {
  readonly name: string;
  process(input: TInput, context: PipelineContext): AsyncIterable<TOutput>;
}

export interface PipelineContext {
  config: ProjectConfig;
  onProgress: (stage: string, current: number, total: number) => void;
  signal: AbortSignal; // Cancellation support
}

// Usage: stages composed into full pipeline
const pipeline = new IndexingPipeline([
  new FileDiscoveryStage(),     // () → FilePath[]
  new ASTParsingStage(),        // FilePath → CodeChunk[]
  new MetadataEnrichmentStage(),// CodeChunk → EnrichedChunk[]
  new EmbeddingStage(provider), // EnrichedChunk → VectorChunk[]
  new QdrantUpsertStage(store), // VectorChunk → UpsertResult[]
]);

await pipeline.run(context);
```

### Pattern 3: MCP Server Tool Registration

**What:** Each tool is a self-contained handler with Zod schema validation, registered on the McpServer instance.
**When:** MCP server setup.
**Why:** MCP SDK provides this pattern natively. Clean separation between tool discovery and execution. (Source: MCP TypeScript SDK docs, HIGH confidence)

```typescript
// apps/mcp-server/src/index.ts
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const server = new McpServer({
  name: 'ia-framework',
  version: '1.0.0',
}, {
  capabilities: {
    tools: { listChanged: false },
    resources: {},
    logging: {},
  },
});

// Register tools
server.tool(
  'search_codebase',
  'Search the indexed codebase for code relevant to a query',
  {
    query: z.string().describe('Natural language search query'),
    limit: z.number().optional().default(10).describe('Max results'),
    language: z.string().optional().describe('Filter by language'),
  },
  async ({ query, limit, language }) => {
    const results = await ragEngine.search({ query, limit, language });
    return {
      content: [{ type: 'text', text: results.formattedContext }],
    };
  }
);

server.tool(
  'index_status',
  'Check the current indexing status',
  {},
  async () => {
    const status = await vectorStore.getCollectionInfo();
    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 4: AST-Aware Chunking Strategy

**What:** Use tree-sitter ASTs to create semantically meaningful chunks instead of arbitrary text splits.
**When:** Indexing phase. Critical for retrieval quality.
**Why:** Text-based chunking breaks code mid-function or mid-class. AST-aware chunking preserves complete semantic units (functions, classes, type definitions), which produces better retrieval results. (Source: Qdrant RAG best practices + tree-sitter docs, HIGH confidence)

```typescript
// packages/ast-parser/src/chunker.ts
export interface CodeChunk {
  id: string;             // Deterministic hash
  content: string;        // Raw source code of the chunk
  filePath: string;
  language: string;
  chunkType: 'function' | 'class' | 'interface' | 'type' | 'module' | 'block';
  name: string;           // Function/class/type name
  signature: string;      // Condensed signature for search
  lineStart: number;
  lineEnd: number;
  imports: string[];       // What this chunk imports
  exports: string[];       // What this chunk exports
}

// Strategy: walk AST, extract top-level declarations as chunks
// If a declaration exceeds max chunk size, split at method boundaries
// Always include the full declaration (don't split mid-function)
```

### Pattern 5: Repository Pattern for Vector Store

**What:** Abstract Qdrant behind a `VectorStore` interface.
**When:** All Qdrant interactions.
**Why:** Enables unit testing with in-memory mocks. Isolates Qdrant-specific concerns. Makes future provider changes possible (though unlikely).

```typescript
// packages/vector-store/src/interface.ts
export interface VectorStore {
  initialize(config: VectorStoreConfig): Promise<void>;
  upsertBatch(points: VectorPoint[]): Promise<void>;
  search(query: number[], options: SearchOptions): Promise<SearchResult[]>;
  getCollectionInfo(): Promise<CollectionInfo>;
  deleteByFilter(filter: PointFilter): Promise<number>;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface SearchOptions {
  limit: number;
  scoreThreshold?: number;
  filter?: Record<string, unknown>;
}
```

### Pattern 6: Shared Metrics Store via SQLite

**What:** A lightweight SQLite database for metrics data that multiple components write to and the dashboard reads from.
**When:** Token usage tracking, benchmark result storage.
**Why:** JSON files have concurrency issues. A full database server is overkill. SQLite handles concurrent reads well (one writer at a time is fine for this use case), is zero-config, and ships as a file. `better-sqlite3` provides excellent TypeScript support.

```typescript
// packages/metrics/src/storage.ts
export interface MetricsStore {
  trackTokenUsage(entry: TokenUsageEntry): void;
  saveBenchmarkResult(result: BenchmarkResult): void;
  getTokenUsage(range: DateRange): TokenUsageEntry[];
  getBenchmarkHistory(options: BenchmarkQuery): BenchmarkResult[];
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Embedding Everything

**What:** Indexing test fixtures, generated code, node_modules, build outputs.
**Why bad:** Wastes tokens, pollutes search results, slows indexing. Generated code has patterns that don't match how developers actually write code.
**Instead:** Use `.gitignore` rules plus explicit include/exclude patterns in config. Default excludes: `node_modules`, `dist`, `build`, `.next`, `coverage`, `*.min.js`, `*.generated.*`, `__snapshots__`, fixture files.

### Anti-Pattern 2: Stateful MCP Server

**What:** Storing session state, caches, or configuration inside the MCP server process memory.
**Why bad:** OpenCode may restart the MCP server process at any time. State is lost. Multiple MCP server instances would have divergent state.
**Instead:** All state lives in Qdrant (index data), SQLite (metrics), and config files (project settings). The MCP server is stateless — it reads from these stores on every request.

### Anti-Pattern 3: Direct Dashboard-to-MCP Coupling

**What:** Having the dashboard call the MCP server's internal APIs, or having the MCP server serve the dashboard.
**Why bad:** The MCP server uses stdio transport — it has no HTTP interface. They run as different processes with different lifecycles. Coupling them creates deployment complexity.
**Instead:** Dashboard and MCP server share data through Qdrant and the SQLite metrics database. They are independent processes that happen to read from the same data stores.

### Anti-Pattern 4: Hardcoded Embedding Dimensions

**What:** Assuming all embeddings are 1536-dimensional (OpenAI default).
**Why bad:** Different models have different dimensions: OpenAI text-embedding-3-small = 1536, Ollama nomic-embed-text = 768, etc. Hardcoding prevents model switching.
**Instead:** Read dimensions from the `EmbeddingProvider.dimensions` property. Create Qdrant collections with the provider's dimension. Store the dimension in project config for validation on re-index.

### Anti-Pattern 5: Monolithic Indexer

**What:** One giant function that walks files, parses, embeds, and stores.
**Why bad:** Untestable, can't add stages, can't report progress per-stage, can't retry failed stages.
**Instead:** Pipeline pattern with discrete stages (see Pattern 2). Each stage is independently testable with mock inputs/outputs.

### Anti-Pattern 6: Re-indexing the Entire Codebase on Every Change

**What:** Full re-index when any file changes.
**Why bad:** For large codebases (10K+ files), full indexing takes minutes to hours and consumes embedding tokens.
**Instead:** Incremental indexing: use `git diff` to detect changed files, delete old chunks for changed files from Qdrant, re-index only changed files. Store last-indexed commit hash in project config.

## Scalability Considerations

| Concern | At 1K files | At 10K files | At 100K files |
|---------|-------------|--------------|---------------|
| **Indexing time** | Minutes | 10-30 min | Hours |
| **Mitigation** | Single-threaded fine | Parallel file processing (worker threads) | Incremental indexing essential, parallel + batch embedding |
| **Qdrant memory** | ~50MB | ~500MB | ~5GB |
| **Mitigation** | Default Docker config | Increase Docker memory limits | Consider `on_disk: true` for vectors |
| **Embedding cost** | $0.10 (OpenAI) | $1-5 | $10-50 |
| **Mitigation** | Cloud is fine | Local Ollama becomes attractive | Local Ollama strongly recommended |
| **Search latency** | <50ms | <100ms | <200ms |
| **Mitigation** | No tuning needed | Default HNSW params fine | Tune `ef` and `m` params |
| **Retrieval quality** | Good with basic search | Needs dependency expansion | Needs re-ranking + careful chunking |

## Key Technology Choices

### Tree-sitter for AST Parsing

Use the `tree-sitter` npm package (native Node.js bindings) rather than `web-tree-sitter` (WASM). The native bindings are faster and simpler for a Node.js-only tool. Load language grammars dynamically based on detected project languages.

**Supported languages to prioritize:** TypeScript, JavaScript, Python, Go, Java, Rust, C#, Ruby (cover the most common stacks).

**Confidence:** MEDIUM — verify `tree-sitter` npm package stability and current Node.js version compatibility during implementation. If native bindings prove problematic, `web-tree-sitter` is a solid fallback.

### MCP Transport: stdio

Use stdio transport exclusively. OpenCode spawns the MCP server as a subprocess and communicates via stdin/stdout. This is the simplest, most reliable transport for local tools. No HTTP server, no port management, no authentication.

**Confidence:** HIGH — confirmed from MCP specification and TypeScript SDK docs.

### Qdrant Client: @qdrant/js-client-rest

Use the official Qdrant JavaScript REST client. It provides full collection management, point upsert, search with filters, and payload management. Well-documented with TypeScript types.

**Confidence:** HIGH — verified from Context7 (Qdrant JS library, 98 code snippets, High reputation).

### Dashboard Backend: Fastify

Use Fastify over Express for the dashboard API. Fastify is TypeScript-first, faster, has built-in schema validation, and better suited for a lightweight internal monitoring API.

**Confidence:** MEDIUM — standard choice for TypeScript APIs, but verify Fastify works well inside Docker with static file serving.

## Suggested Build Order

Dependencies flow downward. Each level requires the levels above it to be complete.

```
Level 0 (no dependencies):
  └── core (types, config, logger)

Level 1 (depends on core):
  ├── project-detector
  ├── embedding (interface + at least one provider)
  ├── ast-parser (interface + at least TypeScript grammar)
  └── vector-store (interface + Qdrant implementation)

Level 2 (depends on Level 1):
  ├── indexer (depends on ast-parser, embedding, vector-store)
  └── rag (depends on embedding, vector-store)

Level 3 (depends on Level 2):
  ├── mcp-server (depends on rag)
  ├── metrics (depends on core — can be built earlier but used here)
  └── installer (depends on project-detector, orchestrates Docker)

Level 4 (depends on Level 3):
  ├── cli (depends on indexer, rag, metrics)
  ├── benchmark runner (depends on rag, metrics)
  └── auto-context mode (depends on rag, MCP integration)

Level 5 (depends on Level 4):
  └── dashboard (depends on vector-store, metrics — but needs data to display)
```

### Roadmap Phase Implications

This build order maps to suggested roadmap phases:

1. **Foundation** (Level 0-1): Core types, config system, Docker setup (Qdrant), project detection, installer skeleton. Establishes the monorepo, build tooling, and infrastructure that everything else depends on.

2. **Indexing** (Level 1-2): AST parsing with tree-sitter, embedding provider abstraction, indexing pipeline, Qdrant integration. Ends with: you can run a command and your codebase is indexed in Qdrant.

3. **Retrieval** (Level 2-3): RAG engine, semantic search, dependency graph expansion, MCP server with basic tools. Ends with: OpenCode can query the codebase through MCP tools.

4. **Intelligence** (Level 3-4): Auto-context injection, retrieval mode configuration (MCP-only / auto-context / both), context budget management. Ends with: AI responses automatically include relevant codebase context.

5. **Quality** (Level 4): Benchmark runner, metrics storage, benchmark comparison across models/strategies. Ends with: you can measure and compare RAG quality.

6. **Visibility** (Level 5): Dashboard with index status, token usage charts, benchmark trend visualization. Ends with: developers can monitor the system visually.

7. **Integration** (Level 4+): GSD workflow extension, end-to-end polish, incremental indexing optimization. Ends with: complete development workflow with RAG-enhanced AI.

**Why this order:**
- Can't retrieve without an index (Phase 2 before 3)
- Can't benchmark without retrieval working (Phase 3 before 5)
- Can't visualize without data to show (Phase 5 before 6)
- Foundation must be solid before anything else (Phase 1 first)
- GSD integration requires all pieces working (Phase 7 last)

## Sources

- MCP TypeScript SDK documentation (Context7, `/modelcontextprotocol/typescript-sdk`, HIGH confidence, 346 code snippets)
- MCP Architecture specification (https://modelcontextprotocol.io/docs/concepts/architecture, HIGH confidence)
- MCP Transport specification (https://modelcontextprotocol.io/docs/concepts/transports, HIGH confidence)
- Qdrant JS Client (Context7, `/qdrant/qdrant-js`, HIGH confidence, 98 code snippets)
- Qdrant RAG documentation (Context7, `/websites/qdrant_tech`, HIGH confidence, 5682 code snippets)
- Tree-sitter documentation (Context7, `/websites/tree-sitter_github_io_tree-sitter`, MEDIUM confidence)
- Turborepo monorepo patterns (Context7, `/vercel/turborepo`, HIGH confidence, 1520 code snippets)
