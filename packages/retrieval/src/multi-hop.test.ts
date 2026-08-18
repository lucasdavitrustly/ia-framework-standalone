import { describe, expect, it, vi } from 'vitest';
import { createEffectiveFilter } from './effective-filter.js';
import { multiHopExpand } from './multi-hop.js';
import type { RetrievalResult } from './types.js';

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'base',
    filePath: '/repo/src/service.ts',
    relativePath: 'src/service.ts',
    language: 'typescript',
    chunkType: 'function',
    content: 'new PaymentService(); client.fetchData();',
    startLine: 1,
    endLine: 4,
    imports: [],
    exports: [],
    score: 0.9,
    matchedVector: 'semantic',
    ...overrides,
  };
}

describe('multiHopExpand', () => {
  it('forwards the complete filter to class symbol lookups', async () => {
    const filter = createEffectiveFilter(
      { must: [{ key: 'language', match: { value: 'typescript' } }] },
      'repo-a',
    );
    const scrollByName = vi.fn().mockResolvedValue([makeResult({ chunkId: 'class' })]);

    const results = await multiHopExpand([makeResult()], { scrollByName }, filter, {
      expandMethodCalls: false,
    });

    expect(scrollByName).toHaveBeenCalledWith('PaymentService', filter);
    expect(results.map((result) => result.chunkId)).toEqual(['class']);
    expect(results[0]?.expansionSource).toBe('multi-hop');
  });

  it('forwards the complete filter to method symbol lookups', async () => {
    const filter = createEffectiveFilter(
      { must: [{ key: 'archLayer', match: { value: 'service' } }] },
      'repo-a',
    );
    const scrollByDefines = vi.fn().mockResolvedValue([makeResult({ chunkId: 'method' })]);

    const results = await multiHopExpand([makeResult()], { scrollByDefines }, filter, {
      expandHierarchy: false,
    });

    expect(scrollByDefines).toHaveBeenCalledWith('fetchData', filter);
    expect(results.map((result) => result.chunkId)).toEqual(['method']);
  });

  it('uses the repo-scoped lookup when a local class lookup is empty', async () => {
    const filter = createEffectiveFilter({}, 'repo-b');
    const scrollByName = vi.fn().mockResolvedValue([]);
    const scrollByNameInRepo = vi
      .fn()
      .mockResolvedValue([makeResult({ chunkId: 'cross-repo', repoId: 'repo-b' })]);

    const results = await multiHopExpand(
      [makeResult()],
      { scrollByName, scrollByNameInRepo },
      filter,
      { expandMethodCalls: false },
    );

    expect(scrollByNameInRepo).toHaveBeenCalledWith('PaymentService', 'repo-b', filter);
    expect(results.map((result) => result.repoId)).toEqual(['repo-b']);
  });

  it('does not invoke a cross-repo lookup without an explicit repository scope', async () => {
    const scrollByName = vi.fn().mockResolvedValue([]);
    const scrollByNameInRepo = vi.fn().mockResolvedValue([]);

    await expect(
      multiHopExpand(
        [makeResult()],
        { scrollByName, scrollByNameInRepo },
        createEffectiveFilter(),
        { expandMethodCalls: false },
      ),
    ).resolves.toEqual([]);
    expect(scrollByNameInRepo).not.toHaveBeenCalled();
  });

  it('returns no expansion when all symbol lookups return no matches', async () => {
    const scrollByName = vi.fn().mockResolvedValue([]);
    const scrollByDefines = vi.fn().mockResolvedValue([]);

    await expect(
      multiHopExpand([makeResult()], { scrollByName, scrollByDefines }, createEffectiveFilter()),
    ).resolves.toEqual([]);
  });

  it('rejects an omitted effective filter before performing lookups', async () => {
    const scrollByName = vi.fn();

    await expect(
      multiHopExpand([makeResult()], { scrollByName }, undefined as never),
    ).rejects.toThrow(/EffectiveFilter is required/);
    expect(scrollByName).not.toHaveBeenCalled();
  });

  it('returns no expansion when no lookup capability is configured', async () => {
    await expect(multiHopExpand([makeResult()], {}, createEffectiveFilter())).resolves.toEqual([]);
  });
});
