import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CodeChunk } from '@ia-framework/ast-parser';

// ── Hoist mock variables ────────────────────────────────────────────────────
const { mockParseFile } = vi.hoisted(() => ({ mockParseFile: vi.fn() }));

// ── Mock @ia-framework/ast-parser ───────────────────────────────────────────
vi.mock('@ia-framework/ast-parser', () => ({
  parseFile: mockParseFile,
}));

import { AstChunkingStrategy } from './ast-strategy.js';

function makeChunk(overrides: Partial<CodeChunk> = {}): CodeChunk {
  return {
    id: 'chunk-1',
    filePath: '/project/src/foo.ts',
    relativePath: 'src/foo.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'foo',
    content: 'function foo() {}',
    startLine: 1,
    endLine: 1,
    imports: [],
    exports: ['foo'],
    ...overrides,
  };
}

describe('AstChunkingStrategy', () => {
  let strategy: AstChunkingStrategy;

  beforeEach(() => {
    vi.clearAllMocks();
    strategy = new AstChunkingStrategy();
  });

  it('delegates to parseFile and returns CodeChunk[]', async () => {
    const chunks = [makeChunk(), makeChunk({ id: 'chunk-2', name: 'bar' })];
    mockParseFile.mockResolvedValue(chunks);

    const result = await strategy.chunk('/project/src/foo.ts', {
      maxChunkLines: 200,
      projectRoot: '/project',
    });

    expect(mockParseFile).toHaveBeenCalledOnce();
    expect(mockParseFile).toHaveBeenCalledWith('/project/src/foo.ts', {
      maxChunkLines: 200,
      projectRoot: '/project',
    });
    expect(result).toEqual(chunks);
  });

  it('passes maxChunkLines and projectRoot to parseFile', async () => {
    mockParseFile.mockResolvedValue([]);

    await strategy.chunk('/project/src/bar.ts', {
      maxChunkLines: 100,
      projectRoot: '/my-project',
    });

    expect(mockParseFile).toHaveBeenCalledWith('/project/src/bar.ts', {
      maxChunkLines: 100,
      projectRoot: '/my-project',
    });
  });

  it('name returns "ast"', () => {
    expect(strategy.name).toBe('ast');
  });

  it('propagates parseFile errors', async () => {
    mockParseFile.mockRejectedValue(new Error('parse failure'));

    await expect(
      strategy.chunk('/bad/file.ts', { maxChunkLines: 200, projectRoot: '/bad' }),
    ).rejects.toThrow('parse failure');
  });
});
