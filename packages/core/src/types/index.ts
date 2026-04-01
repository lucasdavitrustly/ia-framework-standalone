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
  chunkType: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'module' | 'other' | 'table' | 'view';
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
  /** Maximum lines per chunk (default: 100) */
  maxChunkLines?: number | undefined;
  /** Whether to respect .gitignore (default: true) */
  respectGitignore?: boolean | undefined;
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
 * Top-level project configuration loaded from .ia-framework/project.json
 */
export interface ProjectConfig {
  /** Absolute path to the target project to index */
  targetProjectPath: string;
  /** Embedding provider configuration */
  embedding: EmbeddingProviderConfig;
  /** Vector store (Qdrant) configuration */
  vectorStore: VectorStoreConfig;
  /** Indexing configuration */
  indexing?: IndexingConfig | undefined;
  /** Last detected project profile (set after project detection) */
  profile?: ProjectProfile | undefined;
}
