import type {
  EmbedBatchOutcome,
  EmbeddingProvider,
  EmbeddingTaskType,
  InputFailure,
} from './interface.js';

export interface CachingProviderOptions {
  /** Maximum number of cached embeddings (LRU eviction). Default: 100 */
  maxSize?: number;
}

/**
 * LRU cache entry with access tracking for eviction.
 */
interface CacheEntry {
  vector: number[];
  /** Used for LRU tracking — updated on every access */
  lastAccess: number;
}

/**
 * A caching wrapper around any EmbeddingProvider.
 * Caches `embed()` results by (text, taskType) key with LRU-100 eviction.
 * Delegates `embedBatch()` and `estimateTokens()` directly to the underlying provider.
 *
 * Embedding is deterministic (same input → same output), so cached entries never need
 * invalidation. The cache dies naturally with the MCP server process (in-memory).
 */
export class CachingEmbeddingProvider implements EmbeddingProvider {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private accessCounter = 0;

  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  readonly contract: EmbeddingProvider['contract'];

  constructor(
    private readonly underlying: EmbeddingProvider,
    options?: CachingProviderOptions,
  ) {
    this.name = underlying.name;
    this.model = underlying.model;
    this.dimensions = underlying.dimensions;
    this.contract = underlying.contract;
    this.maxSize = options?.maxSize ?? 100;
  }

  async embed(text: string, taskType?: EmbeddingTaskType, signal?: AbortSignal): Promise<number[]> {
    const key = this.buildKey(text, taskType);
    const cached = this.cache.get(key);

    if (cached) {
      // Update LRU access time
      cached.lastAccess = ++this.accessCounter;
      return cached.vector;
    }

    // Cache miss — call underlying provider
    const vector = await this.underlying.embed(text, taskType, signal);

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, { vector, lastAccess: ++this.accessCounter });
    return vector;
  }

  async embedBatch(
    texts: string[],
    taskType?: EmbeddingTaskType,
    signal?: AbortSignal,
  ): Promise<EmbedBatchOutcome> {
    if (texts.length === 0) return this.underlying.embedBatch(texts, taskType, signal);

    const vectors = new Array<number[] | null>(texts.length).fill(null);
    const misses: Array<{ index: number; text: string }> = [];

    for (let index = 0; index < texts.length; index++) {
      const text = texts[index]!;
      const key = this.buildKey(text, taskType);
      const cached = this.cache.get(key);
      if (cached) {
        cached.lastAccess = ++this.accessCounter;
        vectors[index] = cached.vector;
      } else {
        misses.push({ index, text });
      }
    }

    if (misses.length === 0) return { vectors, failures: [] };

    const outcome = await this.underlying.embedBatch(
      misses.map(({ text }) => text),
      taskType,
      signal,
    );
    const failures: InputFailure[] = outcome.failures.map((failure) => ({
      ...failure,
      index: misses[failure.index]?.index ?? failure.index,
    }));

    for (let missIndex = 0; missIndex < misses.length; missIndex++) {
      const vector = outcome.vectors[missIndex];
      if (!vector) continue;
      const { index, text } = misses[missIndex]!;
      vectors[index] = vector;
      const key = this.buildKey(text, taskType);
      if (this.cache.size >= this.maxSize) this.evictLRU();
      this.cache.set(key, { vector, lastAccess: ++this.accessCounter });
    }

    return { vectors, failures };
  }

  estimateTokens(text: string): number {
    return this.underlying.estimateTokens(text);
  }

  private buildKey(text: string, taskType?: EmbeddingTaskType): string {
    return `${taskType ?? '_'}:${text}`;
  }

  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
