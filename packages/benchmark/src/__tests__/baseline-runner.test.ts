import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BenchmarkRunner } from '../benchmark-runner.js';
import { BenchmarkStore } from '../benchmark-store.js';
import type { BenchmarkConfig, BenchmarkQuery, ConfigSnapshot } from '../types.js';
import type { RetrievalResult, RetrievalQuery } from '@ia-framework/retrieval';

function makeRetrievalResult(relativePath: string, score = 0.9): RetrievalResult {
  return {
    chunkId: crypto.randomUUID(),
    filePath: `/project/${relativePath}`,
    relativePath,
    language: 'typescript',
    chunkType: 'function',
    name: undefined,
    content: 'export function foo() {}',
    startLine: 1,
    endLine: 5,
    imports: [],
    exports: ['foo'],
    score,
    matchedVector: 'text',
  };
}

function makeConfigSnapshot(overrides?: Partial<ConfigSnapshot>): ConfigSnapshot {
  return {
    embeddingProvider: 'ollama',
    embeddingModel: 'nomic-embed-text',
    collectionName: 'test-project',
    topK: 10,
    scoreThreshold: 0.5,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<BenchmarkConfig>): BenchmarkConfig {
  return {
    topK: 10,
    scoreThreshold: 0.5,
    ...overrides,
  };
}

function makeMockSearchEngine(results: RetrievalResult[]) {
  return {
    search: vi.fn((_query: RetrievalQuery): Promise<RetrievalResult[]> => Promise.resolve(results)),
  };
}

function makeQueries(count = 1): BenchmarkQuery[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `q${i + 1}`,
    query: `query ${i + 1}`,
    expectedFiles: [`src/file${i + 1}.ts`],
  }));
}

describe('BenchmarkRunner.runBaseline()', () => {
  it('calls run() exactly 3 times (search called 3 * numQueries times)', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/file1.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(2);

    await runner.runBaseline(queries, makeConfigSnapshot());

    // 3 runs × 2 queries = 6 search calls
    expect(mockEngine.search).toHaveBeenCalledTimes(6);
  });

  it('returns averaged MRR across 3 runs', async () => {
    let callCount = 0;
    // Alternate hits: run1 MRR=1.0, run2 MRR=0.0, run3 MRR=1.0 → avg = 2/3
    const mockEngine = {
      search: vi.fn((): Promise<RetrievalResult[]> => {
        callCount++;
        // calls 1,2 = run1 (but we have 1 query per run), calls 2,3 alternating hits
        const runNum = Math.ceil(callCount / 1);
        if (runNum === 2) return Promise.resolve([makeRetrievalResult('src/other.ts')]);
        return Promise.resolve([makeRetrievalResult('src/file1.ts')]);
      }),
    };
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);

    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    // run1: hit → MRR=1.0, run2: miss → MRR=0.0, run3: hit → MRR=1.0 → avg=2/3
    expect(baseline.avgMrr).toBeCloseTo(2 / 3, 5);
  });

  it('returns averaged hitAtK across 3 runs', async () => {
    let callCount = 0;
    const mockEngine = {
      search: vi.fn((): Promise<RetrievalResult[]> => {
        callCount++;
        if (callCount === 2) return Promise.resolve([makeRetrievalResult('src/other.ts')]);
        return Promise.resolve([makeRetrievalResult('src/file1.ts')]);
      }),
    };
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);

    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    // run1: hit=1, run2: hit=0, run3: hit=1 → avg=2/3
    expect(baseline.avgHitAtK).toBeCloseTo(2 / 3, 5);
  });

  it('returns averaged avgLatencyMs across 3 runs', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/file1.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);

    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    // All latency values are ≥ 0
    expect(baseline.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('computes stddev=0 when all 3 runs have identical MRR', async () => {
    // All runs hit → MRR = 1.0 for all → stddev = 0
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/file1.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);

    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    expect(baseline.mrrStddev).toBeCloseTo(0, 10);
  });

  it('computes non-zero stddev when runs have different MRR values', async () => {
    let callCount = 0;
    const mockEngine = {
      search: vi.fn((): Promise<RetrievalResult[]> => {
        callCount++;
        // run1: hit (MRR=1), run2: miss (MRR=0), run3: hit (MRR=1) → stddev > 0
        if (callCount === 2) return Promise.resolve([makeRetrievalResult('src/other.ts')]);
        return Promise.resolve([makeRetrievalResult('src/file1.ts')]);
      }),
    };
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);

    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    expect(baseline.mrrStddev).toBeGreaterThan(0);
  });

  it('returns BaselineResult with runs array containing 3 BenchmarkRun objects', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/file1.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);

    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    expect(baseline.runs).toHaveLength(3);
    // Each element should be a BenchmarkRun
    for (const run of baseline.runs) {
      expect(run).toHaveProperty('runId');
      expect(run).toHaveProperty('mrr');
      expect(run).toHaveProperty('hitAtK');
      expect(run).toHaveProperty('queries');
    }
  });

  it('returns BaselineResult with a baselineId UUID', async () => {
    const mockEngine = makeMockSearchEngine([]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);

    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    expect(typeof baseline.baselineId).toBe('string');
    expect(baseline.baselineId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('returns BaselineResult with a valid ISO 8601 timestamp', async () => {
    const mockEngine = makeMockSearchEngine([]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);

    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    expect(() => new Date(baseline.timestamp)).not.toThrow();
    expect(isNaN(new Date(baseline.timestamp).getTime())).toBe(false);
  });

  it('includes configSnapshot in BaselineResult', async () => {
    const mockEngine = makeMockSearchEngine([]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const snap = makeConfigSnapshot({ topK: 5 });
    const queries = makeQueries(1);

    const baseline = await runner.runBaseline(queries, snap);

    expect(baseline.configSnapshot.topK).toBe(5);
  });
});

describe('BenchmarkStore baseline methods', () => {
  let store: BenchmarkStore;

  beforeEach(() => {
    store = new BenchmarkStore(`/tmp/test-baseline-${Date.now()}.sqlite`);
  });

  afterEach(() => {
    store.close();
  });

  it('saveBaseline() saves a BaselineResult to baseline_runs table', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/file1.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);
    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    expect(() => store.saveBaseline(baseline)).not.toThrow();
  });

  it('getLatestBaseline() returns null when no baselines saved', () => {
    const result = store.getLatestBaseline();
    expect(result).toBeNull();
  });

  it('getLatestBaseline() returns the most recently saved baseline', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/file1.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);

    // Save two baselines with different timestamps
    const baseline1 = await runner.runBaseline(queries, makeConfigSnapshot());
    baseline1.timestamp = '2026-01-01T00:00:00.000Z';
    store.saveBaseline(baseline1);

    const baseline2 = await runner.runBaseline(queries, makeConfigSnapshot());
    baseline2.timestamp = '2026-06-01T00:00:00.000Z';
    store.saveBaseline(baseline2);

    const latest = store.getLatestBaseline();
    expect(latest).not.toBeNull();
    expect(latest!.baselineId).toBe(baseline2.baselineId);
  });

  it('saveBaseline() also saves all 3 individual runs via saveRun()', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/file1.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries = makeQueries(1);
    const baseline = await runner.runBaseline(queries, makeConfigSnapshot());

    store.saveBaseline(baseline);

    // Each run should be retrievable by its runId
    for (const run of baseline.runs) {
      const retrieved = store.getRunById(run.runId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.runId).toBe(run.runId);
    }
  });
});
