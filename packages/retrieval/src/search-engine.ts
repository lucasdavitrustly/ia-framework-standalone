import type {
  SearchEngineConfig,
  RetrievalQuery,
  RetrievalResult,
  FallbackSearchResult,
  FallbackSuggestion,
} from './types.js';
import { analyzeRetrievalQuery } from './query-intelligence.js';
import { mmrRerank, classifyQueryLambda } from './mmr.js';
import { getRelatedTerms } from './search-synonyms.js';
import { applyElbowTruncation } from './elbow-detection.js';

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
    modulePath?: string | undefined;
    packageName?: string | undefined;
    layerHints?: string[] | undefined;
    indexedAt: string;
    superclass?: string | undefined;
    interfaces?: string[] | undefined;
    isInnerClass?: boolean | undefined;
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
    modulePath: raw.payload.modulePath,
    packageName: raw.payload.packageName,
    layerHints: raw.payload.layerHints,
    superclass: raw.payload.superclass,
    interfaces: raw.payload.interfaces,
    isInnerClass: raw.payload.isInnerClass,
    score: raw.score,
    matchedVector,
  };
}

function normalizePath(value: string | undefined): string {
  return (value ?? '').replace(/\\/g, '/').toLowerCase();
}

function rerankResults(results: RetrievalResult[], query: RetrievalQuery): RetrievalResult[] {
  const intent = analyzeRetrievalQuery(query.text);
  if (
    !intent.symbolTerms.length &&
    !intent.packageTerms.length &&
    !intent.entryPointQuery &&
    !intent.architectureQuery &&
    !intent.dataFlowQuery &&
    !query.preferredModule
  ) {
    return [...results].sort((a, b) => b.score - a.score);
  }

  const preferredModule = normalizePath(query.preferredModule);

  return [...results]
    .map((result) => {
      let bonus = 0;
      const relativePath = normalizePath(result.relativePath);
      const modulePath = normalizePath(result.modulePath);
      const packageName = (result.packageName ?? '').toLowerCase();
      const symbolName = result.name ?? '';
      const layerHints = new Set((result.layerHints ?? []).map((hint) => hint.toLowerCase()));

      for (const symbol of intent.symbolTerms) {
        if (symbolName === symbol) {
          bonus += 0.3;
        } else if (relativePath.includes(symbol.toLowerCase())) {
          bonus += 0.18;
        }
      }

      for (const packageTerm of intent.packageTerms) {
        if (packageName === packageTerm.toLowerCase()) {
          bonus += 0.24;
        } else if (packageName.startsWith(packageTerm.toLowerCase())) {
          bonus += 0.16;
        }
      }

      if (preferredModule && modulePath === preferredModule) {
        bonus += 0.14;
      }

      if (intent.entryPointQuery) {
        if (layerHints.has('config') || layerHints.has('route') || layerHints.has('handler')) {
          bonus += 0.12;
        }
        if (/application|main|server|bootstrap|app\./.test(relativePath)) {
          bonus += 0.12;
        }
      }

      if (intent.architectureQuery || intent.dataFlowQuery) {
        if (layerHints.has('controller')) bonus += 0.1;
        if (layerHints.has('service')) bonus += 0.09;
        if (layerHints.has('repository')) bonus += 0.08;
        if (layerHints.has('model')) bonus += 0.06;
      }

      if (intent.dataFlowQuery && layerHints.has('data')) {
        bonus += 0.05;
      }

      return { result, effectiveScore: result.score + bonus };
    })
    .sort((a, b) => b.effectiveScore - a.effectiveScore)
    .map(({ result }) => result);
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
    const scoreThreshold = query.scoreThreshold ?? this.config.defaultScoreThreshold ?? 0.3;
    const searchLimit = limit * (this.config.mmrCandidateMultiplier ?? 3); // over-fetch for MMR (per D-06)

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

    // Apply MMR for diversity first (uses raw .score), then domain-aware reranking — per D-04, D-08
    const rawCandidates = [...merged.values()].sort((a, b) => b.score - a.score);

    if (this.config.mmrEnabled !== false) {
      const lambda = this.config.mmrLambda ?? classifyQueryLambda(query.text);
      // TODO: Add pino debug log: MMR: {rawCandidates.length} candidates → {limit} results
      const mmrResult = mmrRerank({ candidates: rawCandidates, lambda, limit });
      // Apply domain bonuses after MMR so diversity is not overridden by rerankResults
      const reranked = rerankResults(mmrResult, query);
      // Elbow detection: truncate at significant score drops
      if (this.config.elbowDropThreshold !== undefined) {
        return applyElbowTruncation(reranked, {
          dropThreshold: this.config.elbowDropThreshold,
          minResults: this.config.elbowMinResults ?? 1,
        });
      }
      return reranked;
    }

    const sliced = rerankResults(rawCandidates, query).slice(0, limit);
    if (this.config.elbowDropThreshold !== undefined) {
      return applyElbowTruncation(sliced, {
        dropThreshold: this.config.elbowDropThreshold,
        minResults: this.config.elbowMinResults ?? 1,
      });
    }
    return sliced;
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
    const intent = analyzeRetrievalQuery(query.text);
    const dominantModule =
      query.preferredModule ??
      baseResults.find((result) => result.modulePath)?.modulePath ??
      undefined;

    // Get neighbor files from the dependency graph
    let neighborFiles = await this.config.dependencyGraph.getNeighborFiles(baseFilePaths, hops);

    if ((intent.architectureQuery || intent.dataFlowQuery) && dominantModule) {
      const normalizedModule = normalizePath(dominantModule);
      neighborFiles = [
        ...neighborFiles.filter((filePath) => normalizePath(filePath).includes(normalizedModule)),
        ...neighborFiles.filter((filePath) => !normalizePath(filePath).includes(normalizedModule)),
      ];
    }

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
   * Search with automatic fallback: semantic → hybrid → BM25 keyword-only.
   *
   * Sequence:
   * 1. Primary semantic search (with user threshold)
   * 2. If empty and fallback enabled: hybrid search (no threshold)
   * 3. If still empty: BM25 keyword search via searchKeyword (no threshold)
   * 4. Returns FallbackSearchResult envelope with metadata about which mode succeeded.
   */
  async searchWithFallback(
    query: RetrievalQuery,
    options?: { enableFallback?: boolean; maxSuggestions?: number },
  ): Promise<FallbackSearchResult> {
    const { vectorStore } = this.config;
    const maxSuggestions = options?.maxSuggestions ?? 3;

    // Step 1: primary semantic search
    const primaryResults = await this.search(query);
    if (primaryResults.length > 0) {
      return {
        found: true,
        fallback_used: false,
        fallback_mode: 'none',
        results: primaryResults,
        suggestions: [],
      };
    }

    // No fallback requested
    if (options?.enableFallback === false) {
      return {
        found: false,
        fallback_used: false,
        fallback_mode: 'none',
        results: [],
        suggestions: [],
      };
    }

    // Step 2: hybrid fallback (no scoreThreshold)
    if (vectorStore.searchHybrid) {
      const hybridResults = await this.searchHybrid({ ...query, scoreThreshold: undefined });
      if (hybridResults.length > 0) {
        return {
          found: true,
          fallback_used: true,
          fallback_mode: 'hybrid',
          results: hybridResults,
          suggestions: [],
        };
      }
    }

    // Step 3: BM25 keyword fallback
    if (vectorStore.searchKeyword) {
      const sparseVector = computeTermFrequencySparseVector(query.text);
      const kwRaw = await vectorStore.searchKeyword({
        sparseVector,
        limit: maxSuggestions,
        filter: query.filter,
      });
      const suggestions: FallbackSuggestion[] = kwRaw.slice(0, maxSuggestions).map((r) => ({
        file: r.payload.relativePath,
        name: r.payload.name ?? r.payload.chunkType,
        snippet: r.payload.content.slice(0, 200),
      }));

      // Step 4: Related-concept expansion when keyword also returns nothing
      if (suggestions.length === 0) {
        const relatedTerms = getRelatedTerms(query.text);
        if (relatedTerms.length > 0) {
          for (const term of relatedTerms) {
            const relatedResults = await this.search({
              ...query,
              text: term,
              scoreThreshold: undefined,
            });
            if (relatedResults.length > 0) {
              return {
                found: false,
                fallback_used: true,
                fallback_mode: 'keyword',
                results: [],
                suggestions: [],
                relatedResults: relatedResults.slice(0, 3),
                related_query: term,
              };
            }
          }
        }
      }

      return {
        found: false,
        fallback_used: true,
        fallback_mode: 'keyword',
        results: [],
        suggestions,
      };
    }

    // All fallbacks exhausted (keyword not supported)
    // Step 4: Related-concept expansion
    const relatedTerms = getRelatedTerms(query.text);
    if (relatedTerms.length > 0) {
      for (const term of relatedTerms) {
        const relatedResults = await this.search({
          ...query,
          text: term,
          scoreThreshold: undefined,
        });
        if (relatedResults.length > 0) {
          return {
            found: false,
            fallback_used: true,
            fallback_mode: 'keyword',
            results: [],
            suggestions: [],
            relatedResults: relatedResults.slice(0, 3),
            related_query: term,
          };
        }
      }
    }

    return {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: [],
    };
  }

  /**
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

  /**
   * Hybrid search combining dense text, dense code, and BM25 sparse vectors via RRF fusion.
   * Uses Qdrant's query() API with prefetch + RRF to combine rankings from all three vectors.
   *
   * Falls back to plain search() if the vector store does not support searchHybrid.
   *
   * @param query - RetrievalQuery (same type as search())
   */
  async searchHybrid(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const { embeddingProvider, vectorStore } = this.config;

    // Fall back to plain search if hybrid is not supported by this store
    if (!vectorStore.searchHybrid) {
      return this.search(query);
    }

    const limit = query.limit ?? this.config.defaultLimit ?? 10;

    // Embed the query text into a dense vector
    const denseVector = await embeddingProvider.embed(query.text);

    // Compute TF sparse vector from the query text (client-side BM25 input)
    const sparseVector = computeTermFrequencySparseVector(query.text);

    const results = await vectorStore.searchHybrid({
      denseVector,
      sparseVector,
      limit: limit * (this.config.mmrCandidateMultiplier ?? 3), // over-fetch for MMR (per D-06)
      filter: query.filter,
      keywordPrefetchMultiplier: this.config.keywordPrefetchMultiplier,
      semanticPrefetchMultiplier: this.config.semanticPrefetchMultiplier,
    });

    const rawResults = results.map((raw) => toRetrievalResult(raw, 'both'));

    // Post-retrieval RRF threshold: filter out low-relevance results.
    // RRF scores are rank-based (~0.01–0.03), not cosine (~0–1).
    // query.scoreThreshold overrides config, which defaults to 0.015.
    const rrfThreshold = query.scoreThreshold ?? this.config.defaultRrfScoreThreshold ?? 0.015;
    const thresholded = rawResults.filter((r) => r.score >= rrfThreshold);

    // Apply MMR for diversity first (uses raw .score), then domain-aware reranking — per D-04, D-08
    if (this.config.mmrEnabled !== false) {
      const lambda = this.config.mmrLambda ?? classifyQueryLambda(query.text);
      const mmrResult = mmrRerank({ candidates: thresholded, lambda, limit });
      return rerankResults(mmrResult, query);
    }

    return rerankResults(thresholded, query);
  }
}

/**
 * Compute a term-frequency sparse vector from a text string.
 *
 * Tokenizes the text into lowercase alphanumeric tokens, counts occurrences,
 * and maps each unique token to a stable integer index using a simple hash.
 *
 * Qdrant applies IDF weighting server-side (modifier="idf") — we only need TF here.
 *
 * The hash function maps token strings to 32-bit integers in [0, 2^31-1].
 * Hash collisions (two different tokens mapping to the same index) are handled
 * by summing their TF values so the output always has unique, sorted indices,
 * satisfying Qdrant's sparse vector validation ("indices must be unique").
 */
export function computeTermFrequencySparseVector(text: string): {
  indices: number[];
  values: number[];
} {
  // Tokenize: lowercase, split on non-alphanumeric, filter short tokens
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);

  // Count term frequencies
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  // Map each token to a stable integer index using djb2 hash.
  // Merge collisions by summing their TF values (two different tokens
  // that hash to the same index must produce a single entry, otherwise
  // Qdrant rejects the sparse vector with "indices must be unique").
  const indexMap = new Map<number, number>();
  for (const [token, count] of tf) {
    const idx = djb2Hash(token);
    indexMap.set(idx, (indexMap.get(idx) ?? 0) + count);
  }

  // Sort by index for Qdrant (indices must be sorted ascending)
  const entries = Array.from(indexMap.entries()).sort((a, b) => a[0] - b[0]);

  return {
    indices: entries.map((e) => e[0]),
    values: entries.map((e) => e[1]),
  };
}

/**
 * djb2 hash — fast, simple, good distribution for short strings.
 * Returns a non-negative 31-bit integer.
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash & 0x7fffffff; // clamp to 31 bits (Qdrant max sparse index)
}
