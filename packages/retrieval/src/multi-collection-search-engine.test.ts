import { describe, it, expect, vi } from 'vitest';
import type { RetrievalResult } from './types.js';
import type { SearchEngine } from './search-engine.js';
import { MultiCollectionSearchEngine } from './multi-collection-search-engine.js';
import { createEffectiveFilter } from './effective-filter.js';
import { multiHopExpand } from './multi-hop.js';

/**
 * Vitest asymmetric matchers are typed `any`; narrow them to `unknown` so
 * nested matcher shapes stay lint-clean without suppressions.
 */
const arrayContaining = (items: unknown[]): unknown[] =>
  expect.arrayContaining(items) as unknown[];
const objectContaining = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape) as unknown;


type MockSearchEngine = {
  search: ReturnType<typeof vi.fn>;
  searchHybrid: ReturnType<typeof vi.fn>;
  searchWithExpansion: ReturnType<typeof vi.fn>;
  getFile: ReturnType<typeof vi.fn>;
};

function makeResult(
  overrides: Partial<RetrievalResult> & { chunkId: string; score: number },
): RetrievalResult {
  return {
    filePath: '/test/file.ts',
    relativePath: 'test/file.ts',
    language: 'typescript',
    chunkType: 'function',
    content: 'test content',
    startLine: 1,
    endLine: 10,
    imports: [],
    exports: [],
    matchedVector: 'text',
    ...overrides,
  };
}

function createMockEngine(
  searchResults: RetrievalResult[] = [],
  hybridResults?: RetrievalResult[],
  getFileResults?: RetrievalResult[],
): MockSearchEngine {
  return {
    search: vi.fn().mockResolvedValue(searchResults),
    searchHybrid: vi.fn().mockResolvedValue(hybridResults ?? searchResults),
    searchWithExpansion: vi.fn().mockResolvedValue(searchResults),
    getFile: vi.fn().mockResolvedValue(getFileResults ?? searchResults),
  };
}

describe('MultiCollectionSearchEngine', () => {
  describe('search()', () => {
    it('Test 1: two engines - calls search on both in parallel, merges via RRF with source tags', async () => {
      const astResults = [
        makeResult({ chunkId: 'a', score: 0.9 }),
        makeResult({ chunkId: 'b', score: 0.8 }),
      ];
      const llmResults = [
        makeResult({ chunkId: 'c', score: 0.9 }),
        makeResult({ chunkId: 'd', score: 0.8 }),
      ];
      const astEngine = createMockEngine(astResults);
      const llmEngine = createMockEngine(llmResults);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const results = await engine.search({ text: 'test query', limit: 10 });

      expect(astEngine.search).toHaveBeenCalledOnce();
      expect(llmEngine.search).toHaveBeenCalledOnce();
      expect(results.length).toBeGreaterThan(0);
      // All results should have source tags
      for (const r of results) {
        expect(r.source).toMatch(/^(ast|llm)$/);
      }
    });

    it('Test 2: single engine - returns results with source tag', async () => {
      const astResults = [makeResult({ chunkId: 'a', score: 0.9 })];
      const astEngine = createMockEngine(astResults);

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
      });

      const results = await engine.search({ text: 'test query', limit: 10 });

      expect(results).toHaveLength(1);
      expect(results[0]!.chunkId).toBe('a');
      expect(results[0]!.source).toBe('ast');
    });

    it('Test 3: over-fetching - each engine receives limit * 2', async () => {
      const astEngine = createMockEngine([]);
      const llmEngine = createMockEngine([]);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      await engine.search({ text: 'test', limit: 5 });

      expect(astEngine.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
      expect(llmEngine.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    });

    it('Test 4: scoreThreshold is stripped from overFetchQuery (RRF merge produces rank-based scores, cosine threshold would filter wrongly)', async () => {
      const astEngine = createMockEngine([]);
      const llmEngine = createMockEngine([]);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      await engine.search({ text: 'test', limit: 5, scoreThreshold: 0.7 });

      expect(astEngine.search).toHaveBeenCalledWith(
        expect.objectContaining({ scoreThreshold: undefined }),
      );
      expect(llmEngine.search).toHaveBeenCalledWith(
        expect.objectContaining({ scoreThreshold: undefined }),
      );
    });

    it('Test 5: empty results from one engine - other engine results still returned', async () => {
      const astResults = [makeResult({ chunkId: 'a', score: 0.9 })];
      const astEngine = createMockEngine(astResults);
      const llmEngine = createMockEngine([]);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const results = await engine.search({ text: 'test', limit: 10 });

      expect(results).toHaveLength(1);
      expect(results[0]!.chunkId).toBe('a');
      expect(results[0]!.source).toBe('ast');
    });

    it('preserves metadata supplied by a later collection for a merged chunk', async () => {
      const astResult = makeResult({
        chunkId: 'shared',
        score: 0.9,
        signature: 'refund(): void',
        enrichment: { description: 'Refunds a payment.' },
      });
      const llmResult = makeResult({
        chunkId: 'shared',
        score: 0.8,
        classSignature: 'class PaymentService',
        enrichment: {
          businessContext: 'Payment lifecycle',
          semanticTags: ['refund'],
        },
      });

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: createMockEngine([astResult]) as unknown as SearchEngine },
          { name: 'llm', engine: createMockEngine([llmResult]) as unknown as SearchEngine },
        ],
      });

      const [result] = await engine.search({ text: 'refund', limit: 10 });

      expect(result?.signature).toBe('refund(): void');
      expect(result?.classSignature).toBe('class PaymentService');
      expect(result?.enrichment).toEqual({
        description: 'Refunds a payment.',
        businessContext: 'Payment lifecycle',
        semanticTags: ['refund'],
      });
    });

    it('preserves metadata supplied by a later collection for hybrid merged chunks', async () => {
      const astResult = makeResult({
        chunkId: 'shared-hybrid',
        score: 0.02,
        enrichment: { description: 'AST description' },
      });
      const llmResult = makeResult({
        chunkId: 'shared-hybrid',
        score: 0.01,
        stereotype: 'service',
        enrichment: { semanticTags: ['payments'] },
      });
      const astEngine = createMockEngine([], [astResult]);
      const llmEngine = createMockEngine([], [llmResult]);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const [result] = await engine.searchHybrid({ text: 'payment service', limit: 10 });

      expect(result?.stereotype).toBe('service');
      expect(result?.enrichment).toEqual({
        description: 'AST description',
        semanticTags: ['payments'],
      });
    });
  });

  describe('searchHybrid()', () => {
    it('Test 6: two engines - calls searchHybrid on both, merges via RRF with source tags', async () => {
      const astResults = [makeResult({ chunkId: 'a', score: 0.9 })];
      const llmResults = [makeResult({ chunkId: 'b', score: 0.9 })];
      const astEngine = createMockEngine([], astResults);
      const llmEngine = createMockEngine([], llmResults);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const results = await engine.searchHybrid({ text: 'test', limit: 10 });

      expect(astEngine.searchHybrid).toHaveBeenCalledOnce();
      expect(llmEngine.searchHybrid).toHaveBeenCalledOnce();
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.source).toMatch(/^(ast|llm)$/);
      }
    });

    it('Test 7: single engine - pass-through with source tag', async () => {
      const astResults = [makeResult({ chunkId: 'x', score: 0.9 })];
      const astEngine = createMockEngine([], astResults);

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
      });

      const results = await engine.searchHybrid({ text: 'test', limit: 10 });

      expect(results).toHaveLength(1);
      expect(results[0]!.chunkId).toBe('x');
      expect(results[0]!.source).toBe('ast');
    });

    it('Test 8: over-fetching applies to searchHybrid calls', async () => {
      const astEngine = createMockEngine([], []);
      const llmEngine = createMockEngine([], []);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      await engine.searchHybrid({ text: 'test', limit: 5 });

      expect(astEngine.searchHybrid).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    });
  });

  describe('searchWithExpansion()', () => {
    it('Test 9: runs multi-collection search then expands via dependency graph', async () => {
      const baseResults = [
        makeResult({ chunkId: 'a', score: 0.9, filePath: '/test/a.ts', relativePath: 'test/a.ts' }),
      ];
      const neighborChunks = [
        makeResult({ chunkId: 'b', score: 0.5, filePath: '/test/b.ts', relativePath: 'test/b.ts' }),
      ];

      const astEngine = createMockEngine(baseResults, undefined, neighborChunks);
      const depGraph = {
        getNeighborFiles: vi.fn().mockResolvedValue(['/test/b.ts']),
      };

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
        dependencyGraph: depGraph,
      });

      const filter = createEffectiveFilter();
      const results = await engine.searchWithExpansion({ text: 'test', limit: 5 }, filter, {
        hops: 1,
      });

      expect(depGraph.getNeighborFiles).toHaveBeenCalledWith(['/test/a.ts'], 1, filter);
      // Base results + expansion results
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('Test 10: no dependency graph - returns base search results only', async () => {
      const baseResults = [makeResult({ chunkId: 'a', score: 0.9 })];
      const astEngine = createMockEngine(baseResults);

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
        // no dependencyGraph
      });

      const results = await engine.searchWithExpansion(
        { text: 'test', limit: 5 },
        createEffectiveFilter(),
      );

      expect(results).toHaveLength(1);
      expect(results[0]!.chunkId).toBe('a');
    });

    it('Test 11: hops=0 - returns base multi-collection search results without expansion', async () => {
      const baseResults = [makeResult({ chunkId: 'a', score: 0.9 })];
      const astEngine = createMockEngine(baseResults);
      const depGraph = {
        getNeighborFiles: vi.fn().mockResolvedValue(['/test/b.ts']),
      };

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
        dependencyGraph: depGraph,
      });

      await engine.searchWithExpansion({ text: 'test', limit: 5 }, createEffectiveFilter(), {
        hops: 0,
      });

      expect(depGraph.getNeighborFiles).not.toHaveBeenCalled();
    });

    it('T33: preserves the scoped filter across both collection searches', async () => {
      const filter = createEffectiveFilter(
        { must: [{ key: 'language', match: { value: 'typescript' } }] },
        'repo-a',
      );
      const astResult = makeResult({ chunkId: 'repo-a', score: 0.9, repoId: 'repo-a' });
      const outOfScopeResult = makeResult({ chunkId: 'repo-b', score: 0.9, repoId: 'repo-b' });
      const scopedSearch = vi.fn((query: { filter?: Record<string, unknown> }) =>
        Promise.resolve(
          JSON.stringify(query.filter).includes('repo-a') ? [astResult] : [outOfScopeResult],
        ),
      );
      const astEngine = createMockEngine();
      astEngine.search = scopedSearch;
      const llmEngine = createMockEngine();
      llmEngine.search = scopedSearch;
      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const results = await engine.searchWithExpansion(
        { text: 'payment service', limit: 5 },
        filter,
        { hops: 0 },
      );

      const expectedFilter = objectContaining({
        must: arrayContaining([
          { key: 'repoId', match: { value: 'repo-a' } },
          { key: 'language', match: { value: 'typescript' } },
        ]),
        must_not: arrayContaining([
          { key: 'stereotype', match: { value: 'test' } },
          { key: 'kind', match: { value: '__ia_contract__' } },
        ]),
      });
      expect(astEngine.search).toHaveBeenCalledWith(
        expect.objectContaining({ filter: expectedFilter }),
      );
      expect(llmEngine.search).toHaveBeenCalledWith(
        expect.objectContaining({ filter: expectedFilter }),
      );
      expect(results.every((result) => result.repoId === 'repo-a')).toBe(true);
    });

    it('T33: returns the unexpanded base result when dependency expansion is empty', async () => {
      const baseResult = makeResult({ chunkId: 'base', score: 0.9 });
      const astEngine = createMockEngine([baseResult]);
      const dependencyGraph = { getNeighborFiles: vi.fn().mockResolvedValue([]) };
      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
        dependencyGraph,
      });

      await expect(
        engine.searchWithExpansion({ text: 'payment service' }, createEffectiveFilter(), {
          hops: 1,
        }),
      ).resolves.toEqual([{ ...baseResult, source: 'ast' }]);
      expect(dependencyGraph.getNeighborFiles).toHaveBeenCalledOnce();
    });

    it('preserves enrichment on dependency expansion results', async () => {
      const baseResult = makeResult({
        chunkId: 'base',
        score: 0.9,
        filePath: '/test/base.ts',
        relativePath: 'test/base.ts',
      });
      const dependencyResult = makeResult({
        chunkId: 'dependency',
        score: 0,
        filePath: '/test/dependency.ts',
        relativePath: 'test/dependency.ts',
        signature: 'loadDependency(): void',
        enrichment: { description: 'Loads the dependency.' },
      });
      const astEngine = createMockEngine([baseResult], undefined, [dependencyResult]);
      const dependencyGraph = {
        getNeighborFiles: vi.fn().mockResolvedValue(['/test/dependency.ts']),
      };
      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
        dependencyGraph,
      });

      const [result] = (await engine.searchWithExpansion(
        { text: 'load dependency', limit: 5 },
        createEffectiveFilter(),
        { hops: 1 },
      )).filter((item) => item.chunkId === 'dependency');

      expect(result?.signature).toBe('loadDependency(): void');
      expect(result?.enrichment).toEqual({ description: 'Loads the dependency.' });
    });

    it('T33: rejects missing filters on every multi-collection expansion entry point', async () => {
      const engine = new MultiCollectionSearchEngine({ engines: [] });

      await expect(
        engine.searchWithExpansion({ text: 'query' }, undefined as never),
      ).rejects.toThrow(/EffectiveFilter is required/);
      await expect(engine.getFile('src/file.ts', undefined as never)).rejects.toThrow(
        /EffectiveFilter is required/,
      );
      await expect(
        engine.searchWithInterfaceExpansion({ text: 'Service' }, undefined as never),
      ).rejects.toThrow(/EffectiveFilter is required/);
    });
  });

  describe('getFile()', () => {
    it('Test 12: two engines - calls getFile on both, combines results with source tags', async () => {
      const astFileChunks = [
        makeResult({ chunkId: 'ast-1', score: 0.0, startLine: 1, endLine: 10 }),
        makeResult({ chunkId: 'ast-2', score: 0.0, startLine: 11, endLine: 20 }),
      ];
      const llmFileChunks = [
        makeResult({ chunkId: 'llm-1', score: 0.0, startLine: 1, endLine: 25 }),
      ];
      const astEngine = createMockEngine([], undefined, astFileChunks);
      const llmEngine = createMockEngine([], undefined, llmFileChunks);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const results = await engine.getFile('test/file.ts', createEffectiveFilter());

      expect(astEngine.getFile).toHaveBeenCalledWith(
        'test/file.ts',
        expect.objectContaining({
          excludeTests: true,
          reservedExclusion: true,
        }),
      );
      expect(llmEngine.getFile).toHaveBeenCalledWith(
        'test/file.ts',
        expect.objectContaining({
          excludeTests: true,
          reservedExclusion: true,
        }),
      );
      expect(results.length).toBe(3); // 2 ast + 1 llm
      const sources = results.map((r: RetrievalResult) => r.source);
      expect(sources).toContain('ast');
      expect(sources).toContain('llm');
    });

    it('Test 12b: threads repoId to every engine getFile call', async () => {
      const astEngine = createMockEngine([], undefined, []);
      const llmEngine = createMockEngine([], undefined, []);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      await engine.getFile('test/file.ts', createEffectiveFilter({}, 'payment-gateway'));

      expect(astEngine.getFile).toHaveBeenCalledWith(
        'test/file.ts',
        expect.objectContaining({
          repoId: 'payment-gateway',
        }),
      );
      expect(llmEngine.getFile).toHaveBeenCalledWith(
        'test/file.ts',
        expect.objectContaining({
          repoId: 'payment-gateway',
        }),
      );
    });

    it('Test 13: deduplicates by chunkId - keeps first occurrence', async () => {
      const sharedChunk = makeResult({ chunkId: 'shared', score: 0.0, startLine: 1, endLine: 10 });
      const astEngine = createMockEngine([], undefined, [sharedChunk]);
      const llmEngine = createMockEngine([], undefined, [sharedChunk]); // same chunkId

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const results = await engine.getFile('test/file.ts', createEffectiveFilter());

      // deduped: only one result with chunkId 'shared'
      expect(results.filter((r: RetrievalResult) => r.chunkId === 'shared')).toHaveLength(1);
    });

    it('Test 14: single engine - returns tagged results', async () => {
      const chunks = [makeResult({ chunkId: 'a', score: 0.0, startLine: 1, endLine: 10 })];
      const astEngine = createMockEngine([], undefined, chunks);

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
      });

      const results = await engine.getFile('test/file.ts', createEffectiveFilter());

      expect(results).toHaveLength(1);
      expect(results[0]!.source).toBe('ast');
    });

    it('merges metadata when the same file chunk is returned by both collections', async () => {
      const astChunk = makeResult({
        chunkId: 'shared-file',
        score: 0,
        enrichment: { description: 'AST file summary' },
      });
      const llmChunk = makeResult({
        chunkId: 'shared-file',
        score: 0,
        signature: 'load(): void',
        enrichment: { semanticTags: ['file'] },
      });
      const astEngine = createMockEngine([], undefined, [astChunk]);
      const llmEngine = createMockEngine([], undefined, [llmChunk]);
      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const [result] = await engine.getFile('test/file.ts', createEffectiveFilter());

      expect(result?.signature).toBe('load(): void');
      expect(result?.enrichment).toEqual({
        description: 'AST file summary',
        semanticTags: ['file'],
      });
    });
  });

  describe('searchWithInterfaceExpansion()', () => {
    it('T33: forwards the effective filter to the AST interface expansion', async () => {
      const filter = createEffectiveFilter({}, 'repo-a');
      const interfaceResults = [makeResult({ chunkId: 'impl', score: 0, repoId: 'repo-a' })];
      const astEngine = {
        ...createMockEngine(),
        searchWithInterfaceExpansion: vi.fn().mockResolvedValue(interfaceResults),
      };
      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
      });

      const results = await engine.searchWithInterfaceExpansion({ text: 'Service' }, filter);

      expect(astEngine.searchWithInterfaceExpansion).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: objectContaining({
            must: arrayContaining([{ key: 'repoId', match: { value: 'repo-a' } }]),
          }),
        }),
        filter,
      );
      expect(results).toEqual([{ ...interfaceResults[0], source: 'ast' }]);
    });

    it('preserves enrichment on interface implementation results', async () => {
      const filter = createEffectiveFilter({}, 'repo-a');
      const interfaceResult = makeResult({
        chunkId: 'impl-enriched',
        score: 0,
        repoId: 'repo-a',
        signature: 'process(): void',
        enrichment: { description: 'Implements the payment interface.' },
      });
      const astEngine = {
        ...createMockEngine(),
        searchWithInterfaceExpansion: vi.fn().mockResolvedValue([interfaceResult]),
      };
      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
      });

      const [result] = await engine.searchWithInterfaceExpansion({ text: 'PaymentService' }, filter);

      expect(result?.signature).toBe('process(): void');
      expect(result?.enrichment).toEqual({ description: 'Implements the payment interface.' });
    });
  });

  describe('multi-hop expansion metadata', () => {
    it('preserves enrichment on hierarchy expansion', async () => {
      const hit = makeResult({
        chunkId: 'base-class',
        score: 0,
        signature: 'class PaymentService',
        enrichment: { description: 'Coordinates payment operations.' },
      });
      const results = await multiHopExpand(
        [makeResult({ chunkId: 'base', score: 0.9, content: 'new PaymentService();' })],
        { scrollByName: vi.fn().mockResolvedValue([hit]) },
        createEffectiveFilter(),
        { expandMethodCalls: false },
      );

      expect(results[0]?.signature).toBe('class PaymentService');
      expect(results[0]?.enrichment).toEqual({ description: 'Coordinates payment operations.' });
    });

    it('preserves enrichment on method-call expansion', async () => {
      const hit = makeResult({
        chunkId: 'called-method',
        score: 0,
        signature: 'fetchData(): Data',
        enrichment: { semanticTags: ['io', 'data'] },
      });
      const results = await multiHopExpand(
        [makeResult({ chunkId: 'base', score: 0.9, content: 'client.fetchData();' })],
        { scrollByDefines: vi.fn().mockResolvedValue([hit]) },
        createEffectiveFilter(),
        { expandHierarchy: false },
      );

      expect(results[0]?.signature).toBe('fetchData(): Data');
      expect(results[0]?.enrichment).toEqual({ semanticTags: ['io', 'data'] });
    });

    it('preserves enrichment on repository-scoped multi-hop expansion', async () => {
      const hit = makeResult({
        chunkId: 'cross-repo-class',
        score: 0,
        repoId: 'repo-b',
        enrichment: { businessContext: 'Shared payment domain' },
      });
      const results = await multiHopExpand(
        [makeResult({ chunkId: 'base', score: 0.9, content: 'new PaymentService();' })],
        {
          scrollByName: vi.fn().mockResolvedValue([]),
          scrollByNameInRepo: vi.fn().mockResolvedValue([hit]),
        },
        createEffectiveFilter({}, 'repo-b'),
        { expandMethodCalls: false },
      );

      expect(results[0]?.repoId).toBe('repo-b');
      expect(results[0]?.enrichment).toEqual({ businessContext: 'Shared payment domain' });
    });
  });

  describe('interface compatibility', () => {
    it('satisfies Engine duck type (search + searchWithExpansion + getFile)', () => {
      // Type-level check: MultiCollectionSearchEngine must have these methods
      const engine = new MultiCollectionSearchEngine({ engines: [] });
      expect(typeof engine.search).toBe('function');
      expect(typeof engine.searchWithExpansion).toBe('function');
      expect(typeof engine.getFile).toBe('function');
    });

    it('satisfies HybridEngine duck type (searchHybrid)', () => {
      const engine = new MultiCollectionSearchEngine({ engines: [] });
      expect(typeof engine.searchHybrid).toBe('function');
    });
  });

  // ---------------------------------------------------------------------------
  // US8: RRF single-list score preservation
  // ---------------------------------------------------------------------------
  describe('US8: single-engine cosine score preservation', () => {
    it('search() with one engine preserves original cosine scores (no RRF conversion)', async () => {
      const astResults = [
        makeResult({ chunkId: 'a', score: 0.85, scoreType: 'cosine' as const }),
        makeResult({ chunkId: 'b', score: 0.72, scoreType: 'cosine' as const }),
        makeResult({ chunkId: 'c', score: 0.61, scoreType: 'cosine' as const }),
      ];
      const astEngine = createMockEngine(astResults);

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
      });

      const results = await engine.search({ text: 'payment processing', limit: 10 });

      expect(results).toHaveLength(3);
      // Original cosine scores preserved — NOT replaced with 1/(60+rank+1) ≈ 0.016
      expect(results[0]!.score).toBe(0.85);
      expect(results[1]!.score).toBe(0.72);
      expect(results[2]!.score).toBe(0.61);
      // scoreType preserved as cosine
      expect(results[0]!.scoreType).toBe('cosine');
      expect(results[1]!.scoreType).toBe('cosine');
      // Source tag applied
      expect(results[0]!.source).toBe('ast');
    });

    it('search() with two engines where only one returns results preserves cosine scores', async () => {
      const astResults = [makeResult({ chunkId: 'a', score: 0.9, scoreType: 'cosine' as const })];
      const astEngine = createMockEngine(astResults);
      const llmEngine = createMockEngine([]); // empty — collection doesn't exist or has no matches

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const results = await engine.search({ text: 'test', limit: 10 });

      expect(results).toHaveLength(1);
      expect(results[0]!.score).toBe(0.9);
      expect(results[0]!.scoreType).toBe('cosine');
      expect(results[0]!.source).toBe('ast');
    });

    it('search() with two engines both returning results uses RRF fusion', async () => {
      const astResults = [makeResult({ chunkId: 'a', score: 0.9, scoreType: 'cosine' as const })];
      const llmResults = [makeResult({ chunkId: 'b', score: 0.85, scoreType: 'cosine' as const })];
      const astEngine = createMockEngine(astResults);
      const llmEngine = createMockEngine(llmResults);

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine as unknown as SearchEngine },
          { name: 'llm', engine: llmEngine as unknown as SearchEngine },
        ],
      });

      const results = await engine.search({ text: 'test', limit: 10 });

      // Both engines contributed → RRF fusion applied → scores are rank-based
      expect(results).toHaveLength(2);
      expect(results[0]!.scoreType).toBe('rrf');
      expect(results[0]!.score).toBeLessThan(0.1); // RRF scores are ~0.016
    });

    it('searchHybrid() with one engine preserves original scores', async () => {
      const hybridResults = [
        makeResult({ chunkId: 'x', score: 0.78, scoreType: 'cosine' as const }),
      ];
      const astEngine = createMockEngine([], hybridResults);

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine as unknown as SearchEngine }],
      });

      const results = await engine.searchHybrid({ text: 'test', limit: 10 });

      expect(results).toHaveLength(1);
      expect(results[0]!.score).toBe(0.78);
      expect(results[0]!.scoreType).toBe('cosine');
      expect(results[0]!.source).toBe('ast');
    });
  });
});
