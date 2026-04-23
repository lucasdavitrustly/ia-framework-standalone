import { Hono } from 'hono';
import type { BenchmarkRun } from '@ia-framework/benchmark';
import type { StrategyStats } from '@ia-framework/observability';
import type {
  BenchmarkTrendPoint,
  StrategyComparisonRow,
  ScoreDistributionEntry,
  ScoreBucket,
  TokenBreakdownEntry,
} from './analytics-types.js';

export interface AnalyticsDeps {
  benchmarkStore: {
    listRuns(limit?: number): BenchmarkRun[];
  };
  metricsStore: {
    getStrategyStats(): StrategyStats[];
  };
}

/** Build 10 fixed buckets [0.0,0.1), [0.1,0.2), …, [0.9,1.0] */
function makeEmptyBuckets(): ScoreBucket[] {
  return Array.from({ length: 10 }, (_, i) => {
    const start = parseFloat((i / 10).toFixed(1));
    const end = parseFloat(((i + 1) / 10).toFixed(1));
    return {
      label: `${start.toFixed(1)}–${end.toFixed(1)}`,
      bucketStart: start,
      bucketEnd: end,
      count: 0,
    };
  });
}

/** Return the bucket index (0–9) for a given reciprocalRank value (0–1) */
function bucketIndex(rr: number): number {
  if (rr >= 1.0) return 9; // include 1.0 in last bucket
  return Math.min(9, Math.floor(rr * 10));
}

export function analyticsRouter(deps: AnalyticsDeps): Hono {
  const app = new Hono();

  // GET /benchmark-trends
  // Returns BenchmarkTrendPoint[] sorted by timestamp ASC
  app.get('/benchmark-trends', (c) => {
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const runs = deps.benchmarkStore.listRuns(isNaN(limit) ? 50 : limit);

    // listRuns returns DESC; reverse to get ASC for chart left-to-right
    const trends: BenchmarkTrendPoint[] = [...runs].reverse().map((run) => {
      const point: BenchmarkTrendPoint = {
        runId: run.runId,
        timestamp: run.timestamp,
        mrr: run.mrr,
        hitAtK: run.hitAtK,
        avgLatencyMs: run.avgLatencyMs,
        collectionName: run.configSnapshot.collectionName,
        isBaseline: run.isBaseline,
      };
      if (run.label !== undefined) {
        point.label = run.label;
      }
      if (run.configSnapshot.promptVersion !== undefined) {
        point.promptVersion = run.configSnapshot.promptVersion;
      }
      if (run.configSnapshot.promptContentHash !== undefined) {
        point.promptContentHash = run.configSnapshot.promptContentHash;
      }
      return point;
    });

    return c.json({ trends });
  });

  // GET /strategy-comparison
  // Groups benchmark runs by collectionName, computes averages
  app.get('/strategy-comparison', (c) => {
    const runs = deps.benchmarkStore.listRuns(1000);

    // Group by collectionName
    const groups = new Map<string, BenchmarkRun[]>();
    for (const run of runs) {
      const name = run.configSnapshot.collectionName;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(run);
    }

    const strategies: StrategyComparisonRow[] = [];
    for (const [collectionName, groupRuns] of groups) {
      const count = groupRuns.length;
      const avgMrr = groupRuns.reduce((sum, r) => sum + r.mrr, 0) / count;
      const avgHitAtK = groupRuns.reduce((sum, r) => sum + r.hitAtK, 0) / count;
      const avgLatencyMs = groupRuns.reduce((sum, r) => sum + r.avgLatencyMs, 0) / count;
      strategies.push({ collectionName, runCount: count, avgMrr, avgHitAtK, avgLatencyMs });
    }

    return c.json({ strategies });
  });

  // GET /score-distribution
  // Bins reciprocalRank values from all query results into 10 buckets per strategy
  app.get('/score-distribution', (c) => {
    const runs = deps.benchmarkStore.listRuns(1000);

    // Accumulate buckets per collectionName
    const bucketMap = new Map<string, ScoreBucket[]>();
    const totalMap = new Map<string, number>();

    for (const run of runs) {
      const name = run.configSnapshot.collectionName;
      if (!bucketMap.has(name)) {
        bucketMap.set(name, makeEmptyBuckets());
        totalMap.set(name, 0);
      }
      const buckets = bucketMap.get(name)!;
      for (const q of run.queries) {
        const idx = bucketIndex(q.reciprocalRank);
        buckets[idx]!.count += 1;
        totalMap.set(name, (totalMap.get(name) ?? 0) + 1);
      }
    }

    const distributions: ScoreDistributionEntry[] = [];
    for (const [collectionName, buckets] of bucketMap) {
      distributions.push({
        collectionName,
        buckets,
        totalQueries: totalMap.get(collectionName) ?? 0,
      });
    }

    return c.json({ distributions });
  });

  // GET /token-breakdown
  // Maps MetricsStore.getStrategyStats() to TokenBreakdownEntry[]
  app.get('/token-breakdown', (c) => {
    const stats = deps.metricsStore.getStrategyStats();
    const breakdown: TokenBreakdownEntry[] = stats.map((s) => ({
      strategy: s.strategy,
      totalTokens: s.totalTokens,
      avgTokensPerQuery: s.avgTokensPerQuery,
      totalQueries: s.totalQueries,
    }));
    return c.json({ breakdown });
  });

  return app;
}
