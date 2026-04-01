import { describe, it, expect, vi } from 'vitest';
import { BenchmarkRunner } from './benchmark-runner.js';
import type { BenchmarkConfig, BenchmarkQuery, ConfigSnapshot } from './types.js';
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

describe('BenchmarkRunner', () => {
  it('Test 1: run() with expectedFile at position 1 → hit=true, rank=1, reciprocalRank=1.0, hitAtK=1.0, mrr=1.0', async () => {
    const mockEngine = makeMockSearchEngine([
      makeRetrievalResult('src/middleware/auth.ts'),
      makeRetrievalResult('src/utils/token.ts'),
    ]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'authentication middleware', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());

    expect(result.queries).toHaveLength(1);
    const qr = result.queries[0]!;
    expect(qr.hit).toBe(true);
    expect(qr.rank).toBe(1);
    expect(qr.reciprocalRank).toBeCloseTo(1.0, 5);
    expect(result.hitAtK).toBeCloseTo(1.0, 5);
    expect(result.mrr).toBeCloseTo(1.0, 5);
  });

  it('Test 2: run() with expectedFile NOT in top-K → hit=false, rank=Infinity, reciprocalRank=0, hitAtK=0, mrr=0', async () => {
    const mockEngine = makeMockSearchEngine([
      makeRetrievalResult('src/utils/helpers.ts'),
      makeRetrievalResult('src/utils/token.ts'),
    ]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'authentication middleware', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());

    const qr = result.queries[0]!;
    expect(qr.hit).toBe(false);
    expect(qr.rank).toBe(Infinity);
    expect(qr.reciprocalRank).toBe(0);
    expect(result.hitAtK).toBe(0);
    expect(result.mrr).toBe(0);
  });

  it('Test 3: run() with 2 queries (1 hit, 1 miss) → hitAtK=0.5, mrr=0.5', async () => {
    let callCount = 0;
    const mockEngine = {
      search: vi.fn((): Promise<RetrievalResult[]> => {
        callCount++;
        if (callCount === 1) {
          // First query: hit
          return Promise.resolve([makeRetrievalResult('src/middleware/auth.ts')]);
        }
        // Second query: miss
        return Promise.resolve([makeRetrievalResult('src/utils/helpers.ts')]);
      }),
    };
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries: BenchmarkQuery[] = [
      { id: 'q1', query: 'auth middleware', expectedFiles: ['src/middleware/auth.ts'] },
      { id: 'q2', query: 'config loader', expectedFiles: ['src/config/loader.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());

    expect(result.hitAtK).toBeCloseTo(0.5, 5);
    expect(result.mrr).toBeCloseTo(0.5, 5);
  });

  it('Test 4: run() with expectedFile at position 3 → reciprocalRank≈0.333', async () => {
    const mockEngine = makeMockSearchEngine([
      makeRetrievalResult('src/utils/helpers.ts'),
      makeRetrievalResult('src/utils/token.ts'),
      makeRetrievalResult('src/middleware/auth.ts'),
    ]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'authentication middleware', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());

    const qr = result.queries[0]!;
    expect(qr.hit).toBe(true);
    expect(qr.rank).toBe(3);
    expect(qr.reciprocalRank).toBeCloseTo(1 / 3, 5);
  });

  it('Test 5: baseline config (scoreThreshold=2.0) → SearchEngine returns [] → hitAtK=0, mrr=0', async () => {
    const mockEngine = makeMockSearchEngine([]);
    const config = makeConfig({ scoreThreshold: 2.0 });
    const runner = new BenchmarkRunner(mockEngine, config);
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'authentication middleware', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot({ scoreThreshold: 2.0 }));

    expect(result.hitAtK).toBe(0);
    expect(result.mrr).toBe(0);
  });

  it('Test 6: run() returns isBaseline=true when scoreThreshold > 1.0', async () => {
    const mockEngine = makeMockSearchEngine([]);
    const config = makeConfig({ scoreThreshold: 2.0 });
    const runner = new BenchmarkRunner(mockEngine, config);
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'auth middleware', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot({ scoreThreshold: 2.0 }));

    expect(result.isBaseline).toBe(true);
  });

  it('Test 7: latencyMs in QueryResult is >= 0', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'auth middleware', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());

    expect(result.queries[0]!.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
