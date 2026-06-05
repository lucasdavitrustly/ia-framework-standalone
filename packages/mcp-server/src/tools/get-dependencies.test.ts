/**
 * T064: Tests for updated get_dependencies handler.
 * Covers: file-level dependency edge extraction, module-level BFS, error cases.
 *
 * TDD: these tests are written BEFORE the implementation and must fail first.
 */
import { describe, test, expect, vi } from 'vitest';
import { getDependenciesHandler } from './get-dependencies.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'chunk-1',
    filePath: '/project/src/auth.ts',
    relativePath: 'src/auth.ts',
    content: 'const x = 1;',
    startLine: 1,
    endLine: 10,
    language: 'typescript',
    chunkType: 'function',
    name: 'authFn',
    imports: [],
    exports: [],
    score: 1.0,
    matchedVector: 'text',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T064 – Path query with dependencyEdges
// ---------------------------------------------------------------------------

describe('T064: getDependenciesHandler – path query with dependencyEdges', () => {
  test('extracts structured dependencyEdges into structuredContent.imports', async () => {
    const chunk = makeChunk({
      dependencyEdges: [
        { targetPath: 'src/user-service.ts', relation: 'imports', symbols: ['UserService'] },
        { targetPath: 'src/db.ts', relation: 'imports', symbols: ['connect'] },
      ],
    });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };

    const result = await getDependenciesHandler(engine, { path: 'src/auth.ts' });
    const structured = (result as any).structuredContent;

    expect(structured.target).toBe('src/auth.ts');
    expect(structured.imports).toBeDefined();
    expect(structured.imports.some((i: any) => i.path === 'src/user-service.ts')).toBe(true);
    expect(
      structured.imports.find((i: any) => i.path === 'src/user-service.ts')?.symbols,
    ).toContain('UserService');
  });

  test('dependencyEdges field on structuredContent contains raw edges', async () => {
    const edges = [{ targetPath: 'src/logger.ts', relation: 'imports', symbols: ['Logger'] }];
    const chunk = makeChunk({ dependencyEdges: edges });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };

    const result = await getDependenciesHandler(engine, { path: 'src/auth.ts' });
    const structured = (result as any).structuredContent;

    expect(structured.dependencyEdges).toBeDefined();
    expect(structured.dependencyEdges[0].targetPath).toBe('src/logger.ts');
  });

  test('returns error when both path and module are provided', async () => {
    const engine = { getFile: vi.fn() };

    const result = await getDependenciesHandler(engine, {
      path: 'src/auth.ts',
      module: 'com.example:service',
    } as any);
    const text = (result.content[0] as { text: string }).text;

    expect(text.toLowerCase()).toContain('cannot specify both');
  });
});

// ---------------------------------------------------------------------------
// T064 – Module query with BFS traversal
// ---------------------------------------------------------------------------

describe('T064: getDependenciesHandler – module query with BFS', () => {
  test('uses engine.search with module filter when module param provided', async () => {
    const chunk = makeChunk({
      relativePath: 'src/service/auth.ts',
      dependencyEdges: [{ targetPath: 'src/util/crypto.ts', relation: 'imports', symbols: [] }],
    });
    const engine = {
      getFile: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([chunk]),
    };

    const result = await getDependenciesHandler(engine, {
      module: 'com.example:auth-service',
    } as any);
    const text = (result.content[0] as { text: string }).text;

    expect(engine.search).toHaveBeenCalled();
    const searchCall = engine.search.mock.calls[0]![0];
    expect(JSON.stringify(searchCall)).toContain('auth-service');
    expect(text).toContain('com.example:auth-service');
  });

  test('BFS depth=2 calls getFile for each edge targetPath from hop 1', async () => {
    const hop1Chunk = makeChunk({
      relativePath: 'src/service/auth.ts',
      dependencyEdges: [{ targetPath: 'src/util/crypto.ts', relation: 'imports', symbols: [] }],
    });
    const hop2Chunk = makeChunk({
      relativePath: 'src/util/crypto.ts',
      dependencyEdges: [{ targetPath: 'src/util/random.ts', relation: 'imports', symbols: [] }],
    });
    const engine = {
      getFile: vi.fn().mockResolvedValue([hop2Chunk]),
      search: vi.fn().mockResolvedValue([hop1Chunk]),
    };

    await getDependenciesHandler(engine, { module: 'com.example:auth', depth: 2 } as any);

    // getFile should be called for the first-hop edge target to follow to hop 2
    expect(engine.getFile).toHaveBeenCalledWith('src/util/crypto.ts');
  });

  test('module query structuredContent includes target and edges from BFS', async () => {
    const chunk = makeChunk({
      relativePath: 'src/svc.ts',
      dependencyEdges: [{ targetPath: 'src/dep.ts', relation: 'imports', symbols: ['Dep'] }],
    });
    const engine = {
      getFile: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([chunk]),
    };

    const result = await getDependenciesHandler(engine, { module: 'com.example:svc' } as any);
    const structured = (result as any).structuredContent;

    expect(structured.target).toBe('com.example:svc');
    expect(structured.dependencyEdges).toBeDefined();
    expect(structured.dependencyEdges.some((e: any) => e.targetPath === 'src/dep.ts')).toBe(true);
  });
});
