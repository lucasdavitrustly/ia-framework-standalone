import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHandler } from '../search-codebase.js';
import { searchCodebaseHybridHandler } from '../search-codebase-hybrid.js';
import type { SearchCodebaseInput } from '../search-codebase.js';
import type { SearchCodebaseHybridInput } from '../search-codebase-hybrid.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

function makeResult(score: number, id = 'chunk-1'): RetrievalResult {
  return {
    chunkId: id,
    filePath: `/project/src/${id}.ts`,
    relativePath: `src/${id}.ts`,
    language: 'typescript',
    chunkType: 'function',
    name: id,
    content: `function ${id}() {}`,
    startLine: 1,
    endLine: 1,
    imports: [],
    exports: [],
    score,
    matchedVector: 'text',
  };
}

// ---------------------------------------------------------------------------
// Existing tests: engine call still receives undefined scoreThreshold
// ---------------------------------------------------------------------------

describe('searchCodebaseHandler — engine call (no server-side threshold)', () => {
  it('passes undefined scoreThreshold to engine when user provides no score_threshold', async () => {
    const searchWithExpansion = vi.fn().mockResolvedValue([makeResult(0.8)]);
    const engine = { search: vi.fn(), searchWithExpansion };

    await searchCodebaseHandler(engine, { query: 'find auth handler' });

    expect(searchWithExpansion).toHaveBeenCalledWith(
      expect.objectContaining({ scoreThreshold: undefined }),
      expect.anything(),
    );
  });

  it('passes explicit score_threshold through when user provides one', async () => {
    const searchWithExpansion = vi.fn().mockResolvedValue([makeResult(0.8)]);
    const engine = { search: vi.fn(), searchWithExpansion };

    await searchCodebaseHandler(engine, { query: 'auth handler', score_threshold: 0.5 });

    expect(searchWithExpansion).toHaveBeenCalledWith(
      expect.objectContaining({ scoreThreshold: 0.5 }),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// New tests: client-side score filtering with default 0.5
// ---------------------------------------------------------------------------

describe('searchCodebaseHandler — client-side score filtering (default 0.5)', () => {
  it('filters out results below 0.5 by default (scores 0.3, 0.4 removed; 0.6, 0.8 kept)', async () => {
    const results = [
      makeResult(0.3, 'a'),
      makeResult(0.4, 'b'),
      makeResult(0.6, 'c'),
      makeResult(0.8, 'd'),
    ];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    const output = await searchCodebaseHandler(engine, { query: 'find something' });
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/c.ts');
    expect(text).toContain('src/d.ts');
    expect(text).not.toContain('src/a.ts');
    expect(text).not.toContain('src/b.ts');
    expect(output.structuredContent).toMatchObject({ answered: true });
  });

  it('returns all results when score_threshold=0 (filtering disabled)', async () => {
    const results = [makeResult(0.1, 'low1'), makeResult(0.2, 'low2'), makeResult(0.9, 'high')];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    const output = await searchCodebaseHandler(engine, {
      query: 'find something',
      score_threshold: 0,
    });
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/low1.ts');
    expect(text).toContain('src/low2.ts');
    expect(text).toContain('src/high.ts');
  });

  it('applies user-supplied score_threshold=0.7 (only >= 0.7 returned)', async () => {
    const results = [makeResult(0.5, 'mid'), makeResult(0.7, 'target'), makeResult(0.9, 'high')];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    const output = await searchCodebaseHandler(engine, {
      query: 'find something',
      score_threshold: 0.7,
    });
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/target.ts');
    expect(text).toContain('src/high.ts');
    expect(text).not.toContain('src/mid.ts');
  });

  it('uses config defaultScoreThreshold when no input override (config=0.6, scores 0.5 filtered)', async () => {
    const results = [makeResult(0.5, 'low'), makeResult(0.6, 'ok'), makeResult(0.8, 'high')];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'find something' },
      {
        defaultScoreThreshold: 0.6,
      },
    );
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/ok.ts');
    expect(text).toContain('src/high.ts');
    expect(text).not.toContain('src/low.ts');
  });

  it('score filtering happens BEFORE token cap (token cap receives the filtered list)', async () => {
    // Provide many results; low-score ones below 0.5 should be removed before token cap runs
    const results = [
      makeResult(0.9, 'keep1'),
      makeResult(0.8, 'keep2'),
      makeResult(0.2, 'drop1'),
      makeResult(0.1, 'drop2'),
    ];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { search: vi.fn(), searchWithExpansion };

    // Very tight token budget — only 1 result fits (~4 tokens per char, content ~20 chars → ~5 tokens)
    // If filtering happens BEFORE cap, cap receives [keep1, keep2] (2 results)
    // If filtering happened AFTER cap, cap might include low-score results
    const output = await searchCodebaseHandler(
      engine,
      { query: 'find something' },
      {
        maxTokensPerCall: 10, // tight budget
      },
    );
    const text = (output.content[0] as { type: string; text: string }).text;

    // With tight budget, at most 1 result returned — it must be a high-score one
    expect(text).not.toContain('src/drop1.ts');
    expect(text).not.toContain('src/drop2.ts');
  });
});

// ---------------------------------------------------------------------------
// Hybrid handler: client-side filtering (no 0.5 default — RRF scores differ)
// ---------------------------------------------------------------------------

describe('searchCodebaseHybridHandler — client-side score filtering', () => {
  it('filters results by user-supplied score_threshold for hybrid search', async () => {
    const results = [
      makeResult(0.01, 'very-low'),
      makeResult(0.02, 'mid'),
      makeResult(0.03, 'high'),
    ];
    const searchHybrid = vi.fn().mockResolvedValue(results);
    const engine = { searchHybrid };

    const input: SearchCodebaseHybridInput = {
      query: 'find handler',
      score_threshold: 0.025,
      expand_hops: 0,
    };
    const output = await searchCodebaseHybridHandler(engine, input);
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/high.ts');
    expect(text).not.toContain('src/very-low.ts');
    expect(text).not.toContain('src/mid.ts');
  });

  it('does NOT apply 0.5 default threshold to hybrid results (RRF scores are ~0.01-0.03)', async () => {
    const results = [makeResult(0.02, 'rrf-result')];
    const searchHybrid = vi.fn().mockResolvedValue(results);
    const engine = { searchHybrid };

    // No score_threshold provided — hybrid should NOT filter with 0.5 default
    const output = await searchCodebaseHybridHandler(engine, {
      query: 'find handler',
      expand_hops: 0,
    });
    const text = (output.content[0] as { type: string; text: string }).text;

    expect(text).toContain('src/rrf-result.ts');
  });
});
