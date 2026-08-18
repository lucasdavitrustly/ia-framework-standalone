/**
 * Multi-hop retrieval: extract symbols from initial results and perform
 * a second retrieval pass to find related code (definitions of referenced classes/methods).
 *
 * Pipeline position: after initial retrieval + BM25 re-ranking, before token cap.
 */

import type { RetrievalResult } from './types.js';
import { extractSymbols } from './symbol-extractor.js';
import { assertEffectiveFilter, type EffectiveFilter } from './effective-filter.js';

export interface MultiHopConfig {
  /** Maximum symbols to extract for second pass (default: 15) */
  maxSymbols?: number;
  /** Expand on method call references (default: true) */
  expandMethodCalls?: boolean;
  /** Expand on class hierarchy references (default: true) */
  expandHierarchy?: boolean;
}

export interface MultiHopEngine {
  /** Search by name: scroll for chunks whose `name` matches */
  scrollByName?(name: string, filter: EffectiveFilter): Promise<RetrievalResult[]>;
  /** Search by method definition: find chunks that define a method */
  scrollByDefines?(methodName: string, filter: EffectiveFilter): Promise<RetrievalResult[]>;
  /** Search by name in a specific repo (for cross-repo symbol lookup) */
  scrollByNameInRepo?(
    name: string,
    repoId: string,
    filter: EffectiveFilter,
  ): Promise<RetrievalResult[]>;
}

/**
 * Perform multi-hop retrieval: extract symbols from initial results,
 * then fetch definitions of referenced classes and methods.
 *
 * @param initialResults - Results from first retrieval pass
 * @param engine - Engine with scroll capabilities
 * @param config - Multi-hop configuration
 * @returns Additional results from second hop (tagged with expansionSource: 'multi-hop')
 */
export async function multiHopExpand(
  initialResults: RetrievalResult[],
  engine: MultiHopEngine,
  filter: EffectiveFilter,
  config: MultiHopConfig = {},
): Promise<RetrievalResult[]> {
  assertEffectiveFilter(filter, 'multiHopExpand');
  const { maxSymbols = 15, expandMethodCalls = true, expandHierarchy = true } = config;

  if (!engine.scrollByName && !engine.scrollByDefines) return [];

  const symbols = extractSymbols(initialResults, maxSymbols);
  const seenIds = new Set(initialResults.map((r) => r.chunkId));
  const expanded: RetrievalResult[] = [];

  // Expand class references (find their definitions)
  if (expandHierarchy && engine.scrollByName) {
    for (const className of symbols.classReferences) {
      const hits = await engine.scrollByName(className, filter);
      for (const hit of hits) {
        if (!seenIds.has(hit.chunkId)) {
          seenIds.add(hit.chunkId);
          expanded.push({ ...hit, expansionSource: 'multi-hop' });
        }
      }
      // A repository-scoped lookup is the only safe cross-repo fallback. Without
      // repo context, trying another collection would bypass the caller's scope.
      if (hits.length === 0 && filter.repoId !== undefined && engine.scrollByNameInRepo) {
        const crossRepoHits = await engine.scrollByNameInRepo(className, filter.repoId, filter);
        for (const hit of crossRepoHits) {
          if (!seenIds.has(hit.chunkId)) {
            seenIds.add(hit.chunkId);
            expanded.push({ ...hit, expansionSource: 'multi-hop' });
          }
        }
      }
    }
  }

  // Expand method calls (find their definitions)
  if (expandMethodCalls && engine.scrollByDefines) {
    for (const methodName of symbols.methodCalls) {
      const hits = await engine.scrollByDefines(methodName, filter);
      for (const hit of hits) {
        if (!seenIds.has(hit.chunkId)) {
          seenIds.add(hit.chunkId);
          expanded.push({ ...hit, expansionSource: 'multi-hop' });
        }
      }
    }
  }

  return expanded;
}
