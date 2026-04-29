/**
 * Payload stored in Qdrant for each chunk point.
 * Mirrors ChunkMetadata from @ia-framework/core.
 */
export interface ChunkPayload {
  /** Original string chunk ID (sha1 hash) */
  chunkId: string;
  filePath: string;
  relativePath: string;
  language: string;
  chunkType: string;
  name?: string | undefined;
  content: string;
  startLine: number;
  endLine: number;
  imports: string[];
  exports: string[];
  /** Parent construct name when this is a sub-chunk */
  parentName?: string | undefined;
  /** Best-effort module or package root used for retrieval/reranking */
  modulePath?: string | undefined;
  /** Best-effort package or namespace name */
  packageName?: string | undefined;
  /** Heuristic architectural role hints */
  layerHints?: string[] | undefined;
  indexedAt: string;
  /** Heuristic quality score for chunk summary (0-100). Present only for LLM-chunked points. */
  qualityScore?: number | undefined;
  /** Maven module coordinates, populated for files inside a Maven project */
  mavenModule?: { groupId: string; artifactId: string; version: string } | undefined;
}

/**
 * A term-frequency sparse vector for BM25 hybrid search.
 * Indices map tokens to integer positions; values are term counts (TF).
 * Qdrant applies IDF weighting server-side when modifier="idf" is configured.
 */
export interface SparseVector {
  indices: number[];
  values: number[];
}

/**
 * A point to be stored in Qdrant with dual named vectors.
 */
export interface VectorPoint {
  /** Original chunk ID (sha1 string) — stored in payload.chunkId */
  id: string;
  /** Text embedding (from text/natural language embedding model) */
  textVector: number[];
  /** Code embedding (from code-specialized embedding model) */
  codeVector: number[];
  /** Optional BM25 sparse vector. Required when collection has sparse_vectors config. */
  sparseVector?: SparseVector | undefined;
  /** Metadata payload */
  payload: ChunkPayload;
}

/**
 * Options for hybrid search (dense + sparse + RRF fusion).
 */
export interface HybridSearchOptions {
  /** Dense query vector (embedded from the query text) */
  denseVector: number[];
  /** BM25 term-frequency sparse vector computed from the query text */
  sparseVector: SparseVector;
  /** Maximum results to return after RRF fusion */
  limit: number;
  /** Optional Qdrant filter for payload field filtering */
  filter?: Record<string, unknown> | undefined;
}

/**
 * Options for semantic search queries.
 */
export interface SearchOptions {
  /** Which named vector to search against */
  vectorName: 'text' | 'code';
  /** Maximum results to return */
  limit: number;
  /** Minimum similarity score (0-1). Results below threshold are excluded. */
  scoreThreshold?: number | undefined;
  /** Qdrant filter object for payload field filtering */
  filter?: Record<string, unknown> | undefined;
}

/**
 * A single search result.
 */
export interface SearchResult {
  /** Original chunk ID */
  id: string;
  /** Similarity score (0-1) */
  score: number;
  /** Chunk metadata */
  payload: ChunkPayload;
  /** Which vector matched */
  vectorName: 'text' | 'code';
}

/**
 * Summary information about the Qdrant collection.
 */
export interface CollectionInfo {
  name: string;
  pointCount: number;
  vectorDimensions: { text: number; code: number };
  status: string;
  hasSparseVector: boolean; // true if 'sparse' named sparse vector exists
}

/**
 * Provider-agnostic vector storage interface.
 */
export interface VectorStore {
  /**
   * Initialize (or verify) the Qdrant collection.
   * Creates collection with named vectors if it doesn't exist.
   * No-op if collection already exists with correct config.
   */
  initialize(config: { textDimensions: number; codeDimensions: number }): Promise<void>;

  /**
   * Upsert a batch of points into the collection.
   * Existing points with same ID are replaced.
   */
  upsertBatch(points: VectorPoint[]): Promise<void>;

  /**
   * Semantic search using a named vector.
   * Returns results sorted by score descending.
   */
  search(queryVector: number[], options: SearchOptions): Promise<SearchResult[]>;

  /**
   * Hybrid search combining dense text, dense code, and BM25 sparse vectors via RRF fusion.
   * Requires the collection to have been initialized with a sparse vector named "sparse".
   * Returns results sorted by RRF-fused score descending.
   */
  searchHybrid(options: HybridSearchOptions): Promise<SearchResult[]>;

  /**
   * Get metadata about the collection (point count, status, etc.).
   */
  getCollectionInfo(): Promise<CollectionInfo>;

  /**
   * Delete points matching a Qdrant filter.
   * Returns the number of deleted points.
   */
  deleteByFilter(filter: Record<string, unknown>): Promise<number>;

  /**
   * Delete specific points by their chunk IDs.
   */
  deleteByIds(ids: string[]): Promise<void>;

  /**
   * Scroll (paginate) through all points in the collection without a query vector.
   * Returns points ordered by ID, with offset-based pagination.
   */
  scroll(options: {
    limit: number;
    offset?: string | number | undefined;
    filter?: Record<string, unknown> | undefined;
  }): Promise<{
    points: Array<{ id: string; payload: ChunkPayload }>;
    nextOffset?: string | number | undefined;
  }>;

  /**
   * Get the total number of points in the collection, optionally filtered.
   */
  countPoints(filter?: Record<string, unknown>): Promise<number>;

  /**
   * Delete the entire collection. Used when re-indexing with a different embedding model.
   */
  deleteCollection(): Promise<void>;
}
