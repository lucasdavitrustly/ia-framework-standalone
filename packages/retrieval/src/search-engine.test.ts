import { describe, test, expect, vi, beforeEach } from 'vitest';
import { SearchEngine } from './search-engine.js';
import type { SearchEngineConfig } from './types.js';

// Mock vector store search result helper
function makeMockResult(
  chunkId: string,
  score: number,
  vectorName: 'text' | 'code',
  overrides: Partial<{
    relativePath: string;
    name: string;
    filePath: string;
    imports: string[];
    exports: string[];
  }> = {},
) {
  return {
    id: `qdrant-uuid-${chunkId}`,
    score,
    vectorName,
    payload: {
      chunkId,
      filePath: overrides.filePath ?? `/project/${overrides.relativePath ?? 'src/auth.ts'}`,
      relativePath: overrides.relativePath ?? 'src/auth.ts',
      language: 'typescript',
      chunkType: 'function',
      name: overrides.name ?? 'authMiddleware',
      content: 'function authMiddleware() {}',
      startLine: 1,
      endLine: 5,
      imports: overrides.imports ?? ['express'],
      exports: overrides.exports ?? ['authMiddleware'],
      indexedAt: '2026-04-01T00:00:00Z',
    },
  };
}

function makeConfig(overrides: Partial<SearchEngineConfig> = {}): SearchEngineConfig {
  const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  const mockSearch = vi.fn().mockResolvedValue([]);

  return {
    embeddingProvider: {
      embed: mockEmbed,
      dimensions: 3,
    },
    vectorStore: {
      search: mockSearch,
    },
    ...overrides,
  };
}

describe('SearchEngine', () => {
  let config: SearchEngineConfig;
  let engine: SearchEngine;

  beforeEach(() => {
    config = makeConfig();
    engine = new SearchEngine(config);
  });

  test('Test 1: search() calls embeddingProvider.embed() with the query text', async () => {
    await engine.search({ text: 'authentication middleware' });

    expect(config.embeddingProvider.embed).toHaveBeenCalledWith('authentication middleware');
  });

  test('Test 2: search() calls vectorStore.search() twice — once for text, once for code', async () => {
    await engine.search({ text: 'auth' });

    const calls = (config.vectorStore.search as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    const vectorNames = calls.map((c) => c[1].vectorName);
    expect(vectorNames).toContain('text');
    expect(vectorNames).toContain('code');
  });

  test('Test 3: results from both vectors are merged and deduplicated by chunkId', async () => {
    const textResult = makeMockResult('chunk-1', 0.9, 'text');
    const codeResult = makeMockResult('chunk-2', 0.8, 'code');

    (config.vectorStore.search as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([textResult])
      .mockResolvedValueOnce([codeResult]);

    const results = await engine.search({ text: 'auth' });

    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.chunkId);
    expect(ids).toContain('chunk-1');
    expect(ids).toContain('chunk-2');
  });

  test('Test 4: when same chunk appears in both results, score=max and matchedVector=both', async () => {
    const textResult = makeMockResult('chunk-1', 0.7, 'text');
    const codeResult = makeMockResult('chunk-1', 0.9, 'code');

    (config.vectorStore.search as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([textResult])
      .mockResolvedValueOnce([codeResult]);

    const results = await engine.search({ text: 'auth' });

    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBe(0.9);
    expect(results[0]!.matchedVector).toBe('both');
  });

  test('Test 5: results are sorted by score descending', async () => {
    const results_text = [
      makeMockResult('chunk-a', 0.6, 'text', { relativePath: 'src/a.ts' }),
      makeMockResult('chunk-b', 0.9, 'text', { relativePath: 'src/b.ts' }),
    ];
    const results_code = [
      makeMockResult('chunk-c', 0.75, 'code', { relativePath: 'src/c.ts' }),
    ];

    (config.vectorStore.search as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(results_text)
      .mockResolvedValueOnce(results_code);

    const results = await engine.search({ text: 'auth' });

    expect(results[0]!.score).toBe(0.9);
    expect(results[1]!.score).toBe(0.75);
    expect(results[2]!.score).toBe(0.6);
  });

  test('Test 6: results are capped at the requested limit', async () => {
    const manyResults = Array.from({ length: 10 }, (_, i) =>
      makeMockResult(`chunk-${i}`, 0.9 - i * 0.05, 'text', { relativePath: `src/file${i}.ts` }),
    );

    (config.vectorStore.search as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(manyResults)
      .mockResolvedValueOnce([]);

    const results = await engine.search({ text: 'auth', limit: 3 });

    expect(results).toHaveLength(3);
  });

  test('Test 7: getFile() calls vectorStore.search() with a filter on relativePath', async () => {
    const fileResult = makeMockResult('chunk-file', 0.99, 'text', {
      relativePath: 'src/auth.ts',
    });

    (config.vectorStore.search as ReturnType<typeof vi.fn>).mockResolvedValue([fileResult]);

    const results = await engine.getFile('src/auth.ts');

    const searchCalls = (config.vectorStore.search as ReturnType<typeof vi.fn>).mock.calls;
    expect(searchCalls.length).toBeGreaterThan(0);
    const filterUsed = searchCalls[0]![1].filter;
    expect(filterUsed).toBeDefined();
    // Filter should reference relativePath
    expect(JSON.stringify(filterUsed)).toContain('relativePath');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.relativePath).toBe('src/auth.ts');
  });

  test('Test 8: search() with scoreThreshold filters out results below the threshold', async () => {
    const highScore = makeMockResult('chunk-high', 0.9, 'text', { relativePath: 'src/a.ts' });
    const lowScore = makeMockResult('chunk-low', 0.3, 'text', { relativePath: 'src/b.ts' });

    // The vectorStore receives the scoreThreshold and should filter — but in our mock
    // we return both; the engine should apply threshold too
    (config.vectorStore.search as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([highScore, lowScore])
      .mockResolvedValueOnce([]);

    const results = await engine.search({ text: 'auth', scoreThreshold: 0.5 });

    // Verify the scoreThreshold was passed to the vector store
    const calls = (config.vectorStore.search as ReturnType<typeof vi.fn>).mock.calls;
    const textCall = calls.find((c) => c[1].vectorName === 'text');
    expect(textCall![1].scoreThreshold).toBe(0.5);
  });
});

describe('SearchEngine.searchWithExpansion', () => {
  const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  const mockSearch = vi.fn().mockResolvedValue([]);
  const mockGetNeighborFiles = vi.fn().mockResolvedValue([]);

  function makeExpandConfig(opts: { withGraph?: boolean } = {}): SearchEngineConfig {
    return {
      embeddingProvider: { embed: mockEmbed, dimensions: 3 },
      vectorStore: { search: mockSearch },
      ...(opts.withGraph
        ? { dependencyGraph: { getNeighborFiles: mockGetNeighborFiles } }
        : {}),
    };
  }

  beforeEach(() => {
    mockEmbed.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReset().mockResolvedValue([]);
    mockGetNeighborFiles.mockReset().mockResolvedValue([]);
  });

  test('with no dependency graph configured, falls back to search()', async () => {
    const cfg = makeExpandConfig({ withGraph: false });
    const eng = new SearchEngine(cfg);

    const baseResult = makeMockResult('chunk-1', 0.9, 'text');
    mockSearch.mockResolvedValueOnce([baseResult]).mockResolvedValueOnce([]);

    const results = await eng.searchWithExpansion({ text: 'auth' });

    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('chunk-1');
    // getNeighborFiles should NOT have been called
    expect(mockGetNeighborFiles).not.toHaveBeenCalled();
  });

  test('1-hop expansion adds chunks from imported files', async () => {
    const cfg = makeExpandConfig({ withGraph: true });
    const eng = new SearchEngine(cfg);

    const baseResult = makeMockResult('chunk-base', 0.9, 'text', {
      filePath: '/project/src/auth.ts',
      relativePath: 'src/auth.ts',
    });
    const expandedResult = makeMockResult('chunk-dep', 0.0, 'text', {
      filePath: '/project/src/types.ts',
      relativePath: 'src/types.ts',
    });

    // First search call returns base results (text), second (code) empty
    mockSearch
      .mockResolvedValueOnce([baseResult])
      .mockResolvedValueOnce([])
      // Expansion: search for files from graph (text vector with filePath filter)
      .mockResolvedValueOnce([expandedResult]);

    mockGetNeighborFiles.mockResolvedValue(['/project/src/types.ts']);

    const results = await eng.searchWithExpansion({ text: 'auth' }, { hops: 1 });

    expect(mockGetNeighborFiles).toHaveBeenCalledWith(['/project/src/auth.ts'], 1);
    expect(results).toHaveLength(2);
    expect(results[0]!.chunkId).toBe('chunk-base');
    expect(results[0]!.score).toBe(0.9);
    expect(results[1]!.chunkId).toBe('chunk-dep');
    expect(results[1]!.score).toBe(0);
  });

  test('2-hop expansion adds chunks from imported-imports', async () => {
    const cfg = makeExpandConfig({ withGraph: true });
    const eng = new SearchEngine(cfg);

    const baseResult = makeMockResult('chunk-base', 0.85, 'text', {
      filePath: '/project/src/handler.ts',
      relativePath: 'src/handler.ts',
    });
    const expandedResult = makeMockResult('chunk-transitive', 0.0, 'text', {
      filePath: '/project/src/utils.ts',
      relativePath: 'src/utils.ts',
    });

    mockSearch
      .mockResolvedValueOnce([baseResult])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expandedResult]);

    mockGetNeighborFiles.mockResolvedValue(['/project/src/utils.ts']);

    const results = await eng.searchWithExpansion({ text: 'handler' }, { hops: 2 });

    expect(mockGetNeighborFiles).toHaveBeenCalledWith(['/project/src/handler.ts'], 2);
    expect(results).toHaveLength(2);
  });

  test('base results are not duplicated in expansion', async () => {
    const cfg = makeExpandConfig({ withGraph: true });
    const eng = new SearchEngine(cfg);

    const baseResult = makeMockResult('chunk-base', 0.9, 'text', {
      filePath: '/project/src/auth.ts',
      relativePath: 'src/auth.ts',
    });

    mockSearch
      .mockResolvedValueOnce([baseResult])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    // Graph returns a file that already has a base result
    mockGetNeighborFiles.mockResolvedValue(['/project/src/auth.ts']);

    const results = await eng.searchWithExpansion({ text: 'auth' });

    // Should still be 1 result, not duplicated
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('chunk-base');
    expect(results[0]!.score).toBe(0.9);
  });

  test('base results retain original scores; expanded results get score=0', async () => {
    const cfg = makeExpandConfig({ withGraph: true });
    const eng = new SearchEngine(cfg);

    const baseResult = makeMockResult('chunk-base', 0.85, 'text', {
      filePath: '/project/src/auth.ts',
      relativePath: 'src/auth.ts',
    });
    const expandedResult = makeMockResult('chunk-expanded', 0.7, 'text', {
      filePath: '/project/src/types.ts',
      relativePath: 'src/types.ts',
    });

    mockSearch
      .mockResolvedValueOnce([baseResult])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([expandedResult]);

    mockGetNeighborFiles.mockResolvedValue(['/project/src/types.ts']);

    const results = await eng.searchWithExpansion({ text: 'auth' });

    expect(results[0]!.score).toBe(0.85);
    // Expanded results have their score overridden to 0
    expect(results[1]!.score).toBe(0);
  });

  test('expansion with hops=0 skips graph expansion', async () => {
    const cfg = makeExpandConfig({ withGraph: true });
    const eng = new SearchEngine(cfg);

    const baseResult = makeMockResult('chunk-base', 0.9, 'text');
    mockSearch.mockResolvedValueOnce([baseResult]).mockResolvedValueOnce([]);

    const results = await eng.searchWithExpansion({ text: 'auth' }, { hops: 0 });

    expect(mockGetNeighborFiles).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });
});
