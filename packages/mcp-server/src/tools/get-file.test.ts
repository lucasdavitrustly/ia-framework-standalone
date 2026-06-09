import { describe, test, expect, vi } from 'vitest';
import { parseRepoPath, getFileHandler } from './get-file.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

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
    expect((result as any).structuredContent.chunks).toBeDefined();
    expect((result as any).structuredContent.chunks[0].repo).toBe('core');
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
    const structured = (result as any).structuredContent;
    expect(structured.content).toBe('file content');
    expect(structured.chunks).toBeDefined();
    expect(structured.chunks[0].name).toBe('authFn');
    expect(structured.chunks[0].startLine).toBe(5);
  });

  test('falls back to stored Qdrant content when readFileFn throws ENOENT', async () => {
    const chunk = makeChunk({ content: 'stored-qdrant-content' });
    const engine = { getFile: vi.fn().mockResolvedValue([chunk]) };
    const readFileFn = vi.fn().mockRejectedValue(new Error('ENOENT: no such file'));

    const result = await getFileHandler(engine, { path: 'src/auth.ts' }, { readFileFn });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('stored-qdrant-content');
    const structured = (result as any).structuredContent;
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
    expect(text).toContain('auth');
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
    const structured = (result as any).structuredContent;
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
      .mockImplementation((path: string, repo?: string, startLine?: number, endLine?: number) => {
        if (startLine === 166 && endLine === 231) return Promise.resolve(createContent);
        return Promise.resolve('other content');
      });

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
      .mockImplementation((path: string, repo?: string, startLine?: number, endLine?: number) => {
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
