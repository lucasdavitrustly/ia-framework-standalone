import { describe, it, expect } from 'vitest';
import type { SearchHistoryEntry } from '../search-history-store.js';
import type { ChunkBrowseEntry, ScoreAnalysisResponse } from './tuning-types.js';
import { tuningRouter } from './tuning.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeChunkEntry(overrides: Partial<ChunkBrowseEntry> = {}): ChunkBrowseEntry {
  return {
    chunkId: 'chunk-1',
    filePath: 'src/auth.ts',
    startLine: 1,
    endLine: 20,
    chunkType: 'function',
    source: 'ast',
    content: 'function auth() {}',
    ...overrides,
  };
}

function makeHistoryEntry(overrides: Partial<SearchHistoryEntry> = {}): SearchHistoryEntry {
  return {
    id: 'hist-1',
    query: 'authentication middleware',
    params: { limit: 10, scoreThreshold: 0.5, collections: ['both'] },
    results: [],
    metrics: {
      latencyMs: 50,
      chunksScanned: 100,
      resultsReturned: 5,
      scoreRange: { min: 0.3, max: 0.8 },
    },
    collection: 'both',
    resultCount: 5,
    topScore: 0.8,
    latencyMs: 50,
    createdAt: '2026-04-01T10:00:00.000Z',
    ...overrides,
  };
}

type SearchCandidate = {
  chunkId: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  score: number;
  source?: string;
  chunkType: string;
  content: string;
  name?: string;
};

function makeTuningDeps(
  options: {
    chunks?: ChunkBrowseEntry[];
    total?: number;
    historyEntry?: SearchHistoryEntry | null;
    searchResults?: SearchCandidate[];
  } = {},
) {
  const { chunks = [], total = 0, historyEntry = null, searchResults = [] } = options;

  return tuningRouter({
    vectorStore: {
      scrollChunks: () => Promise.resolve({ entries: chunks, total }),
    },
    searchHistoryStore: {
      getById: (id: string) => (id === historyEntry?.id ? historyEntry : null),
    },
    searchEngine: {
      search: () => Promise.resolve(searchResults),
    },
  });
}

// ─── GET /chunks ──────────────────────────────────────────────────────────────

describe('GET /chunks', () => {
  it('returns empty chunks when no chunks exist', async () => {
    const router = makeTuningDeps();
    const res = await router.request('/chunks');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chunks: unknown[]; total: number };
    expect(body.chunks).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns ChunkBrowseEntry array with required fields', async () => {
    const chunk = makeChunkEntry({ chunkId: 'c1', filePath: 'src/foo.ts', qualityScore: 75 });
    const router = makeTuningDeps({ chunks: [chunk], total: 1 });
    const res = await router.request('/chunks');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chunks: ChunkBrowseEntry[]; total: number };
    expect(body.total).toBe(1);
    expect(body.chunks).toHaveLength(1);
    const c = body.chunks[0]!;
    expect(c).toHaveProperty('chunkId', 'c1');
    expect(c).toHaveProperty('filePath', 'src/foo.ts');
    expect(c).toHaveProperty('startLine');
    expect(c).toHaveProperty('endLine');
    expect(c).toHaveProperty('chunkType');
    expect(c).toHaveProperty('source');
    expect(c).toHaveProperty('qualityScore', 75);
    expect(c).toHaveProperty('content');
  });

  it('passes collection query param to vectorStore', async () => {
    let capturedCollection = '';
    const router = tuningRouter({
      vectorStore: {
        scrollChunks: (params: {
          collection: string;
          minQuality?: number;
          limit: number;
          offset: number;
        }) => {
          capturedCollection = params.collection;
          return Promise.resolve({ entries: [], total: 0 });
        },
      },
      searchHistoryStore: { getById: () => null },
      searchEngine: { search: () => Promise.resolve([]) },
    });
    await router.request('/chunks?collection=llm');
    expect(capturedCollection).toBe('llm');
  });

  it('passes minQuality filter query param to vectorStore', async () => {
    let capturedMinQuality: number | undefined;
    const router = tuningRouter({
      vectorStore: {
        scrollChunks: (params: {
          collection: string;
          minQuality?: number;
          limit: number;
          offset: number;
        }) => {
          capturedMinQuality = params.minQuality;
          return Promise.resolve({ entries: [], total: 0 });
        },
      },
      searchHistoryStore: { getById: () => null },
      searchEngine: { search: () => Promise.resolve([]) },
    });
    await router.request('/chunks?minQuality=50');
    expect(capturedMinQuality).toBe(50);
  });

  it('paginates with limit and offset query params', async () => {
    let capturedLimit = 0;
    let capturedOffset = 0;
    const router = tuningRouter({
      vectorStore: {
        scrollChunks: (params: {
          collection: string;
          minQuality?: number;
          limit: number;
          offset: number;
        }) => {
          capturedLimit = params.limit;
          capturedOffset = params.offset;
          return Promise.resolve({ entries: [], total: 100 });
        },
      },
      searchHistoryStore: { getById: () => null },
      searchEngine: { search: () => Promise.resolve([]) },
    });
    await router.request('/chunks?limit=10&offset=20');
    expect(capturedLimit).toBe(10);
    expect(capturedOffset).toBe(20);
  });
});

// ─── GET /scores/:historyId ───────────────────────────────────────────────────

describe('GET /scores/:historyId', () => {
  it('returns 404 when history entry not found', async () => {
    const router = makeTuningDeps();
    const res = await router.request('/scores/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns ScoreAnalysisResponse with required shape', async () => {
    const historyEntry = makeHistoryEntry({
      id: 'hist-1',
      query: 'auth',
      params: { limit: 10, scoreThreshold: 0.5, collections: ['both'] },
    });
    const searchResults: SearchCandidate[] = [
      {
        chunkId: 'c1',
        relativePath: 'src/auth.ts',
        startLine: 1,
        endLine: 10,
        score: 0.8,
        source: 'ast',
        chunkType: 'function',
        content: 'auth()',
      },
      {
        chunkId: 'c2',
        relativePath: 'src/other.ts',
        startLine: 5,
        endLine: 15,
        score: 0.3,
        source: 'llm',
        chunkType: 'class',
        content: 'class Other {}',
      },
    ];
    const router = makeTuningDeps({ historyEntry, searchResults });
    const res = await router.request('/scores/hist-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ScoreAnalysisResponse;
    expect(body).toHaveProperty('query', 'auth');
    expect(body).toHaveProperty('threshold', 0.5);
    expect(body).toHaveProperty('candidates');
    expect(body).toHaveProperty('returnedCount');
    expect(body).toHaveProperty('filteredCount');
    expect(body).toHaveProperty('nearMissCount');
  });

  it('correctly partitions candidates above and below threshold', async () => {
    const historyEntry = makeHistoryEntry({
      id: 'hist-2',
      params: { limit: 10, scoreThreshold: 0.5, collections: ['both'] },
    });
    const searchResults: SearchCandidate[] = [
      {
        chunkId: 'c1',
        relativePath: 'a.ts',
        startLine: 1,
        endLine: 5,
        score: 0.8,
        source: 'ast',
        chunkType: 'function',
        content: 'fn1()',
      },
      {
        chunkId: 'c2',
        relativePath: 'b.ts',
        startLine: 1,
        endLine: 5,
        score: 0.6,
        source: 'ast',
        chunkType: 'function',
        content: 'fn2()',
      },
      {
        chunkId: 'c3',
        relativePath: 'c.ts',
        startLine: 1,
        endLine: 5,
        score: 0.3,
        source: 'ast',
        chunkType: 'function',
        content: 'fn3()',
      },
    ];
    const router = makeTuningDeps({ historyEntry, searchResults });
    const res = await router.request('/scores/hist-2');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ScoreAnalysisResponse;
    expect(body.returnedCount).toBe(2); // 0.8 and 0.6 >= 0.5
    expect(body.filteredCount).toBe(1); // 0.3 < 0.5
    const above = body.candidates.filter((c) => c.aboveThreshold);
    expect(above).toHaveLength(2);
    const below = body.candidates.filter((c) => !c.aboveThreshold);
    expect(below).toHaveLength(1);
  });

  it('identifies near-miss candidates within 10% below threshold (D-10)', async () => {
    // threshold=0.5, near-miss = score in [0.45, 0.5)
    const historyEntry = makeHistoryEntry({
      id: 'hist-3',
      params: { limit: 10, scoreThreshold: 0.5, collections: ['both'] },
    });
    const searchResults: SearchCandidate[] = [
      {
        chunkId: 'c1',
        relativePath: 'a.ts',
        startLine: 1,
        endLine: 5,
        score: 0.7,
        source: 'ast',
        chunkType: 'function',
        content: 'fn1()',
      },
      {
        chunkId: 'c2',
        relativePath: 'b.ts',
        startLine: 1,
        endLine: 5,
        score: 0.47,
        source: 'ast',
        chunkType: 'function',
        content: 'fn2()',
      }, // near-miss: 0.5 * 0.9 = 0.45 <= 0.47 < 0.5
      {
        chunkId: 'c3',
        relativePath: 'c.ts',
        startLine: 1,
        endLine: 5,
        score: 0.2,
        source: 'ast',
        chunkType: 'function',
        content: 'fn3()',
      }, // NOT near-miss
    ];
    const router = makeTuningDeps({ historyEntry, searchResults });
    const res = await router.request('/scores/hist-3');
    const body = (await res.json()) as ScoreAnalysisResponse;
    expect(body.nearMissCount).toBe(1);
    const nearMiss = body.candidates.filter((c) => c.isNearMiss);
    expect(nearMiss).toHaveLength(1);
    expect(nearMiss[0]!.id).toBe('c2');
  });

  it('re-runs search with scoreThreshold 0 to get unfiltered candidates', async () => {
    let capturedThreshold = -1;
    const historyEntry = makeHistoryEntry({
      id: 'hist-4',
      params: { limit: 10, scoreThreshold: 0.5, collections: ['both'] },
    });
    const router = tuningRouter({
      vectorStore: { scrollChunks: () => Promise.resolve({ entries: [], total: 0 }) },
      searchHistoryStore: { getById: () => historyEntry },
      searchEngine: {
        search: (query: { text: string; limit: number; scoreThreshold: number }) => {
          capturedThreshold = query.scoreThreshold;
          return Promise.resolve([]);
        },
      },
    });
    await router.request('/scores/hist-4');
    expect(capturedThreshold).toBe(0);
  });
});
