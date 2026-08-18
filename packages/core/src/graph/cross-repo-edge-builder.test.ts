import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  buildCrossRepoEdges,
  type EdgeBuilderEngine,
  type EdgeBuilderConfig,
  type ChunkForEdgeBuilding,
} from './cross-repo-edge-builder.js';
import type { CrossRepoEdgeStore } from './cross-repo-edges.js';

function makeChunk(overrides: Partial<ChunkForEdgeBuilding> = {}): ChunkForEdgeBuilding {
  return {
    relativePath: 'src/foo.ts',
    name: 'Foo',
    imports: ['@other/lib'],
    repoId: 'repo-a',
    ...overrides,
  };
}

/** The double's mocked members must stay visible so assertions are type-safe. */
type MockedStore = CrossRepoEdgeStore & {
  insertEdges: Mock;
  rebuildForRepo: Mock;
};

function makeStore(): MockedStore {
  return {
    insertEdge: vi.fn(),
    insertEdges: vi.fn(),
    getEdgesFrom: vi.fn().mockReturnValue([]),
    getEdgesTo: vi.fn().mockReturnValue([]),
    rebuildForRepo: vi.fn(),
    close: vi.fn(),
  } as unknown as MockedStore;
}

/** Build the AsyncIterable page stream EdgeBuilderEngine.scrollAllChunks returns. */
function makeAsyncChunkPages<T>(pages: T[][]): AsyncIterable<T[]> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T[]> {
      let index = 0;
      return {
        next: () =>
          Promise.resolve(
            index < pages.length
              ? { value: pages[index++]!, done: false }
              : { value: undefined, done: true },
          ),
      };
    },
  };
}

describe('buildCrossRepoEdges', () => {
  let store: MockedStore;
  let engine: EdgeBuilderEngine;
  let scrollByNameInRepo: Mock;
  let config: EdgeBuilderConfig;

  beforeEach(() => {
    store = makeStore();
    scrollByNameInRepo = vi.fn().mockResolvedValue([
      makeChunk({
        relativePath: 'src/bar.ts',
        name: 'Bar',
        repoId: 'repo-b',
      }),
    ]);
    engine = {
      scrollAllChunks: (repoId: string) => makeAsyncChunkPages([[makeChunk({ repoId })]]),
      scrollByNameInRepo,
    };
    config = {
      repos: [
        { name: 'repo-a', provides: ['@repo-a/core'] },
        { name: 'repo-b', provides: ['@other/lib'] },
      ],
    };
  });

  it('iterates chunks, resolves imports via resolveImportToRepo, inserts edges', async () => {
    const result = await buildCrossRepoEdges(store, engine, config);
    expect(result.edgesCreated).toBeGreaterThan(0);
    expect(store.insertEdges).toHaveBeenCalled();
  });

  it('chunks with imports matching no repo produce no edges', async () => {
    config.repos = [
      { name: 'repo-a', provides: ['@repo-a/core'] },
      { name: 'repo-c', provides: ['@unrelated/pkg'] },
    ];
    const result = await buildCrossRepoEdges(store, engine, config);
    expect(result.edgesCreated).toBe(0);
  });

  it('calls rebuildForRepo when rebuildRepoId is provided (per D-10)', async () => {
    config.rebuildRepoId = 'repo-a';
    await buildCrossRepoEdges(store, engine, config);
    expect(store.rebuildForRepo).toHaveBeenCalledWith('repo-a');
  });

  it('uses scrollByNameInRepo with repoId filter for symbol lookup (per D-02)', async () => {
    await buildCrossRepoEdges(store, engine, config);
    expect(scrollByNameInRepo).toHaveBeenCalledWith(expect.any(String), 'repo-b');
  });

  it('external packages (no provides match) are silently skipped', async () => {
    engine = {
      scrollAllChunks: () =>
        makeAsyncChunkPages([[makeChunk({ imports: ['lodash', 'express'] })]]),
      scrollByNameInRepo: vi.fn().mockResolvedValue([]),
    };
    config.repos = [
      { name: 'repo-a', provides: ['@repo-a/core'] },
      { name: 'repo-b', provides: ['@other/lib'] },
    ];
    const result = await buildCrossRepoEdges(store, engine, config);
    expect(result.edgesCreated).toBe(0);
    expect(result.errors).toBe(0);
  });
});
