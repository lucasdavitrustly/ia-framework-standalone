import { describe, test, expect } from 'vitest';
import {
  mmrRerank,
  classifyQueryLambda,
  jaccardSimilarity,
  cosineSimilarity,
  type MmrOptions,
} from './mmr.js';
import type { RetrievalResult } from './types.js';

function makeResult(id: string, content: string, score: number): RetrievalResult {
  return {
    chunkId: id,
    filePath: `/src/${id}.ts`,
    relativePath: `src/${id}.ts`,
    language: 'typescript',
    chunkType: 'function',
    content,
    startLine: 1,
    endLine: 10,
    imports: [],
    exports: [id],
    score,
    matchedVector: 'text',
  };
}

describe('cosineSimilarity', () => {
  test('identical vectors return 1.0', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  test('orthogonal vectors return 0.0', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  test('zero vector returns 0', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0);
  });
});

describe('jaccardSimilarity', () => {
  test('computes intersection / union correctly', () => {
    // "foo bar baz" ∩ "foo bar qux" = {foo, bar} = 2, union = {foo, bar, baz, qux} = 4
    expect(jaccardSimilarity('foo bar baz', 'foo bar qux')).toBeCloseTo(0.5);
  });

  test('identical strings return 1.0', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1.0);
  });

  test('no common tokens return 0.0', () => {
    expect(jaccardSimilarity('aaa bbb', 'ccc ddd')).toBe(0.0);
  });

  test('both empty strings return 0', () => {
    expect(jaccardSimilarity('', '')).toBe(0);
  });
});

describe('classifyQueryLambda', () => {
  test('architecture/synthesis query returns 0.5', () => {
    expect(classifyQueryLambda('how do services communicate')).toBe(0.5);
  });

  test('architecture keyword returns 0.5', () => {
    expect(classifyQueryLambda('describe the architecture of this system')).toBe(0.5);
  });

  test('lookup query returns 0.8', () => {
    expect(classifyQueryLambda('find the UserService class')).toBe(0.8);
  });

  test('specific symbol query returns 0.8', () => {
    expect(classifyQueryLambda('where is parseToken defined')).toBe(0.8);
  });
});

describe('mmrRerank', () => {
  test('empty candidates returns []', () => {
    const opts: MmrOptions = { candidates: [], lambda: 0.5, limit: 5 };
    expect(mmrRerank(opts)).toEqual([]);
  });

  test('candidates <= limit returns all reordered by MMR', () => {
    const candidates = [
      makeResult('a', 'alpha beta gamma', 0.9),
      makeResult('b', 'delta epsilon zeta', 0.8),
    ];
    const result = mmrRerank({ candidates, lambda: 0.5, limit: 10 });
    expect(result).toHaveLength(2);
  });

  test('lambda=1.0 orders by pure relevance', () => {
    const candidates = [
      makeResult('low', 'foo bar baz', 0.5),
      makeResult('high', 'qux quux corge', 0.9),
      makeResult('mid', 'grault garply waldo', 0.7),
    ];
    const result = mmrRerank({ candidates, lambda: 1.0, limit: 3 });
    expect(result[0]!.chunkId).toBe('high');
    expect(result[1]!.chunkId).toBe('mid');
    expect(result[2]!.chunkId).toBe('low');
  });

  test('lambda=0.8 first result is highest-relevance candidate', () => {
    const candidates = [
      makeResult('a', 'completely unique tokens alpha', 0.9),
      makeResult('b', 'completely unique tokens beta', 0.7),
      makeResult('c', 'completely unique tokens gamma', 0.5),
    ];
    const result = mmrRerank({ candidates, lambda: 0.8, limit: 3 });
    expect(result[0]!.chunkId).toBe('a');
  });

  test('lambda=0.5 promotes diverse results over redundant ones', () => {
    // 5 near-identical chunks (same tokens) + 2 diverse chunks
    const nearIdentical = [
      makeResult('n1', 'function processUser user data handler process', 0.85),
      makeResult('n2', 'function processUser user data handler process', 0.84),
      makeResult('n3', 'function processUser user data handler process', 0.83),
      makeResult('n4', 'function processUser user data handler process', 0.82),
      makeResult('n5', 'function processUser user data handler process', 0.81),
    ];
    const diverse = [
      makeResult('d1', 'network socket connection stream bytes', 0.75),
      makeResult('d2', 'database query schema migration table', 0.74),
    ];
    const candidates2 = [...nearIdentical, ...diverse];
    const result2 = mmrRerank({ candidates: candidates2, lambda: 0.5, limit: 3 });
    const ids = result2.map((r) => r.chunkId);
    // Diverse chunks should appear in top 3 (after first identical chunk is selected)
    expect(ids.some((id) => id === 'd1' || id === 'd2')).toBe(true);
  });

  test('lambda=0.0 maximizes diversity from selected', () => {
    const candidates3 = [
      makeResult('a', 'apple banana cherry', 0.9),
      makeResult('b', 'apple banana cherry', 0.85), // near-duplicate of a
      makeResult('c', 'xray yankee zulu', 0.7), // diverse
    ];
    const result3 = mmrRerank({ candidates: candidates3, lambda: 0.0, limit: 3 });
    // After selecting 'a', 'b' is penalized; 'c' should come second
    expect(result3[0]!.chunkId).toBe('a'); // any first (all same diversity score initially)
    expect(result3[1]!.chunkId).toBe('c'); // 'c' is most diverse from 'a'
  });
});
