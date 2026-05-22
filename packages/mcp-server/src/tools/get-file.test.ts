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
