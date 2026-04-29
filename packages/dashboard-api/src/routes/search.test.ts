import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CollectionEngine } from '@ia-framework/retrieval';
import type { RetrievalResult } from '@ia-framework/retrieval';
import { searchRouter } from './search.js';
import type { SearchDeps } from './search.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRetrievalResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'chunk-1',
    filePath: '/abs/path/src/auth.ts',
    relativePath: 'src/auth.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'authenticate',
    content: 'function authenticate() {}',
    startLine: 10,
    endLine: 20,
    imports: ['express'],
    exports: ['authenticate'],
    score: 0.85,
    matchedVector: 'text',
    source: 'ast',
    ...overrides,
  };
}

function makeSearchDeps(overrides: Partial<SearchDeps> = {}): SearchDeps {
  const astEngine = {
    search: vi.fn().mockResolvedValue([makeRetrievalResult({ source: 'ast' })]),
    searchHybrid: vi.fn().mockResolvedValue([]),
  };

  const llmEngine = {
    search: vi.fn().mockResolvedValue([makeRetrievalResult({ source: 'llm', chunkId: 'chunk-2' })]),
    searchHybrid: vi.fn().mockResolvedValue([]),
  };

  const collectionEngines: CollectionEngine[] = [
    { name: 'ast', engine: astEngine as unknown as CollectionEngine['engine'] },
    { name: 'llm', engine: llmEngine as unknown as CollectionEngine['engine'] },
  ];

  const multiSearchEngine = {
    search: vi
      .fn()
      .mockResolvedValue([
        makeRetrievalResult({ source: 'ast' }),
        makeRetrievalResult({ source: 'llm', chunkId: 'chunk-2', score: 0.75 }),
      ]),
    searchHybrid: vi.fn().mockResolvedValue([]),
  };

  return {
    collectionEngines,
    multiSearchEngine: multiSearchEngine as unknown as SearchDeps['multiSearchEngine'],
    getCollectionInfo: vi.fn().mockResolvedValue({ pointCount: 100 }),
    baseCollectionName: 'ia-framework',
    ...overrides,
  };
}

function postBody(body: Record<string, unknown>) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('searchRouter', () => {
  let deps: SearchDeps;

  beforeEach(() => {
    deps = makeSearchDeps();
  });

  // Test 1: POST / with valid query returns 200 with results array and metrics object
  it('T1: POST / with valid query returns 200 with results and metrics', async () => {
    const router = searchRouter(deps);
    const res = await router.request('/', postBody({ query: 'authentication middleware' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[]; metrics: Record<string, unknown> };
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.metrics).toBeDefined();
  });

  // Test 2: POST / with collections=['ast'] searches only AST engine
  it('T2: POST / with collections=[ast] searches only AST engine', async () => {
    const router = searchRouter(deps);
    await router.request('/', postBody({ query: 'auth', collections: ['ast'] }));
    const astEngine = deps.collectionEngines.find((e: CollectionEngine) => e.name === 'ast')!;
    const llmEngine = deps.collectionEngines.find((e: CollectionEngine) => e.name === 'llm')!;
    expect(getMockSearch(astEngine)).toHaveBeenCalledOnce();
    expect(getMockSearch(llmEngine)).not.toHaveBeenCalled();
  });

  // Test 3: POST / with collections=['llm'] searches only LLM engine
  it('T3: POST / with collections=[llm] searches only LLM engine', async () => {
    const router = searchRouter(deps);
    await router.request('/', postBody({ query: 'auth', collections: ['llm'] }));
    const astEngine = deps.collectionEngines.find((e: CollectionEngine) => e.name === 'ast')!;
    const llmEngine = deps.collectionEngines.find((e: CollectionEngine) => e.name === 'llm')!;
    expect(getMockSearch(astEngine)).not.toHaveBeenCalled();
    expect(getMockSearch(llmEngine)).toHaveBeenCalledOnce();
  });

  // Test 3b: POST / with collections=['llm'] tags results with source='llm' even when engine omits source
  it('T3b: single-collection LLM search tags results with source=llm', async () => {
    // Simulate real engine that returns results WITHOUT source field
    const noSourceResult = makeRetrievalResult({ chunkId: 'no-src' });
    delete (noSourceResult as unknown as Record<string, unknown>).source;
    const llmEngine = deps.collectionEngines.find((e: CollectionEngine) => e.name === 'llm')!;
    getMockSearch(llmEngine).mockResolvedValue([noSourceResult]);

    const router = searchRouter(deps);
    const res = await router.request('/', postBody({ query: 'auth', collections: ['llm'] }));
    const body = (await res.json()) as { results: Array<{ source: string }> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.source).toBe('llm');
  });

  // Test 3c: POST / with collections=['ast'] tags results with source='ast' even when engine omits source
  it('T3c: single-collection AST search tags results with source=ast', async () => {
    const noSourceResult = makeRetrievalResult({ chunkId: 'no-src' });
    delete (noSourceResult as unknown as Record<string, unknown>).source;
    const astEngine = deps.collectionEngines.find((e: CollectionEngine) => e.name === 'ast')!;
    getMockSearch(astEngine).mockResolvedValue([noSourceResult]);

    const router = searchRouter(deps);
    const res = await router.request('/', postBody({ query: 'auth', collections: ['ast'] }));
    const body = (await res.json()) as { results: Array<{ source: string }> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]!.source).toBe('ast');
  });

  // Test 4: POST / with collections=['both'] uses multi-engine
  it('T4: POST / with collections=[both] uses multiSearchEngine', async () => {
    const router = searchRouter(deps);
    await router.request('/', postBody({ query: 'auth', collections: ['both'] }));
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(deps.multiSearchEngine.search as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
  });

  // Test 5: POST / returns metrics with required fields
  it('T5: POST / returns metrics with latencyMs, chunksScanned, resultsReturned, scoreRange', async () => {
    const router = searchRouter(deps);
    const res = await router.request('/', postBody({ query: 'auth' }));
    const body = (await res.json()) as {
      metrics: {
        latencyMs: number;
        chunksScanned: number;
        resultsReturned: number;
        scoreRange: { min: number; max: number };
      };
    };
    expect(body.metrics.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.metrics.chunksScanned).toBeGreaterThanOrEqual(0);
    expect(typeof body.metrics.resultsReturned).toBe('number');
    expect(body.metrics.scoreRange).toHaveProperty('min');
    expect(body.metrics.scoreRange).toHaveProperty('max');
  });

  // Test 6: POST / with empty query string returns 400
  it('T6: POST / with empty query returns 400', async () => {
    const router = searchRouter(deps);
    const res = await router.request('/', postBody({ query: '' }));
    expect(res.status).toBe(400);
  });

  // Test 7: POST / when search throws returns 500
  it('T7: POST / when search throws returns 500', async () => {
    deps = makeSearchDeps({
      multiSearchEngine: {
        search: vi.fn().mockRejectedValue(new Error('Qdrant unavailable')),
      } as unknown as SearchDeps['multiSearchEngine'],
    });
    const router = searchRouter(deps);
    const res = await router.request('/', postBody({ query: 'auth' }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe('string');
  });

  // Test 8: GET /collections returns array with name, type, chunkCount
  it('T8: GET /collections returns collection info array', async () => {
    const router = searchRouter(deps);
    const res = await router.request('/collections');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ name: string; type: string; chunkCount: number }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0]).toHaveProperty('name');
    expect(body[0]).toHaveProperty('type');
    expect(body[0]).toHaveProperty('chunkCount');
  });

  // Test 9: GET /collections when no collections exist returns empty array
  it('T9: GET /collections with no engines returns empty array', async () => {
    deps = makeSearchDeps({ collectionEngines: [] });
    const router = searchRouter(deps);
    const res = await router.request('/collections');
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([]);
  });

  // Test 10: POST / result DTO has correct shape - no imports/exports
  it('T10: POST / result DTO has id, filePath, score, source, etc. but no imports/exports', async () => {
    const router = searchRouter(deps);
    const res = await router.request('/', postBody({ query: 'auth' }));
    const body = (await res.json()) as {
      results: Array<{
        id: string;
        filePath: string;
        startLine: number;
        endLine: number;
        score: number;
        source: string;
        chunkType: string;
        matchedVector: string;
        content: string;
        imports?: unknown;
        exports?: unknown;
      }>;
    };
    expect(body.results.length).toBeGreaterThan(0);
    const result = body.results[0]!;
    expect(result.id).toBeDefined();
    expect(result.filePath).toBeDefined();
    expect(result.score).toBeDefined();
    expect(result.source).toBeDefined();
    expect(result.chunkType).toBeDefined();
    expect(result.matchedVector).toBeDefined();
    expect(result.content).toBeDefined();
    // No imports/exports in DTO
    expect(result.imports).toBeUndefined();
    expect(result.exports).toBeUndefined();
  });
});
function getMockSearch(engine: CollectionEngine): ReturnType<typeof vi.fn> {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  return vi.mocked(engine.engine.search);
}
