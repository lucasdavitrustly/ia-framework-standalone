import { describe, it, expect, vi } from 'vitest';

/**
 * T016: Enrichment cache — given same contentHash, skips LLM call and returns cached result.
 *
 * Tests MUST fail until cache.ts is implemented.
 */

// ── Local type stubs ──────────────────────────────────────────────────────────

interface CachedEnrichment {
  description?: string;
  businessContext?: string;
  semanticTags?: string[];
  relationships?: Array<{ target: string; type: string; label?: string }>;
  enrichedAt: string;
  enrichmentModel: string;
}

// ── Import under test (WILL FAIL — module does not exist yet) ─────────────────
const cacheSpecifier = './cache.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cacheModule = (await import(cacheSpecifier).catch(() => null)) as any;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const EnrichmentCache = cacheModule?.EnrichmentCache as
  | (new () => {
      get(contentHash: string): CachedEnrichment | undefined;
      set(contentHash: string, entry: CachedEnrichment): void;
      size(): number;
    })
  | undefined;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(description = 'cached description'): CachedEnrichment {
  return {
    description,
    businessContext: 'cached context',
    semanticTags: ['cached', 'tag'],
    relationships: [],
    enrichedAt: new Date().toISOString(),
    enrichmentModel: 'qwen3:8b',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EnrichmentCache (T016)', () => {
  it('returns undefined for an unknown contentHash', () => {
    expect(EnrichmentCache, 'EnrichmentCache must be exported from ./cache.ts').toBeDefined();

    const cache = new EnrichmentCache!();
    expect(cache.get('unknown-hash')).toBeUndefined();
  });

  it('stores and retrieves a cached entry by contentHash', () => {
    expect(EnrichmentCache, 'EnrichmentCache must be exported from ./cache.ts').toBeDefined();

    const cache = new EnrichmentCache!();
    const entry = makeEntry();
    cache.set('hash-abc', entry);

    const result = cache.get('hash-abc');
    expect(result).toBeDefined();
    expect(result!.description).toBe('cached description');
    expect(result!.enrichmentModel).toBe('qwen3:8b');
  });

  it('skips LLM call and returns cached result on second access', async () => {
    expect(EnrichmentCache, 'EnrichmentCache must be exported from ./cache.ts').toBeDefined();

    const cache = new EnrichmentCache!();
    const mockLlmCall = vi.fn().mockResolvedValue(makeEntry('from LLM'));

    // Simulate: first call is cache miss → call LLM → store result
    const hash = 'sha256-content-xyz';
    let result = cache.get(hash);
    if (!result) {
      result = await mockLlmCall(hash);
      cache.set(hash, result!);
    }
    expect(mockLlmCall).toHaveBeenCalledOnce();

    // Second access: cache hit → no LLM call
    const result2 = cache.get(hash);
    if (!result2) {
      await mockLlmCall(hash);
    }
    // LLM should still have been called only once
    expect(mockLlmCall).toHaveBeenCalledOnce();
    expect(result2!.description).toBe('from LLM');
  });

  it('different contentHashes produce separate cache entries', () => {
    expect(EnrichmentCache, 'EnrichmentCache must be exported from ./cache.ts').toBeDefined();

    const cache = new EnrichmentCache!();
    cache.set('hash-1', makeEntry('entry 1'));
    cache.set('hash-2', makeEntry('entry 2'));

    expect(cache.get('hash-1')!.description).toBe('entry 1');
    expect(cache.get('hash-2')!.description).toBe('entry 2');
  });

  it('size() returns the number of cached entries', () => {
    expect(EnrichmentCache, 'EnrichmentCache must be exported from ./cache.ts').toBeDefined();

    const cache = new EnrichmentCache!();
    expect(cache.size()).toBe(0);

    cache.set('hash-1', makeEntry());
    expect(cache.size()).toBe(1);

    cache.set('hash-2', makeEntry());
    expect(cache.size()).toBe(2);

    // Setting same hash again doesn't grow size
    cache.set('hash-1', makeEntry('updated'));
    expect(cache.size()).toBe(2);
  });

  it('overwrites existing entry when setting same contentHash again', () => {
    expect(EnrichmentCache, 'EnrichmentCache must be exported from ./cache.ts').toBeDefined();

    const cache = new EnrichmentCache!();
    cache.set('hash-abc', makeEntry('original'));
    cache.set('hash-abc', makeEntry('updated'));

    expect(cache.get('hash-abc')!.description).toBe('updated');
  });
});
