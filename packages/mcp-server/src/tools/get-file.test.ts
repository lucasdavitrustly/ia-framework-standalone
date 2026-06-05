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
