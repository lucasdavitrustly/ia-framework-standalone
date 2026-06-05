/**
 * Payload stored in Qdrant for each chunk point.
 * Lean metadata — does NOT store raw code content.
 * Code is read from filesystem at retrieval time using relativePath + startLine:endLine.
 */
export interface ChunkPayload {
  // === Identity ===
  /** Original string chunk ID (sha1 hash) */
  chunkId: string;
  /** @deprecated use relativePath — kept for backward compat with old-schema collections. Not written by new indexer. */
  filePath?: string | undefined;
  relativePath: string;
  repoId?: string | undefined;

  // === Location (for filesystem retrieval) ===
  startLine: number;
  endLine: number;
  /** SHA256 of content at index time (drift detection) */
  contentHash?: string | undefined;

  // === Signatures ===
  signature?: string | undefined;
  classSignature?: string | undefined;
  contextHeader?: string | undefined;

  // === AST-Derived (deterministic) ===
  language: string;
  chunkType: string;
  name?: string | undefined;
  parentName?: string | undefined;
  packageName?: string | undefined;
  moduleInfo?:
    | {
        group: string;
        module: string;
        submodule?: string | undefined;
      }
    | undefined;
  mavenCoordinates?:
    | {
        groupId: string;
        artifactId: string;
        version: string;
      }
    | undefined;
  /** @deprecated use mavenCoordinates */
  mavenModule?: { groupId: string; artifactId: string; version: string } | undefined;
  visibility?: 'public' | 'protected' | 'package' | 'private' | undefined;
  annotations?: string[] | undefined;
  imports: string[];
  exports: string[];
  defines?: string[] | undefined;
  calls?: string[] | undefined;
  /** @deprecated */
  calledBy?: string[] | undefined;
  superclass?: string | undefined;
  interfaces?: string[] | undefined;
  /** @deprecated */
  isInnerClass?: boolean | undefined;
  /** @deprecated use moduleInfo.module */
  modulePath?: string | undefined;
  /** @deprecated use stereotype/archLayer */
  layerHints?: string[] | undefined;

  // === Classification (heuristic, no LLM) ===
  stereotype?: string | undefined;
  archLayer?: string | undefined;
  complexity?: 'low' | 'medium' | 'high' | undefined;
  /** T122: Structured annotation/decorator metadata for thin-class enrichment */
  annotationMeta?:
    | {
        operationSummaries?: string[] | undefined;
        endpointPaths?: string[] | undefined;
        httpMethods?: string[] | undefined;
        tagName?: string | undefined;
      }
    | undefined;

  // === LLM-Enriched (Ollama) ===
  description?: string | undefined;
  businessContext?: string | undefined;
  serviceBoundary?: string | undefined;
  semanticTags?: string[] | undefined;
  relationships?:
    | Array<{
        target: string;
        type: string;
        label?: string | undefined;
      }>
    | undefined;

  // === Dependency Graph ===
  dependencyEdges?:
    | Array<{
        targetPath: string;
        relation: string;
        symbols?: string[] | undefined;
      }>
    | undefined;

  // === Index Metadata ===
  indexedAt: string;
  enrichedAt?: string | undefined;
  enrichmentModel?: string | undefined;
  qualityScore?: number | undefined;

  // === Legacy fields (backward compat) ===
  /** @deprecated raw code no longer stored in Qdrant */
  content?: string | undefined;
  chunkIndex?: number | undefined;
  totalChunks?: number | undefined;
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
 * A point to be stored in Qdrant with 3 named vectors (semantic, signature, sparse).
 */
export interface VectorPoint {
  /** Original chunk ID (sha1 string) — stored in payload.chunkId */
  id: string;
  /** Semantic embedding (from description + businessContext + semanticTags) */
  semantic: number[];
  /** Signature embedding (from signature + contextHeader) */
  signature: number[];
  /** BM25 sparse vector (tokenized: name + defines + imports + annotations) */
  sparse: SparseVector;
  /** Metadata payload (no raw code) */
  payload: ChunkPayload;

  // === Backward compatibility ===
  /** @deprecated use semantic */
  textVector?: number[] | undefined;
  /** @deprecated use signature */
  codeVector?: number[] | undefined;
  /** @deprecated use sparse */
  sparseVector?: SparseVector | undefined;
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
  /** Prefetch multiplier for keyword/sparse branch (default: 3). Higher = more keyword influence in RRF. */
  keywordPrefetchMultiplier?: number | undefined;
  /** Prefetch multiplier for semantic/dense branches (default: 3). Higher = more semantic influence in RRF. */
  semanticPrefetchMultiplier?: number | undefined;
}

/**
 * Options for semantic search queries.
 */
export interface SearchOptions {
  /** Which named vector to search against */
  vectorName: 'semantic' | 'signature' | 'sparse' | 'text' | 'code';
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
  vectorName: 'semantic' | 'signature' | 'sparse' | 'text' | 'code';
}

/**
 * Summary information about the Qdrant collection.
 */
export interface CollectionInfo {
  name: string;
  pointCount: number;
  vectorDimensions: { text: number; code: number; semantic?: number; signature?: number };
  status: string;
  hasSparseVector: boolean;
  /** true if collection uses new 3-vector schema (semantic/signature/sparse) */
  isNewSchema?: boolean;
}

/**
 * Provider-agnostic vector storage interface.
 */
export interface VectorStore {
  /**
   * Initialize (or verify) the Qdrant collection.
   * Creates collection with named vectors if it doesn't exist.
   * No-op if collection already exists with correct config.
   * When `force` is true, deletes and recreates the collection if it uses the
   * old schema (text/code vectors) instead of throwing.
   */
  initialize(config: {
    textDimensions: number;
    codeDimensions: number;
    force?: boolean;
  }): Promise<void>;

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
