import { describe, test, expect, vi, beforeEach } from 'vitest';
import { SearchEngine, computeTermFrequencySparseVector } from './search-engine.js';
import type { SearchEngineConfig } from './types.js';

type MockSearchFn = ReturnType<typeof vi.fn>;

function getMockSearch(config: SearchEngineConfig): MockSearchFn {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return vi.mocked(config.vectorStore.search);
}

function getMockEmbed(config: SearchEngineConfig): MockSearchFn {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return vi.mocked(config.embeddingProvider.embed);
}

// Mock vector store search result helper
function makeMockResult(
  chunkId: string,
  score: number,
  vectorName: string,
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
      modulePath: 'billing-service',
      packageName: 'com.acme.billing',
      layerHints: ['controller'],
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

    expect(getMockEmbed(config)).toHaveBeenCalledWith('authentication middleware', 'query');
  });

  test('Test 2: search() with a natural language query calls vectorStore.search() once with semantic vector', async () => {
    await engine.search({ text: 'authentication middleware' });

    const calls = getMockSearch(config).mock.calls as [number[], { vectorName: string }][];
    expect(calls).toHaveLength(1);
    expect(calls[0]![1].vectorName).toBe('semantic');
  });

  test('Test 3: results from semantic vector are returned as RetrievalResults', async () => {
    const result1 = makeMockResult('chunk-1', 0.9, 'semantic', { relativePath: 'src/a.ts' });
    const result2 = makeMockResult('chunk-2', 0.8, 'semantic', { relativePath: 'src/b.ts' });

    getMockSearch(config).mockResolvedValueOnce([result1, result2]);

    const results = await engine.search({ text: 'auth' });

    const ids = results.map((r) => r.chunkId);
    expect(ids).toContain('chunk-1');
    expect(ids).toContain('chunk-2');
  });

  test('Test 4: when same chunk appears in multiple vector results, score=max and matchedVector includes both vectors', async () => {
    const semanticResult = makeMockResult('chunk-1', 0.7, 'semantic');
    const signatureResult = makeMockResult('chunk-1', 0.9, 'signature');

    // Mixed query triggers both semantic + signature vector searches
    getMockSearch(config)
      .mockResolvedValueOnce([semanticResult])
      .mockResolvedValueOnce([signatureResult]);

    const results = await engine.search({ text: 'how does PaymentService work' });

    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBe(0.9);
    expect(results[0]!.matchedVector).toContain('semantic');
    expect(results[0]!.matchedVector).toContain('signature');
  });

  test('Test 5: results are sorted by score descending', async () => {
    const semanticResults = [
      makeMockResult('chunk-a', 0.6, 'semantic', { relativePath: 'src/a.ts' }),
      makeMockResult('chunk-b', 0.9, 'semantic', { relativePath: 'src/b.ts' }),
      makeMockResult('chunk-c', 0.75, 'semantic', { relativePath: 'src/c.ts' }),
    ];

    getMockSearch(config).mockResolvedValueOnce(semanticResults);

    const results = await engine.search({ text: 'auth' });

    expect(results[0]!.score).toBe(0.9);
    expect(results[1]!.score).toBe(0.75);
    expect(results[2]!.score).toBe(0.6);
  });

  test('Test 6: results are capped at the requested limit', async () => {
    const manyResults = Array.from({ length: 10 }, (_, i) =>
      makeMockResult(`chunk-${i}`, 0.9 - i * 0.05, 'text', { relativePath: `src/file${i}.ts` }),
    );

    getMockSearch(config).mockResolvedValueOnce(manyResults).mockResolvedValueOnce([]);

    const results = await engine.search({ text: 'auth', limit: 3 });

    expect(results).toHaveLength(3);
  });

  test('Test 7: getFile() calls vectorStore.search() with a filter on relativePath', async () => {
    const fileResult = makeMockResult('chunk-file', 0.99, 'text', {
      relativePath: 'src/auth.ts',
    });

    getMockSearch(config).mockResolvedValue([fileResult]);

    const results = await engine.getFile('src/auth.ts');

    const searchCalls = getMockSearch(config).mock.calls as [
      number[],
      { filter?: Record<string, unknown> | undefined },
    ][];
    expect(searchCalls.length).toBeGreaterThan(0);
    const filterUsed = searchCalls[0]![1].filter;
    expect(filterUsed).toBeDefined();
    // Filter should reference relativePath
    expect(JSON.stringify(filterUsed)).toContain('relativePath');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.relativePath).toBe('src/auth.ts');
  });

  test('Test 8: search() with scoreThreshold passes it to the semantic vector search', async () => {
    const highScore = makeMockResult('chunk-high', 0.9, 'semantic', { relativePath: 'src/a.ts' });
    const lowScore = makeMockResult('chunk-low', 0.3, 'semantic', { relativePath: 'src/b.ts' });

    // The vectorStore receives the scoreThreshold and should filter — but in our mock
    // we return both; the engine should apply threshold too
    getMockSearch(config).mockResolvedValueOnce([highScore, lowScore]);

    await engine.search({ text: 'auth', scoreThreshold: 0.5 });

    // Verify the scoreThreshold was passed to the vector store
    const calls = getMockSearch(config).mock.calls as [
      number[],
      { vectorName: string; scoreThreshold?: number | undefined },
    ][];
    const semanticCall = calls.find((c) => c[1].vectorName === 'semantic');
    expect(semanticCall![1].scoreThreshold).toBe(0.5);
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
      ...(opts.withGraph ? { dependencyGraph: { getNeighborFiles: mockGetNeighborFiles } } : {}),
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

    // First search call returns base results (semantic vector)
    mockSearch
      .mockResolvedValueOnce([baseResult])
      // Expansion: search for files from graph (semantic vector with filePath filter)
      .mockResolvedValueOnce([expandedResult]);

    mockGetNeighborFiles.mockResolvedValue(['/project/src/types.ts']);

    const results = await eng.searchWithExpansion({ text: 'auth' }, { hops: 1 });

    // T094 fix: getNeighborFiles is now called with relativePath, not absolute filePath
    expect(mockGetNeighborFiles).toHaveBeenCalledWith(['src/auth.ts'], 1);
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

    mockSearch.mockResolvedValueOnce([baseResult]).mockResolvedValueOnce([expandedResult]);

    mockGetNeighborFiles.mockResolvedValue(['/project/src/utils.ts']);

    const results = await eng.searchWithExpansion({ text: 'handler' }, { hops: 2 });

    // T094 fix: getNeighborFiles is now called with relativePath, not absolute filePath
    expect(mockGetNeighborFiles).toHaveBeenCalledWith(['src/handler.ts'], 2);
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

    mockSearch.mockResolvedValueOnce([baseResult]).mockResolvedValueOnce([expandedResult]);

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

describe('SearchEngine.searchHybrid', () => {
  const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  const mockSearch = vi.fn().mockResolvedValue([]);
  const mockSearchHybrid = vi.fn();

  function makeHybridConfig(withHybrid: boolean): SearchEngineConfig {
    const vectorStore: SearchEngineConfig['vectorStore'] = {
      search: mockSearch,
      ...(withHybrid ? { searchHybrid: mockSearchHybrid } : {}),
    };
    return {
      embeddingProvider: { embed: mockEmbed, dimensions: 3 },
      vectorStore,
    };
  }

  beforeEach(() => {
    mockEmbed.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearch.mockReset().mockResolvedValue([]);
    mockSearchHybrid.mockReset().mockResolvedValue([]);
  });

  test('searchHybrid() calls vectorStore.searchHybrid() with denseVector and non-empty sparseVector', async () => {
    const mockResult = makeMockResult('chunk-hybrid', 0.9, 'text');
    mockSearchHybrid.mockResolvedValue([mockResult]);

    const cfg = makeHybridConfig(true);
    const eng = new SearchEngine(cfg);

    await eng.searchHybrid({ text: 'QdrantVectorStore search method', limit: 5 });

    expect(mockSearchHybrid).toHaveBeenCalledOnce();
    const [args] = mockSearchHybrid.mock.calls[0] as [
      {
        denseVector: number[];
        sparseVector: { indices: number[]; values: number[] };
        limit: number;
      },
    ];
    expect(args.denseVector).toEqual([0.1, 0.2, 0.3]);
    expect(args.sparseVector.indices.length).toBeGreaterThan(0);
    expect(args.sparseVector.values.length).toBeGreaterThan(0);
    expect(args.limit).toBe(15); // limit(5) * mmrCandidateMultiplier(3) = 15 (over-fetch for MMR per D-06)
  });

  test('searchHybrid() falls back to search() when vectorStore.searchHybrid is undefined', async () => {
    const baseResult = makeMockResult('chunk-fallback', 0.8, 'text');
    mockSearch.mockResolvedValueOnce([baseResult]).mockResolvedValueOnce([]);

    const cfg = makeHybridConfig(false);
    const eng = new SearchEngine(cfg);

    const results = await eng.searchHybrid({ text: 'some query' });

    expect(mockSearchHybrid).not.toHaveBeenCalled();
    expect(mockSearch).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe('chunk-fallback');
  });

  test('searchHybrid() returns RetrievalResult[] with matchedVector=both', async () => {
    const mockResult = makeMockResult('chunk-hybrid', 0.88, 'text');
    mockSearchHybrid.mockResolvedValue([mockResult]);

    const cfg = makeHybridConfig(true);
    const eng = new SearchEngine(cfg);

    const results = await eng.searchHybrid({ text: 'hybrid query' });

    expect(results).toHaveLength(1);
    expect(results[0]!.matchedVector).toBe('both');
    expect(results[0]!.score).toBe(0.88);
    expect(results[0]!.chunkId).toBe('chunk-hybrid');
  });

  test('searchHybrid() reranks exact symbol matches ahead of generic results', async () => {
    const generic = makeMockResult('chunk-generic', 0.95, 'text', {
      relativePath: 'src/GenericService.java',
      name: 'GenericService',
    });
    const exact = makeMockResult('chunk-exact', 0.82, 'text', {
      relativePath: 'src/PaymentController.java',
      name: 'PaymentController',
    });
    mockSearchHybrid.mockResolvedValue([generic, exact]);

    const cfg = makeHybridConfig(true);
    const eng = new SearchEngine(cfg);

    const results = await eng.searchHybrid({ text: 'Where is PaymentController defined?' });

    expect(results[0]!.name).toBe('PaymentController');
  });

  test('searchHybrid() passes keywordPrefetchMultiplier and semanticPrefetchMultiplier from config', async () => {
    mockSearchHybrid.mockResolvedValue([]);

    const cfg: SearchEngineConfig = {
      embeddingProvider: { embed: mockEmbed, dimensions: 3 },
      vectorStore: { search: mockSearch, searchHybrid: mockSearchHybrid },
      keywordPrefetchMultiplier: 5,
      semanticPrefetchMultiplier: 2,
    };
    const eng = new SearchEngine(cfg);

    await eng.searchHybrid({ text: 'some query', limit: 10 });

    expect(mockSearchHybrid).toHaveBeenCalledOnce();
    const [args] = mockSearchHybrid.mock.calls[0] as [Record<string, unknown>];
    expect(args.keywordPrefetchMultiplier).toBe(5);
    expect(args.semanticPrefetchMultiplier).toBe(2);
  });

  test('searchHybrid() omits multipliers when not configured (defaults apply in store)', async () => {
    mockSearchHybrid.mockResolvedValue([]);

    const cfg = makeHybridConfig(true);
    const eng = new SearchEngine(cfg);

    await eng.searchHybrid({ text: 'some query', limit: 5 });

    const [args] = mockSearchHybrid.mock.calls[0] as [Record<string, unknown>];
    expect(args.keywordPrefetchMultiplier).toBeUndefined();
    expect(args.semanticPrefetchMultiplier).toBeUndefined();
  });
});

describe('SearchEngine module-aware expansion', () => {
  test('searchWithExpansion biases same-module neighbors for architecture queries', async () => {
    const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const mockSearch = vi.fn();
    const mockGetNeighborFiles = vi
      .fn()
      .mockResolvedValue([
        '/project/orders-service/src/main/java/com/acme/orders/OrderRepository.java',
      ]);

    mockSearch
      .mockResolvedValueOnce([
        makeMockResult('chunk-base', 0.9, 'text', {
          filePath: '/project/orders-service/src/main/java/com/acme/orders/OrderController.java',
          relativePath: 'orders-service/src/main/java/com/acme/orders/OrderController.java',
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeMockResult('chunk-neighbor', 0.1, 'text', {
          filePath: '/project/orders-service/src/main/java/com/acme/orders/OrderRepository.java',
          relativePath: 'orders-service/src/main/java/com/acme/orders/OrderRepository.java',
          name: 'OrderRepository',
        }),
      ]);

    const eng = new SearchEngine({
      embeddingProvider: { embed: mockEmbed, dimensions: 3 },
      vectorStore: { search: mockSearch },
      dependencyGraph: { getNeighborFiles: mockGetNeighborFiles },
    });

    const results = await eng.searchWithExpansion(
      { text: 'Describe the architecture and data flow for orders-service' },
      { hops: 1 },
    );

    expect(results).toHaveLength(2);
    expect(results[1]!.relativePath).toContain('OrderRepository.java');
  });
});

// ---------------------------------------------------------------------------
// T056: Unified search pipeline routing tests
// ---------------------------------------------------------------------------

describe('T056: Unified search pipeline routing', () => {
  let config: SearchEngineConfig;
  let engine: SearchEngine;

  beforeEach(() => {
    config = makeConfig();
    engine = new SearchEngine(config);
  });

  test('semantic query routes to semantic vector only', async () => {
    await engine.search({ text: 'payment retry logic' });

    const calls = getMockSearch(config).mock.calls as [number[], { vectorName: string }][];
    expect(calls).toHaveLength(1);
    expect(calls[0]![1].vectorName).toBe('semantic');
  });

  test('symbol query routes to signature vector (sparse filtered out of dense path)', async () => {
    await engine.search({ text: 'PaymentService.processPayment' });

    const calls = getMockSearch(config).mock.calls as [number[], { vectorName: string }][];
    const vectorNames = calls.map((c) => c[1].vectorName);
    // Symbol: ['signature', 'sparse'] → sparse excluded → only 'signature' dense call
    expect(vectorNames).toContain('signature');
    expect(vectorNames).not.toContain('semantic');
    expect(vectorNames).not.toContain('sparse');
  });

  test('keyword query routes to semantic vector (sparse filtered out of dense path)', async () => {
    await engine.search({ text: 'PaymentService' });

    const calls = getMockSearch(config).mock.calls as [number[], { vectorName: string }][];
    const vectorNames = calls.map((c) => c[1].vectorName);
    // Keyword: ['sparse', 'semantic'] → sparse excluded → only 'semantic' dense call
    expect(vectorNames).toContain('semantic');
    expect(vectorNames).not.toContain('signature');
  });

  test('mixed query routes to semantic and signature vectors (2 dense calls)', async () => {
    await engine.search({ text: 'how does PaymentService handle retries' });

    const calls = getMockSearch(config).mock.calls as [number[], { vectorName: string }][];
    const vectorNames = calls.map((c) => c[1].vectorName);
    // Mixed: ['semantic', 'signature', 'sparse'] → sparse excluded → 2 dense calls
    expect(vectorNames).toContain('semantic');
    expect(vectorNames).toContain('signature');
    expect(calls).toHaveLength(2);
  });

  test('multi-vector results are merged by chunkId with max-score strategy', async () => {
    const semanticResult = makeMockResult('chunk-1', 0.7, 'semantic', {
      relativePath: 'src/a.ts',
    });
    const signatureResult = makeMockResult('chunk-2', 0.9, 'signature', {
      relativePath: 'src/b.ts',
    });

    getMockSearch(config)
      .mockResolvedValueOnce([semanticResult])
      .mockResolvedValueOnce([signatureResult]);

    // Mixed query triggers semantic + signature
    const results = await engine.search({ text: 'how does PaymentService work' });

    const ids = results.map((r) => r.chunkId);
    expect(ids).toContain('chunk-1');
    expect(ids).toContain('chunk-2');
  });
});

describe('computeTermFrequencySparseVector', () => {
  test('tokenizes text and returns sorted indices with TF values', () => {
    const result = computeTermFrequencySparseVector('the quick brown fox the');

    // Should have unique tokens: "the", "quick", "brown", "fox"
    // "the" appears twice, others once
    expect(result.indices.length).toBeGreaterThan(0);
    expect(result.values.length).toBe(result.indices.length);

    // Indices must be sorted ascending
    for (let i = 1; i < result.indices.length; i++) {
      expect(result.indices[i]).toBeGreaterThan(result.indices[i - 1]!);
    }

    // The total sum of values should equal token count (4 unique tokens: the=2, quick=1, brown=1, fox=1 → sum=5)
    const sum = result.values.reduce((a, b) => a + b, 0);
    expect(sum).toBe(5);
  });

  test('returns empty indices and values for empty string', () => {
    const result = computeTermFrequencySparseVector('');

    expect(result.indices).toHaveLength(0);
    expect(result.values).toHaveLength(0);
  });

  test('indices are always unique (no duplicates even on hash collision)', () => {
    // Generate a large text with many tokens to maximise collision surface
    const words = Array.from({ length: 200 }, (_, i) => `token${i}`).join(' ');
    const result = computeTermFrequencySparseVector(words);

    const uniqueIndices = new Set(result.indices);
    expect(uniqueIndices.size).toBe(result.indices.length);
  });
});

// ---------------------------------------------------------------------------
// MMR integration tests
// ---------------------------------------------------------------------------

describe('MMR integration', () => {
  // Shared near-identical content for order.ts chunks (high Jaccard similarity)
  const ORDER_CONTENT = 'function processOrder orderService emit OrderEvent orderId total status';

  // Distinct content for other files (low Jaccard with order.ts chunks)
  const REPO_CONTENT = 'class OrderRepository database findById sql query fetch rows';
  const DTO_CONTENT = 'interface OrderDTO transfer amount createdAt validation schema';

  function makeMMRResult(
    chunkId: string,
    score: number,
    relativePath: string,
    content: string,
    name: string,
  ) {
    return {
      id: `uuid-${chunkId}`,
      score,
      vectorName: 'semantic' as const,
      payload: {
        chunkId,
        filePath: `/project/${relativePath}`,
        relativePath,
        language: 'typescript',
        chunkType: 'function',
        name,
        content,
        startLine: 1,
        endLine: 5,
        imports: [] as string[],
        exports: [] as string[],
        modulePath: 'order-module',
        packageName: undefined as string | undefined,
        layerHints: [] as string[],
        indexedAt: '2026-04-01T00:00:00Z',
      },
    };
  }

  // 4 near-identical chunks from order.ts + 2 distinct chunks from other files
  const candidates = [
    makeMMRResult('order-a', 0.95, 'src/services/order.ts', ORDER_CONTENT, 'processOrderA'),
    makeMMRResult('order-b', 0.93, 'src/services/order.ts', ORDER_CONTENT, 'processOrderB'),
    makeMMRResult('order-c', 0.91, 'src/services/order.ts', ORDER_CONTENT, 'processOrderC'),
    makeMMRResult('order-d', 0.89, 'src/services/order.ts', ORDER_CONTENT, 'processOrderD'),
    makeMMRResult('repo-a', 0.85, 'src/repositories/order-repo.ts', REPO_CONTENT, 'findById'),
    makeMMRResult('dto-a', 0.82, 'src/dto/order-dto.ts', DTO_CONTENT, 'OrderDTO'),
  ];

  function makeMMRConfig(mmrEnabled: boolean | undefined): SearchEngineConfig {
    const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const mockSearch = vi
      .fn()
      .mockResolvedValueOnce(candidates) // text vector
      .mockResolvedValueOnce([]); // code vector (empty — no dedup needed)
    return {
      embeddingProvider: { embed: mockEmbed, dimensions: 3 },
      vectorStore: { search: mockSearch },
      mmrEnabled,
      defaultLimit: 4,
    };
  }

  function makeMMRHybridConfig(): SearchEngineConfig {
    const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const mockSearchHybrid = vi.fn().mockResolvedValue(candidates);
    const mockSearch = vi.fn().mockResolvedValue([]);
    return {
      embeddingProvider: { embed: mockEmbed, dimensions: 3 },
      vectorStore: { search: mockSearch, searchHybrid: mockSearchHybrid },
      mmrEnabled: true,
      defaultLimit: 4,
    };
  }

  test('MMR: search() with architecture query diversifies results across distinct files', async () => {
    const cfg = makeMMRConfig(true);
    const eng = new SearchEngine(cfg);

    // "how do order services interact" → classifyQueryLambda → λ=0.5 (architecture)
    const results = await eng.search({
      text: 'how do order services interact',
      limit: 4,
    });

    const uniquePaths = new Set(results.map((r) => r.relativePath));
    // With λ=0.5, MMR penalises near-duplicate order.ts chunks → ≥2 distinct files
    expect(uniquePaths.size).toBeGreaterThanOrEqual(2);
    expect(results.length).toBe(4);
  });

  test('MMR disabled: search() returns results in score-descending order', async () => {
    const cfg = makeMMRConfig(false);
    const eng = new SearchEngine(cfg);

    const results = await eng.search({ text: 'order processing', limit: 4 });

    // Without MMR, rerankResults sorts by effectiveScore (≈ raw score for generic query)
    // All order.ts chunks dominate by raw score
    expect(results[0]!.score).toBe(0.95);
    expect(results[1]!.score).toBe(0.93);
    expect(results[2]!.score).toBe(0.91);
    expect(results[3]!.score).toBe(0.89);
    expect(results.length).toBe(4);
  });

  test('MMR: searchHybrid() with architecture query diversifies results', async () => {
    const cfg = makeMMRHybridConfig();
    const eng = new SearchEngine(cfg);

    const results = await eng.searchHybrid({
      text: 'how do order services interact',
      limit: 4,
      scoreThreshold: 0, // disable RRF threshold to include all candidates
    });

    const uniquePaths = new Set(results.map((r) => r.relativePath));
    // MMR with λ=0.5 should pull in non-order.ts chunks
    expect(uniquePaths.size).toBeGreaterThanOrEqual(2);
    expect(results.length).toBe(4);
  });

  test('MMR: specific-lookup query uses λ=0.8, top result is highest-score chunk', async () => {
    const cfg = makeMMRConfig(true);
    const eng = new SearchEngine(cfg);

    // "find OrderService class" → no architecture keywords → λ=0.8 (lookup)
    const results = await eng.search({ text: 'find OrderService class', limit: 4 });

    // With λ=0.8 (relevance dominates), the highest-score chunk (0.95) should be first
    expect(results[0]!.score).toBe(0.95);
  });
});

// ---------------------------------------------------------------------------
// T067: Internal health check — lazy probe on first search
// ---------------------------------------------------------------------------

describe('T067: SearchEngine.healthCheck()', () => {
  test('returns { ok: true } when vector store probe succeeds', async () => {
    const cfg = makeConfig();
    const eng = new SearchEngine(cfg);

    const result = await eng.healthCheck();

    expect(result.ok).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
  });

  test('returns { ok: false, error } when vector store probe throws', async () => {
    const cfg = makeConfig();
    vi.mocked(cfg.embeddingProvider.embed).mockRejectedValueOnce(new Error('Qdrant down'));
    const eng = new SearchEngine(cfg);

    const result = await eng.healthCheck();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Qdrant down');
  });
});

// ---------------------------------------------------------------------------
// T068: Zero-result fallback — glob for path-like queries, grep for identifiers
// ---------------------------------------------------------------------------

describe('T068: searchWithFallback() glob/grep zero-result fallback', () => {
  function makeScrollPoint(relativePath: string, name = 'fn') {
    return {
      id: `point-${relativePath}`,
      payload: {
        chunkId: `chunk-${relativePath}`,
        filePath: `/project/${relativePath}`,
        relativePath,
        language: 'typescript',
        chunkType: 'function',
        name,
        content: 'function fn() {}',
        startLine: 1,
        endLine: 5,
        imports: [],
        exports: [],
        indexedAt: '2026-01-01T00:00:00Z',
      },
    };
  }

  function makeScrollConfig(scrollPoints: ReturnType<typeof makeScrollPoint>[]) {
    const cfg = makeConfig();
    // All vector searches return empty → force fallback path
    vi.mocked(cfg.vectorStore.search).mockResolvedValue([]);
    (cfg.vectorStore as Record<string, unknown>).scroll = vi
      .fn()
      .mockResolvedValue({ points: scrollPoints });
    return cfg;
  }

  test('uses scroll to glob-match path-like query when dense search returns empty', async () => {
    const points = [
      makeScrollPoint('src/auth/middleware.ts', 'authMiddleware'),
      makeScrollPoint('src/auth/utils.ts', 'hashPassword'),
    ];
    const cfg = makeScrollConfig(points);
    const eng = new SearchEngine(cfg);

    const result = await eng.searchWithFallback({ text: 'src/auth/middleware.ts' });

    expect((cfg.vectorStore as any).scroll).toHaveBeenCalled();
    expect(result.fallback_used).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]!.relativePath).toContain('middleware.ts');
  });

  test('uses scroll to grep-match CamelCase identifier when dense search returns empty', async () => {
    const points = [makeScrollPoint('src/payment/service.ts', 'PaymentService')];
    const cfg = makeScrollConfig(points);
    const eng = new SearchEngine(cfg);

    const result = await eng.searchWithFallback({ text: 'PaymentService' });

    expect((cfg.vectorStore as any).scroll).toHaveBeenCalled();
    expect(result.fallback_used).toBe(true);
    expect(result.results.some((r) => r.name === 'PaymentService')).toBe(true);
  });

  test('returns found=false with empty results when scroll also finds nothing', async () => {
    const cfg = makeScrollConfig([]);
    const eng = new SearchEngine(cfg);

    const result = await eng.searchWithFallback({ text: 'NonExistentClass' });

    expect(result.found).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T078: filePath reconstruction from projectRoot when stored filePath is absent
// ─────────────────────────────────────────────────────────────────────────────

describe('T078: SearchEngine reconstructs filePath from projectRoot when payload.filePath is absent', () => {
  function makePayloadWithoutFilePath(relativePath: string) {
    return {
      chunkId: 'c1',
      // filePath intentionally omitted (new schema — not stored)
      filePath: '' as string,
      relativePath,
      language: 'java',
      chunkType: 'class',
      name: 'Payment',
      content: '',
      startLine: 1,
      endLine: 5,
      imports: [],
      exports: ['Payment'],
      indexedAt: '2026-06-05T00:00:00Z',
    };
  }

  test('T078: reconstructs absolute filePath from projectRoot + relativePath when stored filePath is empty', async () => {
    const mockSearch = vi.fn().mockResolvedValue([
      {
        id: 'qdrant-uuid-c1',
        score: 0.9,
        vectorName: 'semantic',
        payload: makePayloadWithoutFilePath('src/Payment.java'),
      },
    ]);

    const cfg = makeConfig({
      projectRoot: '/home/user/myproject',
      vectorStore: { search: mockSearch },
    });
    const engine = new SearchEngine(cfg);

    const results = await engine.search({ text: 'payment entity' });

    expect(results[0]?.filePath).toBe('/home/user/myproject/src/Payment.java');
  });

  test('T078: falls back to relativePath when projectRoot is not configured', async () => {
    const mockSearch = vi.fn().mockResolvedValue([
      {
        id: 'qdrant-uuid-c1',
        score: 0.9,
        vectorName: 'semantic',
        payload: makePayloadWithoutFilePath('src/Payment.java'),
      },
    ]);

    const cfg = makeConfig({
      // no projectRoot
      vectorStore: { search: mockSearch },
    });
    const engine = new SearchEngine(cfg);

    const results = await engine.search({ text: 'payment entity' });

    // When no projectRoot, filePath = relativePath (best effort)
    expect(results[0]?.filePath).toBe('src/Payment.java');
  });

  test('T078: uses stored filePath when it is present (backward compat)', async () => {
    const mockSearch = vi.fn().mockResolvedValue([
      {
        id: 'qdrant-uuid-c1',
        score: 0.9,
        vectorName: 'semantic',
        payload: {
          ...makePayloadWithoutFilePath('src/Payment.java'),
          filePath: '/old/absolute/path/src/Payment.java',
        },
      },
    ]);

    const cfg = makeConfig({
      projectRoot: '/home/user/myproject',
      vectorStore: { search: mockSearch },
    });
    const engine = new SearchEngine(cfg);

    const results = await engine.search({ text: 'payment entity' });

    // Stored filePath takes priority over reconstruction (backward compat)
    expect(results[0]?.filePath).toBe('/old/absolute/path/src/Payment.java');
  });
});

// ---------------------------------------------------------------------------
// Phase 11 (US6): Retrieval correctness — fix silent lean-payload bugs
// T086: sparse vector routing  T087: MMR diversity with empty content
// T089: dependency expansion uses relativePath filter
// ---------------------------------------------------------------------------
describe('Phase 11 (US6): Lean-payload retrieval correctness', () => {
  /** Build a mock Qdrant result with no content (lean-payload schema). */
  function makeLean(
    chunkId: string,
    score: number,
    overrides: Partial<{
      relativePath: string;
      name: string;
      defines: string[];
    }> = {},
  ) {
    return {
      id: `uuid-${chunkId}`,
      score,
      vectorName: 'semantic',
      payload: {
        chunkId,
        relativePath: overrides.relativePath ?? 'src/A.java',
        language: 'java',
        chunkType: 'method',
        name: overrides.name ?? 'processPayment',
        // content intentionally absent — lean payload stores no raw code
        startLine: 1,
        endLine: 10,
        imports: [] as string[],
        exports: [] as string[],
        defines: overrides.defines ?? [],
        indexedAt: '2026-06-01T00:00:00Z',
      },
    };
  }

  test('T086: search() calls vectorStore.searchKeyword for keyword/symbol/mixed queries', async () => {
    const mockSearchKeyword = vi.fn().mockResolvedValue([]);
    const cfg = makeConfig({
      vectorStore: {
        search: vi.fn().mockResolvedValue([]),
        searchKeyword: mockSearchKeyword,
      },
    });
    const engine = new SearchEngine(cfg);

    // 'PaymentProcessor' → keyword type → ['sparse', 'semantic'] → must call searchKeyword
    await engine.search({ text: 'PaymentProcessor', scoreThreshold: 0 });

    expect(mockSearchKeyword).toHaveBeenCalledOnce();
    const args = mockSearchKeyword.mock.calls[0]![0] as { sparseVector: unknown };
    expect(args.sparseVector).toBeDefined();
    expect(args.sparseVector).toHaveProperty('indices');
    expect(args.sparseVector).toHaveProperty('values');
  });

  test('T087: search() MMR provides file diversity for lean-payload chunks with empty content', async () => {
    // 4 chunks from src/A.java (all top by raw score), 2 from src/B.java
    // With content='', jaccardSim=0 for every pair → MMR degrades to pure score sort → no diversity
    // After fix (path+name similarityFn), same-file chunks are penalised → B.java must appear
    const mockSearch = vi
      .fn()
      .mockResolvedValue([
        makeLean('c1', 0.95, { relativePath: 'src/A.java', name: 'methodA1' }),
        makeLean('c2', 0.9, { relativePath: 'src/A.java', name: 'methodA2' }),
        makeLean('c3', 0.85, { relativePath: 'src/A.java', name: 'methodA3' }),
        makeLean('c4', 0.8, { relativePath: 'src/A.java', name: 'methodA4' }),
        makeLean('c5', 0.75, { relativePath: 'src/B.java', name: 'methodB1' }),
        makeLean('c6', 0.7, { relativePath: 'src/B.java', name: 'methodB2' }),
      ]);
    const cfg = makeConfig({
      mmrEnabled: true,
      mmrLambda: 0.5, // force diversity lambda
      vectorStore: { search: mockSearch },
    });
    const engine = new SearchEngine(cfg);

    const results = await engine.search({
      text: 'how does payment processing work',
      limit: 4,
      scoreThreshold: 0,
    });

    const uniquePaths = new Set(results.map((r) => r.relativePath));
    // After fix: path-based pairSim penalises A.java duplicates → B.java must appear
    expect(uniquePaths.size).toBeGreaterThanOrEqual(2);
  });

  test('T089: searchWithExpansion() filters neighbor chunks by relativePath, not filePath', async () => {
    const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const mockSearch = vi.fn();
    const mockGetNeighborFiles = vi
      .fn()
      .mockResolvedValue(['src/main/java/com/acme/OrderRepository.java']);

    // Call 1: base semantic search
    mockSearch
      .mockResolvedValueOnce([
        makeLean('base-chunk', 0.9, {
          relativePath: 'src/main/java/com/acme/OrderController.java',
          name: 'createOrder',
        }),
      ])
      // Call 2: SQLite graph expansion fetch (should use relativePath key)
      .mockResolvedValueOnce([]);

    const cfg: SearchEngineConfig = {
      embeddingProvider: { embed: mockEmbed, dimensions: 3 },
      vectorStore: { search: mockSearch },
      dependencyGraph: { getNeighborFiles: mockGetNeighborFiles },
    };
    const engine = new SearchEngine(cfg);

    await engine.searchWithExpansion(
      { text: 'order repository data access', scoreThreshold: 0 },
      { hops: 1 },
    );

    // The second vectorStore.search call is the SQLite graph expansion fetch
    const calls = mockSearch.mock.calls as Array<
      [number[], { filter?: { should?: Array<{ key: string; match: { value: string } }> } }]
    >;
    const expansionCall = calls[1];
    expect(expansionCall).toBeDefined();
    // After fix: key must be 'relativePath', not the deprecated 'filePath'
    const filterKey = expansionCall?.[1]?.filter?.should?.[0]?.key;
    expect(filterKey).toBe('relativePath');
  });
});

describe('Phase 12 (US7): scoreType tagging', () => {
  test('T096: search() results have scoreType: "cosine"', async () => {
    const config = makeConfig();
    const engine = new SearchEngine(config);
    getMockSearch(config).mockResolvedValueOnce([makeMockResult('c1', 0.9, 'semantic')]);
    const results = await engine.search({ text: 'payment', scoreThreshold: 0 });
    expect(results[0]?.scoreType).toBe('cosine');
  });

  test('T097: searchHybrid() results have scoreType: "rrf"', async () => {
    const mockHybrid = vi.fn().mockResolvedValueOnce([makeMockResult('h1', 0.021, 'both')]);
    const config = makeConfig({
      vectorStore: {
        search: vi.fn().mockResolvedValue([]),
        searchHybrid: mockHybrid,
      },
    });
    const engine = new SearchEngine(config);
    const results = await engine.searchHybrid({ text: 'payment', scoreThreshold: 0 });
    expect(results[0]?.scoreType).toBe('rrf');
  });
});

// T129-T130: Test exclusion filter
describe('Phase 16 (US6): test file exclusion', () => {
  test('T129: search() applies must_not stereotype=test filter by default for non-test queries', async () => {
    const config = makeConfig();
    const engine = new SearchEngine(config);

    await engine.search({ text: 'how is Entry created', scoreThreshold: 0 });

    const calls = getMockSearch(config).mock.calls as Array<
      [number[], { filter?: Record<string, unknown> }]
    >;
    // At least one call should have the must_not filter
    const filterUsed = calls[0]?.[1]?.filter as Record<string, unknown> | undefined;
    expect(filterUsed).toBeDefined();
    expect(filterUsed!.must_not).toEqual([{ key: 'stereotype', match: { value: 'test' } }]);
  });

  test('T130: search() does NOT apply test exclusion filter when query has test intent', async () => {
    const config = makeConfig();
    const engine = new SearchEngine(config);

    await engine.search({ text: 'tests for EntryService', scoreThreshold: 0 });

    const calls = getMockSearch(config).mock.calls as Array<
      [number[], { filter?: Record<string, unknown> }]
    >;
    const filterUsed = calls[0]?.[1]?.filter as Record<string, unknown> | undefined;
    // Should NOT have must_not for test stereotype
    if (filterUsed) {
      expect(filterUsed.must_not).toBeUndefined();
    }
  });

  test('T130: search() does NOT apply test exclusion when user explicitly passes stereotype filter', async () => {
    const config = makeConfig();
    const engine = new SearchEngine(config);

    // User explicitly requests stereotype=test (inclusion filter)
    await engine.search({
      text: 'entry helper',
      scoreThreshold: 0,
      filter: { must: [{ key: 'stereotype', match: { value: 'test' } }] },
    });

    const calls = getMockSearch(config).mock.calls as Array<
      [number[], { filter?: Record<string, unknown> }]
    >;
    const filterUsed = calls[0]?.[1]?.filter as Record<string, unknown> | undefined;
    // Should preserve user's filter and NOT add must_not
    expect(filterUsed).toBeDefined();
    expect(filterUsed!.must_not).toBeUndefined();
    expect(filterUsed!.must).toEqual([{ key: 'stereotype', match: { value: 'test' } }]);
  });
});

// T131-T132: Interface expansion
describe('Phase 16 (US6): interface implementation expansion', () => {
  test('T131: expandInterfaceResults() finds implementations for interface results via dependency edges', async () => {
    const mockSearch = vi.fn();
    const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

    // First call: base search returns an interface
    mockSearch.mockResolvedValueOnce([
      {
        id: 'qdrant-1',
        score: 0.85,
        vectorName: 'semantic',
        payload: {
          chunkId: 'iface-chunk',
          relativePath: 'src/main/java/com/example/EntryService.java',
          language: 'java',
          chunkType: 'interface',
          name: 'EntryService',
          content: 'public interface EntryService {}',
          startLine: 1,
          endLine: 10,
          imports: [],
          exports: ['EntryService'],
          indexedAt: '2026-06-01T00:00:00Z',
        },
      },
    ]);

    // Second call: interface expansion finds implementation
    mockSearch.mockResolvedValueOnce([
      {
        id: 'qdrant-2',
        score: 0.0,
        vectorName: 'semantic',
        payload: {
          chunkId: 'impl-chunk',
          relativePath: 'src/main/java/com/example/EntryServiceImpl.java',
          language: 'java',
          chunkType: 'class',
          name: 'EntryServiceImpl',
          content: 'public class EntryServiceImpl implements EntryService {}',
          startLine: 1,
          endLine: 50,
          imports: ['com.example.EntryService'],
          exports: ['EntryServiceImpl'],
          indexedAt: '2026-06-01T00:00:00Z',
          dependencyEdges: [
            { targetPath: 'src/main/java/com/example/EntryService.java', relation: 'implements' },
          ],
        },
      },
    ]);

    const config: SearchEngineConfig = {
      embeddingProvider: { embed: mockEmbed, dimensions: 3 },
      vectorStore: { search: mockSearch },
    };
    const engine = new SearchEngine(config);

    const results = await engine.searchWithInterfaceExpansion({
      text: 'EntryService createEntry',
      scoreThreshold: 0,
    });

    // Should contain both the interface and its implementation
    expect(results.some((r) => r.name === 'EntryService')).toBe(true);
    expect(results.some((r) => r.name === 'EntryServiceImpl')).toBe(true);
  });

  test('T132: expandInterfaceResults() does NOT duplicate when implementation already in results', async () => {
    const mockSearch = vi.fn();
    const mockEmbed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

    // Base search returns both interface AND implementation already
    mockSearch.mockResolvedValueOnce([
      {
        id: 'qdrant-1',
        score: 0.85,
        vectorName: 'semantic',
        payload: {
          chunkId: 'iface-chunk',
          relativePath: 'src/main/java/com/example/EntryService.java',
          language: 'java',
          chunkType: 'interface',
          name: 'EntryService',
          content: 'public interface EntryService {}',
          startLine: 1,
          endLine: 10,
          imports: [],
          exports: ['EntryService'],
          indexedAt: '2026-06-01T00:00:00Z',
        },
      },
      {
        id: 'qdrant-2',
        score: 0.75,
        vectorName: 'semantic',
        payload: {
          chunkId: 'impl-chunk',
          relativePath: 'src/main/java/com/example/EntryServiceImpl.java',
          language: 'java',
          chunkType: 'class',
          name: 'EntryServiceImpl',
          content: 'public class EntryServiceImpl implements EntryService {}',
          startLine: 1,
          endLine: 50,
          imports: ['com.example.EntryService'],
          exports: ['EntryServiceImpl'],
          indexedAt: '2026-06-01T00:00:00Z',
        },
      },
    ]);

    // Expansion search returns same implementation (already in base results)
    mockSearch.mockResolvedValueOnce([
      {
        id: 'qdrant-2',
        score: 0.0,
        vectorName: 'semantic',
        payload: {
          chunkId: 'impl-chunk',
          relativePath: 'src/main/java/com/example/EntryServiceImpl.java',
          language: 'java',
          chunkType: 'class',
          name: 'EntryServiceImpl',
          content: 'public class EntryServiceImpl implements EntryService {}',
          startLine: 1,
          endLine: 50,
          imports: ['com.example.EntryService'],
          exports: ['EntryServiceImpl'],
          indexedAt: '2026-06-01T00:00:00Z',
        },
      },
    ]);

    const config: SearchEngineConfig = {
      embeddingProvider: { embed: mockEmbed, dimensions: 3 },
      vectorStore: { search: mockSearch },
    };
    const engine = new SearchEngine(config);

    const results = await engine.searchWithInterfaceExpansion({
      text: 'EntryService',
      scoreThreshold: 0,
    });

    // Should NOT have duplicates
    const implResults = results.filter((r) => r.name === 'EntryServiceImpl');
    expect(implResults).toHaveLength(1);
  });
});
