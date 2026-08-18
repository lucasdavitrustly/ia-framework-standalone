import type {
  SearchEngineConfig,
  RetrievalQuery,
  RetrievalResult,
  FallbackSearchResult,
  FallbackSuggestion,
} from './types.js';
import type { ChunkPayload } from '@ia-framework/vector-store';
import { mmrRerank, classifyQueryLambda, jaccardSimilarity } from './mmr.js';
import { getRelatedTerms } from './search-synonyms.js';
import { applyElbowTruncation } from './elbow-detection.js';
import { DependencyGraph } from './dependency-graph.js';
import { FilterOnlyRetrievalError } from '@ia-framework/core';
import type { QueryPlan } from '@ia-framework/core';
import {
  DEFAULT_FILTER_ONLY_CEILING,
  FilterOnlyRetriever,
  type FilterPoint,
} from '@ia-framework/vector-store';
import { assertEffectiveFilter, toQdrantFilter, type EffectiveFilter } from './effective-filter.js';
import { QueryPlanner } from './planning/query-planner.js';

type VectorSearchResult = {
  id: string;
  score: number;
  vectorName: string;
  payload: ChunkPayload;
};

function toRetrievalResult(
  raw: VectorSearchResult,
  matchedVector: string,
  projectRoot?: string,
): RetrievalResult {
  // T078: filePath is no longer stored in Qdrant by the new indexer.
  // Reconstruct absolute path from projectRoot + relativePath.
  // Fall back to stored filePath for backward compat with old-schema collections.
  const filePath =
    raw.payload.filePath ||
    (projectRoot ? `${projectRoot}/${raw.payload.relativePath}` : raw.payload.relativePath);
  const enrichmentFields = {
    description: raw.payload.description,
    businessContext: raw.payload.businessContext,
    semanticTags: raw.payload.semanticTags,
    relationships: raw.payload.relationships,
    enrichedAt: raw.payload.enrichedAt,
    enrichmentModel: raw.payload.enrichmentModel,
  };
  const hasEnrichment = Object.values(enrichmentFields).some((value) => value !== undefined);
  return {
    chunkId: raw.payload.chunkId,
    filePath,
    relativePath: raw.payload.relativePath,
    language: raw.payload.language,
    chunkType: raw.payload.chunkType,
    name: raw.payload.name,
    content: raw.payload.content ?? '',
    contentHash: raw.payload.contentHash,
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
    chunkIndex: raw.payload.chunkIndex,
    totalChunks: raw.payload.totalChunks,
    defines: raw.payload.defines,
    calls: raw.payload.calls,
    calledBy: raw.payload.calledBy,
    repoId: raw.payload.repoId,
    ...(hasEnrichment ? { enrichment: enrichmentFields } : {}),
    signature: raw.payload.signature,
    classSignature: raw.payload.classSignature,
    parentName: raw.payload.parentName,
    parentStartLine: raw.payload.parentStartLine,
    parentEndLine: raw.payload.parentEndLine,
    partIndex: raw.payload.partIndex,
    totalParts: raw.payload.totalParts,
    truncated: raw.payload.truncated,
    stereotype: raw.payload.stereotype,
    archLayer: raw.payload.archLayer,
    docCommentStartLine: raw.payload.docCommentStartLine,
    annotationStartLine: raw.payload.annotationStartLine,
    signatureOnly: raw.payload.signatureOnly,
    score: raw.score,
    scoreType: 'cosine' as const,
    matchedVector,
    ...(raw.payload.dependencyEdges != null
      ? { dependencyEdges: raw.payload.dependencyEdges }
      : {}),
  };
}

function normalizePath(value: string | undefined): string {
  return (value ?? '').replace(/\\/g, '/').toLowerCase();
}

function planSignals(plan: QueryPlan): Set<string> {
  const renderedSignals = plan.representations.signature.match(/^query-signals:(.*)$/m)?.[1] ?? '';
  return new Set(renderedSignals.split(',').filter(Boolean));
}

function rerankResults(
  results: RetrievalResult[],
  query: RetrievalQuery,
  plan: QueryPlan,
): RetrievalResult[] {
  const signals = planSignals(plan);
  if (
    !plan.lexical.exactSymbols.length &&
    !plan.lexical.packageTerms.length &&
    !signals.has('entry-point') &&
    !signals.has('architecture') &&
    !signals.has('data-flow') &&
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

      for (const symbol of plan.lexical.exactSymbols) {
        if (symbolName === symbol) {
          bonus += 0.3;
        } else if (relativePath.includes(symbol.toLowerCase())) {
          bonus += 0.18;
        }
      }

      for (const packageTerm of plan.lexical.packageTerms) {
        if (packageName === packageTerm.toLowerCase()) {
          bonus += 0.24;
        } else if (packageName.startsWith(packageTerm.toLowerCase())) {
          bonus += 0.16;
        }
      }

      if (preferredModule && modulePath === preferredModule) {
        bonus += 0.14;
      }

      if (signals.has('entry-point')) {
        if (layerHints.has('config') || layerHints.has('route') || layerHints.has('handler')) {
          bonus += 0.12;
        }
        if (/application|main|server|bootstrap|app\./.test(relativePath)) {
          bonus += 0.12;
        }
      }

      if (signals.has('architecture') || signals.has('data-flow')) {
        if (layerHints.has('controller')) bonus += 0.1;
        if (layerHints.has('service')) bonus += 0.09;
        if (layerHints.has('repository')) bonus += 0.08;
        if (layerHints.has('model')) bonus += 0.06;
      }

      if (signals.has('data-flow') && layerHints.has('data')) {
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
  private readonly queryPlanner = new QueryPlanner();

  constructor(config: SearchEngineConfig) {
    this.config = config;
  }

  private resolvePlan(query: RetrievalQuery, plan?: QueryPlan): QueryPlan {
    if (plan) return plan;

    const capabilities = this.config.vectorStore.capabilities?.() ?? {
      sparse: Boolean(
        typeof this.config.vectorStore.searchSparse === 'function' ||
          typeof this.config.vectorStore.searchKeyword === 'function' ||
          typeof this.config.vectorStore.searchHybrid === 'function',
      ),
      filterOnly: typeof this.config.vectorStore.scroll === 'function',
      payloadIndexes: [],
    };
    return this.queryPlanner.plan(
      {
        query: query.text,
        ...(query.filter === undefined ? {} : { filter: query.filter }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      },
      capabilities,
    );
  }

  /**
   * T067: Lightweight health check — probes the embedding provider and vector
   * store with a minimal query to verify they are reachable.
   *
   * Called lazily on first `searchWithExpansion()` invocation, but can also
   * be called directly (e.g. on server startup or for operational dashboards).
   *
   * Returns `{ ok: true, latencyMs }` on success or
   * `{ ok: false, error, latencyMs }` on failure (does not throw).
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.config.embeddingProvider.embed('health check probe', 'query');
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Search the indexed codebase using a natural language query.
   *
   * T061: Unified search pipeline.
   * 1. Consume the shared query plan to determine which vectors to search.
   * 2. Embed each selected dense representation from the plan.
   * 3. Search only the branches selected by the plan.
   * 4. Merge by max-score.
   * 5. Apply MMR diversity and domain-aware reranking.
   */
  async search(query: RetrievalQuery, suppliedPlan?: QueryPlan): Promise<RetrievalResult[]> {
    const { embeddingProvider, vectorStore } = this.config;
    const plan = this.resolvePlan(query, suppliedPlan);
    const plannedQuery = { ...query, text: plan.originalQuery };
    const limit = query.limit ?? plan.candidateLimits.retrieval ?? this.config.defaultLimit ?? 10;
    const scoreThreshold = query.scoreThreshold ?? this.config.defaultScoreThreshold ?? 0.3;
    const searchLimit = limit * (this.config.mmrCandidateMultiplier ?? 3); // over-fetch for MMR (per D-06)
    const effectiveFilter = toQdrantFilter(plan.filter);

    // Collect all search promises (dense + optionally sparse/keyword)
    const allSearchPromises: Promise<{ vectorName: string; results: VectorSearchResult[] }>[] = [];

    // Dense vector searches
    for (const vectorName of plan.branches.filter((branch) => branch !== 'sparse')) {
      const queryVector = await embeddingProvider.embed(
        vectorName === 'semantic'
          ? plan.representations.semantic
          : plan.representations.signature,
        'query',
      );
      // SPR-04: reported at the point the call is issued, so provenance describes
      // what executed rather than what was planned.
      query.onBranchExecuted?.(vectorName);
      allSearchPromises.push(
        vectorStore
          .search(queryVector, {
            vectorName,
            limit: searchLimit,
            scoreThreshold,
            filter: effectiveFilter,
          })
          .then((results) => ({ vectorName, results })),
      );
    }

    // T091/T26: execute direct sparse retrieval only when the adapter declares support.
    if (plan.branches.includes('sparse')) {
      const sparseVector = plan.representations.sparse;
      const capabilities = vectorStore.capabilities?.();
      const sparseSupported = capabilities?.sparse ?? typeof vectorStore.searchSparse === 'function';
      if (
        sparseSupported &&
        sparseVector.indices.length > 0 &&
        typeof vectorStore.searchSparse === 'function'
      ) {
        query.onBranchExecuted?.('sparse');
        allSearchPromises.push(
          vectorStore.searchSparse(sparseVector, {
            limit: searchLimit,
            filter: effectiveFilter,
          }).then((results) => ({ vectorName: 'sparse', results })),
        );
      } else if (!capabilities && vectorStore.searchKeyword) {
        // Existing third-party adapters may still expose the pre-T22 method.
        query.onBranchExecuted?.('sparse');
        allSearchPromises.push(
          vectorStore
            .searchKeyword({ sparseVector, limit: searchLimit, filter: effectiveFilter })
            .then((results) => ({ vectorName: 'sparse', results })),
        );
      }
      // Otherwise the branch is SKIPPED: no call is issued and nothing is reported.
    }

    const vectorResults = await Promise.all(allSearchPromises);

    // Merge by chunkId — max-score strategy, tracking which vectors matched
    const merged = new Map<string, RetrievalResult>();

    for (const { vectorName, results } of vectorResults) {
      for (const raw of results) {
        const { chunkId } = raw.payload;
        const existing = merged.get(chunkId);
        if (existing) {
          if (raw.score > existing.score) {
            merged.set(
              chunkId,
              toRetrievalResult(
                raw,
                `${existing.matchedVector}+${vectorName}`,
                this.config.projectRoot,
              ),
            );
          } else {
            existing.matchedVector = `${existing.matchedVector}+${vectorName}`;
          }
        } else {
          merged.set(chunkId, toRetrievalResult(raw, vectorName, this.config.projectRoot));
        }
      }
    }

    // Apply MMR for diversity first (uses raw .score), then domain-aware reranking — per D-04, D-08
    const rawCandidates = [...merged.values()].sort((a, b) => b.score - a.score);

    if (this.config.mmrEnabled !== false) {
      const lambda = this.config.mmrLambda ?? classifyQueryLambda(query.text);
      // T092: when content is absent (lean-payload), jaccardSimilarity on content is always 0,
      // causing MMR to degrade to pure score sort with no diversity. Pass a custom similarityFn
      // that uses relativePath + name + defines as a proxy for content similarity.
      const similarityFn = (a: RetrievalResult, b: RetrievalResult): number => {
        const textA =
          a.content || [a.relativePath, a.name, ...(a.defines ?? [])].filter(Boolean).join(' ');
        const textB =
          b.content || [b.relativePath, b.name, ...(b.defines ?? [])].filter(Boolean).join(' ');
        return jaccardSimilarity(textA, textB);
      };
      const mmrResult = mmrRerank({ candidates: rawCandidates, lambda, limit, similarityFn });
      // Apply domain bonuses after MMR so diversity is not overridden by rerankResults
      const reranked = rerankResults(mmrResult, plannedQuery, plan);
      // Elbow detection: truncate at significant score drops
      if (this.config.elbowDropThreshold !== undefined) {
        return applyElbowTruncation(reranked, {
          dropThreshold: this.config.elbowDropThreshold,
          minResults: this.config.elbowMinResults ?? 1,
        });
      }
      return reranked;
    }

    const sliced = rerankResults(rawCandidates, plannedQuery, plan).slice(0, limit);
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
   *    via SQLite BFS and fetches their chunks from the vector store.
   * 3. T040: Also expands via payload-embedded dependencyEdges (no SQLite required).
   * 4. Merges expansion chunks (score overridden to 0) after base results,
   *    deduplicating by chunkId.
   *
   * Falls back to plain search() when hops=0.
   */
  async searchWithExpansion(
    query: RetrievalQuery,
    effectiveFilter: EffectiveFilter,
    options?: { hops?: 0 | 1 | 2 },
    suppliedPlan?: QueryPlan,
  ): Promise<RetrievalResult[]> {
    assertEffectiveFilter(effectiveFilter, 'SearchEngine.searchWithExpansion');
    const plan = this.resolvePlan(
      { ...query, filter: toQdrantFilter(effectiveFilter) },
      suppliedPlan,
    );
    const hops = options?.hops ?? 1;
    const baseResults = await this.search(
      { ...query, filter: toQdrantFilter(effectiveFilter) },
      plan,
    );

    // Skip expansion entirely when hops=0
    if (hops === 0) {
      return baseResults;
    }

    const baseChunkIds = new Set(baseResults.map((r) => r.chunkId));
    const expandedResults: RetrievalResult[] = [];

    // --- SQLite dependency graph expansion (when graph is configured) ---
    if (this.config.dependencyGraph) {
      // T094: use relativePath for both graph lookup and Qdrant filter — filePath is deprecated
      const baseRelativePaths = [...new Set(baseResults.map((r) => r.relativePath))];
      const dominantModule =
        query.preferredModule ??
        baseResults.find((result) => result.modulePath)?.modulePath ??
        undefined;

      let neighborFiles = await this.config.dependencyGraph.getNeighborFiles(
        baseRelativePaths,
        hops,
        effectiveFilter,
      );

      const signals = planSignals(plan);
      if ((signals.has('architecture') || signals.has('data-flow')) && dominantModule) {
        const normalizedModule = normalizePath(dominantModule);
        neighborFiles = [
          ...neighborFiles.filter((filePath) => normalizePath(filePath).includes(normalizedModule)),
          ...neighborFiles.filter(
            (filePath) => !normalizePath(filePath).includes(normalizedModule),
          ),
        ];
      }

      const baseRelativeSet = new Set(baseRelativePaths);
      const newFiles = neighborFiles.filter((f) => !baseRelativeSet.has(f));

      if (newFiles.length > 0) {
        // T094: use fetchChunksForRelativePaths (relativePath filter) instead of deprecated fetchChunksForFiles
        const sqliteChunks = await this.fetchChunksForRelativePaths(newFiles, effectiveFilter);
        for (const chunk of sqliteChunks) {
          if (!baseChunkIds.has(chunk.chunkId)) {
            baseChunkIds.add(chunk.chunkId);
            expandedResults.push({ ...chunk, score: 0 });
          }
        }
      }
    }

    // --- T040: Payload-edge expansion (works without SQLite graph) ---
    const payloadTargetPaths = DependencyGraph.expandFromPayloadEdges(baseResults, hops);
    if (payloadTargetPaths.length > 0) {
      const payloadChunks = await this.fetchChunksForRelativePaths(
        payloadTargetPaths,
        effectiveFilter,
      );
      for (const chunk of payloadChunks) {
        if (!baseChunkIds.has(chunk.chunkId)) {
          baseChunkIds.add(chunk.chunkId);
          expandedResults.push({ ...chunk, score: 0 });
        }
      }
    }

    return expandedResults.length > 0 ? [...baseResults, ...expandedResults] : baseResults;
  }

  /**
   * T040: Fetch all chunks for the given relative paths from the vector store.
   * Uses filter-only cursor pagination when the adapter exposes scroll().
   */
  private async fetchChunksForRelativePaths(
    relativePaths: string[],
    effectiveFilter: EffectiveFilter,
  ): Promise<RetrievalResult[]> {
    if (relativePaths.length === 0) return [];
    const { vectorStore } = this.config;
    const pathClauses = relativePaths.map((relativePath) => ({
      key: 'relativePath',
      match: { value: relativePath },
    }));
    const userFilters = {
      ...effectiveFilter.userFilters,
      must: [
        ...((effectiveFilter.userFilters.must as unknown[]) ?? []),
        ...(pathClauses.length === 1 ? pathClauses : [{ should: pathClauses }]),
      ],
    };
    const filter = toQdrantFilter({ ...effectiveFilter, userFilters });

    if (vectorStore.scroll) {
      const retriever = this.filterOnlyRetriever();
      const result = await retriever.scrollAll(filter, {
        ceiling: DEFAULT_FILTER_ONLY_CEILING,
      });
      if (result.truncated) {
        throw new FilterOnlyRetrievalError(
          'unknown',
          'fetchChunksForRelativePaths',
          `filter-only result set exceeded ceiling ${DEFAULT_FILTER_ONLY_CEILING}`,
        );
      }
      return result.points.map((point) => this.filterPointToResult(point));
    }
    throw new FilterOnlyRetrievalError(
      'unknown',
      'fetchChunksForRelativePaths',
      'vector store does not support filter-only scrolling',
    );
  }

  /**
   * Returns chunks ordered by chunkIndex. Useful for expanding context around a match.
   */
  async getAdjacentChunks(
    relativePath: string,
    chunkIndex: number,
    totalChunks: number,
    effectiveFilter: EffectiveFilter,
    radius: number = 1,
  ): Promise<RetrievalResult[]> {
    assertEffectiveFilter(effectiveFilter, 'SearchEngine.getAdjacentChunks');
    const { vectorStore } = this.config;

    // Compute adjacent indices within bounds
    const indices: number[] = [];
    for (let i = chunkIndex - radius; i <= chunkIndex + radius; i++) {
      if (i >= 0 && i < totalChunks && i !== chunkIndex) {
        indices.push(i);
      }
    }
    if (indices.length === 0) return [];

    const filter = toQdrantFilter({
      ...effectiveFilter,
      userFilters: {
        ...effectiveFilter.userFilters,
        must: [
          ...((effectiveFilter.userFilters.must as unknown[]) ?? []),
          { key: 'relativePath', match: { value: relativePath } },
          { key: 'chunkIndex', match: { any: indices } },
        ],
      },
    });

    let results: RetrievalResult[];
    if (vectorStore.scroll) {
      const result = await this.filterOnlyRetriever().scrollAll(filter, {
        ceiling: DEFAULT_FILTER_ONLY_CEILING,
      });
      if (result.truncated) {
        throw new FilterOnlyRetrievalError(
          'unknown',
          'getAdjacentChunks',
          `filter-only result set exceeded ceiling ${DEFAULT_FILTER_ONLY_CEILING}`,
        );
      }
      results = result.points.map((point) => ({
        ...this.filterPointToResult(point),
        expansionSource: 'adjacent' as const,
      }));
    } else {
      throw new FilterOnlyRetrievalError(
        'unknown',
        'getAdjacentChunks',
        'vector store does not support filter-only scrolling',
      );
    }

    return results.sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));
  }

  private filterOnlyRetriever(): FilterOnlyRetriever {
    const { vectorStore } = this.config;
    if (!vectorStore.scroll) {
      throw new Error('Vector store does not support filter-only scrolling');
    }
    // Bind rather than detach: the concrete adapter's scroll() uses `this`.
    const scroll = vectorStore.scroll.bind(vectorStore);
    return new FilterOnlyRetriever({
      scroll: async (filter, limit, offset) => {
        const page = await scroll({
          limit,
          ...(offset === undefined ? {} : { offset }),
          filter,
        });
        return { points: page.points as FilterPoint[], nextOffset: page.nextOffset };
      },
      retrieve: () => Promise.resolve([]),
    });
  }

  private filterPointToResult(point: FilterPoint): RetrievalResult {
    return toRetrievalResult(
      {
        id: point.id,
        score: 0,
        vectorName: 'semantic',
        payload: point.payload,
      },
      'semantic',
      this.config.projectRoot,
    );
  }

  /**
   * Expand call chain: given results with `calls` or `calledBy` metadata,
   * fetch chunks that define the called methods or callers.
   * Uses the `defines` payload field to find related chunks.
   */
  async expandCallChain(
    results: RetrievalResult[],
    effectiveFilter: EffectiveFilter,
    direction: 'calls' | 'calledBy' | 'both' = 'both',
  ): Promise<RetrievalResult[]> {
    assertEffectiveFilter(effectiveFilter, 'SearchEngine.expandCallChain');
    const { vectorStore } = this.config;

    // Collect method names to look up
    const targetNames = new Set<string>();
    for (const r of results) {
      const payload = r as RetrievalResult & { calls?: string[]; calledBy?: string[] };
      if ((direction === 'calls' || direction === 'both') && payload.calls) {
        for (const name of payload.calls) targetNames.add(name);
      }
      if ((direction === 'calledBy' || direction === 'both') && payload.calledBy) {
        for (const name of payload.calledBy) targetNames.add(name);
      }
    }

    if (targetNames.size === 0) return [];

    // Search for chunks that define these methods
    const filter = toQdrantFilter({
      ...effectiveFilter,
      userFilters: {
        ...effectiveFilter.userFilters,
        must: [
          ...((effectiveFilter.userFilters.must as unknown[]) ?? []),
          { key: 'defines', match: { any: [...targetNames] } },
        ],
      },
    });

    let hits: RetrievalResult[];
    if (vectorStore.scroll) {
      const result = await this.filterOnlyRetriever().scrollAll(filter, {
        ceiling: DEFAULT_FILTER_ONLY_CEILING,
      });
      if (result.truncated) {
        throw new FilterOnlyRetrievalError(
          'unknown',
          'expandCallChain',
          `filter-only result set exceeded ceiling ${DEFAULT_FILTER_ONLY_CEILING}`,
        );
      }
      hits = result.points.map((point) => this.filterPointToResult(point));
    } else {
      throw new FilterOnlyRetrievalError(
        'unknown',
        'expandCallChain',
        'vector store does not support filter-only scrolling',
      );
    }

    return hits.map((r) => ({ ...r, expansionSource: 'call-chain' as const }));
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
    suppliedPlan?: QueryPlan,
  ): Promise<FallbackSearchResult> {
    const { vectorStore } = this.config;
    const plan = this.resolvePlan(query, suppliedPlan);
    const maxSuggestions = options?.maxSuggestions ?? 3;

    // Step 1: primary semantic search
    const primaryResults = await this.search(query, plan);
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
      const hybridResults = await this.searchHybrid(
        { ...query, scoreThreshold: undefined },
        plan,
      );
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
    const capabilities = vectorStore.capabilities?.();
    const sparseSupported = capabilities?.sparse ?? typeof vectorStore.searchSparse === 'function';
    const sparseVector = plan.representations.sparse;
    const sparseSearch =
      sparseSupported && vectorStore.searchSparse
        ? await vectorStore.searchSparse(sparseVector, {
            limit: maxSuggestions,
            filter: toQdrantFilter(plan.filter),
          })
        : !capabilities && vectorStore.searchKeyword
          ? await vectorStore.searchKeyword({
              sparseVector,
              limit: maxSuggestions,
              filter: toQdrantFilter(plan.filter),
            })
          : undefined;
    if (sparseSearch) {
      const kwRaw = sparseSearch;
      const suggestions: FallbackSuggestion[] = kwRaw.slice(0, maxSuggestions).map((r) => ({
        file: r.payload.relativePath,
        name: r.payload.name ?? r.payload.chunkType,
        snippet: (r.payload.content ?? '').slice(0, 200),
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

    // T068: Step 5 — glob/grep scroll fallback when keyword search not supported
    const scrollResults = await this.scrollFallback(query.text, toQdrantFilter(plan.filter));
    if (scrollResults.length > 0) {
      return {
        found: true,
        fallback_used: true,
        fallback_mode: 'keyword',
        results: scrollResults,
        suggestions: [],
      };
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
   * T068: Zero-result fallback using scroll — glob for path-like queries, grep for identifiers.
   * Called internally when all other fallback mechanisms return empty results.
   *
   * - Path-like (contains `/` or has file extension): scroll and filter by relativePath fragment.
   * - Identifier-like (CamelCase, dot.notation): scroll and filter by exact `name` match.
   */
  private async scrollFallback(
    query: string,
    filter?: Record<string, unknown>,
  ): Promise<RetrievalResult[]> {
    const { vectorStore } = this.config;
    if (!vectorStore.scroll) return [];

    const isQualifiedSymbol =
      /^[A-Za-z_$][\w$]*(?:\.|::)[A-Za-z_$][\w$]*$/.test(query);
    const isPathLike = !isQualifiedSymbol && (query.includes('/') || /\.\w{1,5}$/.test(query));
    const isIdentifierLike =
      isQualifiedSymbol ||
      /^[A-Z][a-zA-Z0-9]*$/.test(query) ||
      /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(query);

    if (!isPathLike && !isIdentifierLike) return [];

    // Page through a bounded number of chunks. A single first page can miss an
    // exact path/name match in a large collection, which defeats this fallback.
    const points: Array<{ id: string; payload: ChunkPayload }> = [];
    let offset: string | number | undefined;
    let pages = 0;
    do {
      const scrollResult = await vectorStore.scroll({
        limit: 200,
        filter,
        ...(offset === undefined ? {} : { offset }),
      });
      points.push(...scrollResult.points);
      offset = scrollResult.nextOffset;
      pages++;
    } while (offset !== undefined && pages < 50);

    let matched: typeof points;

    if (isPathLike) {
      // Glob: find chunks whose relativePath contains any fragment of the query
      const fragment = query.split('/').pop()!; // basename or last segment
      matched = points.filter((p) => p.payload.relativePath?.includes(fragment));
    } else {
      // Grep: support dotted identifiers by matching the final symbol as well
      // as the complete name/defines value.
      const identifier = query.split(/\.|::/).pop() ?? query;
      matched = points.filter(
        (p) =>
          p.payload.name === query ||
          p.payload.name === identifier ||
          p.payload.defines?.includes(query) === true ||
          p.payload.defines?.includes(identifier) === true,
      );
    }

    return matched.slice(0, 5).map((p) =>
      toRetrievalResult(
        {
          id: String(p.id),
          score: 0,
          vectorName: 'glob-grep',
          payload: p.payload,
        },
        'glob-grep',
        this.config.projectRoot,
      ),
    );
  }

  /**
   * Uses a Qdrant filter on relativePath — returns all matching chunks.
   *
   * In multi-repo collections the same `relativePath` can exist in several
   * repos. Pass `repoId` to scope the lookup to a single repo, avoiding
   * cross-repo chunk bleed.
   */
  async getFile(
    relativePath: string,
    effectiveFilter: EffectiveFilter,
  ): Promise<RetrievalResult[]> {
    assertEffectiveFilter(effectiveFilter, 'SearchEngine.getFile');
    const { vectorStore } = this.config;

    // Build a filter for the relativePath, optionally scoped to a repo.
    const filter = toQdrantFilter({
      ...effectiveFilter,
      userFilters: {
        ...effectiveFilter.userFilters,
        must: [
          ...((effectiveFilter.userFilters.must as unknown[]) ?? []),
          { key: 'relativePath', match: { value: relativePath } },
        ],
      },
    });

    if (vectorStore.scroll) {
      const result = await this.filterOnlyRetriever().scrollAll(filter, {
        ceiling: DEFAULT_FILTER_ONLY_CEILING,
      });
      if (result.truncated) {
        throw new FilterOnlyRetrievalError(
          'unknown',
          'getFile',
          `filter-only result set exceeded ceiling ${DEFAULT_FILTER_ONLY_CEILING}`,
        );
      }
      return result.points.map((point) => this.filterPointToResult(point));
    }
    throw new FilterOnlyRetrievalError(
      'unknown',
      'getFile',
      'vector store does not support filter-only scrolling',
    );
  }

  /**
   * Hybrid search combining dense text, dense code, and BM25 sparse vectors via RRF fusion.
   * Uses Qdrant's query() API with prefetch + RRF to combine rankings from all three vectors.
   *
   * Falls back to plain search() if the vector store does not support searchHybrid.
   *
   * @param query - RetrievalQuery (same type as search())
   */
  async searchHybrid(query: RetrievalQuery, suppliedPlan?: QueryPlan): Promise<RetrievalResult[]> {
    const { embeddingProvider, vectorStore } = this.config;
    const plan = this.resolvePlan(query, suppliedPlan);

    // Fall back to plain search if hybrid is not supported by this store
    if (!vectorStore.searchHybrid) {
      return this.search(query, plan);
    }

    const limit = query.limit ?? this.config.defaultLimit ?? 10;

    const semanticVector = await embeddingProvider.embed(plan.representations.semantic, 'query');
    const signatureVector = await embeddingProvider.embed(plan.representations.signature, 'query');

    const results = await vectorStore.searchHybrid({
      semanticVector,
      signatureVector,
      ...(plan.branches.includes('sparse')
        ? { sparseVector: plan.representations.sparse }
        : {}),
      limit: limit * (this.config.mmrCandidateMultiplier ?? 3), // over-fetch for MMR (per D-06)
      filter: toQdrantFilter(plan.filter),
      keywordPrefetchMultiplier: this.config.keywordPrefetchMultiplier,
      semanticPrefetchMultiplier: this.config.semanticPrefetchMultiplier,
    });

    const rawResults = results
      .filter((raw) => {
        const stereotype = raw.payload as { stereotype?: string };
        return !(stereotype.stereotype === 'test' && plan.filter.excludeTests);
      })
      .map((raw) => ({
        ...toRetrievalResult(raw, 'both', this.config.projectRoot),
        scoreType: 'rrf' as const,
      }));

    // Post-retrieval RRF threshold: filter out low-relevance results.
    // RRF scores are rank-based (~0.01–0.03), not cosine (~0–1).
    // query.scoreThreshold overrides config, which defaults to 0.015.
    const rrfThreshold = query.scoreThreshold ?? this.config.defaultRrfScoreThreshold ?? 0.015;
    const thresholded = rawResults.filter((r) => r.score >= rrfThreshold);

    // Apply MMR for diversity first (uses raw .score), then domain-aware reranking — per D-04, D-08
    if (this.config.mmrEnabled !== false) {
      const lambda = this.config.mmrLambda ?? classifyQueryLambda(query.text);
      const similarityFn = (a: RetrievalResult, b: RetrievalResult): number => {
        const textA =
          a.content || [a.relativePath, a.name, ...(a.defines ?? [])].filter(Boolean).join(' ');
        const textB =
          b.content || [b.relativePath, b.name, ...(b.defines ?? [])].filter(Boolean).join(' ');
        return jaccardSimilarity(textA, textB);
      };
      const mmrResult = mmrRerank({ candidates: thresholded, lambda, limit, similarityFn });
      const reranked = rerankResults(mmrResult, query, plan);
      if (this.config.elbowDropThreshold !== undefined) {
        return applyElbowTruncation(reranked, {
          dropThreshold: this.config.elbowDropThreshold,
          minResults: this.config.elbowMinResults ?? 1,
        });
      }
      return reranked;
    }

    const reranked = rerankResults(thresholded, query, plan);
    if (this.config.elbowDropThreshold !== undefined) {
      return applyElbowTruncation(reranked, {
        dropThreshold: this.config.elbowDropThreshold,
        minResults: this.config.elbowMinResults ?? 1,
      });
    }
    return reranked;
  }

  /**
   * T136: Search with automatic interface implementation expansion.
   *
   * 1. Runs base search() to get top results.
   * 2. Identifies interface results (chunkType === 'interface').
   * 3. For each interface, searches for implementations via dependency edges
   *    (chunks that have `dependencyEdges[].relation === 'implements'` targeting
   *    the interface's relativePath).
   * 4. Appends unique implementations to the result set (deduplicates by chunkId).
   *
   * This eliminates the need for follow-up searches when an interface is found
   * but its implementation is not in the top results.
   */
  async searchWithInterfaceExpansion(
    query: RetrievalQuery,
    effectiveFilter: EffectiveFilter,
  ): Promise<RetrievalResult[]> {
    assertEffectiveFilter(effectiveFilter, 'SearchEngine.searchWithInterfaceExpansion');
    const baseResults = await this.search({ ...query, filter: toQdrantFilter(effectiveFilter) });

    // Identify interface results
    const interfaceResults = baseResults.filter((r) => r.chunkType === 'interface');

    if (interfaceResults.length === 0) {
      return baseResults;
    }

    const baseChunkIds = new Set(baseResults.map((r) => r.chunkId));
    const expandedResults: RetrievalResult[] = [];

    for (const ifaceResult of interfaceResults) {
      const implChunks = await this.findImplementations(ifaceResult.relativePath, effectiveFilter);
      for (const chunk of implChunks) {
        if (!baseChunkIds.has(chunk.chunkId)) {
          baseChunkIds.add(chunk.chunkId);
          expandedResults.push({ ...chunk, score: 0, expansionSource: 'interface-impl' });
        }
      }
    }

    return expandedResults.length > 0 ? [...baseResults, ...expandedResults] : baseResults;
  }

  /**
   * Find chunks that implement a given interface by searching for dependency edges
   * with `relation: 'implements'` targeting the interface's relativePath.
   */
  private async findImplementations(
    interfaceRelativePath: string,
    effectiveFilter: EffectiveFilter,
  ): Promise<RetrievalResult[]> {
    assertEffectiveFilter(effectiveFilter, 'SearchEngine.findImplementations');
    const { vectorStore } = this.config;

    // Use Qdrant nested filter to find chunks with implements edge targeting this interface
    const filter = toQdrantFilter({
      ...effectiveFilter,
      userFilters: {
        ...effectiveFilter.userFilters,
        must: [
          ...((effectiveFilter.userFilters.must as unknown[]) ?? []),
          {
            nested: {
              key: 'dependencyEdges',
              filter: {
                must: [
                  { key: 'targetPath', match: { value: interfaceRelativePath } },
                  { key: 'relation', match: { value: 'implements' } },
                ],
              },
            },
          },
        ],
      },
    });

    if (vectorStore.scroll) {
      const result = await this.filterOnlyRetriever().scrollAll(filter, {
        ceiling: DEFAULT_FILTER_ONLY_CEILING,
      });
      if (result.truncated) {
        throw new FilterOnlyRetrievalError(
          'unknown',
          'findImplementations',
          `filter-only result set exceeded ceiling ${DEFAULT_FILTER_ONLY_CEILING}`,
        );
      }
      return result.points.map((point) => this.filterPointToResult(point));
    }
    throw new FilterOnlyRetrievalError(
      'unknown',
      'findImplementations',
      'vector store does not support filter-only scrolling',
    );
  }
}
