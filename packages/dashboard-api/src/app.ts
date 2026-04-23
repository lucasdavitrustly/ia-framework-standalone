import { Hono } from 'hono';
import type {
  TotalStats,
  StrategyStats,
  DailyTokenUsage,
  EventsPage,
} from '@ia-framework/observability';
import type { BenchmarkRun } from '@ia-framework/benchmark';
import type { ProjectConfig } from '@ia-framework/core';
import type { CollectionEngine, MultiCollectionSearchEngine } from '@ia-framework/retrieval';
import type { VectorStore } from '@ia-framework/vector-store';
import type { ChunkBrowseEntry } from './routes/tuning-types.js';
import type { SearchHistoryStore } from './search-history-store.js';
import { IndexingStateManager } from './indexing-state.js';
import { statusRouter } from './routes/status.js';
import { configRouter } from './routes/config.js';
import { metricsRouter } from './routes/metrics.js';
import { benchmarksRouter } from './routes/benchmarks.js';
import { indexingRouter } from './routes/indexing.js';
import { dbRouter } from './routes/db.js';
import { searchRouter } from './routes/search.js';
import { analyticsRouter } from './routes/analytics.js';
import { tuningRouter } from './routes/tuning.js';

export interface MetricsStoreDep {
  getTotalStats(): TotalStats;
  getStrategyStats(): StrategyStats[];
  getEventsByDay(): DailyTokenUsage[];
  listEvents(limit: number, offset: number): EventsPage;
}

export interface BenchmarkStoreDep {
  listRuns(limit?: number): BenchmarkRun[];
  getRunById(runId: string): BenchmarkRun | null;
}

export interface AppDependencies {
  metricsStore: MetricsStoreDep;
  benchmarkStore: BenchmarkStoreDep;
  configWatcher: { getConfig(): ProjectConfig | null };
  configPath: string;
  indexingState: IndexingStateManager;
  frameworkDir: string;
  /** Optional fetch override for testing */
  fetchFn?: typeof fetch;
  /** Search dependencies — undefined when no Qdrant collections are available */
  search?: {
    collectionEngines: CollectionEngine[];
    multiSearchEngine: MultiCollectionSearchEngine;
    getCollectionInfo: (collectionName: string) => Promise<{ pointCount: number } | null>;
    baseCollectionName: string;
    searchHistoryStore?: SearchHistoryStore;
    /** Named vector stores for direct Qdrant access (scroll, count) */
    vectorStores?: Map<string, VectorStore>;
  };
}

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();

  const statusDeps = {
    indexingState: deps.indexingState,
    frameworkDir: deps.frameworkDir,
    configWatcher: deps.configWatcher,
    ...(deps.fetchFn !== undefined ? { fetchFn: deps.fetchFn } : {}),
  };

  const statusApp = statusRouter(statusDeps);
  const configApp = configRouter({
    configWatcher: deps.configWatcher,
    configPath: deps.configPath,
  });
  const metricsApp = metricsRouter({ metricsStore: deps.metricsStore });
  const benchmarksApp = benchmarksRouter({ benchmarkStore: deps.benchmarkStore });
  const analyticsApp = analyticsRouter({
    benchmarkStore: deps.benchmarkStore,
    metricsStore: deps.metricsStore,
  });
  const indexingApp = indexingRouter({
    indexingState: deps.indexingState,
    frameworkDir: deps.frameworkDir,
  });

  app.route('/api/status', statusApp);
  app.route('/api/config', configApp);
  app.route('/api/metrics', metricsApp);
  app.route('/api/benchmarks', benchmarksApp);
  app.route('/api/analytics', analyticsApp);
  app.route('/api/indexing', indexingApp);
  app.route('/api/db', dbRouter({ frameworkDir: deps.frameworkDir }));

  if (deps.search) {
    const searchApp = searchRouter(deps.search);
    app.route('/api/search', searchApp);

    if (deps.search.searchHistoryStore) {
      const multiEngine = deps.search.multiSearchEngine;
      const vectorStores = deps.search.vectorStores;
      const baseCollectionName = deps.search.baseCollectionName;

      // Build scrollChunks adapter using raw Qdrant scroll + count
      const scrollChunksAdapter = async (params: {
        collection: string;
        minQuality?: number;
        limit: number;
        offset: number;
      }): Promise<{ entries: ChunkBrowseEntry[]; total: number }> => {
        // Map collection name to actual Qdrant collection
        const collectionName =
          params.collection === 'llm' ? `${baseCollectionName}-llm` : baseCollectionName;

        const vs = vectorStores?.get(collectionName);
        if (!vs) {
          return { entries: [], total: 0 };
        }

        // Build optional quality filter
        const filter =
          params.minQuality !== undefined
            ? {
                must: [
                  {
                    key: 'qualityScore',
                    range: { gte: params.minQuality },
                  },
                ],
              }
            : undefined;

        // Get total count and scroll enough points to cover offset + limit
        // Qdrant scroll uses cursor-based pagination (point ID), not row offset.
        // For simplicity, fetch offset+limit points and slice.
        const fetchCount = params.offset + params.limit;
        const [total, scrollResult] = await Promise.all([
          vs.countPoints(filter),
          vs.scroll({
            limit: fetchCount,
            filter,
          }),
        ]);

        // Slice to get the requested page
        const pagePoints = scrollResult.points.slice(params.offset, params.offset + params.limit);

        const entries: ChunkBrowseEntry[] = pagePoints.map((p) => ({
          chunkId: p.payload.chunkId,
          filePath: p.payload.relativePath,
          startLine: p.payload.startLine,
          endLine: p.payload.endLine,
          chunkType: p.payload.chunkType,
          source: params.collection === 'llm' ? ('llm' as const) : ('ast' as const),
          ...(p.payload.qualityScore !== undefined ? { qualityScore: p.payload.qualityScore } : {}),
          ...(p.payload.name !== undefined ? { name: p.payload.name } : {}),
          content: p.payload.content,
        }));

        return { entries, total };
      };

      const tuningApp = tuningRouter({
        vectorStore: { scrollChunks: scrollChunksAdapter },
        searchHistoryStore: deps.search.searchHistoryStore,
        searchEngine: {
          async search(query) {
            const results = await multiEngine.search(query);
            return results.map((r) => ({
              chunkId: r.chunkId,
              relativePath: r.relativePath,
              startLine: r.startLine,
              endLine: r.endLine,
              score: r.score,
              ...(r.source !== undefined ? { source: r.source } : {}),
              chunkType: r.chunkType,
              content: r.content,
              ...(r.name !== undefined ? { name: r.name } : {}),
            }));
          },
        },
      });
      app.route('/api/tuning', tuningApp);
    }
  }

  return app;
}
