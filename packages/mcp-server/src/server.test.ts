import { describe, test, expect, vi } from 'vitest';
import type { RetrievalResult } from '@ia-framework/retrieval';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { searchCodebaseHandler } from './tools/search-codebase.js';
import { getFileHandler } from './tools/get-file.js';
import { getDependenciesHandler } from './tools/get-dependencies.js';
import { benchmarkPreflightHandler } from './tools/benchmark-preflight.js';
import { createMcpServer } from './server.js';

/** Extract text from a CallToolResult's first content item */
function getFirstText(output: CallToolResult): string {
  const item = output.content[0];
  if (!item || item.type !== 'text') throw new Error('Expected text content');
  return item.text;
}

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'chunk-1',
    filePath: '/project/src/auth/middleware.ts',
    relativePath: 'src/auth/middleware.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'authMiddleware',
    content: 'export function authMiddleware(req, res, next) {\n  // verify token\n}',
    startLine: 1,
    endLine: 3,
    imports: ['express', 'jsonwebtoken'],
    exports: ['authMiddleware'],
    score: 0.92,
    matchedVector: 'text',
    ...overrides,
  };
}

function makeMockEngine(
  searchResults: RetrievalResult[] = [],
  fileResults: RetrievalResult[] = [],
) {
  return {
    search: vi.fn().mockResolvedValue(searchResults),
    searchWithExpansion: vi.fn().mockResolvedValue(searchResults),
    searchHybrid: vi.fn().mockResolvedValue(searchResults),
    getFile: vi.fn().mockResolvedValue(fileResults),
  };
}

describe('MCP Server Tools', () => {
  describe('search_codebase handler', () => {
    test('Test 1: calls searchEngine.searchWithExpansion() with the query text', async () => {
      const engine = makeMockEngine([]);
      await searchCodebaseHandler(engine, { query: 'authentication middleware' });
      const [query, options] = engine.searchWithExpansion.mock.calls[0] as [
        { text: string },
        { hops: number },
      ];
      expect(query.text).toBe('authentication middleware');
      expect(options.hops).toEqual(expect.any(Number));
    });

    test('Test 2: formats results as markdown with file path, chunk name, and score', async () => {
      const result = makeResult();
      const engine = makeMockEngine([result]);
      const output = await searchCodebaseHandler(engine, { query: 'auth' });
      const text = getFirstText(output);
      expect(text).toContain('src/auth/middleware.ts');
      expect(text).toContain('authMiddleware');
      expect(text).toContain('0.92');
    });

    test('Test 3: passes limit to searchEngine.searchWithExpansion()', async () => {
      const engine = makeMockEngine([]);
      await searchCodebaseHandler(engine, { query: 'auth', limit: 3 });
      const [query, options] = engine.searchWithExpansion.mock.calls[0] as [
        { limit?: number | undefined },
        { hops: number },
      ];
      expect(query.limit).toBe(3);
      expect(options.hops).toEqual(expect.any(Number));
    });

    test('Test 4: returns "no results" message when results are empty', async () => {
      const engine = makeMockEngine([]);
      const output = await searchCodebaseHandler(engine, { query: 'does not exist' });
      const text = getFirstText(output);
      expect(text.toLowerCase()).toContain('no');
      expect(text.toLowerCase()).toContain('result');
    });

    test('Test 4b: falls back to plain search when expansion fails', async () => {
      const result = makeResult({ relativePath: 'src/fallback.ts' });
      const engine = makeMockEngine([result]);
      engine.searchWithExpansion.mockRejectedValueOnce(new Error('permission denied'));

      const output = await searchCodebaseHandler(engine, { query: 'fallback query' });
      const text = getFirstText(output);

      expect(engine.search).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'fallback query' }),
      );
      expect(text).toContain('dependency expansion was unavailable');
      expect(text).toContain('src/fallback.ts');
    });
  });

  describe('get_file handler', () => {
    test('Test 5: calls searchEngine.getFile() with the provided path', async () => {
      const engine = makeMockEngine([], [makeResult()]);
      await getFileHandler(engine, { path: 'src/auth/middleware.ts' });
      expect(engine.getFile).toHaveBeenCalledWith('src/auth/middleware.ts');
    });

    test('Test 6: formats results as markdown code blocks', async () => {
      const result = makeResult();
      const engine = makeMockEngine([], [result]);
      const output = await getFileHandler(engine, { path: 'src/auth/middleware.ts' });
      const text = getFirstText(output);
      expect(text).toContain('```');
      expect(text).toContain('authMiddleware');
    });

    test('Test 6b: falls back to search evidence when getFile fails', async () => {
      const result = makeResult({ relativePath: 'src/auth/fallback.ts' });
      const engine = makeMockEngine([result], []);
      engine.getFile.mockRejectedValueOnce(new Error('blocked'));

      const output = await getFileHandler(engine, { path: 'src/auth/fallback.ts' });
      const text = getFirstText(output);

      expect(engine.search).toHaveBeenCalledWith({ text: 'src/auth/fallback.ts', limit: 5 });
      expect(text).toContain('direct file retrieval was unavailable');
      expect(text).toContain('Indexed evidence for: src/auth/fallback.ts');
    });
  });

  describe('get_dependencies handler', () => {
    test('Test 7: calls searchEngine.getFile() and extracts unique imports and exports', async () => {
      const chunk1 = makeResult({
        imports: ['express', 'jsonwebtoken'],
        exports: ['authMiddleware'],
      });
      const chunk2 = makeResult({
        chunkId: 'chunk-2',
        name: 'validateToken',
        imports: ['jsonwebtoken', 'zod'],
        exports: ['validateToken'],
      });
      const engine = makeMockEngine([], [chunk1, chunk2]);
      const output = await getDependenciesHandler(engine, { path: 'src/auth/middleware.ts' });
      const text = getFirstText(output);
      // Imports should be deduped
      expect(text).toContain('express');
      expect(text).toContain('jsonwebtoken');
      expect(text).toContain('zod');
      // Not duplicated
      const jsonwebtokenCount = (text.match(/jsonwebtoken/g) ?? []).length;
      expect(jsonwebtokenCount).toBe(1);
      // Exports
      expect(text).toContain('authMiddleware');
      expect(text).toContain('validateToken');
    });

    test('Test 7b: falls back to search evidence when dependency extraction fails', async () => {
      const chunk = makeResult({ imports: ['express'], exports: ['authMiddleware'] });
      const engine = makeMockEngine([chunk], []);
      engine.getFile.mockRejectedValueOnce(new Error('permission denied'));

      const output = await getDependenciesHandler(engine, { path: 'src/auth/middleware.ts' });
      const text = getFirstText(output);

      expect(text).toContain('direct dependency extraction was unavailable');
      expect(text).toContain('express');
      expect(text).toContain('authMiddleware');
    });
  });

  describe('benchmark_preflight handler', () => {
    test('Test 7c: reports runnable preflight when required tools are callable', async () => {
      const engine = makeMockEngine([makeResult()], [makeResult()]);

      const output = await benchmarkPreflightHandler(engine);
      const text = getFirstText(output);

      expect(text).toContain('Benchmark preflight');
      expect(text).toContain('0 blocked');
    });

    test('Test 7d: reports fallback when semantic search is blocked but get_file works', async () => {
      const engine = makeMockEngine([makeResult()], [makeResult()]);
      engine.searchWithExpansion.mockRejectedValueOnce(new Error('permission denied'));

      const output = await benchmarkPreflightHandler(engine);
      const text = getFirstText(output);

      expect(text).toContain('search_codebase: fallback');
      expect(text).toContain('fallback: get_file');
    });
  });

  describe('createMcpServer', () => {
    test('Test 8: createMcpServer() returns an object with a connect() method', () => {
      const engine = makeMockEngine();
      const server = createMcpServer({ searchEngine: engine as never });
      expect(server).toBeDefined();
      expect(typeof server.connect).toBe('function');
    });

    test('Test 9: registers benchmark_preflight tool', () => {
      const engine = makeMockEngine();
      const server = createMcpServer({ searchEngine: engine as never });

      expect(server).toBeDefined();
    });
  });
});
