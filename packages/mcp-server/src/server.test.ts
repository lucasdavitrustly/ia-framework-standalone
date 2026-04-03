import { describe, test, expect, vi } from 'vitest';
import type { RetrievalResult } from '@ia-framework/retrieval';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { searchCodebaseHandler, registerSearchCodebaseTool } from './tools/search-codebase.js';
import { getFileHandler, registerGetFileTool } from './tools/get-file.js';
import { getDependenciesHandler, registerGetDependenciesTool } from './tools/get-dependencies.js';
import { createMcpServer } from './server.js';

/** Extract text from a CallToolResult's first content item */
function getFirstText(output: CallToolResult): string {
  const item = output.content[0];
  if (!item || item.type !== 'text') throw new Error('Expected text content');
  return item.text;
}

function makeResult(
  overrides: Partial<RetrievalResult> = {},
): RetrievalResult {
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

function makeMockEngine(searchResults: RetrievalResult[] = [], fileResults: RetrievalResult[] = []) {
  return {
    search: vi.fn().mockResolvedValue(searchResults),
    searchWithExpansion: vi.fn().mockResolvedValue(searchResults),
    getFile: vi.fn().mockResolvedValue(fileResults),
  };
}

describe('MCP Server Tools', () => {
  describe('search_codebase handler', () => {
    test('Test 1: calls searchEngine.searchWithExpansion() with the query text', async () => {
      const engine = makeMockEngine([]);
      await searchCodebaseHandler(engine, { query: 'authentication middleware' });
      expect(engine.searchWithExpansion).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'authentication middleware' }),
        expect.objectContaining({ hops: expect.any(Number) }),
      );
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
      expect(engine.searchWithExpansion).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 3 }),
        expect.objectContaining({ hops: expect.any(Number) }),
      );
    });

    test('Test 4: returns "no results" message when results are empty', async () => {
      const engine = makeMockEngine([]);
      const output = await searchCodebaseHandler(engine, { query: 'does not exist' });
      const text = getFirstText(output);
      expect(text.toLowerCase()).toContain('no');
      expect(text.toLowerCase()).toContain('result');
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
  });

  describe('get_dependencies handler', () => {
    test('Test 7: calls searchEngine.getFile() and extracts unique imports and exports', async () => {
      const chunk1 = makeResult({ imports: ['express', 'jsonwebtoken'], exports: ['authMiddleware'] });
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
  });

  describe('createMcpServer', () => {
    test('Test 8: createMcpServer() returns an object with a connect() method', () => {
      const engine = makeMockEngine();
      const server = createMcpServer({ searchEngine: engine as never });
      expect(server).toBeDefined();
      expect(typeof server.connect).toBe('function');
    });
  });
});
