import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CachingEmbeddingProvider } from './caching-provider.js';
import type { EmbeddingProvider, EmbeddingTaskType } from './interface.js';

function createMockProvider(): EmbeddingProvider {
  let callCount = 0;
  return {
    name: 'mock',
    model: 'mock-model',
    dimensions: 768,
    embed: vi.fn(async (text: string, _taskType?: EmbeddingTaskType) => {
      callCount++;
      // Return a deterministic vector based on text content
      return Array.from({ length: 768 }, (_, i) => text.charCodeAt(i % text.length) / 255);
    }),
    embedBatch: vi.fn(async (texts: string[], _taskType?: EmbeddingTaskType) => {
      callCount += texts.length;
      return texts.map((text) =>
        Array.from({ length: 768 }, (_, i) => text.charCodeAt(i % text.length) / 255),
      );
    }),
    estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  };
}

describe('CachingEmbeddingProvider', () => {
  let underlying: EmbeddingProvider;
  let caching: CachingEmbeddingProvider;

  beforeEach(() => {
    underlying = createMockProvider();
    caching = new CachingEmbeddingProvider(underlying);
  });

  // T148: Returns cached vector on cache hit without calling underlying provider again
  describe('T148: cache hit returns same vector without second call', () => {
    it('returns the same vector on cache hit without calling underlying embed() a second time', async () => {
      const text = 'payment retry logic';
      const taskType: EmbeddingTaskType = 'query';

      const first = await caching.embed(text, taskType);
      const second = await caching.embed(text, taskType);

      expect(first).toEqual(second);
      expect(underlying.embed).toHaveBeenCalledTimes(1);
    });

    it('differentiates cache entries by taskType', async () => {
      const text = 'payment retry logic';

      await caching.embed(text, 'query');
      await caching.embed(text, 'document');

      // Different taskType → different cache entries → 2 calls
      expect(underlying.embed).toHaveBeenCalledTimes(2);
    });

    it('differentiates cache entries by text content', async () => {
      await caching.embed('hello', 'query');
      await caching.embed('world', 'query');

      expect(underlying.embed).toHaveBeenCalledTimes(2);
    });

    it('exposes the underlying provider properties (name, model, dimensions)', () => {
      expect(caching.name).toBe('mock');
      expect(caching.model).toBe('mock-model');
      expect(caching.dimensions).toBe(768);
    });

    it('delegates embedBatch to the underlying provider (no batch caching)', async () => {
      const texts = ['hello', 'world'];
      const result = await caching.embedBatch(texts, 'document');

      expect(result).toHaveLength(2);
      expect(underlying.embedBatch).toHaveBeenCalledWith(texts, 'document');
    });

    it('delegates estimateTokens to the underlying provider', () => {
      const tokens = caching.estimateTokens('hello world');
      expect(tokens).toBeGreaterThan(0);
      expect(underlying.estimateTokens).toHaveBeenCalledWith('hello world');
    });
  });

  // T149: LRU eviction at 100 entries
  describe('T149: LRU eviction at 100 entries', () => {
    it('evicts the least-recently-used entry when cache reaches 100 entries', async () => {
      // Fill cache with 100 entries
      for (let i = 0; i < 100; i++) {
        await caching.embed(`text-${i}`, 'query');
      }

      // Underlying should have been called 100 times
      expect(underlying.embed).toHaveBeenCalledTimes(100);

      // Access text-0 again — should be a cache hit (it's still in cache)
      await caching.embed('text-0', 'query');
      expect(underlying.embed).toHaveBeenCalledTimes(100); // No new call

      // Now add entry 101 — this should evict the LRU entry (text-1, since text-0 was just accessed)
      await caching.embed('text-100', 'query');
      expect(underlying.embed).toHaveBeenCalledTimes(101);

      // text-1 should now be evicted (it was LRU after text-0 was re-accessed)
      await caching.embed('text-1', 'query');
      expect(underlying.embed).toHaveBeenCalledTimes(102); // Cache miss → new call

      // text-0 should still be in cache (it was recently used)
      await caching.embed('text-0', 'query');
      expect(underlying.embed).toHaveBeenCalledTimes(102); // Cache hit → no new call
    });

    it('respects custom maxSize if provided', async () => {
      const freshUnderlying = createMockProvider();
      const smallCache = new CachingEmbeddingProvider(freshUnderlying, { maxSize: 3 });

      await smallCache.embed('a', 'query');
      await smallCache.embed('b', 'query');
      await smallCache.embed('c', 'query');
      // Cache full: [a(1), b(2), c(3)] — access counters
      expect(freshUnderlying.embed).toHaveBeenCalledTimes(3);

      await smallCache.embed('d', 'query');
      // Evicts 'a' (LRU, oldest access): cache is [b(2), c(3), d(4)]
      expect(freshUnderlying.embed).toHaveBeenCalledTimes(4);

      // 'a' should be evicted — cache miss
      await smallCache.embed('a', 'query');
      expect(freshUnderlying.embed).toHaveBeenCalledTimes(5);

      // 'c' and 'd' should still be in cache — cache hit
      await smallCache.embed('c', 'query');
      expect(freshUnderlying.embed).toHaveBeenCalledTimes(5); // no new call

      await smallCache.embed('d', 'query');
      expect(freshUnderlying.embed).toHaveBeenCalledTimes(5); // no new call
    });
  });
});
