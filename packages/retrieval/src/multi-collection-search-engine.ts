import type { RetrievalQuery, RetrievalResult } from './types.js';
import type { SearchEngine } from './search-engine.js';
import { rrfMerge } from './rrf.js';
import { assertEffectiveFilter, toQdrantFilter, type EffectiveFilter } from './effective-filter.js';

function mergeDefinedFields<T extends object>(
  primary: T | undefined,
  secondary: T | undefined,
): T | undefined {
  if (!primary && !secondary) return undefined;

  const merged: Record<string, unknown> = { ...(secondary ?? {}) };
  for (const [key, value] of Object.entries(primary ?? {})) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as T;
}

/** Preserve the ranked result while filling metadata omitted by another collection. */
function mergeResultMetadata(
  primary: RetrievalResult,
  secondary: RetrievalResult,
): RetrievalResult {
  const merged: Record<string, unknown> = { ...secondary, ...primary };
  for (const [key, value] of Object.entries(secondary)) {
    if (merged[key] === undefined && value !== undefined) merged[key] = value;
  }
  merged.enrichment = mergeDefinedFields(primary.enrichment, secondary.enrichment);
  return merged as unknown as RetrievalResult;
}

function mergeMetadataAcrossCollections(
  results: RetrievalResult[],
  lists: Array<{ results: RetrievalResult[] }>,
): RetrievalResult[] {
  const metadataByChunk = new Map<string, RetrievalResult>();
  for (const list of lists) {
    for (const result of list.results) {
      const existing = metadataByChunk.get(result.chunkId);
      metadataByChunk.set(
        result.chunkId,
        existing ? mergeResultMetadata(existing, result) : result,
      );
    }
  }

  return results.map((result) => {
    const metadata = metadataByChunk.get(result.chunkId);
    return metadata ? mergeResultMetadata(result, metadata) : result;
  });
}

/**
 * A named collection engine pairing — binds a source tag to a SearchEngine instance.
 */
export interface CollectionEngine {
  /** Which collection/strategy this engine serves */
  name: 'ast' | 'llm';
  /** The underlying SearchEngine instance */
  engine: SearchEngine;
}

export interface MultiCollectionSearchEngineConfig {
  /** One or more named search engines to query in parallel */
  engines: CollectionEngine[];
  /** Optional dependency graph for searchWithExpansion */
  dependencyGraph?: {
    getNeighborFiles(filePaths: string[], hops: 1 | 2, filter: EffectiveFilter): Promise<string[]>;
  };
}

/**
 * Multi-collection search engine that queries N SearchEngine instances in parallel,
 * merges results via Reciprocal Rank Fusion (RRF), and tags each result with its source.
 *
 * Satisfies the Engine and HybridEngine duck types used by MCP tool handlers:
 * - Engine:       search(), searchWithExpansion(), getFile()
 * - HybridEngine: searchHybrid()
 */
export class MultiCollectionSearchEngine {
  private readonly engines: CollectionEngine[];
  private readonly dependencyGraph:
    | {
        getNeighborFiles(
          filePaths: string[],
          hops: 1 | 2,
          filter: EffectiveFilter,
        ): Promise<string[]>;
      }
    | undefined;

  constructor(config: MultiCollectionSearchEngineConfig) {
    this.engines = config.engines;
    this.dependencyGraph = config.dependencyGraph;
  }

  /**
   * Search all engines in parallel and merge via RRF.
   *
   * Each engine is queried with `limit * 2` (over-fetch) so RRF has enough
   * candidates to produce a high-quality top-`limit` merged ranking.
   * scoreThreshold is set to undefined so child engines don't apply cosine
   * filtering before RRF merge (post-RRF scores are rank-based, not cosine).
   *
   * When only one engine returns non-empty results, RRF fusion is skipped
   * and original cosine scores are preserved (RRF of one list is meaningless).
   */
  async search(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const limit = query.limit ?? 10;
    const overFetchQuery = { ...query, limit: limit * 2, scoreThreshold: undefined };

    const listsWithSources = await Promise.all(
      this.engines.map(async ({ name, engine }) => ({
        source: name,
        results: await engine.search(overFetchQuery),
      })),
    );

    // Skip RRF when only one engine contributes results — preserve cosine scores
    const nonEmpty = listsWithSources.filter((l) => l.results.length > 0);
    if (nonEmpty.length <= 1) {
      const single = nonEmpty[0];
      if (!single) return [];
      return single.results.map((r) => ({ ...r, source: single.source })).slice(0, limit);
    }

    return mergeMetadataAcrossCollections(rrfMerge(listsWithSources, limit), listsWithSources);
  }

  /**
   * Hybrid search across all engines in parallel, merged via RRF.
   *
   * Same over-fetch strategy as search(). Each engine handles its own
   * sparse/dense fusion internally — we RRF across collection boundaries.
   * scoreThreshold is cleared so RRF rank-based scores aren't filtered by cosine threshold.
   *
   * When only one engine returns non-empty results, RRF fusion is skipped
   * and original scores are preserved.
   */
  async searchHybrid(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const limit = query.limit ?? 10;
    const overFetchQuery = { ...query, limit: limit * 2, scoreThreshold: undefined };

    const listsWithSources = await Promise.all(
      this.engines.map(async ({ name, engine }) => ({
        source: name,
        results: await engine.searchHybrid(overFetchQuery),
      })),
    );

    // Skip RRF when only one engine contributes results — preserve original scores
    const nonEmpty = listsWithSources.filter((l) => l.results.length > 0);
    if (nonEmpty.length <= 1) {
      const single = nonEmpty[0];
      if (!single) return [];
      return single.results.map((r) => ({ ...r, source: single.source })).slice(0, limit);
    }

    return mergeMetadataAcrossCollections(rrfMerge(listsWithSources, limit), listsWithSources);
  }

  /**
   * Multi-collection search with optional dependency-graph expansion.
   *
   * 1. Runs multi-collection search() for base results.
   * 2. If dependencyGraph and hops > 0: resolves neighbor files and fetches
   *    their chunks via getFile() (queries all collections).
   * 3. Merges expansion results (score=0) after base results, deduping by chunkId.
   */
  async searchWithExpansion(
    query: RetrievalQuery,
    filter: EffectiveFilter,
    options?: { hops?: 0 | 1 | 2 },
  ): Promise<RetrievalResult[]> {
    assertEffectiveFilter(filter, 'MultiCollectionSearchEngine.searchWithExpansion');
    const hops = options?.hops ?? 1;
    const baseResults = await this.search({ ...query, filter: toQdrantFilter(filter) });

    if (!this.dependencyGraph || hops === 0) {
      return baseResults;
    }

    const baseFilePaths = [...new Set(baseResults.map((r) => r.filePath))];
    const baseChunkIds = new Set(baseResults.map((r) => r.chunkId));

    const neighborFiles = await this.dependencyGraph.getNeighborFiles(baseFilePaths, hops, filter);

    const baseFileSet = new Set(baseFilePaths);
    const newFiles = neighborFiles.filter((f) => !baseFileSet.has(f));

    if (newFiles.length === 0) {
      return baseResults;
    }

    // Fetch expansion chunks through all collections via getFile
    const expansionChunkArrays = await Promise.all(
      newFiles.map((filePath) => this.getFile(filePath, filter)),
    );

    const expansionResults: RetrievalResult[] = [];
    for (const chunks of expansionChunkArrays) {
      for (const chunk of chunks) {
        if (!baseChunkIds.has(chunk.chunkId)) {
          baseChunkIds.add(chunk.chunkId);
          expansionResults.push({ ...chunk, score: 0 });
        }
      }
    }

    return [...baseResults, ...expansionResults];
  }

  /**
   * Retrieve all chunks for a file from all engines, combined and deduped.
   *
   * Results are tagged with their engine source and deduplicated by chunkId
   * (first occurrence wins). Sorted by startLine for natural reading order.
   */
  async getFile(relativePath: string, filter: EffectiveFilter): Promise<RetrievalResult[]> {
    assertEffectiveFilter(filter, 'MultiCollectionSearchEngine.getFile');
    const allChunkArrays = await Promise.all(
      this.engines.map(async ({ name, engine }) => {
        const chunks = await engine.getFile(relativePath, filter);
        return chunks.map((chunk): RetrievalResult => ({ ...chunk, source: name }));
      }),
    );

    // Combine and deduplicate by chunkId while preserving complementary metadata.
    const combined = new Map<string, RetrievalResult>();

    for (const chunks of allChunkArrays) {
      for (const chunk of chunks) {
        const existing = combined.get(chunk.chunkId);
        combined.set(chunk.chunkId, existing ? mergeResultMetadata(existing, chunk) : chunk);
      }
    }

    // Sort by startLine for natural file reading order
    return [...combined.values()].sort((a, b) => a.startLine - b.startLine);
  }

  /**
   * Search with interface implementation expansion.
   *
   * Delegates to the AST engine since interfaces and `implements` dependency edges
   * are only stored in AST collections (LLM chunks don't have chunkType or edges).
   * Falls back to plain multi-collection search() if no AST engine is available.
   */
  async searchWithInterfaceExpansion(
    query: RetrievalQuery,
    filter: EffectiveFilter,
  ): Promise<RetrievalResult[]> {
    assertEffectiveFilter(filter, 'MultiCollectionSearchEngine.searchWithInterfaceExpansion');
    const astEngine = this.engines.find((e) => e.name === 'ast');
    if (!astEngine) {
      return this.search({ ...query, filter: toQdrantFilter(filter) });
    }
    const results = await astEngine.engine.searchWithInterfaceExpansion(
      { ...query, filter: toQdrantFilter(filter) },
      filter,
    );
    return results.map((r) => ({ ...r, source: 'ast' }));
  }
}
