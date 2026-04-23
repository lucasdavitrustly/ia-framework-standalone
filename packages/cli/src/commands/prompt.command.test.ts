import { describe, it, expect } from 'vitest';
import { formatComparisonTable, generateComparisonReport } from './prompt.command.js';
import type { BenchmarkRun } from '@ia-framework/benchmark';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRun(queries: Array<{ id: string; query: string; rr: number }>): BenchmarkRun {
  const queryResults = queries.map((q) => ({
    queryId: q.id,
    query: q.query,
    expectedFiles: ['src/foo.ts'],
    retrievedFiles: q.rr > 0 ? ['src/foo.ts'] : [],
    hit: q.rr > 0,
    rank: q.rr > 0 ? Math.round(1 / q.rr) : Infinity,
    reciprocalRank: q.rr,
    latencyMs: 10,
  }));

  const mrr = queryResults.reduce((sum, q) => sum + q.reciprocalRank, 0) / queryResults.length;

  return {
    runId: 'aaaabbbbccccdddd',
    isBaseline: false,
    configSnapshot: {
      embeddingProvider: 'ollama',
      embeddingModel: 'nomic-embed-text',
      collectionName: 'test',
      topK: 10,
      scoreThreshold: 0.5,
    },
    queries: queryResults,
    hitAtK: queryResults.filter((q) => q.hit).length / queryResults.length,
    mrr,
    avgLatencyMs: 10,
    timestamp: '2026-01-01T00:00:00Z',
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────

const runA = makeRun([
  { id: 'q1', query: 'find auth middleware', rr: 0.5 },
  { id: 'q2', query: 'get user by email', rr: 1.0 },
  { id: 'q3', query: 'vector store setup', rr: 0.0 },
]);

const runB = makeRun([
  { id: 'q1', query: 'find auth middleware', rr: 1.0 },
  { id: 'q2', query: 'get user by email', rr: 0.33 },
  { id: 'q3', query: 'vector store setup', rr: 0.5 },
]);

// ── formatComparisonTable ─────────────────────────────────────────────────────

describe('formatComparisonTable', () => {
  it('contains all query rows', () => {
    const table = formatComparisonTable(runA, runB, 1, 2);
    expect(table).toContain('find auth middleware');
    expect(table).toContain('get user by email');
    expect(table).toContain('vector store setup');
  });

  it('includes MRR column headers for both versions', () => {
    const table = formatComparisonTable(runA, runB, 1, 2);
    expect(table).toContain('MRR-v1');
    expect(table).toContain('MRR-v2');
  });

  it('applies green ANSI code for positive delta', () => {
    // q1: runB(1.0) > runA(0.5) → delta from runA perspective = rr_A - rr_B = 0.5 - 1.0 = -0.5 (negative, red)
    // OR: q2: runA(1.0) > runB(0.33) → delta = 1.0 - 0.33 = +0.67 → green
    const table = formatComparisonTable(runA, runB, 1, 2);
    // q2 has positive delta in runA column
    const GREEN = '\x1b[32m';
    expect(table).toContain(GREEN);
  });

  it('applies red ANSI code for negative delta', () => {
    const table = formatComparisonTable(runA, runB, 1, 2);
    const RED = '\x1b[31m';
    expect(table).toContain(RED);
  });

  it('contains Summary line with both MRR values', () => {
    const table = formatComparisonTable(runA, runB, 1, 2);
    expect(table).toContain('Summary:');
    expect(table).toContain('v1 MRR:');
    expect(table).toContain('v2 MRR:');
    expect(table).toContain('Delta:');
  });
});

// ── generateComparisonReport ──────────────────────────────────────────────────

describe('generateComparisonReport', () => {
  it('contains ## Prompt Comparison header', () => {
    const report = generateComparisonReport(runA, runB, 1, 2);
    expect(report).toContain('## Prompt Comparison');
  });

  it('contains all query rows', () => {
    const report = generateComparisonReport(runA, runB, 1, 2);
    expect(report).toContain('find auth middleware');
    expect(report).toContain('get user by email');
    expect(report).toContain('vector store setup');
  });

  it('has no ANSI escape codes', () => {
    const report = generateComparisonReport(runA, runB, 1, 2);
    // ANSI escape code pattern
    expect(report).not.toMatch(/\x1b\[[0-9;]*m/);
  });

  it('includes Summary with both version MRR values', () => {
    const report = generateComparisonReport(runA, runB, 1, 2);
    expect(report).toContain(`v1 MRR:`);
    expect(report).toContain(`v2 MRR:`);
    expect(report).toContain('Delta:');
  });

  it('includes generated timestamp', () => {
    const report = generateComparisonReport(runA, runB, 1, 2);
    expect(report).toContain('Generated:');
  });
});
