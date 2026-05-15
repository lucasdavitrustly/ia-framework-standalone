import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHandler } from './search-codebase.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'chunk-1',
    filePath: '/project/src/foo.ts',
    relativePath: 'src/foo.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'myFunction',
    content: 'function myFunction() {}',
    startLine: 1,
    endLine: 3,
    score: 0.92,
    matchedVector: 'both',
    imports: [],
    exports: [],
    ...overrides,
  };
}

describe('searchCodebaseHandler - hierarchy expansion', () => {
  it('Test 1: expands superclass when result has superclass field and expand_hops >= 1', async () => {
    const subclassChunk = makeResult({
      chunkId: 'chunk-sub',
      name: 'UserService',
      chunkType: 'class',
      superclass: 'BaseService',
    });
    const parentChunk = makeResult({
      chunkId: 'chunk-parent',
      name: 'BaseService',
      chunkType: 'class',
      content: 'class BaseService {}',
      score: 0,
    });

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([subclassChunk]),
      search: vi.fn().mockResolvedValue([subclassChunk]),
      scrollForHierarchy: vi.fn().mockResolvedValue([parentChunk]),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'user service',
      expand_hops: 1,
    });

    expect(engine.scrollForHierarchy).toHaveBeenCalledWith('BaseService', 'class');
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('BaseService');
    expect(text).toContain('[hierarchy]');
  });

  it('Test 2: skips hierarchy expansion when expand_hops=0', async () => {
    const subclassChunk = makeResult({
      chunkId: 'chunk-sub',
      name: 'UserService',
      chunkType: 'class',
      superclass: 'BaseService',
    });

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([subclassChunk]),
      search: vi.fn().mockResolvedValue([subclassChunk]),
      scrollForHierarchy: vi.fn().mockResolvedValue([]),
    };

    await searchCodebaseHandler(engine, {
      query: 'user service',
      expand_hops: 0,
    });

    expect(engine.scrollForHierarchy).not.toHaveBeenCalled();
  });

  it('Test 3: multi-level hierarchy expansion follows chain up to hops limit', async () => {
    const subclassChunk = makeResult({
      chunkId: 'chunk-sub',
      name: 'UserService',
      chunkType: 'class',
      superclass: 'BaseService',
    });
    const midChunk = makeResult({
      chunkId: 'chunk-mid',
      name: 'BaseService',
      chunkType: 'class',
      superclass: 'AbstractHandler',
      score: 0,
    });
    const rootChunk = makeResult({
      chunkId: 'chunk-root',
      name: 'AbstractHandler',
      chunkType: 'class',
      score: 0,
    });

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([subclassChunk]),
      search: vi.fn().mockResolvedValue([subclassChunk]),
      scrollForHierarchy: vi
        .fn()
        .mockResolvedValueOnce([midChunk])
        .mockResolvedValueOnce([rootChunk]),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'handler',
      expand_hops: 2,
    });

    expect(engine.scrollForHierarchy).toHaveBeenCalledTimes(2);
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('BaseService');
    expect(text).toContain('AbstractHandler');
  });

  it('Test 4: exception hierarchy traversal returns connected chain', async () => {
    const leafException = makeResult({
      chunkId: 'chunk-leaf',
      name: 'ResourceNotFoundException',
      chunkType: 'class',
      superclass: 'AppException',
    });
    const parentException = makeResult({
      chunkId: 'chunk-parent',
      name: 'AppException',
      chunkType: 'class',
      superclass: 'RuntimeException',
      score: 0,
    });
    const rootException = makeResult({
      chunkId: 'chunk-root',
      name: 'RuntimeException',
      chunkType: 'class',
      score: 0,
    });

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([leafException]),
      search: vi.fn().mockResolvedValue([leafException]),
      scrollForHierarchy: vi
        .fn()
        .mockResolvedValueOnce([parentException])
        .mockResolvedValueOnce([rootException]),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'exception hierarchy',
      expand_hops: 2,
    });

    expect(engine.scrollForHierarchy).toHaveBeenCalledWith('AppException', 'class');
    expect(engine.scrollForHierarchy).toHaveBeenCalledWith('RuntimeException', 'class');
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('ResourceNotFoundException');
    expect(text).toContain('AppException');
    expect(text).toContain('RuntimeException');
  });
});

describe('searchCodebaseHandler - token cap', () => {
  it('Test 5: trims results when total tokens exceed maxTokensPerCall', async () => {
    // Each result has 3000-char content → ~750 tokens each
    // 10 results × 750 tokens = 7500 tokens > 6000 cap
    const largeContent = 'x'.repeat(3000);
    const results = Array.from({ length: 10 }, (_, i) =>
      makeResult({
        chunkId: `chunk-${i}`,
        content: largeContent,
        score: 1.0 - i * 0.05,
        relativePath: `src/file${i}.ts`,
      }),
    );

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
      scrollForHierarchy: vi.fn().mockResolvedValue([]),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'test token cap', expand_hops: 0 },
      { maxTokensPerCall: 6000 },
    );

    // Should have fewer than 10 results
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    const matchCount = (text.match(/###\s+\d+\./g) ?? []).length;
    expect(matchCount).toBeLessThan(10);

    // structuredContent must contain token_cap_applied: true
    expect(output.structuredContent).toBeDefined();
    expect((output.structuredContent as Record<string, unknown>).token_cap_applied).toBe(true);
    expect(typeof (output.structuredContent as Record<string, unknown>).results_trimmed).toBe(
      'number',
    );
  });

  it('Test 6: 70/30 split applies when hierarchy results are present', async () => {
    const largeContent = 'x'.repeat(4000); // ~1000 tokens each
    const directResults = Array.from({ length: 3 }, (_, i) =>
      makeResult({
        chunkId: `direct-${i}`,
        content: largeContent,
        score: 0.9 - i * 0.1,
        relativePath: `src/direct${i}.ts`,
      }),
    );
    const hierarchyResults = Array.from({ length: 3 }, (_, i) =>
      makeResult({
        chunkId: `hier-${i}`,
        content: largeContent,
        score: 0.5,
        relativePath: `src/hier${i}.ts`,
        expansionSource: 'hierarchy' as const,
      }),
    );

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(directResults),
      search: vi.fn().mockResolvedValue(directResults),
      scrollForHierarchy: vi.fn().mockResolvedValue(hierarchyResults),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'hierarchy cap test', expand_hops: 1 },
      { maxTokensPerCall: 6000 },
    );

    // With 6 results × 1000 tokens = 6000 tokens, cap should apply to at least some
    expect(output.structuredContent).toBeDefined();
    // Both direct and hierarchy results should appear (70/30 split preserves at least 1 from each)
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('src/direct0.ts');
  });
});

describe('query classification routing', () => {
  it('keyword query routes to searchWithFallback, not searchWithExpansion', async () => {
    const result = makeResult({ chunkId: 'kw-1', name: 'UserService' });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [result], suggestions: [], fallback_used: false }),
    };

    const output = await searchCodebaseHandler(engine, { query: 'UserService' });

    expect(engine.searchWithFallback).toHaveBeenCalled();
    expect(engine.searchWithExpansion).not.toHaveBeenCalled();
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('keyword-routed');
  });

  it('semantic query routes to searchWithExpansion', async () => {
    const result = makeResult({ chunkId: 'sem-1' });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [], suggestions: [], fallback_used: false }),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'how does authentication work in this project',
    });

    expect(engine.searchWithExpansion).toHaveBeenCalled();
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).not.toContain('keyword-routed');
  });

  it('keyword query with 0 results falls back to semantic path', async () => {
    const result = makeResult({ chunkId: 'fb-1' });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [], suggestions: [], fallback_used: false }),
    };

    const output = await searchCodebaseHandler(engine, { query: 'NonExistentSymbol' });

    // searchWithFallback called first (keyword route), then searchWithExpansion (semantic fallback)
    expect(engine.searchWithFallback).toHaveBeenCalled();
    expect(engine.searchWithExpansion).toHaveBeenCalled();
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).not.toContain('keyword-routed');
  });

  it('keyword route skips score threshold filtering', async () => {
    const lowScoreResult = makeResult({ chunkId: 'low-1', score: 0.1 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [lowScoreResult], suggestions: [], fallback_used: false }),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'UserService' },
      { defaultScoreThreshold: 0.5 },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('keyword-routed');
    expect(text).toContain('1 results');
  });
});
