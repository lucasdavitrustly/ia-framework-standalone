import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { SparseVector, StoreCapabilities } from '@ia-framework/vector-store';
import type { VectorBranch } from '@ia-framework/core';
import type { EffectiveFilter } from './effective-filter.js';

/**
 * A natural language query to the retrieval engine.
 */
export interface RetrievalQuery {
  /** Natural language search text */
  text: string;
  /** Maximum number of results (default: 10) */
  limit?: number | undefined;
  /** Minimum similarity score 0-1 (default: 0.5) */
  scoreThreshold?: number | undefined;
  /** Optional Qdrant payload filter */
  filter?: Record<string, unknown> | undefined;
  /** Optional retrieval hint for path/module-aware search */
  preferredModule?: string | undefined;
  /**
   * SPR-04 / SPR-06: invoked once per vector branch the engine actually issues a
   * retrieval call for. A branch the plan selected but the engine skipped (e.g. an
   * empty sparse vector) is never reported, which is what makes "skipped" and
   * "executed with zero results" distinguishable to the caller.
   */
  onBranchExecuted?: ((branch: VectorBranch) => void) | undefined;
}

/**
 * LLM-produced metadata attached to an indexed chunk.
 * The group is omitted when a chunk has no enrichment.
 */
export interface RetrievalEnrichment {
  description?: string | undefined;
  businessContext?: string | undefined;
  semanticTags?: string[] | undefined;
  relationships?: Array<{
    target: string;
    type: string;
    label?: string | undefined;
  }> | undefined;
  enrichedAt?: string | undefined;
  enrichmentModel?: string | undefined;
}

/**
 * A single ranked retrieval result.
 * Maps from Qdrant ChunkPayload + search score.
 */
export interface RetrievalResult {
  /** Original string chunk ID (sha1) */
  chunkId: string;
  /** Absolute path to source file */
  filePath: string;
  /** Path relative to project root */
  relativePath: string;
  /** Programming language */
  language: string;
  /** Type of code construct */
  chunkType: string;
  /** Name of the construct (function/class name), if applicable */
  name?: string | undefined;
  /** Raw source code text */
  content: string;
  /** 1-indexed start line */
  startLine: number;
  /** 1-indexed end line */
  endLine: number;
  /** Module specifiers this chunk imports */
  imports: string[];
  /** Names this chunk exports */
  exports: string[];
  /** Best similarity score across searched vectors (0-1) */
  score: number;
  /** Score type — 'cosine' for primary dense search, 'rrf' for hybrid RRF fallback */
  scoreType?: 'cosine' | 'rrf' | undefined;
  /** Which vector(s) contributed to this result */
  matchedVector: string;
  /** Which collection/strategy produced this result */
  source?: 'ast' | 'llm' | undefined;
  /** Best-effort module or package root used for reranking */
  modulePath?: string | undefined;
  /** Best-effort package or namespace */
  packageName?: string | undefined;
  /** Heuristic architectural role hints */
  layerHints?: string[] | undefined;
  /** Direct superclass name from extends clause (class chunks only) */
  superclass?: string | undefined;
  /** Interfaces/traits implemented (class chunks only) */
  interfaces?: string[] | undefined;
  /** True if this is an inner/nested class */
  isInnerClass?: boolean | undefined;
  /** Zero-based index of this chunk within its file */
  chunkIndex?: number | undefined;
  /** Total number of chunks in the same file */
  totalChunks?: number | undefined;
  /** Method/function names this chunk defines */
  defines?: string[] | undefined;
  /** Method names called within this chunk */
  calls?: string[] | undefined;
  /** Methods that call this chunk's defined method */
  calledBy?: string[] | undefined;
  /** Expansion source tag (e.g., 'hierarchy') for expanded results */
  expansionSource?: string | undefined;
  /** Source repository for cross-repo expanded results (per D-11) */
  expansionRepo?: string | undefined;
  /** Source repository identifier (kebab-case from RepoRegistry) */
  repoId?: string | undefined;
  /** LLM-produced metadata, absent when the chunk was not enriched. */
  enrichment?: RetrievalEnrichment | undefined;
  /** Deterministic construct signature used for structural context assembly. */
  signature?: string | undefined;
  /** Full class declaration signature, when the chunk is class-related. */
  classSignature?: string | undefined;
  /** Enclosing class name, when the chunk is a member. */
  parentName?: string | undefined;
  /** 1-indexed start of the parent construct when this is a split chunk. */
  parentStartLine?: number | undefined;
  /** 1-indexed end of the parent construct when this is a split chunk. */
  parentEndLine?: number | undefined;
  /** 1-based part number within the parent construct. */
  partIndex?: number | undefined;
  /** Total number of parts in the parent construct. */
  totalParts?: number | undefined;
  /** True when the indexed content is a bounded prefix rather than the full chunk. */
  truncated?: boolean | undefined;
  /** Heuristic construct classification. */
  stereotype?: string | undefined;
  /** Heuristic architectural layer classification. */
  archLayer?: string | undefined;
  /** 1-indexed start of the associated documentation comment. */
  docCommentStartLine?: number | undefined;
  /** 1-indexed start of the associated annotation/decorator. */
  annotationStartLine?: number | undefined;
  /** True when only the construct signature was embedded. */
  signatureOnly?: boolean | undefined;
  /** Import/dependency edges extracted from AST (used for payload-edge graph expansion) */
  dependencyEdges?:
    | Array<{
        targetPath: string;
        relation: string;
        symbols?: string[] | undefined;
      }>
    | undefined;
  /**
   * SHA256 of the chunk content at index time.
   * Used at retrieval time to detect drift (file changed since indexing).
   */
  contentHash?: string | undefined;
  /**
   * Set to true at retrieval time when live file content hash differs from stored contentHash.
   * Indicates the indexed chunk may be stale.
   */
  stale?: boolean | undefined;
}

/**
 * Configuration for the SearchEngine.
 */
export interface SearchEngineConfig {
  /** Embedding provider to embed queries */
  embeddingProvider: Pick<EmbeddingProvider, 'embed' | 'dimensions' | 'contract'>;
  /**
   * Absolute path to the indexed project root.
   * Used to reconstruct absolute filePaths from relativePaths when stored filePath is absent.
   */
  projectRoot?: string | undefined;
  /** Vector store to search against */
  vectorStore: {
    search(
      queryVector: number[],
      options: {
        vectorName: string;
        limit: number;
        scoreThreshold?: number | undefined;
        filter?: Record<string, unknown> | undefined;
      },
    ): Promise<
      Array<{
        id: string;
        score: number;
        payload: {
          chunkId: string;
          /** @deprecated not stored by new indexer — reconstructed at retrieval time from projectRoot + relativePath */
          filePath?: string | undefined;
          relativePath: string;
          language: string;
          chunkType: string;
          name?: string | undefined;
          /** Raw code content — optional in new lean-payload schema (code read from filesystem at retrieval time) */
          content?: string | undefined;
          startLine: number;
          endLine: number;
          imports: string[];
          exports: string[];
          contentHash?: string | undefined;
          modulePath?: string | undefined;
          packageName?: string | undefined;
          layerHints?: string[] | undefined;
          indexedAt: string;
        };
        vectorName: string;
      }>
    >;
    /** Optional: sparse-only BM25 keyword search. Falls back to skipping keyword step if absent. */
    searchKeyword?(options: {
      sparseVector: { indices: number[]; values: number[] };
      limit: number;
      filter?: Record<string, unknown> | undefined;
    }): Promise<
      Array<{
        id: string;
        score: number;
        payload: {
          chunkId: string;
          filePath?: string | undefined;
          relativePath: string;
          language: string;
          chunkType: string;
          name?: string | undefined;
          /** Raw code content — optional in new lean-payload schema (code read from filesystem at retrieval time) */
          content?: string | undefined;
          startLine: number;
          endLine: number;
          imports: string[];
          exports: string[];
          contentHash?: string | undefined;
          modulePath?: string | undefined;
          packageName?: string | undefined;
          layerHints?: string[] | undefined;
          indexedAt: string;
        };
        vectorName: string;
      }>
    >;
    /** Optional: direct named sparse search. */
    searchSparse?(
      vector: SparseVector,
      options: { limit: number; filter?: Record<string, unknown> | undefined },
    ): Promise<
      Array<{
        id: string;
        score: number;
        payload: {
          chunkId: string;
          filePath?: string | undefined;
          relativePath: string;
          language: string;
          chunkType: string;
          name?: string | undefined;
          content?: string | undefined;
          startLine: number;
          endLine: number;
          imports: string[];
          exports: string[];
          contentHash?: string | undefined;
          modulePath?: string | undefined;
          packageName?: string | undefined;
          layerHints?: string[] | undefined;
          indexedAt: string;
        };
        vectorName: string;
      }>
    >;
    /** Optional adapter capabilities. */
    capabilities?(): StoreCapabilities;
    /** Optional: hybrid search combining dense + sparse + RRF. Falls back to search() if absent. */
    searchHybrid?(options: {
      semanticVector: number[];
      signatureVector: number[];
      sparseVector?: { indices: number[]; values: number[] } | undefined;
      limit: number;
      filter?: Record<string, unknown> | undefined;
      /** Prefetch multiplier for keyword/sparse branch (default: 3) */
      keywordPrefetchMultiplier?: number | undefined;
      /** Prefetch multiplier for semantic/dense branches (default: 3) */
      semanticPrefetchMultiplier?: number | undefined;
    }): Promise<
      Array<{
        id: string;
        score: number;
        payload: {
          chunkId: string;
          filePath?: string | undefined;
          relativePath: string;
          language: string;
          chunkType: string;
          name?: string | undefined;
          /** Raw code content — optional in new lean-payload schema (code read from filesystem at retrieval time) */
          content?: string | undefined;
          startLine: number;
          endLine: number;
          imports: string[];
          exports: string[];
          contentHash?: string | undefined;
          modulePath?: string | undefined;
          packageName?: string | undefined;
          layerHints?: string[] | undefined;
          indexedAt: string;
        };
        vectorName: string;
      }>
    >;
    /**
     * Optional: T068 scroll (paginate) through all points without a query vector.
     * Used as last-resort glob/grep fallback when all dense searches return empty.
     */
    scroll?(options: {
      limit: number;
      offset?: string | number | undefined;
      filter?: Record<string, unknown> | undefined;
    }): Promise<{
      points: Array<{
        id: string;
        payload: {
          chunkId: string;
          filePath?: string | undefined;
          relativePath: string;
          language: string;
          chunkType: string;
          name?: string | undefined;
          /** Raw code content — optional in new lean-payload schema (code read from filesystem at retrieval time) */
          content?: string | undefined;
          startLine: number;
          endLine: number;
          imports: string[];
          exports: string[];
          contentHash?: string | undefined;
          repoId?: string | undefined;
          modulePath?: string | undefined;
          packageName?: string | undefined;
          layerHints?: string[] | undefined;
          indexedAt: string;
        };
      }>;
      nextOffset?: string | number | undefined;
    }>;
  };
  /** Default number of results (default: 10) */
  defaultLimit?: number | undefined;
  /** Default score threshold (default: 0.5) */
  defaultScoreThreshold?: number | undefined;
  /** Default RRF score threshold for hybrid search (default: 0.015). RRF scores are rank-based (~0.01–0.03), not cosine. */
  defaultRrfScoreThreshold?: number | undefined;
  /** RRF constant k (default: 60). Lower values amplify top-ranked differences. */
  rrfK?: number | undefined;
  /** Enable MMR diversity re-ranking (default: true). Per D-05. */
  mmrEnabled?: boolean | undefined;
  /** Override MMR lambda (0=max diversity, 1=relevance only). If unset, query-type-aware. Per D-02. */
  mmrLambda?: number | undefined;
  /** Candidate multiplier for over-fetching before MMR (default: 3). Per D-06. */
  mmrCandidateMultiplier?: number | undefined;
  /** Prefetch multiplier for keyword/sparse branch in hybrid search (default: 3). Higher = more keyword influence. */
  keywordPrefetchMultiplier?: number | undefined;
  /** Prefetch multiplier for semantic/dense branches in hybrid search (default: 3). Higher = more semantic influence. */
  semanticPrefetchMultiplier?: number | undefined;
  /** Elbow detection: truncate results when score drops by more than this ratio (0-1). Undefined = disabled. */
  elbowDropThreshold?: number | undefined;
  /** Minimum results to keep when elbow detection triggers (default: 1). */
  elbowMinResults?: number | undefined;
  /** Optional dependency graph for expanding results along import edges */
  dependencyGraph?:
    | {
        getNeighborFiles(
          filePaths: string[],
          hops: 1 | 2,
          filter: EffectiveFilter,
        ): Promise<string[]>;
      }
    | undefined;
}

/**
 * A single keyword-based suggestion returned by the fallback search.
 */
export interface FallbackSuggestion {
  /** Relative file path */
  file: string;
  /** Construct name or chunk type */
  name: string;
  /** First 200 chars of content */
  snippet: string;
}

/**
 * Result envelope returned by SearchEngine.searchWithFallback().
 */
export interface FallbackSearchResult {
  /** Whether any results were found (true = results array is non-empty) */
  found: boolean;
  /** Whether a fallback strategy was used */
  fallback_used: boolean;
  /** Which mode ultimately produced results (or was last tried) */
  fallback_mode: 'none' | 'hybrid' | 'keyword';
  /** Ranked retrieval results (non-empty only when found=true) */
  results: RetrievalResult[];
  /** BM25 keyword suggestions (non-empty only when fallback_mode='keyword' and results found) */
  suggestions: FallbackSuggestion[];
  /** Related-concept results when all fallbacks return zero (absent when found=true) */
  relatedResults?: RetrievalResult[];
  /** The expanded synonym term that produced relatedResults */
  related_query?: string;
}
