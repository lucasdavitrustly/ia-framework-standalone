import { Hono } from 'hono';
import type { SearchHistoryEntry } from '../search-history-store.js';
import type {
  ChunkBrowseEntry,
  ChunkBrowseResponse,
  ScoreAnalysisResponse,
  ScoreCandidate,
} from './tuning-types.js';

// ─── Deps interface ───────────────────────────────────────────────────────────

export interface TuningVectorStoreDep {
  scrollChunks(params: {
    collection: string;
    minQuality?: number;
    limit: number;
    offset: number;
  }): Promise<{ entries: ChunkBrowseEntry[]; total: number }>;
}

export interface TuningSearchEngineDep {
  search(query: { text: string; limit: number; scoreThreshold: number }): Promise<
    Array<{
      chunkId: string;
      relativePath: string;
      startLine: number;
      endLine: number;
      score: number;
      source?: string;
      chunkType: string;
      content: string;
      name?: string;
    }>
  >;
}

export interface TuningDeps {
  vectorStore: TuningVectorStoreDep;
  searchHistoryStore: {
    getById(id: string): SearchHistoryEntry | null;
  };
  searchEngine: TuningSearchEngineDep;
}

// ─── Near-miss threshold constant ─────────────────────────────────────────────

/** Results within this percentage below threshold are considered near-miss (D-10) */
const NEAR_MISS_MARGIN = 0.1;

// ─── Router factory ───────────────────────────────────────────────────────────

export function tuningRouter(deps: TuningDeps): Hono {
  const app = new Hono();

  // GET /chunks
  // Returns paginated ChunkBrowseEntry[] filtered by collection and optional quality score
  app.get('/chunks', async (c) => {
    const collection = c.req.query('collection') ?? 'llm';
    const minQualityParam = c.req.query('minQuality');
    const minQuality = minQualityParam !== undefined ? parseInt(minQualityParam, 10) : undefined;
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const offsetParam = c.req.query('offset');
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    const { entries, total } = await deps.vectorStore.scrollChunks({
      collection,
      ...(minQuality !== undefined && !isNaN(minQuality) ? { minQuality } : {}),
      limit: isNaN(limit) ? 50 : limit,
      offset: isNaN(offset) ? 0 : offset,
    });

    const response: ChunkBrowseResponse = { chunks: entries, total };
    return c.json(response);
  });

  // GET /scores/:historyId
  // Re-runs the original query with scoreThreshold=0 to get all candidates,
  // then partitions into above/below threshold and identifies near-misses (D-10).
  app.get('/scores/:historyId', async (c) => {
    const historyId = c.req.param('historyId');
    const entry = deps.searchHistoryStore.getById(historyId);
    if (!entry) {
      return c.json({ error: 'Not found' }, 404);
    }

    const threshold = entry.params.scoreThreshold;

    // Re-run with scoreThreshold=0 to get ALL candidates (Pitfall 1)
    const rawResults = await deps.searchEngine.search({
      text: entry.query,
      limit: 50,
      scoreThreshold: 0,
    });

    // Near-miss: within 10% below threshold (D-10)
    const nearMissLow = threshold * (1 - NEAR_MISS_MARGIN);

    const candidates: ScoreCandidate[] = rawResults.map((r) => {
      const aboveThreshold = r.score >= threshold;
      const isNearMiss = !aboveThreshold && r.score >= nearMissLow;
      return {
        id: r.chunkId,
        filePath: r.relativePath,
        startLine: r.startLine,
        endLine: r.endLine,
        score: r.score,
        source: (r.source === 'llm' ? 'llm' : 'ast') as 'ast' | 'llm',
        chunkType: r.chunkType,
        content: r.content,
        aboveThreshold,
        isNearMiss,
      };
    });

    const returnedCount = candidates.filter((c) => c.aboveThreshold).length;
    const filteredCount = candidates.filter((c) => !c.aboveThreshold).length;
    const nearMissCount = candidates.filter((c) => c.isNearMiss).length;

    const response: ScoreAnalysisResponse = {
      query: entry.query,
      threshold,
      candidates,
      returnedCount,
      filteredCount,
      nearMissCount,
    };

    return c.json(response);
  });

  return app;
}
