import { Hono } from 'hono';
import type { CollectionEngine, MultiCollectionSearchEngine } from '@ia-framework/retrieval';
import type { RetrievalQuery } from '@ia-framework/retrieval';

export interface SearchDeps {
  /** Individual engines for single-collection queries */
  collectionEngines: CollectionEngine[];
  /** For 'both' merged queries via RRF */
  multiSearchEngine: MultiCollectionSearchEngine;
  /** For chunksScanned metric: returns pointCount for a collection name */
  getCollectionInfo: (collectionName: string) => Promise<{ pointCount: number } | null>;
  /** Base collection name e.g. 'ia-framework' — used for GET /collections */
  baseCollectionName: string;
}

export function searchRouter(deps: SearchDeps): Hono {
  const app = new Hono();

  // POST / — execute a search query
  app.post('/', async (c) => {
    try {
      const body = (await c.req.json()) as {
        query?: string;
        limit?: number;
        scoreThreshold?: number;
        collections?: string[];
      };

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
      let rawResults;

      if (wantBoth) {
        rawResults = await deps.multiSearchEngine.search(retrievalQuery);
      } else if (wantAst) {
        const engineEntry = deps.collectionEngines.find((e) => e.name === 'ast');
        if (!engineEntry) {
          return c.json({ error: 'AST collection not available' }, 404);
        }
        rawResults = await engineEntry.engine.search(retrievalQuery);
      } else if (wantLlm) {
        const engineEntry = deps.collectionEngines.find((e) => e.name === 'llm');
        if (!engineEntry) {
          return c.json({ error: 'LLM collection not available' }, 404);
        }
        rawResults = await engineEntry.engine.search(retrievalQuery);
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
      const results = rawResults.map((r) => ({
        id: r.chunkId,
        filePath: r.relativePath,
        startLine: r.startLine,
        endLine: r.endLine,
        score: r.score,
        source: r.source ?? 'ast',
        chunkType: r.chunkType,
        matchedVector: r.matchedVector,
        content: r.content,
        description: r.name,
      }));

      const metrics = {
        latencyMs,
        chunksScanned,
        resultsReturned: results.length,
        scoreRange: {
          min: results.length > 0 ? Math.min(...results.map((r) => r.score)) : 0,
          max: results.length > 0 ? Math.max(...results.map((r) => r.score)) : 0,
        },
      };

      return c.json({ results, metrics });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
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
