import { describe, it, expect, vi, beforeEach } from 'vitest';
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

function makeStore(): CrossRepoEdgeStore {
  return {
    insertEdge: vi.fn(),
    insertEdges: vi.fn(),
    getEdgesFrom: vi.fn().mockReturnValue([]),
    getEdgesTo: vi.fn().mockReturnValue([]),
    rebuildForRepo: vi.fn(),
    close: vi.fn(),
  } as unknown as CrossRepoEdgeStore;
}

describe('buildCrossRepoEdges', () => {
  let store: CrossRepoEdgeStore;
  let engine: EdgeBuilderEngine;
  let config: EdgeBuilderConfig;

  beforeEach(() => {
    store = makeStore();
    engine = {
      async *scrollAllChunks(repoId: string) {
        yield [makeChunk({ repoId })];
      },
      scrollByNameInRepo: vi.fn().mockResolvedValue([
        makeChunk({
          relativePath: 'src/bar.ts',
          name: 'Bar',
          repoId: 'repo-b',
        }),
      ]),
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
    expect(store.insertEdges as ReturnType<typeof vi.fn>).toHaveBeenCalled();
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
    expect(store.rebuildForRepo as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('repo-a');
  });

  it('uses scrollByNameInRepo with repoId filter for symbol lookup (per D-02)', async () => {
    await buildCrossRepoEdges(store, engine, config);
    expect(engine.scrollByNameInRepo).toHaveBeenCalledWith(expect.any(String), 'repo-b');
  });

  it('external packages (no provides match) are silently skipped', async () => {
    engine = {
      async *scrollAllChunks() {
        yield [makeChunk({ imports: ['lodash', 'express'] })];
      },
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
