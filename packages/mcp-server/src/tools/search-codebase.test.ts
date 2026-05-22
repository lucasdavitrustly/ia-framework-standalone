import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHandler, formatResult } from './search-codebase.js';
import type { RetrievalResult } from '@ia-framework/retrieval';
import * as classificationModule from '../classification/index.js';

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

describe('CEX — confidence-based early exit', () => {
  it('logs earlyExit=true when keyword confidence >= 0.8 and results > 0', async () => {
    // "UserService" is a symbol pattern → classified as keyword with confidence 1.0
    const result = makeResult({ chunkId: 'cex-1', name: 'UserService' });
    const loggerInfo = vi.fn();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [result], suggestions: [], fallback_used: false }),
    };

    await searchCodebaseHandler(engine, { query: 'UserService' }, {
      metricsStore: {} as any,
      logger: { info: loggerInfo },
    } as any);

    expect(loggerInfo).toHaveBeenCalled();
    const logEntry = loggerInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(logEntry.earlyExit).toBe(true);
    expect(logEntry.earlyExitReason).toBe('confidence-above-threshold');
  });

  it('logs earlyExit=false when keyword confidence >= 0.8 but 0 results (fallback)', async () => {
    // "NonExistentSymbol" is a symbol → keyword with high confidence, but 0 results
    const semanticResult = makeResult({ chunkId: 'fb-sem' });
    const loggerInfo = vi.fn();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([semanticResult]),
      search: vi.fn().mockResolvedValue([semanticResult]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [], suggestions: [], fallback_used: false }),
    };

    await searchCodebaseHandler(engine, { query: 'NonExistentSymbol' }, {
      metricsStore: {} as any,
      logger: { info: loggerInfo },
    } as any);

    // First log call is the keyword-fallback-semantic
    expect(loggerInfo).toHaveBeenCalled();
    const firstLog = loggerInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(firstLog.earlyExit).toBe(false);
    expect(firstLog.earlyExitReason).toBe('fallback-no-results');
  });

  it('logs earlyExit=false when keyword confidence < 0.8', async () => {
    // Mock classifyQuery to return keyword with low confidence (0.6)
    const classifySpy = vi.spyOn(classificationModule, 'classifyQuery').mockReturnValue({
      type: 'keyword',
      reason: 'short-identifier',
      confidence: 0.6,
    });

    const result = makeResult({ chunkId: 'low-conf' });
    const loggerInfo = vi.fn();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [result], suggestions: [], fallback_used: false }),
    };

    await searchCodebaseHandler(engine, { query: 'some query' }, {
      metricsStore: {} as any,
      logger: { info: loggerInfo },
    } as any);

    expect(loggerInfo).toHaveBeenCalled();
    const logEntry = loggerInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(logEntry.earlyExit).toBe(false);
    expect(logEntry.earlyExitReason).toBeUndefined();

    classifySpy.mockRestore();
  });

  it('respects custom earlyExitConfidence threshold (0.9)', async () => {
    // "UserService" → confidence 1.0, which is >= 0.9
    const result = makeResult({ chunkId: 'custom-1', name: 'UserService' });
    const loggerInfo = vi.fn();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [result], suggestions: [], fallback_used: false }),
    };

    await searchCodebaseHandler(engine, { query: 'UserService' }, {
      metricsStore: {} as any,
      logger: { info: loggerInfo },
      earlyExitConfidence: 0.9,
    } as any);

    expect(loggerInfo).toHaveBeenCalled();
    const logEntry = loggerInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(logEntry.earlyExit).toBe(true);
    expect(logEntry.earlyExitReason).toBe('confidence-above-threshold');
  });
});

describe('searchCodebaseHandler - confidence gate', () => {
  it('returns "no relevant code found" when best result score is below confidenceThreshold', async () => {
    const lowScoreResult = makeResult({ chunkId: 'low-1', score: 0.55 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([lowScoreResult]),
      search: vi.fn().mockResolvedValue([lowScoreResult]),
      searchWithFallback: vi.fn(),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'payment gateway retry logic' },
      { confidenceThreshold: 0.65 },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No relevant code found');
    expect(text).toContain('Do not guess or hallucinate');
    // Should NOT call fallback when confidence gate triggers
    expect(engine.searchWithFallback).not.toHaveBeenCalled();
  });

  it('returns results normally when best result score is above confidenceThreshold', async () => {
    const highScoreResult = makeResult({ chunkId: 'high-1', score: 0.8 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([highScoreResult]),
      search: vi.fn().mockResolvedValue([highScoreResult]),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'payment service' },
      { confidenceThreshold: 0.65 },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Code results for');
    expect(text).toContain('myFunction');
  });

  it('does not apply confidence gate when confidenceThreshold is not configured', async () => {
    const lowScoreResult = makeResult({ chunkId: 'low-2', score: 0.55 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([lowScoreResult]),
      search: vi.fn().mockResolvedValue([lowScoreResult]),
    };

    // No confidenceThreshold in observability config
    const output = await searchCodebaseHandler(engine, { query: 'some query' }, {});

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    // Should still return results since score 0.55 > default scoreThreshold 0.5
    expect(text).toContain('Code results for');
  });

  it('sets confidence_gated: true in structuredContent when gate triggers', async () => {
    const lowScoreResult = makeResult({ chunkId: 'low-3', score: 0.6 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([lowScoreResult]),
      search: vi.fn().mockResolvedValue([lowScoreResult]),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'unknown pattern' },
      { confidenceThreshold: 0.7 },
    );

    expect(output.structuredContent).toBeDefined();
    expect((output.structuredContent as any).confidence_gated).toBe(true);
    expect((output.structuredContent as any).answered).toBe(false);
  });

  it('confidence gate applies BEFORE score threshold filtering', async () => {
    // Result with score 0.55 — above default scoreThreshold (0.5) but below confidenceThreshold (0.65)
    const result = makeResult({ chunkId: 'mid-1', score: 0.55 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
      searchWithFallback: vi.fn(),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'something obscure' },
      { confidenceThreshold: 0.65 },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No relevant code found');
    // Fallback should NOT be tried
    expect(engine.searchWithFallback).not.toHaveBeenCalled();
  });
});

describe('searchCodebaseHandler - repo param and grouping', () => {
  it('passes repoId filter to engine when repo param provided', async () => {
    const result = makeResult({ chunkId: 'repo-1', repoId: 'backend' });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };

    await searchCodebaseHandler(engine, {
      query: 'how does auth work',
      repo: 'backend',
      expand_hops: 0,
    });

    expect(engine.searchWithExpansion).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { must: [{ key: 'repoId', match: { value: 'backend' } }] },
      }),
      expect.anything(),
    );
  });

  it('groups results by repoId with best-scoring repo first', async () => {
    const results = [
      makeResult({ chunkId: 'r1', repoId: 'frontend', score: 0.7, relativePath: 'src/a.ts' }),
      makeResult({ chunkId: 'r2', repoId: 'backend', score: 0.95, relativePath: 'src/b.ts' }),
      makeResult({ chunkId: 'r3', repoId: 'frontend', score: 0.6, relativePath: 'src/c.ts' }),
    ];
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'how does auth work',
      expand_hops: 0,
    });

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    // backend has best score (0.95) so should appear first
    const backendIdx = text.indexOf('--- [backend] ---');
    const frontendIdx = text.indexOf('--- [frontend] ---');
    expect(backendIdx).toBeGreaterThan(-1);
    expect(frontendIdx).toBeGreaterThan(-1);
    expect(backendIdx).toBeLessThan(frontendIdx);
  });

  it('includes repo field in structuredContent', async () => {
    const results = [makeResult({ chunkId: 'r1', repoId: 'core', score: 0.9 })];
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'how does auth work',
      expand_hops: 0,
    });

    const structured = output.structuredContent as any;
    expect(structured.results).toBeDefined();
    expect(structured.results[0].repo).toBe('core');
  });
});

describe('formatResult - line number display', () => {
  it('includes :startLine-endLine in header with named chunk', () => {
    const result = makeResult({
      startLine: 10,
      endLine: 25,
      relativePath: 'src/Foo.ts',
      name: 'FooClass',
      score: 0.85,
      matchedVector: 'both',
    });
    const output = formatResult(result, 1);
    expect(output).toContain('### 1. src/Foo.ts:10-25 (FooClass)');
  });

  it('includes :startLine-endLine in header without name', () => {
    const result = makeResult({
      startLine: 10,
      endLine: 25,
      relativePath: 'src/Foo.ts',
      name: undefined,
      score: 0.85,
      matchedVector: 'both',
    });
    const output = formatResult(result, 1);
    expect(output).toContain('### 1. src/Foo.ts:10-25 —');
    expect(output).not.toMatch(/src\/Foo\.ts:10-25 \(/);
  });
});
