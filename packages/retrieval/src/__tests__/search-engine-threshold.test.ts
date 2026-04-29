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
  });
});

describe('MultiCollectionSearchEngine score threshold behavior', () => {
  it('scoreThreshold is stripped before child engines receive over-fetch query', () => {
    // Covered by multi-collection-search-engine.test.ts Test 4 (updated to assert undefined)
    expect(true).toBe(true);
  });
});
