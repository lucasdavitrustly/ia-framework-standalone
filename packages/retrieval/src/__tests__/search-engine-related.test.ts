import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRelatedTerms } from '../search-synonyms.js';
import { SearchEngine } from '../search-engine.js';
import type { SearchEngineConfig } from '../types.js';

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

describe('getRelatedTerms()', () => {
  it('returns synonym terms for "websocket"', () => {
    const terms = getRelatedTerms('websocket');
    expect(terms).toEqual(['message', 'queue', 'event', 'broker', 'listener', 'publish']);
  });

  it('returns synonym terms for "grpc"', () => {
    const terms = getRelatedTerms('grpc');
    expect(terms).toEqual(['protobuf', 'stub', 'channel', 'service', 'rpc']);
  });

  it('returns [] for unknown term', () => {
    const terms = getRelatedTerms('unknown_term');
    expect(terms).toEqual([]);
  });

  it('is case-insensitive', () => {
    const terms = getRelatedTerms('WebSocket');
    expect(terms).toEqual(['message', 'queue', 'event', 'broker', 'listener', 'publish']);
  });
});

describe('SearchEngine.searchWithFallback() related-concept expansion', () => {
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
      embeddingProvider: { embed: mockEmbed, dimensions: 384 },
      vectorStore: {
        search: mockSearch,
        searchHybrid: mockSearchHybrid,
        searchKeyword: mockSearchKeyword,
      },
    } as unknown as SearchEngineConfig;
  });

  it('returns relatedResults when all fallbacks return zero results but synonym match exists', async () => {
    // mockEmbed returns different vectors per query text so mockSearch can distinguish
    mockEmbed.mockImplementation(async (text: string) => {
      if (text === 'message') return new Array(384).fill(0.2);
      return new Array(384).fill(0.1);
    });
    // Primary search for "websocket" (vector 0.1) returns empty; "message" (vector 0.2) returns results
    mockSearch.mockImplementation(async (vector: number[]) => {
      if (vector[0] === 0.2) return [makeRaw('msg-handler'), makeRaw('msg-queue')];
      return [];
    });
    mockSearchHybrid.mockResolvedValue([]);
    mockSearchKeyword.mockResolvedValue([]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'websocket' });

    expect(result.found).toBe(false);
    expect(result.relatedResults).toBeDefined();
    expect(result.relatedResults!.length).toBeGreaterThan(0);
    expect(result.related_query).toBe('message');
  });

  it('does not set relatedResults when primary search succeeds', async () => {
    mockSearch.mockResolvedValue([makeRaw('fn-a'), makeRaw('fn-b'), makeRaw('fn-c')]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'websocket' });

    expect(result.found).toBe(true);
    expect(result.relatedResults).toBeUndefined();
  });

  it('returns no relatedResults when term has no synonym match', async () => {
    mockSearch.mockResolvedValue([]);
    mockSearchHybrid.mockResolvedValue([]);
    mockSearchKeyword.mockResolvedValue([]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'unknown_xyz' });

    expect(result.found).toBe(false);
    expect(result.relatedResults).toBeUndefined();
  });

  it('caps relatedResults at 3', async () => {
    mockEmbed.mockImplementation(async (text: string) => {
      if (text === 'message') return new Array(384).fill(0.2);
      return new Array(384).fill(0.1);
    });
    mockSearch.mockImplementation(async (vector: number[]) => {
      if (vector[0] === 0.2)
        return [makeRaw('r1'), makeRaw('r2'), makeRaw('r3'), makeRaw('r4'), makeRaw('r5')];
      return [];
    });
    mockSearchHybrid.mockResolvedValue([]);
    mockSearchKeyword.mockResolvedValue([]);

    const engine = new SearchEngine(config);
    const result = await engine.searchWithFallback({ text: 'websocket' });

    expect(result.relatedResults).toHaveLength(3);
  });
});
