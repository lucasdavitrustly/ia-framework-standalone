import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RetrievalResult } from './types.js';
import type { SearchEngine } from './search-engine.js';
import { MultiCollectionSearchEngine } from './multi-collection-search-engine.js';

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
): SearchEngine {
  return {
    search: vi.fn().mockResolvedValue(searchResults),
    searchHybrid: vi.fn().mockResolvedValue(hybridResults ?? searchResults),
    searchWithExpansion: vi.fn().mockResolvedValue(searchResults),
    getFile: vi.fn().mockResolvedValue(getFileResults ?? searchResults),
  } as unknown as SearchEngine;
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
          { name: 'ast', engine: astEngine },
          { name: 'llm', engine: llmEngine },
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
        engines: [{ name: 'ast', engine: astEngine }],
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
          { name: 'ast', engine: astEngine },
          { name: 'llm', engine: llmEngine },
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
          { name: 'ast', engine: astEngine },
          { name: 'llm', engine: llmEngine },
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
          { name: 'ast', engine: astEngine },
          { name: 'llm', engine: llmEngine },
        ],
      });

      const results = await engine.search({ text: 'test', limit: 10 });

      expect(results).toHaveLength(1);
      expect(results[0]!.chunkId).toBe('a');
      expect(results[0]!.source).toBe('ast');
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
          { name: 'ast', engine: astEngine },
          { name: 'llm', engine: llmEngine },
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
        engines: [{ name: 'ast', engine: astEngine }],
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
          { name: 'ast', engine: astEngine },
          { name: 'llm', engine: llmEngine },
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
        engines: [{ name: 'ast', engine: astEngine }],
        dependencyGraph: depGraph,
      });

      const results = await engine.searchWithExpansion({ text: 'test', limit: 5 }, { hops: 1 });

      expect(depGraph.getNeighborFiles).toHaveBeenCalledOnce();
      // Base results + expansion results
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('Test 10: no dependency graph - returns base search results only', async () => {
      const baseResults = [makeResult({ chunkId: 'a', score: 0.9 })];
      const astEngine = createMockEngine(baseResults);

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine }],
        // no dependencyGraph
      });

      const results = await engine.searchWithExpansion({ text: 'test', limit: 5 });

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
        engines: [{ name: 'ast', engine: astEngine }],
        dependencyGraph: depGraph,
      });

      await engine.searchWithExpansion({ text: 'test', limit: 5 }, { hops: 0 });

      expect(depGraph.getNeighborFiles).not.toHaveBeenCalled();
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
          { name: 'ast', engine: astEngine },
          { name: 'llm', engine: llmEngine },
        ],
      });

      const results = await engine.getFile('test/file.ts');

      expect(astEngine.getFile).toHaveBeenCalledWith('test/file.ts');
      expect(llmEngine.getFile).toHaveBeenCalledWith('test/file.ts');
      expect(results.length).toBe(3); // 2 ast + 1 llm
      const sources = results.map((r: RetrievalResult) => r.source);
      expect(sources).toContain('ast');
      expect(sources).toContain('llm');
    });

    it('Test 13: deduplicates by chunkId - keeps first occurrence', async () => {
      const sharedChunk = makeResult({ chunkId: 'shared', score: 0.0, startLine: 1, endLine: 10 });
      const astEngine = createMockEngine([], undefined, [sharedChunk]);
      const llmEngine = createMockEngine([], undefined, [sharedChunk]); // same chunkId

      const engine = new MultiCollectionSearchEngine({
        engines: [
          { name: 'ast', engine: astEngine },
          { name: 'llm', engine: llmEngine },
        ],
      });

      const results = await engine.getFile('test/file.ts');

      // deduped: only one result with chunkId 'shared'
      expect(results.filter((r: RetrievalResult) => r.chunkId === 'shared')).toHaveLength(1);
    });

    it('Test 14: single engine - returns tagged results', async () => {
      const chunks = [makeResult({ chunkId: 'a', score: 0.0, startLine: 1, endLine: 10 })];
      const astEngine = createMockEngine([], undefined, chunks);

      const engine = new MultiCollectionSearchEngine({
        engines: [{ name: 'ast', engine: astEngine }],
      });

      const results = await engine.getFile('test/file.ts');

      expect(results).toHaveLength(1);
      expect(results[0]!.source).toBe('ast');
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
});
