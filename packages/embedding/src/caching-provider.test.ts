import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { EmbeddingContract } from '@ia-framework/core';
import { CachingEmbeddingProvider } from './caching-provider.js';
import type {
  EmbedBatchOutcome,
  EmbeddingProvider,
  EmbeddingTaskType,
} from './interface.js';

const MOCK_CONTRACT: EmbeddingContract = {
  provider: 'openai',
  model: 'mock-model',
  dimension: 768,
  tokenizerVersion: 1,
  sparseHashVersion: 1,
};

/**
 * The double's mocked members must stay visible so call-count assertions are
 * type-safe rather than unbound-method reads off the interface type.
 */
type MockedProvider = EmbeddingProvider & {
  embed: Mock;
  embedBatch: Mock;
  estimateTokens: Mock;
};

function createMockProvider(): MockedProvider {
  return {
    name: 'mock',
    model: 'mock-model',
    dimensions: 768,
    contract: MOCK_CONTRACT,
    // Deterministic vector derived from the text content.
    embed: vi.fn((text: string, _taskType?: EmbeddingTaskType) =>
      Promise.resolve(Array.from({ length: 768 }, (_, i) => text.charCodeAt(i % text.length) / 255)),
    ),
    embedBatch: vi.fn(
      (texts: string[], _taskType?: EmbeddingTaskType): Promise<EmbedBatchOutcome> =>
        Promise.resolve({
          vectors: texts.map((text) =>
            Array.from({ length: 768 }, (_, i) => text.charCodeAt(i % text.length) / 255),
          ),
          failures: [],
        }),
    ),
    estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  };
}

describe('CachingEmbeddingProvider', () => {
  let underlying: MockedProvider;
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

    it('forwards the complete embedding contract from the underlying provider', () => {
      expect(caching.contract).toEqual(MOCK_CONTRACT);
    });

    it('delegates embedBatch to the underlying provider (no batch caching)', async () => {
      const texts = ['hello', 'world'];
      const result = await caching.embedBatch(texts, 'document');

      expect(result.vectors).toHaveLength(2);
      expect(result.failures).toEqual([]);
      expect(underlying.embedBatch).toHaveBeenCalledWith(texts, 'document', undefined);
    });

    it('returns an empty per-input outcome for an empty batch', async () => {
      const result = await caching.embedBatch([], 'document');

      expect(result).toEqual({ vectors: [], failures: [] });
      expect(underlying.embedBatch).toHaveBeenCalledWith([], 'document', undefined);
    });

    it('preserves a cached vector while remapping a failing sibling to its original index', async () => {
      const cachedVector = await caching.embed('cached', 'document');
      underlying.embedBatch = vi.fn(
        (): Promise<EmbedBatchOutcome> =>
          Promise.resolve({
            vectors: [null],
            failures: [{ index: 0, reason: 'provider unavailable', retryable: true }],
          }),
      );

      const result = await caching.embedBatch(['cached', 'uncached'], 'document');

      expect(result.vectors).toEqual([cachedVector, null]);
      expect(result.failures).toEqual([
        { index: 1, reason: 'provider unavailable', retryable: true },
      ]);
      expect(underlying.embedBatch).toHaveBeenCalledWith(['uncached'], 'document', undefined);
    });

    it('preserves successful and failed positions for a partially failing cache miss batch', async () => {
      underlying.embedBatch = vi.fn(
        (): Promise<EmbedBatchOutcome> =>
          Promise.resolve({
            vectors: [[1, 2], null, [3, 4]],
            failures: [{ index: 1, reason: 'invalid input', retryable: false }],
          }),
      );

      const result = await caching.embedBatch(['first', 'second', 'third'], 'query');

      expect(result.vectors).toEqual([[1, 2], null, [3, 4]]);
      expect(result.failures).toEqual([{ index: 1, reason: 'invalid input', retryable: false }]);
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
