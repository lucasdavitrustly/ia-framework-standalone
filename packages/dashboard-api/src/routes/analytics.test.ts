import { describe, it, expect } from 'vitest';
import type { BenchmarkRun } from '@ia-framework/benchmark';
import type { StrategyStats } from '@ia-framework/observability';
import { analyticsRouter } from './analytics.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeBenchmarkRun(overrides: Partial<BenchmarkRun> = {}): BenchmarkRun {
  return {
    runId: 'run-1',
    isBaseline: false,
    configSnapshot: {
      embeddingProvider: 'ollama',
      embeddingModel: 'nomic-embed-text',
      collectionName: 'ia-framework',
      topK: 10,
      scoreThreshold: 0.3,
    },
    queries: [
      {
        queryId: 'q1',
        query: 'authentication middleware',
        expectedFiles: ['src/auth.ts'],
        retrievedFiles: ['src/auth.ts'],
        hit: true,
        rank: 1,
        reciprocalRank: 1.0,
        latencyMs: 50,
      },
      {
        queryId: 'q2',
        query: 'search engine',
        expectedFiles: ['src/search.ts'],
        retrievedFiles: ['src/other.ts'],
        hit: false,
        rank: Infinity,
        reciprocalRank: 0.0,
        latencyMs: 80,
      },
    ],
    hitAtK: 0.5,
    mrr: 0.5,
    avgLatencyMs: 65,
    timestamp: '2026-04-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeAnalyticsDeps(
  options: {
    runs?: BenchmarkRun[];
    strategyStats?: StrategyStats[];
  } = {},
) {
  const runs = options.runs ?? [];
  const strategyStats = options.strategyStats ?? [];

  return analyticsRouter({
    benchmarkStore: {
      listRuns: (limit = 50) => runs.slice(0, limit),
    },
    metricsStore: {
      getStrategyStats: () => strategyStats,
    },
  });
}

// ─── GET /benchmark-trends ────────────────────────────────────────────────────

describe('GET /benchmark-trends', () => {
  it('returns empty array when no runs exist', async () => {
    const router = makeAnalyticsDeps();
    const res = await router.request('/benchmark-trends');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { trends: unknown[] };
    expect(body.trends).toEqual([]);
  });

  it('returns trend points sorted by timestamp ASC', async () => {
    const run1 = makeBenchmarkRun({
      runId: 'run-1',
      timestamp: '2026-04-01T10:00:00.000Z',
      mrr: 0.4,
      hitAtK: 0.5,
    });
    const run2 = makeBenchmarkRun({
      runId: 'run-2',
      timestamp: '2026-04-02T10:00:00.000Z',
      mrr: 0.7,
      hitAtK: 0.8,
    });
    const router = makeAnalyticsDeps({ runs: [run2, run1] }); // store returns newest first
    const res = await router.request('/benchmark-trends');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      trends: Array<{ runId: string; mrr: number; timestamp: string }>;
    };
    expect(body.trends).toHaveLength(2);
    // sorted ASC by timestamp
    expect(body.trends[0]!.runId).toBe('run-1');
    expect(body.trends[1]!.runId).toBe('run-2');
    expect(body.trends[0]!.mrr).toBe(0.4);
    expect(body.trends[1]!.mrr).toBe(0.7);
  });

  it('includes all required fields in each trend point', async () => {
    const run = makeBenchmarkRun({ runId: 'run-1', label: 'My Run', isBaseline: false });
    const router = makeAnalyticsDeps({ runs: [run] });
    const res = await router.request('/benchmark-trends');
    const body = (await res.json()) as { trends: Array<Record<string, unknown>> };
    const point = body.trends[0]!;
    expect(point).toHaveProperty('runId', 'run-1');
    expect(point).toHaveProperty('label', 'My Run');
    expect(point).toHaveProperty('timestamp', '2026-04-01T10:00:00.000Z');
    expect(point).toHaveProperty('mrr', 0.5);
    expect(point).toHaveProperty('hitAtK', 0.5);
    expect(point).toHaveProperty('avgLatencyMs', 65);
    expect(point).toHaveProperty('collectionName', 'ia-framework');
    expect(point).toHaveProperty('isBaseline', false);
  });

  it('includes promptVersion and promptContentHash when present in configSnapshot', async () => {
    const run = makeBenchmarkRun({
      runId: 'run-pv',
      configSnapshot: {
        embeddingProvider: 'ollama',
        embeddingModel: 'nomic-embed-text',
        collectionName: 'ia-framework',
        topK: 10,
        scoreThreshold: 0.3,
        promptVersion: 3,
        promptContentHash: 'abc123def456',
      },
    });
    const router = makeAnalyticsDeps({ runs: [run] });
    const res = await router.request('/benchmark-trends');
    const body = (await res.json()) as { trends: Array<Record<string, unknown>> };
    const point = body.trends[0]!;
    expect(point).toHaveProperty('promptVersion', 3);
    expect(point).toHaveProperty('promptContentHash', 'abc123def456');
  });

  it('omits promptVersion and promptContentHash for runs without them (retroactive runs)', async () => {
    const run = makeBenchmarkRun({ runId: 'run-old' });
    const router = makeAnalyticsDeps({ runs: [run] });
    const res = await router.request('/benchmark-trends');
    const body = (await res.json()) as { trends: Array<Record<string, unknown>> };
    const point = body.trends[0]!;
    expect(point).not.toHaveProperty('promptVersion');
    expect(point).not.toHaveProperty('promptContentHash');
  });

  it('respects ?limit query param', async () => {
    const runs = Array.from({ length: 10 }, (_, i) =>
      makeBenchmarkRun({ runId: `run-${i}`, timestamp: `2026-04-0${i + 1}T10:00:00.000Z` }),
    );
    const router = makeAnalyticsDeps({ runs });
    const res = await router.request('/benchmark-trends?limit=3');
    const body = (await res.json()) as { trends: unknown[] };
    expect(body.trends).toHaveLength(3);
  });
});

// ─── GET /strategy-comparison ─────────────────────────────────────────────────

describe('GET /strategy-comparison', () => {
  it('returns empty array when no runs exist', async () => {
    const router = makeAnalyticsDeps();
    const res = await router.request('/strategy-comparison');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { strategies: unknown[] };
    expect(body.strategies).toEqual([]);
  });

  it('groups runs by collectionName and computes averages', async () => {
    const astRun1 = makeBenchmarkRun({ runId: 'r1', mrr: 0.4, hitAtK: 0.5, avgLatencyMs: 50 });
    const astRun2 = makeBenchmarkRun({ runId: 'r2', mrr: 0.6, hitAtK: 0.7, avgLatencyMs: 100 });
    const llmRun = makeBenchmarkRun({
      runId: 'r3',
      mrr: 0.8,
      hitAtK: 0.9,
      avgLatencyMs: 200,
      configSnapshot: {
        embeddingProvider: 'ollama',
        embeddingModel: 'nomic-embed-text',
        collectionName: 'ia-framework-llm',
        topK: 10,
        scoreThreshold: 0.3,
      },
    });
    const router = makeAnalyticsDeps({ runs: [astRun1, astRun2, llmRun] });
    const res = await router.request('/strategy-comparison');
    const body = (await res.json()) as {
      strategies: Array<{
        collectionName: string;
        runCount: number;
        avgMrr: number;
        avgHitAtK: number;
        avgLatencyMs: number;
      }>;
    };
    expect(body.strategies).toHaveLength(2);
    const ast = body.strategies.find((s) => s.collectionName === 'ia-framework')!;
    expect(ast.runCount).toBe(2);
    expect(ast.avgMrr).toBeCloseTo(0.5, 5);
    expect(ast.avgHitAtK).toBeCloseTo(0.6, 5);
    expect(ast.avgLatencyMs).toBeCloseTo(75, 5);
    const llm = body.strategies.find((s) => s.collectionName === 'ia-framework-llm')!;
    expect(llm.runCount).toBe(1);
    expect(llm.avgMrr).toBe(0.8);
  });
});

// ─── GET /score-distribution ──────────────────────────────────────────────────

describe('GET /score-distribution', () => {
  it('returns empty array when no runs exist', async () => {
    const router = makeAnalyticsDeps();
    const res = await router.request('/score-distribution');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { distributions: unknown[] };
    expect(body.distributions).toEqual([]);
  });

  it('returns 10 buckets per strategy with correct counts', async () => {
    const run = makeBenchmarkRun({
      queries: [
        {
          queryId: 'q1',
          query: 'a',
          expectedFiles: [],
          retrievedFiles: [],
          hit: true,
          rank: 1,
          reciprocalRank: 1.0,
          latencyMs: 10,
        },
        {
          queryId: 'q2',
          query: 'b',
          expectedFiles: [],
          retrievedFiles: [],
          hit: true,
          rank: 2,
          reciprocalRank: 0.5,
          latencyMs: 10,
        },
        {
          queryId: 'q3',
          query: 'c',
          expectedFiles: [],
          retrievedFiles: [],
          hit: false,
          rank: Infinity,
          reciprocalRank: 0.0,
          latencyMs: 10,
        },
      ],
    });
    const router = makeAnalyticsDeps({ runs: [run] });
    const res = await router.request('/score-distribution');
    const body = (await res.json()) as {
      distributions: Array<{
        collectionName: string;
        buckets: Array<{ bucketStart: number; count: number }>;
        totalQueries: number;
      }>;
    };
    expect(body.distributions).toHaveLength(1);
    const dist = body.distributions[0]!;
    expect(dist.collectionName).toBe('ia-framework');
    expect(dist.buckets).toHaveLength(10);
    expect(dist.totalQueries).toBe(3);
    // reciprocalRank=1.0 → bucket [0.9,1.0] (last bucket)
    const bucket10 = dist.buckets.find((b) => b.bucketStart === 0.9)!;
    expect(bucket10.count).toBe(1);
    // reciprocalRank=0.5 → bucket [0.5,0.6) (floor(0.5*10)=5 → index 5)
    const bucket5 = dist.buckets.find((b) => b.bucketStart === 0.5)!;
    expect(bucket5.count).toBe(1);
    // reciprocalRank=0.0 → bucket [0.0,0.1)
    const bucket1 = dist.buckets.find((b) => b.bucketStart === 0.0)!;
    expect(bucket1.count).toBe(1);
  });

  it('groups distributions by collectionName across multiple runs', async () => {
    const astRun = makeBenchmarkRun({ runId: 'r1' });
    const llmRun = makeBenchmarkRun({
      runId: 'r2',
      configSnapshot: {
        embeddingProvider: 'ollama',
        embeddingModel: 'nomic-embed-text',
        collectionName: 'ia-framework-llm',
        topK: 10,
        scoreThreshold: 0.3,
      },
    });
    const router = makeAnalyticsDeps({ runs: [astRun, llmRun] });
    const res = await router.request('/score-distribution');
    const body = (await res.json()) as { distributions: Array<{ collectionName: string }> };
    expect(body.distributions).toHaveLength(2);
    const names = body.distributions.map((d) => d.collectionName);
    expect(names).toContain('ia-framework');
    expect(names).toContain('ia-framework-llm');
  });
});

// ─── GET /token-breakdown ─────────────────────────────────────────────────────

describe('GET /token-breakdown', () => {
  it('returns empty array when no strategy stats exist', async () => {
    const router = makeAnalyticsDeps();
    const res = await router.request('/token-breakdown');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { breakdown: unknown[] };
    expect(body.breakdown).toEqual([]);
  });

  it('maps StrategyStats to TokenBreakdownEntry', async () => {
    const stats: StrategyStats[] = [
      { strategy: 'mcp', totalQueries: 10, totalTokens: 5000, avgTokensPerQuery: 500 },
      { strategy: 'auto-context', totalQueries: 5, totalTokens: 3000, avgTokensPerQuery: 600 },
    ];
    const router = makeAnalyticsDeps({ strategyStats: stats });
    const res = await router.request('/token-breakdown');
    const body = (await res.json()) as {
      breakdown: Array<{
        strategy: string;
        totalTokens: number;
        avgTokensPerQuery: number;
        totalQueries: number;
      }>;
    };
    expect(body.breakdown).toHaveLength(2);
    const mcp = body.breakdown.find((b) => b.strategy === 'mcp')!;
    expect(mcp.totalTokens).toBe(5000);
    expect(mcp.avgTokensPerQuery).toBe(500);
    expect(mcp.totalQueries).toBe(10);
  });
});
