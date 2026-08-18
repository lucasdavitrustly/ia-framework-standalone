import { describe, test, expect, vi, beforeEach } from 'vitest';
import { parseRepoPath, getFileHandler, resetGetFileSessionCache } from './get-file.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

/** Typed view of the get_file tool's structuredContent payload. */
interface GetFileStructured {
  answered?: boolean;
  multiRepo?: boolean;
  fallbackUsed?: boolean;
  cached?: boolean;
  content?: string;
  resolvedVia?: string;
  reposSearched?: string[];
  candidates?: unknown[];
  chunks?: Array<{
    repo?: string;
    name?: string;
    startLine?: number;
    endLine?: number;
    chunkId?: string;
  }>;
  [key: string]: unknown;
}

function structuredOf(result: { structuredContent?: object | undefined }): GetFileStructured {
  return (result.structuredContent ?? {}) as GetFileStructured;
}

describe('parseRepoPath', () => {
  test('parses repo:path prefix', () => {
    expect(parseRepoPath('core:src/a.ts')).toEqual({ repo: 'core', path: 'src/a.ts' });
  });

  test('parses path without prefix', () => {
    expect(parseRepoPath('src/a.ts')).toEqual({ repo: undefined, path: 'src/a.ts' });
  });

  test('does not confuse Windows drive letter with repo prefix', () => {
    expect(parseRepoPath('C:/path/file.ts')).toEqual({ repo: undefined, path: 'C:/path/file.ts' });
  });

  test('handles hyphenated repo names', () => {
    expect(parseRepoPath('my-repo:src/index.ts')).toEqual({
      repo: 'my-repo',
      path: 'src/index.ts',
    });
  });
});

describe('getFileHandler multi-repo', () => {
  function makeResult(overrides: Partial<RetrievalResult>): RetrievalResult {
    return {
      chunkId: 'test-chunk-id',
      filePath: '/project/src/a.ts',
      relativePath: 'src/a.ts',
      content: 'const x = 1;',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
      chunkType: 'function',
      name: 'fn',
      imports: [],
      exports: [],
      score: 1,
      matchedVector: 'text',
      ...overrides,
    };
  }

  test('filters results by repo when prefix provided', async () => {
    const engine = {
      getFile: vi
        .fn()
        .mockResolvedValue([
          makeResult({ repoId: 'core', relativePath: 'src/a.ts' }),
          makeResult({ repoId: 'backend', relativePath: 'src/a.ts' }),
        ]),
    };

    const result = await getFileHandler(engine, { path: 'core:src/a.ts' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('[core]');
    expect(text).not.toContain('[backend]');
  });

  test('groups results by repo when no prefix and multiple repos', async () => {
    const engine = {
      getFile: vi
        .fn()
        .mockResolvedValue([
          makeResult({ repoId: 'core', relativePath: 'src/a.ts' }),
          makeResult({ repoId: 'backend', relativePath: 'src/a.ts' }),
        ]),
    };

    const result = await getFileHandler(engine, { path: 'src/a.ts' });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('## [core]');
    expect(text).toContain('## [backend]');
  });

  test('structuredContent includes repo field per chunk', async () => {
    const engine = {
      getFile: vi
        .fn()
        .mockResolvedValue([makeResult({ repoId: 'core', relativePath: 'src/a.ts' })]),
    };

    const result = await getFileHandler(engine, { path: 'src/a.ts' });
    const structured = structuredOf(result);
    expect(structured.chunks).toBeDefined();
    expect(structured.chunks![0]!.repo).toBe('core');
  });

  test('rejects an explicit unknown repo before querying the engine', async () => {
    const engine = { getFile: vi.fn() };

    const result = await getFileHandler(
      engine,
      { path: 'unknown:src/a.ts' },
      { knownRepos: ['core', 'backend'] },
    );

    expect((result.content[0] as { text: string }).text).toContain("Unknown repo 'unknown'");
    expect(engine.getFile).not.toHaveBeenCalled();
  });

  test('reads a valid but not-yet-indexed explicit repo file from disk', async () => {
    const engine = { getFile: vi.fn().mockResolvedValue([]) };
    const readFileFn = vi.fn().mockResolvedValue('export const fromDisk = true;');

    const result = await getFileHandler(
      engine,
      { path: 'core:src/new.ts' },
      { knownRepos: ['core'], readFileFn },
    );

    expect((result.content[0] as { text: string }).text).toContain('fromDisk = true');
    expect(structuredOf(result).resolvedVia).toBe('filesystem-fallback');
    expect(readFileFn).toHaveBeenCalledWith('src/new.ts', 'core', undefined, undefined);
  });

  test('does not use an invalid zero parent range for a contiguous read', async () => {
    const engine = {
      getFile: vi.fn().mockResolvedValue([
        makeResult({
          name: 'Foo$part1',
          parentName: 'Foo',
          parentStartLine: 0,
          parentEndLine: 20,
          startLine: 2,
          endLine: 10,
        }),
      ]),
    };
    const readFileFn = vi.fn().mockResolvedValue('part content');

    await getFileHandler(engine, { path: 'src/a.ts', name: 'Foo' }, { readFileFn });

    expect(readFileFn).toHaveBeenCalledWith('src/a.ts', undefined, 2, 10);
    expect(readFileFn).not.toHaveBeenCalledWith('src/a.ts', undefined, 0, 20);
  });

  test('prioritizes a direct Foo chunk over methods whose parentName is Foo', async () => {
    const engine = {
      getFile: vi.fn().mockResolvedValue([
        makeResult({ name: 'Foo', chunkType: 'class', startLine: 1, endLine: 20 }),
        makeResult({ name: 'create', parentName: 'Foo', startLine: 3, endLine: 8 }),
      ]),
    };
    const readFileFn = vi.fn().mockResolvedValue('class Foo {}');

    await getFileHandler(engine, { path: 'src/a.ts', name: 'Foo' }, { readFileFn });

    expect(readFileFn).toHaveBeenCalledTimes(1);
    expect(readFileFn).toHaveBeenCalledWith('src/a.ts', undefined, 1, 20);
  });
});

// ---------------------------------------------------------------------------
// T063: Filesystem read primary, semantic search fallback, return chunk metadata
// ---------------------------------------------------------------------------

describe('T063: get_file filesystem read primary + semantic fallback', () => {
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
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('returns filesystem content when readFileFn succeeds', async () => {
    const chunk = makeChunk();
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockResolvedValue('full file content from disk');

    const result = await getFileHandler(engine, { path: 'src/auth.ts' }, { readFileFn });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('full file content from disk');
    expect(readFileFn).toHaveBeenCalledWith('src/auth.ts', undefined);
  });

  test('structuredContent includes indexed chunk metadata when readFileFn provided', async () => {
    const chunk = makeChunk({ name: 'authFn', chunkType: 'function', startLine: 5, endLine: 15 });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockResolvedValue('file content');

    const result = await getFileHandler(engine, { path: 'src/auth.ts' }, { readFileFn });
    const structured = structuredOf(result);
    expect(structured.content).toBe('file content');
    expect(structured.chunks).toBeDefined();
    expect(structured.chunks![0]!.name).toBe('authFn');
    expect(structured.chunks![0]!.startLine).toBe(5);
  });

  test('falls back to stored Qdrant content when readFileFn throws ENOENT', async () => {
    const chunk = makeChunk({ content: 'stored-qdrant-content' });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockRejectedValue(new Error('ENOENT: no such file'));

    const result = await getFileHandler(engine, { path: 'src/auth.ts' }, { readFileFn });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('stored-qdrant-content');
    const structured = structuredOf(result);
    expect(structured.fallbackUsed).toBe(true);
  });

  test('uses semantic search when getFile returns empty and readFileFn not provided', async () => {
    const chunk = makeChunk({ relativePath: 'src/auth-service.ts' });
    const engine = {
      getFile: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([chunk]),
    };

    const result = await getFileHandler(engine, { path: 'src/auth.ts' });
    const text = (result.content[0] as { text: string }).text;
    expect(engine.search).toHaveBeenCalled();
    expect(text).toContain('No exact indexed file matched');
    expect(text).toContain('src/auth-service.ts');
    expect(structuredOf(result).candidates).toBeDefined();
  });

  test('forwards repo from repo:path prefix to readFileFn as second argument', async () => {
    const chunk = makeChunk({ repoId: 'core' });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockResolvedValue('live file from core repo');

    const result = await getFileHandler(engine, { path: 'core:src/auth.ts' }, { readFileFn });
    expect(readFileFn).toHaveBeenCalledWith('src/auth.ts', 'core');
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('live file from core repo');
  });

  test('passes repo prefix into engine.getFile for Qdrant-level filtering', async () => {
    const chunk = makeChunk({ repoId: 'core' });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockResolvedValue('content');

    await getFileHandler(engine, { path: 'core:src/auth.ts' }, { readFileFn });
    expect(engine.getFile).toHaveBeenCalledWith(
      'src/auth.ts',
      expect.objectContaining({ repoId: 'core', excludeTests: true, reservedExclusion: true }),
    );
  });

  test('derives repo from chunk repoId when no prefix given (single repo)', async () => {
    // File lives only in repo "payment-gateway"; caller omits the prefix.
    const chunk = makeChunk({ repoId: 'payment-gateway', relativePath: 'src/svc.ts' });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockResolvedValue('live content from payment-gateway');

    const result = await getFileHandler(engine, { path: 'src/svc.ts' }, { readFileFn });
    // Must read from the owning repo, NOT the default/first repo (undefined).
    expect(readFileFn).toHaveBeenCalledWith('src/svc.ts', 'payment-gateway');
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('live content from payment-gateway');
  });

  test('groups by repo and reads each from its own root when path spans repos (no prefix)', async () => {
    const chunks = [
      makeChunk({ chunkId: 'c1', repoId: 'achpro', relativePath: 'src/Foo.java' }),
      makeChunk({ chunkId: 'c2', repoId: 'paypro', relativePath: 'src/Foo.java' }),
    ];
    const engine = { getFile: vi.fn().mockResolvedValue(chunks) };
    const readFileFn = vi.fn((_path: string, repo?: string) =>
      Promise.resolve(`content of ${repo}`),
    );

    const result = await getFileHandler(engine, { path: 'src/Foo.java' }, { readFileFn });
    const text = (result.content[0] as { text: string }).text;

    // Both repos are surfaced, each read from its own root.
    expect(text).toContain('## [achpro]');
    expect(text).toContain('## [paypro]');
    expect(readFileFn).toHaveBeenCalledWith('src/Foo.java', 'achpro');
    expect(readFileFn).toHaveBeenCalledWith('src/Foo.java', 'paypro');
    expect(text).toContain('content of achpro');
    expect(text).toContain('content of paypro');
    expect(structuredOf(result).multiRepo).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 17 (T139–T143): get_file line-range and name filtering
// ---------------------------------------------------------------------------

describe('T139: get_file with startLine/endLine returns only the specified range', () => {
  function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
    return {
      chunkId: 'chunk-1',
      filePath: '/project/src/entry/Entry.java',
      relativePath: 'src/entry/Entry.java',
      content: '',
      startLine: 1,
      endLine: 350,
      language: 'java',
      chunkType: 'class',
      name: 'Entry',
      imports: [],
      exports: [],
      score: 1.0,
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('returns only the specified line range from the file', async () => {
    const fullFile = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    const chunk = makeChunk({ startLine: 1, endLine: 10 });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockResolvedValue(fullFile);

    const result = await getFileHandler(
      engine,
      { path: 'src/entry/Entry.java', startLine: 3, endLine: 5 },
      { readFileFn },
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('line 3');
    expect(text).toContain('line 4');
    expect(text).toContain('line 5');
    expect(text).not.toContain('line 1\n');
    expect(text).not.toContain('line 6');
  });

  test('structuredContent reflects the filtered range', async () => {
    const fullFile = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    const chunk = makeChunk();
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockResolvedValue(fullFile);

    const result = await getFileHandler(
      engine,
      { path: 'src/entry/Entry.java', startLine: 10, endLine: 15 },
      { readFileFn },
    );
    const structured = structuredOf(result);
    expect(structured.answered).toBe(true);
    // The content should only contain the sliced lines
    expect(structured.content).toContain('line 10');
    expect(structured.content).toContain('line 15');
    expect(structured.content).not.toContain('line 9\n');
    expect(structured.content).not.toContain('line 16');
  });
});

describe('T140: get_file with name parameter filters chunks by name', () => {
  function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
    return {
      chunkId: 'chunk-1',
      filePath: '/project/src/entry/Entry.java',
      relativePath: 'src/entry/Entry.java',
      content: 'public static Entry create(...) { ... }',
      startLine: 166,
      endLine: 231,
      language: 'java',
      chunkType: 'method',
      name: 'create',
      imports: [],
      exports: [],
      score: 1.0,
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('returns only chunks matching the name filter', async () => {
    const createChunk = makeChunk({ chunkId: 'c1', name: 'create', startLine: 166, endLine: 231 });
    const refundChunk = makeChunk({ chunkId: 'c2', name: 'refund', startLine: 250, endLine: 320 });
    const engine = { getFile: vi.fn().mockResolvedValue([createChunk, refundChunk]) };
    // readFileFn returns specific content for the create method range
    const createContent = 'public static Entry create(...) {\n  // create logic\n}';
    const readFileFn = vi
      .fn()
      .mockImplementation(
        (_path: string, _repo?: string, startLine?: number, endLine?: number) => {
          if (startLine === 166 && endLine === 231) return Promise.resolve(createContent);
          return Promise.resolve('other content');
        },
      );

    const result = await getFileHandler(
      engine,
      { path: 'src/entry/Entry.java', name: 'create' },
      { readFileFn },
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('create');
    expect(text).not.toContain('refund');
  });

  test('name matching is case-insensitive', async () => {
    const chunk = makeChunk({ name: 'CreateEntry' });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockResolvedValue('CreateEntry method body');

    const result = await getFileHandler(
      engine,
      { path: 'src/entry/Entry.java', name: 'createentry' },
      { readFileFn },
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('CreateEntry');
  });
});

describe('T141: get_file with name matching multiple chunks returns all', () => {
  function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
    return {
      chunkId: 'chunk-1',
      filePath: '/project/src/entry/Entry.java',
      relativePath: 'src/entry/Entry.java',
      content: '',
      startLine: 1,
      endLine: 50,
      language: 'java',
      chunkType: 'method',
      name: 'create',
      imports: [],
      exports: [],
      score: 1.0,
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('returns all matching chunks when name matches multiple', async () => {
    const chunk1 = makeChunk({ chunkId: 'c1', name: 'create', startLine: 100, endLine: 150 });
    const chunk2 = makeChunk({ chunkId: 'c2', name: 'create', startLine: 160, endLine: 230 });
    const otherChunk = makeChunk({ chunkId: 'c3', name: 'refund', startLine: 250, endLine: 300 });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk1, chunk2, otherChunk]) };
    const readFileFn = vi
      .fn()
      .mockImplementation((_path: string, _repo?: string, startLine?: number) => {
        if (startLine === 100) return Promise.resolve('create overload 1');
        if (startLine === 160) return Promise.resolve('create overload 2');
        return Promise.resolve('other');
      });

    const result = await getFileHandler(
      engine,
      { path: 'src/entry/Entry.java', name: 'create' },
      { readFileFn },
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('create overload 1');
    expect(text).toContain('create overload 2');
    expect(text).not.toContain('refund');
  });
});

describe('T142: get_file with name that matches no chunks falls back to full file', () => {
  function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
    return {
      chunkId: 'chunk-1',
      filePath: '/project/src/entry/Entry.java',
      relativePath: 'src/entry/Entry.java',
      content: 'class content',
      startLine: 1,
      endLine: 50,
      language: 'java',
      chunkType: 'class',
      name: 'Entry',
      imports: [],
      exports: [],
      score: 1.0,
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('falls back to full file with informational note when name matches nothing', async () => {
    const chunk = makeChunk({ name: 'Entry' });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const fullFileContent = 'full Entry.java file content here';
    const readFileFn = vi.fn().mockResolvedValue(fullFileContent);

    const result = await getFileHandler(
      engine,
      { path: 'src/entry/Entry.java', name: 'nonExistentMethod' },
      { readFileFn },
    );
    const text = (result.content[0] as { text: string }).text;
    // Should contain full file since no chunks matched
    expect(text).toContain(fullFileContent);
    // Should include a note about no matching chunks
    expect(text.toLowerCase()).toContain('no chunk');
  });
});

describe('T143: get_file with both name and line range — name takes precedence', () => {
  function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
    return {
      chunkId: 'chunk-1',
      filePath: '/project/src/entry/Entry.java',
      relativePath: 'src/entry/Entry.java',
      content: '',
      startLine: 166,
      endLine: 231,
      language: 'java',
      chunkType: 'method',
      name: 'create',
      imports: [],
      exports: [],
      score: 1.0,
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('name filter takes precedence over startLine/endLine', async () => {
    const chunk = makeChunk({ name: 'create', startLine: 166, endLine: 231 });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi
      .fn()
      .mockImplementation((path: string, repo?: string, startLine?: number, endLine?: number) => {
        if (startLine === 166 && endLine === 231) return Promise.resolve('create method via name');
        return Promise.resolve('line range content that should not appear');
      });

    const result = await getFileHandler(
      engine,
      { path: 'src/entry/Entry.java', name: 'create', startLine: 1, endLine: 10 },
      { readFileFn },
    );
    const text = (result.content[0] as { text: string }).text;
    // Should use name-based filtering (lines 166-231), not the provided line range (1-10)
    expect(text).toContain('create method via name');
    expect(text).not.toContain('line range content that should not appear');
  });
});

// ---------------------------------------------------------------------------
// Track 2: split-chunk parent retrieval
// ---------------------------------------------------------------------------

describe('Track 2: get_file resolves split chunks to one parent range', () => {
  function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
    return {
      chunkId: 'split-1',
      filePath: '/project/src/Foo.java',
      relativePath: 'src/Foo.java',
      content: '',
      startLine: 100,
      endLine: 600,
      language: 'java',
      chunkType: 'class',
      name: 'Foo$part1',
      imports: [],
      exports: [],
      score: 1.0,
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('reads one contiguous parent range for an exact parent request', async () => {
    const chunks = [
      makeChunk({
        chunkId: 'split-1',
        name: 'Foo$part1',
        startLine: 100,
        endLine: 600,
        parentName: 'Foo',
        parentStartLine: 66,
        parentEndLine: 1204,
        partIndex: 1,
        totalParts: 2,
      }),
      makeChunk({
        chunkId: 'split-2',
        name: 'Foo$part2',
        startLine: 601,
        endLine: 900,
        parentName: 'Foo',
        parentStartLine: 66,
        parentEndLine: 1204,
        partIndex: 2,
        totalParts: 2,
      }),
    ];
    const engine = { getFile: vi.fn().mockResolvedValue(chunks) };
    const parentContent = Array.from({ length: 1139 }, (_, index) => `line ${index + 66}`).join('\n');
    const readFileFn = vi.fn().mockResolvedValue(parentContent);

    const result = await getFileHandler(
      engine,
      { path: 'src/Foo.java', name: 'Foo' },
      { readFileFn },
    );
    const text = (result.content[0] as { text: string }).text;

    expect(readFileFn).toHaveBeenCalledTimes(1);
    expect(readFileFn).toHaveBeenCalledWith('src/Foo.java', undefined, 66, 1204);
    expect(text).toContain('### construct: Foo (lines 66-1204)');
    expect(text).toContain('line 600');
    expect(text).toContain('line 601');
    expect(text.match(/```/g)).toHaveLength(2);
    expect(text).not.toContain('### class: Foo$part1');
    expect(text).not.toContain('### class: Foo$part2');
    expect(structuredOf(result).content).toBe(parentContent);
  });

  test('uses an exact name match instead of selecting FooService by substring', async () => {
    const foo = makeChunk({
      chunkId: 'foo',
      name: 'Foo',
      startLine: 10,
      endLine: 20,
      chunkType: 'class',
    });
    const fooService = makeChunk({
      chunkId: 'foo-service',
      name: 'FooService',
      startLine: 30,
      endLine: 40,
      chunkType: 'class',
    });
    const engine = { getFile: vi.fn().mockResolvedValue([foo, fooService]) };
    const readFileFn = vi
      .fn()
      .mockImplementation((_path: string, _repo?: string, startLine?: number) =>
        Promise.resolve(startLine === 10 ? 'Foo body' : 'FooService body'),
      );

    const result = await getFileHandler(
      engine,
      { path: 'src/Foo.java', name: 'Foo' },
      { readFileFn },
    );
    const text = (result.content[0] as { text: string }).text;

    expect(readFileFn).toHaveBeenCalledTimes(1);
    expect(readFileFn).toHaveBeenCalledWith('src/Foo.java', undefined, 10, 20);
    expect(text).toContain('Foo body');
    expect(text).not.toContain('FooService body');
  });

  test('resolves an exact split chunk name through its parent metadata', async () => {
    const chunk = makeChunk({
      name: 'Foo$part2',
      parentName: 'Foo',
      parentStartLine: 66,
      parentEndLine: 1204,
      partIndex: 2,
      totalParts: 2,
    });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockResolvedValue('complete Foo body');

    const result = await getFileHandler(
      engine,
      { path: 'src/Foo.java', name: 'Foo$part2' },
      { readFileFn },
    );
    const text = (result.content[0] as { text: string }).text;

    expect(readFileFn).toHaveBeenCalledWith('src/Foo.java', undefined, 66, 1204);
    expect(text).toContain('### construct: Foo (lines 66-1204)');
    expect(text).toContain('complete Foo body');
  });
});

// ---------------------------------------------------------------------------
// Phase 18 (T150–T153): get_file session dedup
// ---------------------------------------------------------------------------

describe('T150: get_file session dedup returns short message on duplicate call', () => {
  beforeEach(() => resetGetFileSessionCache());

  function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
    return {
      chunkId: 'chunk-1',
      filePath: '/project/src/auth.ts',
      relativePath: 'src/auth.ts',
      content: '',
      startLine: 1,
      endLine: 50,
      language: 'typescript',
      chunkType: 'function',
      name: 'authenticate',
      imports: [],
      exports: [],
      score: 1.0,
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('returns short "Content unchanged" message on second identical call when mtime unchanged', async () => {
    const chunk = makeChunk();
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    // Use a realistically-sized file content so the full response is larger than the dedup message
    const fileContent = Array.from({ length: 50 }, (_, i) => `const line${i} = ${i};`).join('\n');
    const readFileFn = vi.fn().mockResolvedValue(fileContent);
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 1000 });

    const options = { readFileFn, statFn, sessionCache: true };

    // First call — full response
    const first = await getFileHandler(engine, { path: 'src/auth.ts' }, options);
    const firstText = (first.content[0] as { text: string }).text;
    expect(firstText).toContain('const line0');

    // Second call — should return short dedup message
    const second = await getFileHandler(engine, { path: 'src/auth.ts' }, options);
    const secondText = (second.content[0] as { text: string }).text;
    expect(secondText.length).toBeLessThan(firstText.length);
    expect(secondText.toLowerCase()).toContain('unchanged');
  });
});

describe('T151: get_file session dedup invalidates on mtime change', () => {
  beforeEach(() => resetGetFileSessionCache());

  function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
    return {
      chunkId: 'chunk-1',
      filePath: '/project/src/auth.ts',
      relativePath: 'src/auth.ts',
      content: '',
      startLine: 1,
      endLine: 50,
      language: 'typescript',
      chunkType: 'function',
      name: 'authenticate',
      imports: [],
      exports: [],
      score: 1.0,
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('invalidates cached entry and returns fresh content when file mtime changes', async () => {
    const chunk = makeChunk();
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi
      .fn()
      .mockResolvedValueOnce('original content')
      .mockResolvedValueOnce('updated content');
    const statFn = vi
      .fn()
      .mockResolvedValueOnce({ mtimeMs: 1000 }) // first call
      .mockResolvedValueOnce({ mtimeMs: 2000 }); // second call - mtime changed

    const options = { readFileFn, statFn, sessionCache: true };

    // First call
    const first = await getFileHandler(engine, { path: 'src/auth.ts' }, options);
    const firstText = (first.content[0] as { text: string }).text;
    expect(firstText).toContain('original content');

    // Second call with changed mtime — should re-read file
    const second = await getFileHandler(engine, { path: 'src/auth.ts' }, options);
    const secondText = (second.content[0] as { text: string }).text;
    expect(secondText).toContain('updated content');
    expect(secondText.toLowerCase()).not.toContain('unchanged');
  });
});

describe('T153: session dedup produces separate cache entries for different parameters', () => {
  beforeEach(() => resetGetFileSessionCache());

  function makeChunk(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
    return {
      chunkId: 'chunk-1',
      filePath: '/project/src/auth.ts',
      relativePath: 'src/auth.ts',
      content: '',
      startLine: 1,
      endLine: 50,
      language: 'typescript',
      chunkType: 'function',
      name: 'authenticate',
      imports: [],
      exports: [],
      score: 1.0,
      matchedVector: 'semantic',
      ...overrides,
    };
  }

  test('different paths produce separate cache entries', async () => {
    const chunk = makeChunk();
    const chunk2 = makeChunk({ relativePath: 'src/user.ts', filePath: '/project/src/user.ts' });
    const engine = {
      getFile: vi.fn().mockResolvedValueOnce([chunk]).mockResolvedValueOnce([chunk2]),
    };
    const readFileFn = vi
      .fn()
      .mockResolvedValueOnce('auth content')
      .mockResolvedValueOnce('user content');
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 1000 });

    const options = { readFileFn, statFn, sessionCache: true };

    const first = await getFileHandler(engine, { path: 'src/auth.ts' }, options);
    const second = await getFileHandler(engine, { path: 'src/user.ts' }, options);

    const firstText = (first.content[0] as { text: string }).text;
    const secondText = (second.content[0] as { text: string }).text;
    // Both should be full responses (different cache keys)
    expect(firstText).toContain('auth content');
    expect(secondText).toContain('user content');
  });

  test('same path with different name filter produces separate cache entries', async () => {
    const chunk1 = makeChunk({ name: 'create', startLine: 10, endLine: 20 });
    const chunk2 = makeChunk({ name: 'delete', startLine: 30, endLine: 40 });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk1, chunk2]) };
    const readFileFn = vi
      .fn()
      .mockImplementation((_path: string, _repo?: string, startLine?: number) => {
        if (startLine === 10) return Promise.resolve('create body');
        if (startLine === 30) return Promise.resolve('delete body');
        return Promise.resolve('full file');
      });
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 1000 });

    const options = { readFileFn, statFn, sessionCache: true };

    const first = await getFileHandler(engine, { path: 'src/auth.ts', name: 'create' }, options);
    const second = await getFileHandler(engine, { path: 'src/auth.ts', name: 'delete' }, options);

    const firstText = (first.content[0] as { text: string }).text;
    const secondText = (second.content[0] as { text: string }).text;
    expect(firstText).toContain('create body');
    expect(secondText).toContain('delete body');
  });
});

// ---------------------------------------------------------------------------
// Feature 017: cross-repo existence-check fallback when index yields no chunk
// ---------------------------------------------------------------------------

describe('Feature 017: get_file cross-repo fallback', () => {
  const emptyEngine = () => ({ getFile: vi.fn().mockResolvedValue([]) });

  function resolver(map: Record<string, string | null>, skipped: string[] = []) {
    // map: repo -> content (string) or null (not found). skipped: inaccessible repos.
    return vi.fn((_relativePath: string, opts?: { startLine?: number; endLine?: number }) =>
      Promise.resolve(
        Object.keys(map).map((repo) => {
          if (skipped.includes(repo)) {
            return { repo, found: false, skipped: true, error: 'path inaccessible' };
          }
          const content = map[repo];
          if (content === null) return { repo, found: false };
          const body =
            opts?.startLine !== undefined
              ? `${content} [${opts.startLine}-${opts.endLine}]`
              : content;
          return { repo, found: true, content: body };
        }),
      ),
    );
  }

  // ── US1: single-match auto-resolution ──────────────────────────────────────
  describe('US1 single-match', () => {
    test('T006: resolves file on disk in exactly one repo and flags filesystem-fallback', async () => {
      const engine = emptyEngine();
      const readFileFn = vi.fn().mockResolvedValue('unused');
      const resolveFileAcrossRepos = resolver({ achpro: 'FOO CONTENT', paypro: null });

      const result = await getFileHandler(
        engine,
        { path: 'src/Foo.java' },
        { readFileFn, resolveFileAcrossRepos },
      );

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('FOO CONTENT');
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.resolvedVia).toBe('filesystem-fallback');
      expect(structured.fallbackUsed).toBeUndefined();
    });

    test('T007: valid prefix + index hit keeps resolvedVia="index" and no fallbackUsed', async () => {
      const chunk: RetrievalResult = {
        chunkId: 'c1',
        filePath: '/p/src/a.ts',
        relativePath: 'src/a.ts',
        content: 'stored',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
        chunkType: 'function',
        name: 'fn',
        imports: [],
        exports: [],
        score: 1,
        matchedVector: 'text',
        repoId: 'core',
      };
      const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
      const readFileFn = vi.fn().mockResolvedValue('live core content');
      const resolveFileAcrossRepos = resolver({ core: 'should-not-be-used' });

      const result = await getFileHandler(
        engine,
        { path: 'core:src/a.ts' },
        { readFileFn, resolveFileAcrossRepos },
      );

      expect(resolveFileAcrossRepos).not.toHaveBeenCalled();
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.resolvedVia).toBe('index');
      expect(structured.fallbackUsed).toBeUndefined();
    });

    test('T008: honors startLine/endLine and name filters on single-match fallback', async () => {
      const engine = emptyEngine();
      const readFileFn = vi.fn().mockResolvedValue('unused');
      const resolveFileAcrossRepos = resolver({ achpro: 'RANGE', paypro: null });

      const result = await getFileHandler(
        engine,
        { path: 'src/Foo.java', startLine: 10, endLine: 20 },
        { readFileFn, resolveFileAcrossRepos },
      );

      expect(resolveFileAcrossRepos).toHaveBeenCalledWith('src/Foo.java', {
        startLine: 10,
        endLine: 20,
      });
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('RANGE [10-20]');
    });
  });

  // ── US2: tiered disambiguation ──────────────────────────────────────────────
  describe('US2 disambiguation', () => {
    test('T011: 2 repos on disk → grouped copies with multiRepo flag', async () => {
      const engine = emptyEngine();
      const readFileFn = vi.fn().mockResolvedValue('unused');
      const resolveFileAcrossRepos = resolver({ achpro: 'A-BODY', paypro: 'P-BODY' });

      const result = await getFileHandler(
        engine,
        { path: 'pom.xml' },
        { readFileFn, resolveFileAcrossRepos },
      );

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('## [achpro]');
      expect(text).toContain('## [paypro]');
      expect(text).toContain('A-BODY');
      expect(text).toContain('P-BODY');
      expect(text).toMatch(/repo:/);
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.multiRepo).toBe(true);
      expect(structured.resolvedVia).toBe('filesystem-fallback');
    });

    test('T012: above threshold → content-free candidate list, no file bodies', async () => {
      const engine = emptyEngine();
      const readFileFn = vi.fn().mockResolvedValue('unused');
      const resolveFileAcrossRepos = resolver({
        r1: 'B1',
        r2: 'B2',
        r3: 'B3',
        r4: 'B4',
      });

      const result = await getFileHandler(
        engine,
        { path: 'index.ts' },
        { readFileFn, resolveFileAcrossRepos, disambiguationThreshold: 3 },
      );

      const text = (result.content[0] as { text: string }).text;
      // No file bodies leaked
      expect(text).not.toContain('B1');
      expect(text).not.toContain('B4');
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.candidates).toEqual([
        'r1:index.ts',
        'r2:index.ts',
        'r3:index.ts',
        'r4:index.ts',
      ]);
      expect(structured.answered).toBe(false);
      expect(structured.resolvedVia).toBe('filesystem-fallback');
    });

    test('T013: threshold is configurable — same matches grouped vs candidate-list', async () => {
      const engine = emptyEngine();
      const readFileFn = vi.fn().mockResolvedValue('unused');
      const map = { r1: 'B1', r2: 'B2', r3: 'B3' };

      const grouped = await getFileHandler(
        engine,
        { path: 'x.ts' },
        { readFileFn, resolveFileAcrossRepos: resolver(map), disambiguationThreshold: 3 },
      );
      expect((grouped.structuredContent as Record<string, unknown>).multiRepo).toBe(true);

      const candidateList = await getFileHandler(
        engine,
        { path: 'x.ts' },
        { readFileFn, resolveFileAcrossRepos: resolver(map), disambiguationThreshold: 2 },
      );
      expect((candidateList.structuredContent as Record<string, unknown>).candidates).toHaveLength(
        3,
      );
    });
  });

  // ── US3: diagnostics ────────────────────────────────────────────────────────
  describe('US3 diagnostics', () => {
    test('T016: zero on-disk matches → diagnostic with reposSearched, no content', async () => {
      const engine = emptyEngine();
      const readFileFn = vi.fn().mockResolvedValue('unused');
      const resolveFileAcrossRepos = resolver({ achpro: null, paypro: null });

      const result = await getFileHandler(
        engine,
        { path: 'does/not/exist.ts' },
        { readFileFn, resolveFileAcrossRepos },
      );

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('achpro');
      expect(text).toContain('paypro');
      expect(text).toContain('does/not/exist.ts');
      expect(text).toMatch(/repo:/); // retry guidance
      const structured = result.structuredContent as Record<string, unknown>;
      expect(structured.reposSearched).toEqual(['achpro', 'paypro']);
      expect(structured.answered).toBe(false);
      expect(structured.resolvedVia).toBeUndefined();
    });

    test('T017: unknown repo prefix → error, resolver never invoked', async () => {
      // engine.getFile throws for an unknown repo, mirroring resolveRepoRoot behavior
      const engine = {
        getFile: vi
          .fn()
          .mockRejectedValue(new Error("Unknown repo 'badrepo' — configured repos: achpro")),
      };
      const readFileFn = vi.fn().mockResolvedValue('unused');
      const resolveFileAcrossRepos = resolver({ achpro: 'x' });

      await expect(
        getFileHandler(
          engine,
          { path: 'badrepo:src/a.ts' },
          { readFileFn, resolveFileAcrossRepos },
        ),
      ).rejects.toThrow(/Unknown repo 'badrepo'/);
      expect(resolveFileAcrossRepos).not.toHaveBeenCalled();
    });

    test('T018: inaccessible repo excluded from reads but named in diagnostic; flags not conflated', async () => {
      const engine = emptyEngine();
      const readFileFn = vi.fn().mockResolvedValue('unused');
      // achpro found, paypro inaccessible → single found match, but paypro reported
      const resolveFileAcrossRepos = resolver({ achpro: 'OK', paypro: null }, ['paypro']);

      const result = await getFileHandler(
        engine,
        { path: 'src/Foo.java' },
        { readFileFn, resolveFileAcrossRepos },
      );

      const structured = result.structuredContent as Record<string, unknown>;
      // Single found match → filesystem-fallback success, NOT degraded
      expect(structured.resolvedVia).toBe('filesystem-fallback');
      expect(structured.fallbackUsed).toBeUndefined();
    });
  });
});
