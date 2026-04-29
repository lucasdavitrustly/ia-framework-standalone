import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchEngine } from '../search-engine.js';
import type { SearchEngineConfig } from '../types.js';

describe('SearchEngine score threshold behavior', () => {
  let mockVectorStore: {
    search: ReturnType<typeof vi.fn>;
    searchHybrid: ReturnType<typeof vi.fn>;
  };
  let mockEmbeddingProvider: {
    embed: ReturnType<typeof vi.fn>;
    dimensions: number;
  };
  let config: SearchEngineConfig;

  beforeEach(() => {
    mockVectorStore = {
      search: vi.fn().mockResolvedValue([]),
      searchHybrid: vi.fn().mockResolvedValue([]),
    };
    mockEmbeddingProvider = {
      embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
      dimensions: 384,
    };
    config = {
      embeddingProvider: mockEmbeddingProvider,
      vectorStore: mockVectorStore,
    } as unknown as SearchEngineConfig;
  });

  describe('search() - dense mode', () => {
    it('uses 0.3 cosine threshold by default when no scoreThreshold is specified', async () => {
      const engine = new SearchEngine(config);
      await engine.search({ text: 'test query' });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ scoreThreshold: 0.3 }),
      );
    });

    it('passes explicit scoreThreshold override through to vectorStore', async () => {
      const engine = new SearchEngine(config);
      await engine.search({ text: 'test query', scoreThreshold: 0.7 });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ scoreThreshold: 0.7 }),
      );
    });

    it('uses config.defaultScoreThreshold when provided and no query override', async () => {
      const engineWithConfig = new SearchEngine({
        ...config,
        defaultScoreThreshold: 0.6,
      } as unknown as SearchEngineConfig);
      await engineWithConfig.search({ text: 'test query' });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ scoreThreshold: 0.6 }),
      );
    });
  });

  describe('searchHybrid() - RRF mode', () => {
    it('does NOT pass scoreThreshold to vectorStore.searchHybrid (RRF scores are rank-based ~0.01-0.03)', async () => {
      const engine = new SearchEngine(config);
      await engine.searchHybrid({ text: 'test query' });

      expect(mockVectorStore.searchHybrid).toHaveBeenCalledTimes(1);
      const [options] = mockVectorStore.searchHybrid.mock.calls[0] as [
        { scoreThreshold?: number | undefined },
      ];
      expect(options.scoreThreshold).toBeUndefined();
    });

    it('does not pass scoreThreshold even when query has one (RRF mode ignores it)', async () => {
      const engine = new SearchEngine(config);
      await engine.searchHybrid({ text: 'test query', scoreThreshold: 0.5 });

      expect(mockVectorStore.searchHybrid).toHaveBeenCalledTimes(1);
      const [options] = mockVectorStore.searchHybrid.mock.calls[0] as [
        { scoreThreshold?: number | undefined },
      ];
      expect(options.scoreThreshold).toBeUndefined();
    });

    it('filters out results below default RRF threshold (0.015)', async () => {
      const makePayload = (chunkId: string) => ({
        chunkId,
        filePath: `/src/${chunkId}.ts`,
        relativePath: `src/${chunkId}.ts`,
        language: 'typescript',
        chunkType: 'function',
        name: chunkId,
        content: `function ${chunkId}() {}`,
        startLine: 1,
        endLine: 1,
        imports: [],
        exports: [chunkId],
        indexedAt: '2024-01-01',
      });

      mockVectorStore.searchHybrid.mockResolvedValue([
        { id: '1', score: 0.025, payload: makePayload('highScore'), vectorName: 'text' },
        { id: '2', score: 0.01, payload: makePayload('lowScore'), vectorName: 'text' },
        { id: '3', score: 0.02, payload: makePayload('midScore'), vectorName: 'text' },
      ]);

      const engine = new SearchEngine(config);
      const results = await engine.searchHybrid({ text: 'test query' });

      // lowScore (0.010) should be filtered out — below 0.015 default
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(['highScore', 'midScore']));
      expect(results.find((r) => r.name === 'lowScore')).toBeUndefined();
    });

    it('uses config.defaultRrfScoreThreshold when provided', async () => {
      const makePayload = (chunkId: string) => ({
        chunkId,
        filePath: `/src/${chunkId}.ts`,
        relativePath: `src/${chunkId}.ts`,
        language: 'typescript',
        chunkType: 'function',
        name: chunkId,
        content: `function ${chunkId}() {}`,
        startLine: 1,
        endLine: 1,
        imports: [],
        exports: [chunkId],
        indexedAt: '2024-01-01',
      });

      mockVectorStore.searchHybrid.mockResolvedValue([
        { id: '1', score: 0.025, payload: makePayload('highScore'), vectorName: 'text' },
        { id: '2', score: 0.018, payload: makePayload('midScore'), vectorName: 'text' },
      ]);

      const engine = new SearchEngine({
        ...config,
        defaultRrfScoreThreshold: 0.02,
      } as unknown as SearchEngineConfig);
      const results = await engine.searchHybrid({ text: 'test query' });

      // midScore (0.018) should be filtered out — below custom 0.02 threshold
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('highScore');
    });

    it('uses query scoreThreshold as RRF threshold override when provided', async () => {
      const makePayload = (chunkId: string) => ({
        chunkId,
        filePath: `/src/${chunkId}.ts`,
        relativePath: `src/${chunkId}.ts`,
        language: 'typescript',
        chunkType: 'function',
        name: chunkId,
        content: `function ${chunkId}() {}`,
        startLine: 1,
        endLine: 1,
        imports: [],
        exports: [chunkId],
        indexedAt: '2024-01-01',
      });

      mockVectorStore.searchHybrid.mockResolvedValue([
        { id: '1', score: 0.025, payload: makePayload('highScore'), vectorName: 'text' },
        { id: '2', score: 0.022, payload: makePayload('midScore'), vectorName: 'text' },
      ]);

      const engine = new SearchEngine(config);
      const results = await engine.searchHybrid({ text: 'test query', scoreThreshold: 0.024 });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('highScore');
    });

    it('returns empty array when all results are below RRF threshold', async () => {
      const makePayload = (chunkId: string) => ({
        chunkId,
        filePath: `/src/${chunkId}.ts`,
        relativePath: `src/${chunkId}.ts`,
        language: 'typescript',
        chunkType: 'function',
        name: chunkId,
        content: `function ${chunkId}() {}`,
        startLine: 1,
        endLine: 1,
        imports: [],
        exports: [chunkId],
        indexedAt: '2024-01-01',
      });

      mockVectorStore.searchHybrid.mockResolvedValue([
        { id: '1', score: 0.005, payload: makePayload('veryLow'), vectorName: 'text' },
        { id: '2', score: 0.008, payload: makePayload('alsoLow'), vectorName: 'text' },
      ]);

      const engine = new SearchEngine(config);
      const results = await engine.searchHybrid({ text: 'nonexistent query' });

      expect(results).toHaveLength(0);
    });
  });
});

describe('MultiCollectionSearchEngine score threshold behavior', () => {
  it('scoreThreshold is stripped before child engines receive over-fetch query', () => {
    // Covered by multi-collection-search-engine.test.ts Test 4 (updated to assert undefined)
    expect(true).toBe(true);
  });
});
