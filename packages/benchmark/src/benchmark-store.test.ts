import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BenchmarkStore } from './benchmark-store.js';
import type { BenchmarkRun, ConfigSnapshot, QueryResult } from './types.js';

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

function makeQueryResult(overrides?: Partial<QueryResult>): QueryResult {
  return {
    queryId: 'q1',
    query: 'authentication middleware',
    expectedFiles: ['src/middleware/auth.ts'],
    retrievedFiles: ['src/middleware/auth.ts', 'src/utils/token.ts'],
    hit: true,
    rank: 1,
    reciprocalRank: 1.0,
    latencyMs: 45,
    ...overrides,
  };
}

function makeRun(overrides?: Partial<BenchmarkRun>): BenchmarkRun {
  const qr = makeQueryResult();
  return {
    runId: crypto.randomUUID(),
    label: 'test run',
    isBaseline: false,
    configSnapshot: makeConfigSnapshot(),
    queries: [qr],
    hitAtK: 1.0,
    mrr: 1.0,
    avgLatencyMs: 45,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('BenchmarkStore', () => {
  let store: BenchmarkStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = `/tmp/test-benchmarks-${Date.now()}.sqlite`;
    store = new BenchmarkStore(dbPath);
  });

  afterEach(() => {
    store.close();
  });

  it('Test 1: constructor creates benchmarks.sqlite with required tables', () => {
    // If the constructor threw, store would not be created — just verify we can query
    const run = makeRun();
    // Saving and retrieving verifies the tables exist
    expect(() => store.saveRun(run)).not.toThrow();
    expect(() => store.getRunById(run.runId)).not.toThrow();
  });

  it('Test 2: saveRun() inserts a BenchmarkRun; getRunById() returns it with correct metrics', () => {
    const run = makeRun({ hitAtK: 0.75, mrr: 0.58, avgLatencyMs: 42 });
    store.saveRun(run);

    const retrieved = store.getRunById(run.runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.runId).toBe(run.runId);
    expect(retrieved!.label).toBe(run.label);
    expect(retrieved!.isBaseline).toBe(false);
    expect(retrieved!.hitAtK).toBeCloseTo(0.75, 5);
    expect(retrieved!.mrr).toBeCloseTo(0.58, 5);
    expect(retrieved!.avgLatencyMs).toBeCloseTo(42, 5);
    expect(retrieved!.configSnapshot.embeddingProvider).toBe('ollama');
    expect(retrieved!.configSnapshot.topK).toBe(10);
  });

  it('Test 3: saveRun() with 3 QueryResults inserts 3 rows in benchmark_query_results', () => {
    const queries: QueryResult[] = [
      makeQueryResult({ queryId: 'q1', query: 'auth', hit: true, rank: 1, reciprocalRank: 1.0 }),
      makeQueryResult({
        queryId: 'q2',
        query: 'config',
        hit: false,
        rank: Infinity,
        reciprocalRank: 0,
      }),
      makeQueryResult({ queryId: 'q3', query: 'types', hit: true, rank: 2, reciprocalRank: 0.5 }),
    ];
    const run = makeRun({ queries, hitAtK: 2 / 3, mrr: 0.5 });
    store.saveRun(run);

    const retrieved = store.getRunById(run.runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.queries).toHaveLength(3);

    const q2 = retrieved!.queries.find((q) => q.queryId === 'q2');
    expect(q2).toBeDefined();
    expect(q2!.hit).toBe(false);
    expect(q2!.rank).toBe(Infinity);
    expect(q2!.reciprocalRank).toBe(0);
  });

  it('Test 4: listRuns() returns runs ordered by timestamp DESC, newest first', () => {
    const run1 = makeRun({
      runId: crypto.randomUUID(),
      timestamp: '2026-01-01T00:00:00.000Z',
      label: 'oldest',
    });
    const run2 = makeRun({
      runId: crypto.randomUUID(),
      timestamp: '2026-06-01T00:00:00.000Z',
      label: 'newest',
    });
    const run3 = makeRun({
      runId: crypto.randomUUID(),
      timestamp: '2026-03-01T00:00:00.000Z',
      label: 'middle',
    });

    store.saveRun(run1);
    store.saveRun(run2);
    store.saveRun(run3);

    const runs = store.listRuns();
    expect(runs).toHaveLength(3);
    expect(runs[0]!.label).toBe('newest');
    expect(runs[1]!.label).toBe('middle');
    expect(runs[2]!.label).toBe('oldest');
  });

  it('Test 5: getRunById() returns null for unknown runId', () => {
    const result = store.getRunById('non-existent-id');
    expect(result).toBeNull();
  });

  it('Test 6: close() releases the database connection without error', () => {
    const run = makeRun();
    store.saveRun(run);
    expect(() => store.close()).not.toThrow();
  });

  it('Test 7: clearRuns() deletes all rows from benchmark_runs and benchmark_query_results', () => {
    const run1 = makeRun({ runId: crypto.randomUUID() });
    const run2 = makeRun({ runId: crypto.randomUUID() });
    store.saveRun(run1);
    store.saveRun(run2);

    // Confirm data exists before clearing
    expect(store.listRuns()).toHaveLength(2);

    store.clearRuns();

    expect(store.listRuns()).toHaveLength(0);
    expect(store.getRunById(run1.runId)).toBeNull();
    expect(store.getRunById(run2.runId)).toBeNull();
  });

  it('Test 8: clearRuns() on an empty store does not throw', () => {
    expect(store.listRuns()).toHaveLength(0);
    expect(() => store.clearRuns()).not.toThrow();
  });

  it('Test 9: saveRun() works normally after clearRuns()', () => {
    const run1 = makeRun({ runId: crypto.randomUUID() });
    store.saveRun(run1);
    store.clearRuns();

    const run2 = makeRun({ runId: crypto.randomUUID() });
    store.saveRun(run2);

    const runs = store.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.runId).toBe(run2.runId);
  });

  it('Test 10: saveRun() persists modelMismatch and identityMissing; getRunById() returns them', () => {
    const query = makeQueryResult({
      queryId: 'q-mismatch',
      modelMismatch: true,
      identityMissing: false,
    });
    const run = makeRun({ queries: [query] });
    store.saveRun(run);

    const retrieved = store.getRunById(run.runId);
    expect(retrieved).not.toBeNull();
    const q = retrieved!.queries.find((q) => q.queryId === 'q-mismatch');
    expect(q).toBeDefined();
    expect(q!.modelMismatch).toBe(true);
    expect(q!.identityMissing).toBe(false);
  });

  it('Test 11: saveRun() persists runIntegrity; getRunById() returns it', () => {
    const run = makeRun({ runIntegrity: 'partial' });
    store.saveRun(run);

    const retrieved = store.getRunById(run.runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.runIntegrity).toBe('partial');
  });

  it('Test 12: modelMismatch and identityMissing are undefined (not null) when not set', () => {
    const run = makeRun();
    store.saveRun(run);

    const retrieved = store.getRunById(run.runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.queries[0]!.modelMismatch).toBeUndefined();
    expect(retrieved!.queries[0]!.identityMissing).toBeUndefined();
  });

  it('Test 13: runIntegrity is undefined when not set', () => {
    const run = makeRun();
    store.saveRun(run);

    const retrieved = store.getRunById(run.runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.runIntegrity).toBeUndefined();
  });
});
