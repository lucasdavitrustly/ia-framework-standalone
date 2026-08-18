import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchEngine } from '../search-engine.js';
import type { SearchEngineConfig } from '../types.js';
import type { EmbeddingContract } from '@ia-framework/core';
import { createEffectiveFilter } from '../effective-filter.js';

const MOCK_CONTRACT: EmbeddingContract = {
  provider: 'openai',
  model: 'mock-model',
  dimension: 384,
  tokenizerVersion: 1,
  sparseHashVersion: 1,
};

/**
 * Helper to create a minimal VectorSearchResult-shaped mock return value.
 */
function makeRaw(chunkId: string, content = 'code content') {
  return {
    id: chunkId,
    score: 0.9,
    vectorName: 'text' as const,
    payload: {
      chunkId,
      filePath: `/project/src/${chunkId}.ts`,
      relativePath: `src/${chunkId}.ts`,
      language: 'typescript',
      chunkType: 'function',
      name: chunkId,
      content,
      startLine: 1,
      endLine: 10,
      imports: [],
      exports: [chunkId],
      indexedAt: '2026-01-01T00:00:00Z',
    },
  };
}

function makeEnrichedRaw(chunkId: string, enrichment: Record<string, unknown>) {
  return {
    ...makeRaw(chunkId),
    payload: {
      ...makeRaw(chunkId).payload,
      ...enrichment,
      signature: 'load(): void',
      stereotype: 'service',
      archLayer: 'service',
      docCommentStartLine: 1,
      annotationStartLine: 1,
      signatureOnly: false,
    },
  };
}

describe('SearchEngine.searchWithFallback()', () => {
  let mockSearch: ReturnType<typeof vi.fn>;
  let mockSearchHybrid: ReturnType<typeof vi.fn>;
  let mockSearchKeyword: ReturnType<typeof vi.fn>;
  let mockEmbed: ReturnType<typeof vi.fn>;
  let config: SearchEngineConfig;

  beforeEach(() => {
    mockSearch = vi.fn();
    mockSearchHybrid = vi.fn();
    mockSearchKeyword = vi.fn();
    mockEmbed = vi.fn().mockResolvedValue(new Array(384).fill(0.1));

    config = {
      embeddingProvider: { embed: mockEmbed, dimensions: 384, contract: MOCK_CONTRACT },
      vectorStore: {
        search: mockSearch,
        searchHybrid: mockSearchHybrid,
        searchKeyword: mockSearchKeyword,
      },
    } as unknown as SearchEngineConfig;
  });

  // Test 1: primary search returns results → no fallback triggered
  it('returns results from primary search when results exist (no fallback triggered)', async () => {
    const raw = makeRaw('fn-a');
    mockSearch.mockResolvedValue([raw]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'auth middleware' });

    expect(result.found).toBe(true);
    expect(result.fallback_used).toBe(false);
    expect(result.fallback_mode).toBe('none');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.chunkId).toBe('fn-a');
    expect(result.suggestions).toEqual([]);
    // Hybrid and keyword should NOT be called
    expect(mockSearchHybrid).not.toHaveBeenCalled();
    expect(mockSearchKeyword).not.toHaveBeenCalled();
  });

  // Test 2: primary returns [] → hybrid called → hybrid results returned
  it('calls searchHybrid when primary search() returns [] and returns hybrid results', async () => {
    mockSearch.mockResolvedValue([]);
    const hybridRaw = makeRaw('fn-b');
    mockSearchHybrid.mockResolvedValue([hybridRaw]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'auth middleware' });

    expect(result.found).toBe(true);
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_mode).toBe('hybrid');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.chunkId).toBe('fn-b');
    expect(result.suggestions).toEqual([]);
    expect(mockSearchKeyword).not.toHaveBeenCalled();
  });

  // Test 3: both primary and hybrid return [] → searchKeyword called → suggestions returned
  it('calls searchKeyword when both search() and searchHybrid() return [] and returns suggestions', async () => {
    mockSearch.mockResolvedValue([]);
    mockSearchHybrid.mockResolvedValue([]);
    const kwRaw = makeRaw('fn-c', 'keyword match content here for fn-c');
    mockSearchKeyword.mockResolvedValue([kwRaw]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'auth middleware' });

    expect(result.found).toBe(false);
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_mode).toBe('keyword');
    expect(result.results).toEqual([]);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]!.file).toBe('src/fn-c.ts');
    expect(result.suggestions[0]!.name).toBe('fn-c');
    expect(result.suggestions[0]!.snippet).toContain('keyword match');
    expect(mockSearchKeyword).toHaveBeenCalled();
  });

  // Test 4: all three modes return [] → empty FallbackSearchResult with found:false
  it('returns empty FallbackSearchResult with found:false when all three modes return []', async () => {
    mockSearch.mockResolvedValue([]);
    mockSearchHybrid.mockResolvedValue([]);
    mockSearchKeyword.mockResolvedValue([]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'totally unknown query' });

    expect(result.found).toBe(false);
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_mode).toBe('keyword');
    expect(result.results).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  // Test 5: fallback steps use scoreThreshold 0.0 (per D-07)
  it('calls hybrid and keyword fallback with no scoreThreshold (uses engine defaults)', async () => {
    mockSearch.mockResolvedValue([]);
    mockSearchHybrid.mockResolvedValue([]);
    mockSearchKeyword.mockResolvedValue([]);

    const engine = new SearchEngine(config);
    await engine.searchWithFallback({ text: 'query', scoreThreshold: 0.9 });

    // hybrid call should NOT receive scoreThreshold
    expect(mockSearchHybrid).toHaveBeenCalledWith(
      expect.not.objectContaining({ scoreThreshold: expect.anything() as unknown }),
    );
  });

  // Test 6: enableFallback:false → no retry (per D-06)
  it('returns empty result without retrying when enableFallback is false', async () => {
    mockSearch.mockResolvedValue([]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback(
      { text: 'auth middleware' },
      { enableFallback: false },
    );

    expect(result.found).toBe(false);
    expect(result.fallback_used).toBe(false);
    expect(result.fallback_mode).toBe('none');
    expect(result.results).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(mockSearchHybrid).not.toHaveBeenCalled();
    expect(mockSearchKeyword).not.toHaveBeenCalled();
  });

  // Test 7: suggestions capped at 3 entries (per D-04)
  it('caps suggestions at 3 entries', async () => {
    mockSearch.mockResolvedValue([]);
    mockSearchHybrid.mockResolvedValue([]);
    const kwRaws = ['fn-x', 'fn-y', 'fn-z', 'fn-w'].map((id) => makeRaw(id));
    mockSearchKeyword.mockResolvedValue(kwRaws);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'anything' });

    expect(result.suggestions).toHaveLength(3);
  });

  // Test 8: found:true, fallback_used:false when primary succeeds
  it('returns found:true, fallback_used:false when primary succeeds', async () => {
    mockSearch.mockResolvedValue([makeRaw('fn-d')]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'primary succeeds' });

    expect(result.found).toBe(true);
    expect(result.fallback_used).toBe(false);
    expect(result.fallback_mode).toBe('none');
  });

  // Test 9: found:true, fallback_used:true, fallback_mode:'hybrid' when hybrid succeeds
  it('returns found:true, fallback_used:true, fallback_mode:hybrid when hybrid succeeds', async () => {
    mockSearch.mockResolvedValue([]);
    mockSearchHybrid.mockResolvedValue([makeRaw('fn-e')]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'hybrid only' });

    expect(result.found).toBe(true);
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_mode).toBe('hybrid');
  });

  it('preserves the same metadata completeness on the hybrid fallback as the primary path', async () => {
    const primaryRaw = makeEnrichedRaw('same-chunk', {
      description: 'Primary description',
      semanticTags: ['primary'],
    });
    const fallbackRaw = makeEnrichedRaw('same-chunk', {
      description: 'Fallback description',
      semanticTags: ['fallback'],
    });
    mockSearch.mockResolvedValue([primaryRaw]);
    mockSearchHybrid.mockResolvedValue([fallbackRaw]);

    const engine = new SearchEngine(config);
    const primary = await engine.search({ text: 'primary path' });
    mockSearch.mockResolvedValue([]);
    const fallback = await engine.searchWithFallback({ text: 'fallback path' });

    const populatedFields = (result: (typeof primary)[number]) =>
      Object.keys(result).filter((key) => result[key as keyof typeof result] !== undefined);
    expect(populatedFields(fallback.results[0]!)).toEqual(populatedFields(primary[0]!));
    expect(fallback.results[0]!.enrichment).toEqual({
      description: 'Fallback description',
      semanticTags: ['fallback'],
    });
    expect(fallback.results[0]!.signature).toBe('load(): void');
    expect(fallback.results[0]!.stereotype).toBe('service');
  });

  it('preserves enrichment on call-chain expansion results', async () => {
    const expandedRaw = makeEnrichedRaw('called-method', {
      description: 'Loads payment data.',
      semanticTags: ['payments'],
    });
    const engine = new SearchEngine({
      ...config,
      vectorStore: {
        search: mockSearch as SearchEngineConfig['vectorStore']['search'],
        scroll: vi.fn().mockResolvedValue({
          points: [{ id: expandedRaw.id, payload: expandedRaw.payload }],
          nextOffset: undefined,
        }),
      },
    });

    const results = await engine.expandCallChain(
      [{ ...makeRaw('caller').payload, calls: ['loadPayment'] } as never],
      createEffectiveFilter(),
      'calls',
    );

    expect(results[0]?.enrichment).toEqual({
      description: 'Loads payment data.',
      semanticTags: ['payments'],
    });
    expect(results[0]?.signature).toBe('load(): void');
  });

  it('preserves enrichment on adjacent expansion results', async () => {
    const expandedRaw = makeEnrichedRaw('adjacent', {
      description: 'Defines the adjacent helper.',
      semanticTags: ['helper'],
    });
    const engine = new SearchEngine({
      ...config,
      vectorStore: {
        search: mockSearch as SearchEngineConfig['vectorStore']['search'],
        scroll: vi.fn().mockResolvedValue({
          points: [{ id: expandedRaw.id, payload: { ...expandedRaw.payload, chunkIndex: 0 } }],
          nextOffset: undefined,
        }),
      },
    });

    const [result] = await engine.getAdjacentChunks(
      'src/adjacent.ts',
      1,
      3,
      createEffectiveFilter(),
    );

    expect(result?.enrichment).toEqual({
      description: 'Defines the adjacent helper.',
      semanticTags: ['helper'],
    });
    expect(result?.signature).toBe('load(): void');
  });

  it('does not invoke a query-time enrichment client during dependency expansion', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const expandedRaw = makeEnrichedRaw('dependency', { description: 'Indexed dependency summary' });
    mockSearch.mockResolvedValue([makeRaw('base')]);
    const engine = new SearchEngine({
      ...config,
      dependencyGraph: {
        getNeighborFiles: vi.fn().mockResolvedValue(['src/dependency.ts']),
      },
      vectorStore: {
        search: mockSearch as SearchEngineConfig['vectorStore']['search'],
        scroll: vi.fn().mockResolvedValue({
          points: [{ id: expandedRaw.id, payload: expandedRaw.payload }],
          nextOffset: undefined,
        }),
      },
    });

    try {
      const results = await engine.searchWithExpansion(
        { text: 'load dependency' },
        createEffectiveFilter(),
      );

      expect(results[1]?.enrichment).toEqual({ description: 'Indexed dependency summary' });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  // Test 10: found:false, fallback_mode:'keyword', suggestions populated when only keyword returns
  it('returns found:false, fallback_mode:keyword with suggestions when only keyword returns results', async () => {
    mockSearch.mockResolvedValue([]);
    mockSearchHybrid.mockResolvedValue([]);
    mockSearchKeyword.mockResolvedValue([makeRaw('fn-f', 'relevant keyword snippet content')]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'keyword only match' });

    expect(result.found).toBe(false);
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_mode).toBe('keyword');
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]!.snippet).toBeTruthy();
  });

  // Test 11: graceful degradation when vectorStore.searchKeyword is undefined
  it('skips keyword step and returns empty suggestions when vectorStore.searchKeyword is undefined', async () => {
    mockSearch.mockResolvedValue([]);
    mockSearchHybrid.mockResolvedValue([]);

    const configWithoutKeyword: SearchEngineConfig = {
      embeddingProvider: { embed: mockEmbed, dimensions: 384, contract: MOCK_CONTRACT },
      vectorStore: {
        search: mockSearch,
        searchHybrid: mockSearchHybrid,
        // no searchKeyword
      },
    } as unknown as SearchEngineConfig;

    const engine = new SearchEngine(configWithoutKeyword);
    const result = await engine.searchWithFallback({ text: 'nothing found' });

    expect(result.found).toBe(false);
    expect(result.fallback_used).toBe(true);
    expect(result.fallback_mode).toBe('keyword');
    expect(result.suggestions).toEqual([]);
  });

  // Test 12: graceful degradation when vectorStore.searchHybrid is undefined — goes to keyword
  it('skips hybrid step and goes to keyword when vectorStore.searchHybrid is undefined', async () => {
    mockSearch.mockResolvedValue([]);
    const kwRaw = makeRaw('fn-g');
    mockSearchKeyword.mockResolvedValue([kwRaw]);

    const configWithoutHybrid: SearchEngineConfig = {
      embeddingProvider: { embed: mockEmbed, dimensions: 384, contract: MOCK_CONTRACT },
      vectorStore: {
        search: mockSearch,
        // no searchHybrid
        searchKeyword: mockSearchKeyword,
      },
    } as unknown as SearchEngineConfig;

    const engine = new SearchEngine(configWithoutHybrid);
    const result = await engine.searchWithFallback({ text: 'nothing semantic' });

    expect(mockSearchHybrid).not.toHaveBeenCalled();
    expect(mockSearchKeyword).toHaveBeenCalled();
    expect(result.fallback_mode).toBe('keyword');
    expect(result.suggestions).toHaveLength(1);
  });
});
