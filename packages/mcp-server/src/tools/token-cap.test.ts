import { describe, it, expect } from 'vitest';
import { estimateTokens, applyTokenCap } from './token-cap.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

function makeResult(overrides: Partial<RetrievalResult> & { content: string }): RetrievalResult {
  return {
    chunkId: overrides.chunkId ?? 'chunk-1',
    content: overrides.content,
    relativePath: overrides.relativePath ?? 'src/foo.ts',
    filePath: overrides.filePath ?? '/project/src/foo.ts',
    score: overrides.score ?? 0.9,
    language: overrides.language ?? 'typescript',
    matchedVector: overrides.matchedVector ?? 'text',
    chunkType: overrides.chunkType ?? 'function',
    startLine: overrides.startLine ?? 1,
    endLine: overrides.endLine ?? 10,
    imports: overrides.imports ?? [],
    exports: overrides.exports ?? [],
    name: overrides.name,
    source: overrides.source,
    expansionSource: overrides.expansionSource,
    superclass: overrides.superclass,
  };
}

describe('estimateTokens', () => {
  it('returns ceil(length / 4) for a simple string', () => {
    // "hello world" = 11 chars → ceil(11/4) = 3
    expect(estimateTokens('hello world')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('handles exact multiples of 4', () => {
    // 8 chars → ceil(8/4) = 2
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('rounds up for non-multiple lengths', () => {
    // 5 chars → ceil(5/4) = 2
    expect(estimateTokens('abcde')).toBe(2);
    // 9 chars → ceil(9/4) = 3
    expect(estimateTokens('abcdefghi')).toBe(3);
  });
});

describe('applyTokenCap', () => {
  it('returns all results when total tokens are under cap (no trim)', () => {
    // 5 results, each 400 chars → 100 tokens each → 500 total < 6000 cap
    const results = Array.from({ length: 5 }, (_, i) =>
      makeResult({ chunkId: `chunk-${i}`, content: 'x'.repeat(400), score: 1 - i * 0.1 }),
    );
    const out = applyTokenCap(results, 6000);
    expect(out.results).toHaveLength(5);
    expect(out.tokenCapApplied).toBe(false);
    expect(out.resultsTrimmed).toBe(0);
    expect(out.totalTokens).toBe(500); // 5 × 100
  });

  it('trims lowest-ranked results when total tokens exceed cap', () => {
    // 10 chunks × 3000 chars = 750 tokens each → total 7500 > 6000
    // At 750 tokens/chunk, 8 fit (8×750=6000), so 2 trimmed
    const results = Array.from({ length: 10 }, (_, i) =>
      makeResult({ chunkId: `chunk-${i}`, content: 'x'.repeat(3000), score: 1 - i * 0.05 }),
    );
    const out = applyTokenCap(results, 6000);
    expect(out.results).toHaveLength(8);
    expect(out.tokenCapApplied).toBe(true);
    expect(out.resultsTrimmed).toBe(2);
    expect(out.totalTokens).toBe(6000); // 8 × 750
  });

  it('always returns at least 1 result even if it alone exceeds cap (minimum guarantee)', () => {
    // Single chunk of 10000 chars → 2500 tokens >> cap of 100
    const results = [makeResult({ chunkId: 'big-chunk', content: 'x'.repeat(10000) })];
    const out = applyTokenCap(results, 100);
    expect(out.results).toHaveLength(1);
    expect(out.tokenCapApplied).toBe(true);
    expect(out.resultsTrimmed).toBe(0);
    expect(out.totalTokens).toBe(2500); // ceil(10000/4)
  });

  it('returns empty results for empty input without applying cap', () => {
    const out = applyTokenCap([], 6000);
    expect(out.results).toHaveLength(0);
    expect(out.tokenCapApplied).toBe(false);
    expect(out.resultsTrimmed).toBe(0);
    expect(out.totalTokens).toBe(0);
  });

  it('returns all results when total tokens exactly equals cap', () => {
    // 4 results × 1000 chars = 250 tokens each → 1000 total == cap 1000
    const results = Array.from({ length: 4 }, (_, i) =>
      makeResult({ chunkId: `chunk-${i}`, content: 'x'.repeat(1000) }),
    );
    const out = applyTokenCap(results, 1000);
    expect(out.results).toHaveLength(4);
    expect(out.tokenCapApplied).toBe(false);
    expect(out.resultsTrimmed).toBe(0);
  });
});
