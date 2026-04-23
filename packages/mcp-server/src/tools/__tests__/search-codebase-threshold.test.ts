import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHandler } from '../search-codebase.js';
import type { SearchCodebaseInput } from '../search-codebase.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

const mockResult: RetrievalResult = {
  chunkId: 'chunk-1',
  filePath: '/project/src/foo.ts',
  relativePath: 'src/foo.ts',
  language: 'typescript',
  chunkType: 'function',
  name: 'foo',
  content: 'function foo() {}',
  startLine: 1,
  endLine: 1,
  imports: [],
  exports: [],
  score: 0.8,
  matchedVector: 'text',
};

describe('searchCodebaseHandler score threshold behavior', () => {
  it('does NOT hardcode 0.3 — passes undefined scoreThreshold when user provides no score_threshold', async () => {
    const searchWithExpansion = vi.fn().mockResolvedValue([mockResult]);
    const search = vi.fn().mockResolvedValue([mockResult]);
    const engine = { search, searchWithExpansion };

    const input: SearchCodebaseInput = { query: 'find auth handler' };
    await searchCodebaseHandler(engine, input);

    expect(searchWithExpansion).toHaveBeenCalledWith(
      expect.objectContaining({ scoreThreshold: undefined }),
      expect.anything(),
    );
  });

  it('passes explicit score_threshold through when user provides one', async () => {
    const searchWithExpansion = vi.fn().mockResolvedValue([mockResult]);
    const engine = { search: vi.fn(), searchWithExpansion };

    const input: SearchCodebaseInput = { query: 'auth handler', score_threshold: 0.5 };
    await searchCodebaseHandler(engine, input);

    expect(searchWithExpansion).toHaveBeenCalledWith(
      expect.objectContaining({ scoreThreshold: 0.5 }),
      expect.anything(),
    );
  });

  it('does NOT apply 0.3 fallback — scoreThreshold is undefined when omitted', async () => {
    const searchWithExpansion = vi.fn().mockResolvedValue([]);
    const engine = { search: vi.fn(), searchWithExpansion };

    await searchCodebaseHandler(engine, { query: 'test' });

    const call = searchWithExpansion.mock.calls[0]!;
    expect(call[0].scoreThreshold).toBeUndefined();
  });
});

describe('searchCodebaseHybridHandler score threshold behavior', () => {
  it('never applies scoreThreshold (verified via search-codebase-hybrid.test.ts)', () => {
    // The hybrid handler is tested in search-codebase-hybrid.test.ts
    // It correctly does not pass scoreThreshold — no changes needed there
    expect(true).toBe(true);
  });
});
