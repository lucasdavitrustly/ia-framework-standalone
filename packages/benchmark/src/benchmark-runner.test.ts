import { describe, it, expect, vi } from 'vitest';
import { BenchmarkRunner } from './benchmark-runner.js';
import { BenchmarkPreflightError } from './mcp-preflight.js';
import type {
  BenchmarkConfig,
  BenchmarkQuery,
  BenchmarkToolProbe,
  ConfigSnapshot,
} from './types.js';
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

  // --- Model identity enforcement tests ---

  const IDENTITY_BLOCK = `---LLM-IDENTITY---
Model: claude-sonnet-4-5
Provider: anthropic
Temperature: 1.0
---END-IDENTITY---`;

  it('Test 8: rawResponse with matching identity → modelMismatch=false, identityMissing=false', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(
      mockEngine,
      makeConfig({ configuredModel: 'claude-sonnet-4-5' }),
    );
    const queries: BenchmarkQuery[] = [
      {
        id: 'auth',
        query: 'auth middleware',
        expectedFiles: ['src/middleware/auth.ts'],
        rawResponse: `Some answer.\n${IDENTITY_BLOCK}`,
      },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    const qr = result.queries[0]!;
    expect(qr.identityMissing).toBe(false);
    expect(qr.modelMismatch).toBe(false);
  });

  it('Test 9: rawResponse without identity block → identityMissing=true, modelMismatch=undefined', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(
      mockEngine,
      makeConfig({ configuredModel: 'claude-sonnet-4-5' }),
    );
    const queries: BenchmarkQuery[] = [
      {
        id: 'auth',
        query: 'auth middleware',
        expectedFiles: ['src/middleware/auth.ts'],
        rawResponse: 'Some answer without identity block.',
      },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    const qr = result.queries[0]!;
    expect(qr.identityMissing).toBe(true);
    expect(qr.modelMismatch).toBeUndefined();
  });

  it('Test 10: rawResponse with mismatched model → modelMismatch=true', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig({ configuredModel: 'gpt-4o' }));
    const queries: BenchmarkQuery[] = [
      {
        id: 'auth',
        query: 'auth middleware',
        expectedFiles: ['src/middleware/auth.ts'],
        rawResponse: `Some answer.\n${IDENTITY_BLOCK}`,
      },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    const qr = result.queries[0]!;
    expect(qr.modelMismatch).toBe(true);
  });

  it('Test 11: strictModel=true with mismatch → throws Error containing "Model mismatch"', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(
      mockEngine,
      makeConfig({ configuredModel: 'gpt-4o', strictModel: true }),
    );
    const queries: BenchmarkQuery[] = [
      {
        id: 'auth',
        query: 'auth middleware',
        expectedFiles: ['src/middleware/auth.ts'],
        rawResponse: `Some answer.\n${IDENTITY_BLOCK}`,
      },
    ];

    await expect(runner.run(queries, makeConfigSnapshot())).rejects.toThrow('Model mismatch');
  });

  it('Test 12: all queries with matching identity → runIntegrity="full"', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(
      mockEngine,
      makeConfig({ configuredModel: 'claude-sonnet-4-5' }),
    );
    const queries: BenchmarkQuery[] = [
      {
        id: 'q1',
        query: 'auth',
        expectedFiles: ['src/middleware/auth.ts'],
        rawResponse: `Answer.\n${IDENTITY_BLOCK}`,
      },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    expect(result.runIntegrity).toBe('full');
  });

  it('Test 13: any mismatch → runIntegrity="partial"', async () => {
    let callCount = 0;
    const mockEngine = {
      search: vi.fn((): Promise<RetrievalResult[]> => {
        callCount++;
        return Promise.resolve([makeRetrievalResult('src/middleware/auth.ts')]);
      }),
    };
    const runner = new BenchmarkRunner(mockEngine, makeConfig({ configuredModel: 'gpt-4o' }));
    const mismatchIdentity = `---LLM-IDENTITY---
Model: claude-sonnet-4-5
Provider: anthropic
Temperature: 1.0
---END-IDENTITY---`;
    const matchIdentity = `---LLM-IDENTITY---
Model: gpt-4o
Provider: openai
Temperature: 1.0
---END-IDENTITY---`;
    const queries: BenchmarkQuery[] = [
      {
        id: 'q1',
        query: 'auth',
        expectedFiles: ['src/middleware/auth.ts'],
        rawResponse: `Answer.\n${matchIdentity}`,
      },
      {
        id: 'q2',
        query: 'config',
        expectedFiles: ['src/middleware/auth.ts'],
        rawResponse: `Answer.\n${mismatchIdentity}`,
      },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    expect(result.runIntegrity).toBe('partial');
  });

  it('Test 14: no rawResponse on any query → runIntegrity="unknown"', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(
      mockEngine,
      makeConfig({ configuredModel: 'claude-sonnet-4-5' }),
    );
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'auth middleware', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    expect(result.runIntegrity).toBe('unknown');
  });

  it('Test 15: identity block present but Model: field absent → identityMissing=true, modelMismatch=undefined', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(
      mockEngine,
      makeConfig({ configuredModel: 'claude-sonnet-4-5' }),
    );
    const blockWithoutModel = `---LLM-IDENTITY---\nProvider: anthropic\nTemperature: 1.0\n---END-IDENTITY---`;
    const queries: BenchmarkQuery[] = [
      {
        id: 'auth',
        query: 'auth middleware',
        expectedFiles: ['src/middleware/auth.ts'],
        rawResponse: `Some answer.\n${blockWithoutModel}`,
      },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    const qr = result.queries[0]!;
    expect(qr.identityMissing).toBe(true);
    expect(qr.modelMismatch).toBeUndefined();
  });

  it('Test 16: no configuredModel set → runIntegrity is undefined', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries: BenchmarkQuery[] = [
      {
        id: 'auth',
        query: 'auth middleware',
        expectedFiles: ['src/middleware/auth.ts'],
        rawResponse: `Some answer.\n${IDENTITY_BLOCK}`,
      },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    expect(result.runIntegrity).toBeUndefined();
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

  // --- Preflight integration tests ---

  function makeProbe(tool: string, callable: boolean): BenchmarkToolProbe {
    return { tool, available: callable, callable, reason: callable ? undefined : 'not available' };
  }

  function makeAllReadyProbes(): BenchmarkToolProbe[] {
    return [
      makeProbe('search_codebase', true),
      makeProbe('search_codebase_hybrid', true),
      makeProbe('get_file', true),
      makeProbe('get_module_dependencies', true),
      makeProbe('query_database', true),
    ];
  }

  it('Test 17: run() with blocked required tool throws BenchmarkPreflightError', async () => {
    const probes = makeAllReadyProbes();
    probes[0] = makeProbe('search_codebase', false); // block a required tool
    probes[2] = makeProbe('get_file', false); // block its fallback too

    const mockEngine = makeMockSearchEngine([]);
    const preflightProvider = { probe: vi.fn().mockResolvedValue(probes) };
    const runner = new BenchmarkRunner(mockEngine, makeConfig(), undefined, preflightProvider);
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'auth', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    await expect(runner.run(queries, makeConfigSnapshot())).rejects.toThrow(
      BenchmarkPreflightError,
    );
    expect(preflightProvider.probe).toHaveBeenCalledOnce();
  });

  it('Test 18: run() with skipPreflight=true and blocked required tool does NOT throw', async () => {
    const probes = makeAllReadyProbes();
    probes[0] = makeProbe('search_codebase', false);
    probes[2] = makeProbe('get_file', false);

    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const preflightProvider = { probe: vi.fn().mockResolvedValue(probes) };
    const runner = new BenchmarkRunner(mockEngine, makeConfig(), undefined, preflightProvider);
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'auth', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot(), { skipPreflight: true });
    expect(result.queries).toHaveLength(1);
    expect(preflightProvider.probe).not.toHaveBeenCalled();
  });

  it('Test 19: run() with all tools ready proceeds normally', async () => {
    const probes = makeAllReadyProbes();
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const preflightProvider = { probe: vi.fn().mockResolvedValue(probes) };
    const runner = new BenchmarkRunner(mockEngine, makeConfig(), undefined, preflightProvider);
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'auth', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    expect(result.queries).toHaveLength(1);
    expect(result.queries[0]!.hit).toBe(true);
    expect(preflightProvider.probe).toHaveBeenCalledOnce();
  });

  it('Test 20: BenchmarkPreflightError.report contains the full report', async () => {
    const probes = makeAllReadyProbes();
    probes[0] = makeProbe('search_codebase', false);
    probes[2] = makeProbe('get_file', false);

    const mockEngine = makeMockSearchEngine([]);
    const preflightProvider = { probe: vi.fn().mockResolvedValue(probes) };
    const runner = new BenchmarkRunner(mockEngine, makeConfig(), undefined, preflightProvider);
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'auth', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    try {
      await runner.run(queries, makeConfigSnapshot());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BenchmarkPreflightError);
      const prefErr = err as BenchmarkPreflightError;
      expect(prefErr.report.runnable).toBe(false);
      expect(prefErr.report.blockedCount).toBeGreaterThan(0);
      expect(prefErr.message).toContain('Preflight failed');
      expect(prefErr.message).toContain('search_codebase');
    }
  });

  it('Test 21: run() without preflightProvider skips preflight silently', async () => {
    const mockEngine = makeMockSearchEngine([makeRetrievalResult('src/middleware/auth.ts')]);
    const runner = new BenchmarkRunner(mockEngine, makeConfig());
    const queries: BenchmarkQuery[] = [
      { id: 'auth', query: 'auth', expectedFiles: ['src/middleware/auth.ts'] },
    ];

    const result = await runner.run(queries, makeConfigSnapshot());
    expect(result.queries).toHaveLength(1);
  });
});
