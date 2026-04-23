import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from './app.js';
import type { AppDependencies } from './app.js';
import { IndexingStateManager } from './indexing-state.js';
import type {
  TotalStats,
  StrategyStats,
  DailyTokenUsage,
  RagEvent,
  EventsPage,
} from '@ia-framework/observability';
import type { BenchmarkRun } from '@ia-framework/benchmark';

function makeRun(overrides: Partial<BenchmarkRun> = {}): BenchmarkRun {
  return {
    runId: crypto.randomUUID(),
    isBaseline: false,
    configSnapshot: {
      embeddingProvider: 'ollama',
      embeddingModel: 'nomic-embed-text',
      collectionName: 'test',
      topK: 10,
      scoreThreshold: 0.5,
    },
    queries: [],
    hitAtK: 0.8,
    mrr: 0.7,
    avgLatencyMs: 50,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<RagEvent> = {}): RagEvent {
  return {
    id: crypto.randomUUID(),
    sessionId: 'session-1',
    query: 'find auth middleware',
    chunksRetrieved: 3,
    chunkIds: ['chunk-a', 'chunk-b'],
    tokenCount: 100,
    strategy: 'mcp',
    timestamp: new Date().toISOString(),
    latencyMs: 42,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AppDependencies> = {}): AppDependencies {
  const indexingState = new IndexingStateManager();

  const totals: TotalStats = {
    totalEvents: 10,
    totalTokens: 5000,
    totalSessions: 2,
    avgTokensPerQuery: 500,
  };

  const byStrategy: StrategyStats[] = [
    { strategy: 'mcp', totalQueries: 10, totalTokens: 5000, avgTokensPerQuery: 500 },
  ];

  const byDay: DailyTokenUsage[] = [{ date: '2026-04-01', totalTokens: 5000, totalQueries: 10 }];

  const events: RagEvent[] = [makeEvent(), makeEvent()];
  const eventsPage: EventsPage = { events, total: 2 };

  const runs: BenchmarkRun[] = [makeRun({ label: 'run-1' })];

  const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

  return {
    metricsStore: {
      getTotalStats: vi.fn().mockReturnValue(totals),
      getStrategyStats: vi.fn().mockReturnValue(byStrategy),
      getEventsByDay: vi.fn().mockReturnValue(byDay),
      listEvents: vi.fn().mockReturnValue(eventsPage),
    },
    benchmarkStore: {
      listRuns: vi.fn().mockReturnValue(runs),
      getRunById: vi
        .fn()
        .mockImplementation((id: string) => runs.find((r) => r.runId === id) ?? null),
    },
    configWatcher: {
      getConfig: vi.fn().mockReturnValue({
        targetProjectPath: '/test/project',
        embedding: { provider: 'ollama', model: 'nomic-embed-text' },
        vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
      }),
    },
    configPath: '/tmp/test-project.json',
    indexingState,
    frameworkDir: '/tmp/.ia-framework',
    fetchFn: mockFetch,
    ...overrides,
  };
}

describe('createApp', () => {
  let deps: AppDependencies;

  beforeEach(() => {
    deps = makeDeps();
  });

  // Test 1: GET /api/status with healthy Qdrant mock → 200, { qdrant: 'ok', indexingInProgress: false }
  it('GET /api/status with healthy Qdrant → 200 with qdrant ok', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      qdrant: string;
      indexingInProgress: boolean;
      timestamp: string;
    };
    expect(body.qdrant).toBe('ok');
    expect(body.indexingInProgress).toBe(false);
    expect(typeof body.timestamp).toBe('string');
  });

  // Test 2: GET /api/status with Qdrant mock that throws → 200, { qdrant: 'error' }
  it('GET /api/status with Qdrant down → 200 with qdrant error', async () => {
    deps = makeDeps({
      fetchFn: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    const app = createApp(deps);
    const res = await app.request('/api/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { qdrant: string };
    expect(body.qdrant).toBe('error');
  });

  // Test 3: GET /api/config with loaded ConfigWatcher mock → 200, returns config object
  it('GET /api/config with loaded config → 200', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { targetProjectPath: string };
    expect(body).toMatchObject({ targetProjectPath: '/test/project' });
  });

  // Test 4: GET /api/config with empty ConfigWatcher mock (null) → 503
  it('GET /api/config with no config → 503', async () => {
    deps = makeDeps({
      configWatcher: { getConfig: vi.fn().mockReturnValue(null) },
      configPath: '/tmp/test-project.json',
    });
    const app = createApp(deps);
    const res = await app.request('/api/config');
    expect(res.status).toBe(503);
  });

  // Test 5: GET /api/metrics → 200, { totals, byStrategy, byDay } from mock MetricsStore
  it('GET /api/metrics → 200 with metrics', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/metrics');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totals: { totalTokens: number };
      byStrategy: unknown[];
      byDay: unknown[];
    };
    expect(body).toHaveProperty('totals');
    expect(body).toHaveProperty('byStrategy');
    expect(body).toHaveProperty('byDay');
    expect(body.totals.totalTokens).toBe(5000);
  });

  // Test 6: GET /api/metrics/events?limit=5 → 200, { events: [...], total: N }
  it('GET /api/metrics/events → 200 with paginated events', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/metrics/events?limit=5');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[]; total: number };
    expect(body).toHaveProperty('events');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.events)).toBe(true);
  });

  // Test 7: GET /api/benchmarks → 200, { runs: [...] } from mock BenchmarkStore
  it('GET /api/benchmarks → 200 with runs', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/benchmarks');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: unknown[] };
    expect(body).toHaveProperty('runs');
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.runs.length).toBe(1);
  });

  // Test 8: GET /api/benchmarks/:runId with valid ID → 200, full BenchmarkRun object
  it('GET /api/benchmarks/:runId with valid ID → 200', async () => {
    const run = makeRun({ runId: 'test-run-id' });
    deps = makeDeps({
      benchmarkStore: {
        listRuns: vi.fn().mockReturnValue([run]),
        getRunById: vi.fn().mockImplementation((id: string) => (id === run.runId ? run : null)),
      },
    });
    const app = createApp(deps);
    const res = await app.request(`/api/benchmarks/${run.runId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runId: string };
    expect(body.runId).toBe(run.runId);
  });

  // Test 9: GET /api/benchmarks/:runId with unknown ID → 404
  it('GET /api/benchmarks/:runId with unknown ID → 404', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/benchmarks/nonexistent');
    expect(res.status).toBe(404);
  });

  // Test 10: GET /api/indexing/status → 200, IndexingState with running=false
  it('GET /api/indexing/status → 200 with running=false', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/indexing/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { running: boolean };
    expect(body.running).toBe(false);
  });

  // Test 13: GET /api/metrics/events?offset=0&limit=10 → pagination works
  it('GET /api/metrics/events with pagination params → calls listEvents with correct args', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/metrics/events?offset=0&limit=10');
    expect(res.status).toBe(200);
    expect(deps.metricsStore.listEvents).toHaveBeenCalledWith(10, 0);
  });

  // Test 14: ConfigWatcher — IndexingStateManager starts with null error and running=false
  it('IndexingStateManager starts with null error and running=false', () => {
    const stateManager = new IndexingStateManager();
    const state = stateManager.getState();
    expect(state.running).toBe(false);
    expect(state.error).toBeNull();
    expect(state.stage).toBeNull();
  });

  // Test: Fallback routes return empty data when search deps are undefined
  it('GET /api/search/history returns empty list when no search deps', async () => {
    const app = createApp(deps); // deps has no search property
    const res = await app.request('/api/search/history');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[]; total: number };
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('GET /api/search/collections returns empty array when no search deps', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/search/collections');
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([]);
  });

  it('GET /api/tuning/chunks returns empty response when no search deps', async () => {
    const app = createApp(deps);
    const res = await app.request('/api/tuning/chunks');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chunks: unknown[]; total: number };
    expect(body.chunks).toEqual([]);
    expect(body.total).toBe(0);
  });

  // Test 15: IndexingStateManager.start() sets running=true; fail() clears running
  it('IndexingStateManager.start() sets running=true; fail() clears running', () => {
    const stateManager = new IndexingStateManager();
    stateManager.start('2026-01-01T00:00:00Z');
    expect(stateManager.getState().running).toBe(true);
    expect(stateManager.getState().startedAt).toBe('2026-01-01T00:00:00Z');

    stateManager.fail('Something went wrong');
    expect(stateManager.getState().running).toBe(false);
    expect(stateManager.getState().error).toBe('Something went wrong');
    expect(stateManager.getState().completedAt).toBeTruthy();
  });
});
