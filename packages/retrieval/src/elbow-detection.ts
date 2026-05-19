/**
 * Elbow detection — truncate ranked results when there's a significant
 * relative score drop between consecutive items.
 *
 * This prevents low-quality tail results from being included when there's
 * a clear "elbow" in the score distribution.
 */

export interface ElbowOptions {
  /** Maximum relative drop allowed (0-1). If score[i]/score[i-1] < (1 - dropThreshold), truncate.
   *  Default: 0.5 (50% drop triggers truncation). */
  dropThreshold?: number;
  /** Minimum number of results to keep regardless of elbow detection. Default: 1. */
  minResults?: number;
}

/**
 * Truncate a sorted (descending score) array at the first significant score drop.
 * Items must have a `score` property. Array must be pre-sorted by score descending.
 */
export function applyElbowTruncation<T extends { score: number }>(
  items: T[],
  options?: ElbowOptions,
): T[] {
  if (items.length <= 1) return items;

  const dropThreshold = options?.dropThreshold ?? 0.5;
  const minResults = options?.minResults ?? 1;

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!.score;
    const curr = items[i]!.score;

    // Relative drop: if curr/prev < (1 - threshold), we've hit an elbow
    if (prev > 0 && curr / prev < 1 - dropThreshold) {
      return items.slice(0, Math.max(i, minResults));
    }
  }

  return items;
}
