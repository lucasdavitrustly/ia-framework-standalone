import { describe, it, expect } from 'vitest';
import { rrfMerge } from './rrf.js';
import type { RankedList } from './rrf.js';
import type { RetrievalResult } from './types.js';

function makeResult(
  overrides: Partial<RetrievalResult> & { chunkId: string; score: number },
): RetrievalResult {
  return {
    filePath: '/test/file.ts',
    relativePath: 'test/file.ts',
    language: 'typescript',
    chunkType: 'function',
    content: 'test content',
    startLine: 1,
    endLine: 10,
    imports: [],
    exports: [],
    matchedVector: 'text',
    ...overrides,
  };
}

describe('rrfMerge', () => {
  const k = 60;

  it('Test 1: single list preserves original scores (no RRF conversion — fusion is meaningless)', () => {
    const r1 = makeResult({ chunkId: 'a', score: 0.9 });
    const r2 = makeResult({ chunkId: 'b', score: 0.8 });
    const r3 = makeResult({ chunkId: 'c', score: 0.7 });

    const lists: RankedList[] = [{ source: 'ast', results: [r1, r2, r3] }];
    const result = rrfMerge(lists, 10);

    expect(result).toHaveLength(3);
    // Original cosine scores preserved — NOT replaced with 1/(60+rank+1)
    expect(result[0]!.score).toBe(0.9);
    expect(result[1]!.score).toBe(0.8);
    expect(result[2]!.score).toBe(0.7);
    // Order preserved
    expect(result[0]!.chunkId).toBe('a');
    expect(result[1]!.chunkId).toBe('b');
    expect(result[2]!.chunkId).toBe('c');
    // Source tag applied
    expect(result[0]!.source).toBe('ast');
  });

  it('Test 2: two lists with no overlapping chunkIds returns all results sorted by RRF score', () => {
    const r1 = makeResult({ chunkId: 'a', score: 0.9 });
    const r2 = makeResult({ chunkId: 'b', score: 0.8 });
    const r3 = makeResult({ chunkId: 'c', score: 0.7 });
    const r4 = makeResult({ chunkId: 'd', score: 0.6 });

    const lists: RankedList[] = [
      { source: 'ast', results: [r1, r2] },
      { source: 'llm', results: [r3, r4] },
    ];
    const result = rrfMerge(lists, 10);

    expect(result).toHaveLength(4);
    // a (rank 0 in list1): 1/61, c (rank 0 in list2): 1/61, b (rank 1): 1/62, d (rank 1): 1/62
    // Both 'a' and 'c' have score 1/61 — order between them may be stable or insertion-order
    const chunkIds = result.map((r: RetrievalResult) => r.chunkId);
    expect(chunkIds).toContain('a');
    expect(chunkIds).toContain('b');
    expect(chunkIds).toContain('c');
    expect(chunkIds).toContain('d');
    // First two should have higher scores than last two
    expect(result[0]!.score).toBeCloseTo(1 / (k + 0 + 1), 10);
    expect(result[1]!.score).toBeCloseTo(1 / (k + 0 + 1), 10);
    expect(result[2]!.score).toBeCloseTo(1 / (k + 1 + 1), 10);
    expect(result[3]!.score).toBeCloseTo(1 / (k + 1 + 1), 10);
  });

  it('Test 3: two lists with one overlapping chunkId produces summed RRF scores', () => {
    const r1 = makeResult({ chunkId: 'shared', score: 0.9 });
    const r2 = makeResult({ chunkId: 'b', score: 0.8 });
    const r3 = makeResult({ chunkId: 'shared', score: 0.7 }); // same chunkId
    const r4 = makeResult({ chunkId: 'd', score: 0.6 });

    const lists: RankedList[] = [
      { source: 'ast', results: [r1, r2] },
      { source: 'llm', results: [r3, r4] },
    ];
    const result = rrfMerge(lists, 10);

    expect(result).toHaveLength(3); // shared, b, d (shared deduped)
    const shared = result.find((r: RetrievalResult) => r.chunkId === 'shared');
    expect(shared).toBeDefined();
    // summed: 1/61 (rank 0 in list1) + 1/61 (rank 0 in list2)
    expect(shared!.score).toBeCloseTo(1 / (k + 1) + 1 / (k + 1), 10);
    // shared should be ranked first (highest score)
    expect(result[0]!.chunkId).toBe('shared');
  });

  it('Test 4: empty lists returns empty array', () => {
    expect(rrfMerge([], 10)).toEqual([]);
    expect(rrfMerge([{ source: 'ast', results: [] }], 10)).toEqual([]);
  });

  it('Test 5: single list preserves original cosine scores (no RRF conversion)', () => {
    const r1 = makeResult({ chunkId: 'a', score: 0.9 });
    const r2 = makeResult({ chunkId: 'b', score: 0.75 });
    const lists: RankedList[] = [{ source: 'ast', results: [r1, r2] }];
    const result = rrfMerge(lists, 10);

    expect(result).toHaveLength(2);
    expect(result[0]!.chunkId).toBe('a');
    // Original cosine score preserved — NOT replaced with 1/(60+rank+1)
    expect(result[0]!.score).toBe(0.9);
    expect(result[1]!.score).toBe(0.75);
    // scoreType preserved (cosine from search engine, not overwritten to 'rrf')
    expect(result[0]!.scoreType).not.toBe('rrf');
    expect(result[1]!.scoreType).not.toBe('rrf');
    // Source tag is still applied
    expect(result[0]!.source).toBe('ast');
    expect(result[1]!.source).toBe('ast');
  });

  it('Test 6: limit truncation — 3 results per list, limit=4 returns top 4', () => {
    const lists: RankedList[] = [
      {
        source: 'ast',
        results: [
          makeResult({ chunkId: 'a', score: 0.9 }),
          makeResult({ chunkId: 'b', score: 0.8 }),
          makeResult({ chunkId: 'c', score: 0.7 }),
        ],
      },
      {
        source: 'llm',
        results: [
          makeResult({ chunkId: 'd', score: 0.9 }),
          makeResult({ chunkId: 'e', score: 0.8 }),
          makeResult({ chunkId: 'f', score: 0.7 }),
        ],
      },
    ];
    const result = rrfMerge(lists, 4);
    expect(result).toHaveLength(4);
  });

  it('Test 7: source tagging — each result has correct source field from its list', () => {
    const r1 = makeResult({ chunkId: 'a', score: 0.9 });
    const r2 = makeResult({ chunkId: 'b', score: 0.8 });
    const lists: RankedList[] = [
      { source: 'ast', results: [r1] },
      { source: 'llm', results: [r2] },
    ];
    const result = rrfMerge(lists, 10);

    const a = result.find((r: RetrievalResult) => r.chunkId === 'a');
    const b = result.find((r: RetrievalResult) => r.chunkId === 'b');
    expect(a?.source).toBe('ast');
    expect(b?.source).toBe('llm');
  });

  it('Test 8: overlapping result keeps source from highest-ranked occurrence (first list, rank 0)', () => {
    // r1 is rank 0 in list1 (ast), r2 is rank 1 in list2 (llm) - shared chunkId
    const r1 = makeResult({ chunkId: 'shared', score: 0.9 });
    const r2 = makeResult({ chunkId: 'x', score: 0.8 });
    const r3 = makeResult({ chunkId: 'y', score: 0.7 });
    const r4 = makeResult({ chunkId: 'shared', score: 0.5 }); // same chunkId, lower rank

    const lists: RankedList[] = [
      { source: 'ast', results: [r1, r2] },
      { source: 'llm', results: [r3, r4] }, // shared is at rank 1 here
    ];
    const result = rrfMerge(lists, 10);

    const shared = result.find((r: RetrievalResult) => r.chunkId === 'shared');
    expect(shared).toBeDefined();
    // First occurrence (rank 0 in list1, source='ast') wins
    expect(shared!.source).toBe('ast');
  });
});
