import { Hono } from 'hono';
import type {
  TotalStats,
  StrategyStats,
  DailyTokenUsage,
  EventsPage,
} from '@ia-framework/observability';
import type { BenchmarkRun } from '@ia-framework/benchmark';
import type { ProjectConfig } from '@ia-framework/core';
import { IndexingStateManager } from './indexing-state.js';
import { statusRouter } from './routes/status.js';
import { configRouter } from './routes/config.js';
import { metricsRouter } from './routes/metrics.js';
import { benchmarksRouter } from './routes/benchmarks.js';
import { indexingRouter } from './routes/indexing.js';
import { dbRouter } from './routes/db.js';

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
  indexingState: IndexingStateManager;
  frameworkDir: string;
  /** Optional fetch override for testing */
  fetchFn?: typeof fetch;
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
  const configApp = configRouter({ configWatcher: deps.configWatcher });
  const metricsApp = metricsRouter({ metricsStore: deps.metricsStore });
  const benchmarksApp = benchmarksRouter({ benchmarkStore: deps.benchmarkStore });
  const indexingApp = indexingRouter({
    indexingState: deps.indexingState,
    frameworkDir: deps.frameworkDir,
  });

  app.route('/api/status', statusApp);
  app.route('/api/config', configApp);
  app.route('/api/metrics', metricsApp);
  app.route('/api/benchmarks', benchmarksApp);
  app.route('/api/indexing', indexingApp);
  app.route('/api/db', dbRouter({ frameworkDir: deps.frameworkDir }));

  return app;
}
