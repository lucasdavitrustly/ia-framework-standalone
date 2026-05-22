import { describe, it, expect } from 'vitest';
import type { ChunkPayload } from '@ia-framework/vector-store';
import type { IndexingConfig } from '../pipeline.js';

describe('repoId field', () => {
  it('ChunkPayload accepts repoId field', () => {
    const payload = {
      chunkId: 'test',
      filePath: '/test.ts',
      relativePath: 'test.ts',
      language: 'typescript',
      chunkType: 'function',
      content: 'const x = 1;',
      startLine: 1,
      endLine: 1,
      imports: [],
      exports: [],
      indexedAt: new Date().toISOString(),
      repoId: 'my-repo',
    } satisfies ChunkPayload;

    expect(payload.repoId).toBe('my-repo');
  });

  it('IndexingConfig accepts repoId field', () => {
    // Type-level test: IndexingConfig should have optional repoId
    const partial: Pick<IndexingConfig, 'repoId'> = { repoId: 'my-repo' };
    expect(partial.repoId).toBe('my-repo');
  });
});
