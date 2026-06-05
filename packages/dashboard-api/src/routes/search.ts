import { Hono } from 'hono';
import type {
  CollectionEngine,
  MultiCollectionSearchEngine,
  RetrievalResult,
} from '@ia-framework/retrieval';
import type { RetrievalQuery } from '@ia-framework/retrieval';
import type { SearchHistoryStore, SearchHistoryListParams } from '../search-history-store.js';

export interface SearchDeps {
  /** Individual engines for single-collection queries */
  collectionEngines: CollectionEngine[];
  /** For 'both' merged queries via RRF */
  multiSearchEngine: MultiCollectionSearchEngine;
  /** For chunksScanned metric: returns pointCount for a collection name */
  getCollectionInfo: (collectionName: string) => Promise<{ pointCount: number } | null>;
  /** Base collection name e.g. 'ia-framework' — used for GET /collections */
  baseCollectionName: string;
  /** Optional search history store — graceful when not available */
  searchHistoryStore?: SearchHistoryStore;
}

/** Map a raw RetrievalResult to the search response / history DTO shape */
function mapResult(r: RetrievalResult): {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
  scoreType?: 'cosine' | 'rrf';
  source: string;
  chunkType: string;
  matchedVector: string;
  content: string;
  description?: string;
} {
  const base = {
    id: r.chunkId,
    filePath: r.relativePath,
    startLine: r.startLine,
    endLine: r.endLine,
    score: r.score,
    ...(r.scoreType !== undefined ? { scoreType: r.scoreType } : {}),
    source: r.source ?? 'ast',
    chunkType: r.chunkType,
    matchedVector: r.matchedVector,
    content: r.content,
  };
  if (r.name !== undefined) {
    return { ...base, description: r.name };
  }
  return base;
}

export function searchRouter(deps: SearchDeps): Hono {
  const app = new Hono();

  // POST / — execute a search query
  app.post('/', async (c) => {
    try {
      const body: {
        query?: string;
        limit?: number;
        scoreThreshold?: number;
        collections?: string[];
      } = await c.req.json();

      // Validate query
      if (!body.query || typeof body.query !== 'string' || body.query.trim() === '') {
        return c.json({ error: 'query is required and must be a non-empty string' }, 400);
      }

      const query = body.query;
      const limit = body.limit ?? 10;
      const scoreThreshold = body.scoreThreshold ?? 0.3;
      const collections = body.collections ?? ['both'];

      const retrievalQuery: RetrievalQuery = {
        text: query,
        limit,
        scoreThreshold,
      };

      // Determine which engine to use
      const wantAst = collections.includes('ast');
      const wantLlm = collections.includes('llm');
      const wantBoth = collections.includes('both') || (wantAst && wantLlm);

      const start = Date.now();
      let rawResults: RetrievalResult[];

      if (wantBoth) {
        rawResults = await deps.multiSearchEngine.search(retrievalQuery);
      } else if (wantAst) {
        const engineEntry = deps.collectionEngines.find((e) => e.name === 'ast');
        if (!engineEntry) {
          return c.json({ error: 'AST collection not available' }, 404);
        }
        rawResults = (await engineEntry.engine.search(retrievalQuery)).map((r) => ({
          ...r,
          source: 'ast' as const,
        }));
      } else if (wantLlm) {
        const engineEntry = deps.collectionEngines.find((e) => e.name === 'llm');
        if (!engineEntry) {
          return c.json({ error: 'LLM collection not available' }, 404);
        }
        rawResults = (await engineEntry.engine.search(retrievalQuery)).map((r) => ({
          ...r,
          source: 'llm' as const,
        }));
      } else {
        rawResults = await deps.multiSearchEngine.search(retrievalQuery);
      }

      const latencyMs = Date.now() - start;

      // Compute chunksScanned: sum pointCount for queried collections
      let chunksScanned = 0;
      if (wantBoth) {
        const infos = await Promise.all(
          deps.collectionEngines.map((e) =>
            deps.getCollectionInfo(
              e.name === 'ast' ? deps.baseCollectionName : `${deps.baseCollectionName}-${e.name}`,
            ),
          ),
        );
        chunksScanned = infos.reduce((sum, info) => sum + (info?.pointCount ?? 0), 0);
      } else if (wantAst) {
        const info = await deps.getCollectionInfo(deps.baseCollectionName);
        chunksScanned = info?.pointCount ?? 0;
      } else if (wantLlm) {
        const info = await deps.getCollectionInfo(`${deps.baseCollectionName}-llm`);
        chunksScanned = info?.pointCount ?? 0;
      }

      // Map to response DTO (drop imports/exports)
      const results = rawResults.map(mapResult);

      const metrics = {
        latencyMs,
        chunksScanned,
        resultsReturned: results.length,
        scoreRange: {
          min: results.length > 0 ? Math.min(...results.map((r) => r.score)) : 0,
          max: results.length > 0 ? Math.max(...results.map((r) => r.score)) : 0,
        },
      };

      // Auto-save search to history
      let historyId: string | undefined;
      if (deps.searchHistoryStore) {
        try {
          const collectionLabel = wantBoth ? 'both' : wantAst ? 'ast' : wantLlm ? 'llm' : 'both';
          historyId = deps.searchHistoryStore.saveEntry({
            query,
            params: { limit, scoreThreshold, collections: body.collections ?? ['both'] },
            results,
            metrics,
            collection: collectionLabel,
            resultCount: results.length,
            topScore: metrics.scoreRange.max,
            latencyMs: metrics.latencyMs,
          });
        } catch {
          // Auto-save failure should not fail the search — silently ignore
        }
      }

      return c.json({ results, metrics, historyId });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // GET /history — list history entries with filters
  app.get('/history', (c) => {
    if (!deps.searchHistoryStore) return c.json({ error: 'History not available' }, 503);
    // Build params only with defined values (required by exactOptionalPropertyTypes)
    const params: SearchHistoryListParams = {};
    const q = c.req.query('q');
    if (q) params.q = q;
    const collection = c.req.query('collection');
    if (collection) params.collection = collection;
    const dateFrom = c.req.query('dateFrom');
    if (dateFrom) params.dateFrom = dateFrom;
    const dateTo = c.req.query('dateTo');
    if (dateTo) params.dateTo = dateTo;
    const minScoreStr = c.req.query('minScore');
    if (minScoreStr) params.minScore = parseFloat(minScoreStr);
    const sortByStr = c.req.query('sortBy') as SearchHistoryListParams['sortBy'] | undefined;
    if (sortByStr) params.sortBy = sortByStr;
    const sortOrderStr = c.req.query('sortOrder');
    if (sortOrderStr === 'asc' || sortOrderStr === 'desc') params.sortOrder = sortOrderStr;
    const pageStr = c.req.query('page');
    if (pageStr) params.page = parseInt(pageStr, 10);
    const pageSizeStr = c.req.query('pageSize');
    if (pageSizeStr) params.pageSize = parseInt(pageSizeStr, 10);
    const result = deps.searchHistoryStore.list(params);
    return c.json(result);
  });

  // GET /history/:id — get single entry
  app.get('/history/:id', (c) => {
    if (!deps.searchHistoryStore) return c.json({ error: 'History not available' }, 503);
    const entry = deps.searchHistoryStore.getById(c.req.param('id'));
    if (!entry) return c.json({ error: 'Not found' }, 404);
    return c.json(entry);
  });

  // POST /history/:id/replay — re-execute saved query
  app.post('/history/:id/replay', async (c) => {
    if (!deps.searchHistoryStore) return c.json({ error: 'History not available' }, 503);
    const entry = deps.searchHistoryStore.getById(c.req.param('id'));
    if (!entry) return c.json({ error: 'Not found' }, 404);

    const retrievalQuery: RetrievalQuery = {
      text: entry.query,
      limit: entry.params.limit,
      scoreThreshold: entry.params.scoreThreshold,
    };

    const collections = entry.params.collections;
    const replayWantAst = collections.includes('ast');
    const replayWantLlm = collections.includes('llm');
    const replayWantBoth = collections.includes('both') || (replayWantAst && replayWantLlm);

    const start = Date.now();
    let rawResults: RetrievalResult[];
    let collectionWarning: string | undefined;

    try {
      if (replayWantBoth) {
        rawResults = await deps.multiSearchEngine.search(retrievalQuery);
      } else if (replayWantAst) {
        const engineEntry = deps.collectionEngines.find((e) => e.name === 'ast');
        if (!engineEntry) {
          collectionWarning = 'AST collection no longer available';
          rawResults = [];
        } else {
          rawResults = (await engineEntry.engine.search(retrievalQuery)).map((r) => ({
            ...r,
            source: 'ast' as const,
          }));
        }
      } else if (replayWantLlm) {
        const engineEntry = deps.collectionEngines.find((e) => e.name === 'llm');
        if (!engineEntry) {
          collectionWarning = 'LLM collection no longer available';
          rawResults = [];
        } else {
          rawResults = (await engineEntry.engine.search(retrievalQuery)).map((r) => ({
            ...r,
            source: 'llm' as const,
          }));
        }
      } else {
        rawResults = await deps.multiSearchEngine.search(retrievalQuery);
      }
    } catch {
      return c.json({ error: 'Replay search failed' }, 500);
    }

    const latencyMs = Date.now() - start;

    const freshResults = rawResults.map(mapResult);

    const freshMetrics = {
      latencyMs,
      chunksScanned: 0,
      resultsReturned: freshResults.length,
      scoreRange: {
        min: freshResults.length > 0 ? Math.min(...freshResults.map((r) => r.score)) : 0,
        max: freshResults.length > 0 ? Math.max(...freshResults.map((r) => r.score)) : 0,
      },
    };

    return c.json({
      original: { results: entry.results, metrics: entry.metrics },
      fresh: { results: freshResults, metrics: freshMetrics },
      ...(collectionWarning ? { warning: collectionWarning } : {}),
    });
  });

  // DELETE /history/:id — delete single entry
  app.delete('/history/:id', (c) => {
    if (!deps.searchHistoryStore) return c.json({ error: 'History not available' }, 503);
    const deleted = deps.searchHistoryStore.deleteById(c.req.param('id'));
    if (!deleted) return c.json({ error: 'Not found' }, 404);
    return c.json({ ok: true });
  });

  // DELETE /history — clear all entries
  app.delete('/history', (c) => {
    if (!deps.searchHistoryStore) return c.json({ error: 'History not available' }, 503);
    deps.searchHistoryStore.clearAll();
    return c.json({ ok: true });
  });

  // GET /collections — discover available Qdrant collections
  app.get('/collections', async (c) => {
    const collectionInfos = await Promise.all(
      deps.collectionEngines.map(async (e) => {
        const collectionName =
          e.name === 'ast' ? deps.baseCollectionName : `${deps.baseCollectionName}-${e.name}`;
        const info = await deps.getCollectionInfo(collectionName);
        return {
          name: collectionName,
          type: e.name,
          chunkCount: info?.pointCount ?? 0,
        };
      }),
    );

    return c.json(collectionInfos);
  });

  return app;
}
