/**
 * Represents a single chunk of code extracted from the codebase.
 * One chunk = one indexed unit stored in Qdrant.
 */
export interface ChunkMetadata {
  /** Unique identifier (file path + chunk index) */
  id: string;
  /** Absolute path to the source file */
  filePath: string;
  /** Path relative to targetProjectPath */
  relativePath: string;
  /** Programming language of the file */
  language: string;
  /** Type of code construct: function, class, interface, module, etc. */
  chunkType:
    | 'function'
    | 'class'
    | 'interface'
    | 'type'
    | 'enum'
    | 'module'
    | 'other'
    | 'table'
    | 'view'
    | 'aspect';
  /** Name of the construct (function name, class name, etc.) */
  name?: string | undefined;
  /** The actual source code text */
  content: string;
  /** Start line in the source file (1-indexed) */
  startLine: number;
  /** End line in the source file (1-indexed) */
  endLine: number;
  /** Identifiers this chunk imports from other modules */
  imports: string[];
  /** Identifiers this chunk exports */
  exports: string[];
  /** Parent construct name when this is a sub-chunk (e.g., method extracted from a class) */
  parentName?: string | undefined;
  /** Best-effort module or package root used for cross-module retrieval/reranking */
  modulePath?: string | undefined;
  /** Best-effort language package/namespace (most useful for Java) */
  packageName?: string | undefined;
  /** Heuristic architectural roles inferred from path and content */
  layerHints?: string[] | undefined;
  /** Zero-based index of this chunk within its file */
  chunkIndex?: number | undefined;
  /** Total number of chunks in the same file */
  totalChunks?: number | undefined;
  /** Git commit hash at time of indexing */
  indexedAt: string;
}

/**
 * Detected profile of the target project being indexed.
 */
export interface ProjectProfile {
  /** Primary programming language(s) detected */
  languages: string[];
  /** Framework(s) detected (e.g., 'next.js', 'express', 'django') */
  frameworks: string[];
  /** Package manager ('npm', 'pnpm', 'yarn', 'pip', etc.) */
  packageManager: string;
  /** Test runner ('vitest', 'jest', 'pytest', etc.) */
  testRunner?: string | undefined;
  /** Build command (e.g., 'pnpm build', 'npm run build') */
  buildCommand?: string | undefined;
  /** Dev server command */
  devCommand?: string | undefined;
}

/**
 * A single embedding vector with its source content.
 */
export interface EmbeddingVector {
  /** The floating-point embedding values */
  values: number[];
  /** The text that was embedded */
  sourceText: string;
  /** Which embedding model produced this */
  model: string;
  /** Vector dimensionality */
  dimensions: number;
}

/**
 * A single search result returned from semantic search.
 */
export interface SearchResult {
  /** The chunk metadata */
  chunk: ChunkMetadata;
  /** Similarity score (0-1, higher = more similar) */
  score: number;
  /** Which vector type matched ('text' or 'code') */
  vectorType: 'text' | 'code';
}

export interface CodeAnchor {
  file: string;
  symbol?: string | undefined;
  lines: string;
  anchor: string;
}

/**
 * Configuration for embedding provider (OpenAI or Ollama).
 */
export interface EmbeddingProviderConfig {
  /** Provider type */
  provider: 'openai' | 'ollama';
  /** Model name (e.g., 'text-embedding-3-small', 'nomic-embed-text') */
  model: string;
  /** Base URL override (for Ollama or OpenAI-compatible APIs) */
  baseUrl?: string | undefined;
  /** API key (required for OpenAI, ignored for Ollama) */
  apiKey?: string | undefined;
  /** Number of dimensions in the embedding output */
  dimensions?: number | undefined;
  /** Optional task-type prefixes prepended to text before embedding (model-specific) */
  prefixes?: { document: string; query: string } | undefined;
}

/**
 * Configuration for Qdrant vector store connection.
 */
export interface VectorStoreConfig {
  /** Qdrant host */
  host: string;
  /** Qdrant port (default: 6333) */
  port: number;
  /** Collection name for this project's chunks */
  collectionName: string;
  /** Optional API key for Qdrant Cloud */
  apiKey?: string | undefined;
}

/**
 * Indexing configuration — what to index and how.
 */
export interface IndexingConfig {
  /** Glob patterns for files to include */
  includePatterns: string[];
  /** Glob patterns for files to exclude */
  excludePatterns: string[];
  /** Maximum lines per chunk (default: 200). Oversized chunks are split with signature context preserved. */
  maxChunkLines?: number | undefined;
  /** Whether to respect .gitignore (default: true) */
  respectGitignore?: boolean | undefined;
  /** Override default embedding concurrency (provider-aware). Ollama default: 3, OpenAI default: 10. */
  embeddingConcurrency?: number | undefined;
  /** Number of chunks per embedding API call (default: 50, range: 1-200). */
  embeddingBatchSize?: number | undefined;
  /** LLM chunking configuration (optional — model and Ollama URL for LLM-based chunking strategy) */
  llm?: { model: string; ollamaUrl: string } | undefined;
  /** LLM enrichment configuration (optional — enables Ollama metadata enrichment) */
  enrichment?: EnrichmentConfig | undefined;
}

/**
 * A pluggable context source that produces indexable chunks.
 * Implement this interface to add new context types (DB schema, docs, etc.)
 * to the indexing pipeline alongside code chunks.
 */
export interface ContextSource {
  /** Human-readable name for logging (e.g. 'postgres', 'docs') */
  name: string;
  /** Produce all chunks from this source for embedding and storage */
  getChunks(): Promise<ChunkMetadata[]>;
}

/**
 * Retrieval configuration — controls how search results are expanded and served.
 */
export interface RetrievalConfig {
  /** Retrieval mode: mcp-only (v1), auto-context (v2), combined (v2) */
  mode: 'mcp-only' | 'auto-context' | 'combined';
  /** Number of dependency graph hops: 0 = off, 1 = direct imports, 2 = transitive */
  expansionHops: 0 | 1 | 2;
  /** Top-K results for auto-context injection (v2) */
  autoContextTopK: number;
  /** Default minimum relevance score for filtering (0-1). Omit or 0 to disable. */
  scoreThreshold?: number | undefined;
  /** Confidence threshold for keyword early exit (0-1, default 0.8). */
  earlyExitConfidence?: number | undefined;
}

/**
 * A single repository entry in the multi-repo configuration.
 */
export interface RepoEntry {
  /** Path to the repository (resolved to absolute at runtime) */
  path: string;
  /** Optional logical name (derived from basename if not specified) */
  name?: string | undefined;
  /** Package names this repo provides (for cross-repo symbol resolution) */
  provides?: string[] | undefined;
  /** Optional per-repo profile override */
  profile?: ProjectProfile | undefined;
}

// ============================================================
// AST + LLM RAG Optimization — Shared Types (Feature 008)
// ============================================================

/**
 * Architectural stereotype of a code chunk (heuristic classification).
 */
export type Stereotype =
  | 'controller'
  | 'service'
  | 'repository'
  | 'entity'
  | 'dto'
  | 'mapper'
  | 'config'
  | 'aspect'
  | 'filter'
  | 'interceptor'
  | 'exception-handler'
  | 'validator'
  | 'event-listener'
  | 'scheduler'
  | 'client'
  | 'gateway'
  | 'test'
  | 'proto-service'
  | 'proto-message'
  | 'unknown';

/**
 * Architectural layer classification.
 */
export type ArchLayer =
  | 'presentation'
  | 'service'
  | 'domain'
  | 'persistence'
  | 'infrastructure'
  | 'crosscutting';

/**
 * Module hierarchy info derived from directory structure / pom.xml.
 */
export interface ModuleInfo {
  group: string; // top-level directory (e.g., "payments")
  module: string; // second-level (e.g., "merchant-gateway")
  submodule?: string; // third-level (e.g., "merchant-gateway-core")
}

/**
 * Maven project coordinates parsed from pom.xml.
 */
export interface MavenCoordinates {
  groupId: string;
  artifactId: string;
  version: string;
}

/**
 * LLM-identified relationship between chunks.
 */
export interface RelationshipTag {
  target: string;
  type: 'uses' | 'implements' | 'extends' | 'configures' | 'produces' | 'consumes' | 'tests';
  label?: string;
}

/**
 * A directed dependency edge from one file/chunk to another.
 */
export interface DependencyEdge {
  targetPath: string; // relative to repo root
  relation: 'imports' | 'exports' | 'implements' | 'configures' | 'references' | 'generates';
  symbols?: string[];
}

/**
 * Extended chunk type values including new AST constructs.
 */
export type ChunkType =
  | 'method'
  | 'class-signature'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'module'
  | 'config-block'
  | 'service-def'
  | 'message-def'
  | 'migration'
  | 'aspect'
  | 'other';

/**
 * Configuration for the LLM enrichment pipeline (Ollama).
 */
export interface EnrichmentConfig {
  /** Ollama provider (currently the only supported provider) */
  provider: 'ollama';
  /** Model name (e.g., 'qwen3:8b') */
  model: string;
  /** Ollama base URL (default: http://localhost:11434) */
  baseUrl?: string;
  /** Context window size in tokens (default: 32768) */
  numCtx?: number;
  /** Max concurrent Ollama requests (default: auto-detect from GPU) */
  concurrency?: number;
  /** Retry attempts on Ollama failure (default: 2) */
  retryAttempts?: number;
  /** If true, skip LLM enrichment when Ollama is unavailable instead of failing (default: true) */
  skipOnFailure?: boolean;
  /** Languages to exclude from LLM enrichment (default: ["xml", "yaml", "sql", "proto"]) */
  excludeLanguages?: string[];
  /** Stereotypes to exclude from LLM enrichment (default: ["test", "dto", "config-block", "migration"]) */
  excludeStereotypes?: string[];
  /** Minimum line count for method/function chunks to qualify for enrichment (default: 6). Set to 1 to disable. */
  minEnrichmentLines?: number;
  /** File extensions to exclude from LLM enrichment (e.g., [".js", ".jsx"]). Case-insensitive. */
  excludeExtensions?: string[];
  /** Maximum chunks per Ollama enrichment call (default: 20, range: 1-50). Caps the dynamic token-budget batcher. */
  maxBatchChunks?: number;
  /** Approximate characters per token for the model's tokenizer (default: 3). Lower = more conservative batching. */
  charsPerToken?: number;
  /** Fraction of numCtx allocated to input tokens (default: 0.45, range: 0.2-0.7). Remainder is output headroom. */
  tokenBudgetRatio?: number;
  /** Estimated output tokens needed per chunk in the response (default: 300, range: 50-1000). Controls num_predict. */
  outputTokensPerChunk?: number;
}

/**
 * Top-level project configuration loaded from .ia-framework/project.json
 */
export interface ProjectConfig {
  /** Absolute path to the target project to index (legacy single-repo format) */
  targetProjectPath?: string | undefined;
  /** Multi-repo format: array of repo entries */
  repos?: RepoEntry[] | undefined;
  /** Embedding provider configuration */
  embedding: EmbeddingProviderConfig;
  /** Vector store (Qdrant) configuration */
  vectorStore: VectorStoreConfig;
  /** Indexing configuration */
  indexing?: IndexingConfig | undefined;
  /** Last detected project profile (set after project detection) */
  profile?: ProjectProfile | undefined;
  /** Retrieval configuration (graph expansion, mode) */
  retrieval?: RetrievalConfig | undefined;
}
