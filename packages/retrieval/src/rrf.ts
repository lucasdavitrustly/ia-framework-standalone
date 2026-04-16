import type { RetrievalResult } from './types.js';

/**
 * A ranked list of results from a single collection/strategy.
 */
export interface RankedList {
  /** Which collection/strategy produced these results */
  source: 'ast' | 'llm';
  /** Results ranked from highest to lowest relevance */
  results: RetrievalResult[];
}

/**
 * Merge multiple ranked lists using Reciprocal Rank Fusion (RRF).
 *
 * RRF formula: score(d) = SUM(1 / (k + rank_i(d) + 1)) for each list i
 * where k=60 is the standard RRF constant and rank is 0-indexed.
 *
 * Results are deduped by chunkId — if the same chunkId appears in multiple
 * lists, its RRF contributions are summed. The result object is taken from
 * the first (highest-ranked) occurrence.
 *
 * @param lists - Array of ranked result lists, each tagged with a source name
 * @param limit - Maximum number of results to return
 * @param k - RRF constant (default: 60)
 * @returns Merged results sorted by RRF score, truncated to limit
 */
export function rrfMerge(lists: RankedList[], limit: number, k = 60): RetrievalResult[] {
  if (lists.length === 0) return [];

  // Single-list optimization: tag and score directly without Map overhead
  if (lists.length === 1) {
    const list = lists[0];
    if (!list) return [];
    const { source, results } = list;
    return results
      .map(
        (result: RetrievalResult, rank: number): RetrievalResult => ({
          ...result,
          source,
          score: 1 / (k + rank + 1),
        }),
      )
      .slice(0, limit);
  }

  // Multi-list: accumulate RRF scores keyed by chunkId
  const scores = new Map<string, { result: RetrievalResult; rrfScore: number }>();

  for (const { source, results } of lists) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      if (!result) continue;
      const rrfContribution = 1 / (k + rank + 1);
      const key = result.chunkId;
      const existing = scores.get(key);
      if (existing) {
        // Sum RRF contributions — result object from first (higher-ranked) occurrence kept
        existing.rrfScore += rrfContribution;
      } else {
        // First occurrence: store result with source tag
        scores.set(key, {
          result: { ...result, source },
          rrfScore: rrfContribution,
        });
      }
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(({ result, rrfScore }): RetrievalResult => ({ ...result, score: rrfScore }));
}
