/**
 * T028: Enrichment cache
 *
 * In-memory cache keyed by contentHash (SHA256 of chunk source code).
 * Skips LLM enrichment calls for chunks whose content hasn't changed since last indexing.
 *
 * Usage pattern:
 *   1. Before enriching, call cache.get(chunk.contentHash)
 *   2. If hit → use cached metadata, skip LLM call
 *   3. If miss → call LLM → cache.set(chunk.contentHash, result)
 */

export interface CachedEnrichment {
  description?: string | undefined;
  businessContext?: string | undefined;
  semanticTags?: string[] | undefined;
  relationships?:
    | Array<{
        target: string;
        type: string;
        label?: string | undefined;
      }>
    | undefined;
  enrichedAt: string;
  enrichmentModel: string;
}

/**
 * In-memory enrichment cache.
 * Not persisted between runs — used to avoid duplicate LLM calls within a single indexing run
 * when the same file content appears multiple times (e.g., incremental re-index of unchanged files).
 *
 * For cross-run persistence, integrate with the llm-cache on disk (out of scope for T028).
 */
export class EnrichmentCache {
  private readonly store = new Map<string, CachedEnrichment>();

  /**
   * Retrieve cached enrichment metadata for a given content hash.
   * Returns undefined if not cached.
   */
  get(contentHash: string): CachedEnrichment | undefined {
    return this.store.get(contentHash);
  }

  /**
   * Store enrichment metadata for a given content hash.
   * Overwrites existing entry if present.
   */
  set(contentHash: string, entry: CachedEnrichment): void {
    this.store.set(contentHash, entry);
  }

  /** Number of cached entries. */
  size(): number {
    return this.store.size;
  }

  /** Clear all cached entries. */
  clear(): void {
    this.store.clear();
  }
}
