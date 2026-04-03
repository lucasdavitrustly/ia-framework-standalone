import type { SearchEngineConfig, RetrievalQuery, RetrievalResult } from './types.js';

type VectorSearchResult = {
  id: string;
  score: number;
  vectorName: 'text' | 'code';
  payload: {
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
  };
};

function toRetrievalResult(
  raw: VectorSearchResult,
  matchedVector: 'text' | 'code' | 'both',
): RetrievalResult {
  return {
    chunkId: raw.payload.chunkId,
    filePath: raw.payload.filePath,
    relativePath: raw.payload.relativePath,
    language: raw.payload.language,
    chunkType: raw.payload.chunkType,
    name: raw.payload.name,
    content: raw.payload.content,
    startLine: raw.payload.startLine,
    endLine: raw.payload.endLine,
    imports: raw.payload.imports,
    exports: raw.payload.exports,
    score: raw.score,
    matchedVector,
  };
}

/**
 * Semantic search engine that queries both 'text' and 'code' Qdrant vectors,
 * deduplicates results by chunkId (max-score merge), and returns ranked RetrievalResult[].
 */
export class SearchEngine {
  private readonly config: SearchEngineConfig;

  constructor(config: SearchEngineConfig) {
    this.config = config;
  }

  /**
   * Search the indexed codebase using a natural language query.
   * Embeds the query, searches both 'text' and 'code' named vectors,
   * merges results by max-score, and returns top `limit` results.
   */
  async search(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const { embeddingProvider, vectorStore } = this.config;
    const limit = query.limit ?? this.config.defaultLimit ?? 10;
    const scoreThreshold = query.scoreThreshold ?? this.config.defaultScoreThreshold ?? 0.5;
    const searchLimit = limit * 2; // fetch extra to allow dedup

    // Embed the query once (same vector for both searches)
    const queryVector = await embeddingProvider.embed(query.text);

    // Search both named vectors in parallel
    const [textResults, codeResults] = await Promise.all([
      vectorStore.search(queryVector, {
        vectorName: 'text',
        limit: searchLimit,
        scoreThreshold,
        filter: query.filter,
      }),
      vectorStore.search(queryVector, {
        vectorName: 'code',
        limit: searchLimit,
        scoreThreshold,
        filter: query.filter,
      }),
    ]);

    // Merge by chunkId — max-score strategy
    const merged = new Map<string, RetrievalResult>();

    for (const raw of textResults) {
      const { chunkId } = raw.payload;
      merged.set(chunkId, toRetrievalResult(raw, 'text'));
    }

    for (const raw of codeResults) {
      const { chunkId } = raw.payload;
      const existing = merged.get(chunkId);
      if (existing) {
        // Keep the higher score, mark as 'both'
        if (raw.score > existing.score) {
          merged.set(chunkId, toRetrievalResult(raw, 'both'));
        } else {
          existing.matchedVector = 'both';
        }
      } else {
        merged.set(chunkId, toRetrievalResult(raw, 'code'));
      }
    }

    // Sort by score descending, cap at limit
    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Search with optional dependency-graph expansion.
   * 1. Runs base search() to get top results.
   * 2. If a dependencyGraph is configured and hops > 0, resolves neighbor files
   *    via BFS and fetches their chunks from the vector store.
   * 3. Merges expansion chunks (score overridden to 0) after base results,
   *    deduplicating by chunkId.
   *
   * Falls back to plain search() when no dependency graph is configured or hops=0.
   */
  async searchWithExpansion(
    query: RetrievalQuery,
    options?: { hops?: 0 | 1 | 2 },
  ): Promise<RetrievalResult[]> {
    const hops = options?.hops ?? 1;
    const baseResults = await this.search(query);

    // Fall back to plain search when graph is unavailable or hops=0
    if (!this.config.dependencyGraph || hops === 0) {
      return baseResults;
    }

    // Collect unique file paths from base results
    const baseFilePaths = [...new Set(baseResults.map((r) => r.filePath))];
    const baseChunkIds = new Set(baseResults.map((r) => r.chunkId));

    // Get neighbor files from the dependency graph
    const neighborFiles = await this.config.dependencyGraph.getNeighborFiles(
      baseFilePaths,
      hops as 1 | 2,
    );

    // Filter out files that are already represented in base results
    const baseFileSet = new Set(baseFilePaths);
    const newFiles = neighborFiles.filter((f) => !baseFileSet.has(f));

    if (newFiles.length === 0) {
      return baseResults;
    }

    // Fetch chunks for neighbor files using filePath filter
    const expansionChunks = await this.fetchChunksForFiles(newFiles);

    // Deduplicate against base results and set score=0 for expansion chunks
    const expandedResults: RetrievalResult[] = [];
    for (const chunk of expansionChunks) {
      if (!baseChunkIds.has(chunk.chunkId)) {
        baseChunkIds.add(chunk.chunkId);
        expandedResults.push({ ...chunk, score: 0 });
      }
    }

    return [...baseResults, ...expandedResults];
  }

  /**
   * Fetch all chunks for the given file paths from the vector store.
   * Uses a Qdrant filter matching filePath against the provided list.
   */
  private async fetchChunksForFiles(filePaths: string[]): Promise<RetrievalResult[]> {
    const { embeddingProvider, vectorStore } = this.config;

    const filter = {
      should: filePaths.map((fp) => ({
        key: 'filePath',
        match: { value: fp },
      })),
    };

    const zeroVector = new Array<number>(embeddingProvider.dimensions).fill(0);

    const results = await vectorStore.search(zeroVector, {
      vectorName: 'text',
      limit: filePaths.length * 50, // generous limit for multi-file fetch
      filter,
    });

    return results.map((raw) => toRetrievalResult(raw, 'text'));
  }

  /**
   * Retrieve all chunks for a specific file by relative path.
   * Uses a Qdrant filter on relativePath — returns all matching chunks.
   */
  async getFile(relativePath: string): Promise<RetrievalResult[]> {
    const { embeddingProvider, vectorStore } = this.config;

    // Build a filter for the relativePath
    const filter = {
      must: [
        {
          key: 'relativePath',
          match: { value: relativePath },
        },
      ],
    };

    // Use a zero-vector with a high limit to get all chunks for the file
    const zeroVector = new Array<number>(embeddingProvider.dimensions).fill(0);

    const results = await vectorStore.search(zeroVector, {
      vectorName: 'text',
      limit: 1000, // get all chunks for the file
      filter,
    });

    return results.map((raw) => toRetrievalResult(raw, 'text'));
  }
}
