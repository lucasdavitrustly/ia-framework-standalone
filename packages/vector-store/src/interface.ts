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
  indexedAt: string;
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
  /** Metadata payload */
  payload: ChunkPayload;
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
}
