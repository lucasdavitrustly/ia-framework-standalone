import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { CrossRepoEdgeStore, type CrossRepoEdge } from './cross-repo-edges.js';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CrossRepoEdgeStore', () => {
  let store: CrossRepoEdgeStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `cross-repo-edges-test-${Date.now()}.sqlite`);
    store = new CrossRepoEdgeStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  });

  test('constructor creates cross_repo_edges table with correct schema', () => {
    // If we got here without error, table was created. Verify by inserting.
    store.insertEdge({
      sourceRepo: 'frontend',
      sourcePath: 'src/api.ts',
      sourceSymbol: null,
      targetRepo: 'backend',
      targetPath: null,
      targetSymbol: 'UserService',
    });
    const edges = store.getEdgesFrom('frontend', 'src/api.ts');
    expect(edges).toHaveLength(1);
  });

  test('insertEdge stores edge and getEdgesFrom retrieves by source_repo+source_path', () => {
    store.insertEdge({
      sourceRepo: 'frontend',
      sourcePath: 'src/utils.ts',
      sourceSymbol: 'fetchUser',
      targetRepo: 'shared',
      targetPath: 'src/types.ts',
      targetSymbol: 'User',
    });
    store.insertEdge({
      sourceRepo: 'frontend',
      sourcePath: 'src/utils.ts',
      sourceSymbol: 'fetchOrder',
      targetRepo: 'backend',
      targetPath: null,
      targetSymbol: 'OrderService',
    });
    store.insertEdge({
      sourceRepo: 'frontend',
      sourcePath: 'src/other.ts',
      sourceSymbol: null,
      targetRepo: 'shared',
      targetPath: null,
      targetSymbol: 'Config',
    });

    const edges = store.getEdgesFrom('frontend', 'src/utils.ts');
    expect(edges).toHaveLength(2);
    expect(edges[0].targetRepo).toBe('shared');
    expect(edges[1].targetRepo).toBe('backend');
  });

  test('getEdgesTo retrieves edges by target_repo+target_symbol', () => {
    store.insertEdge({
      sourceRepo: 'frontend',
      sourcePath: 'src/a.ts',
      sourceSymbol: null,
      targetRepo: 'shared',
      targetPath: null,
      targetSymbol: 'User',
    });
    store.insertEdge({
      sourceRepo: 'backend',
      sourcePath: 'src/b.ts',
      sourceSymbol: null,
      targetRepo: 'shared',
      targetPath: null,
      targetSymbol: 'User',
    });
    store.insertEdge({
      sourceRepo: 'frontend',
      sourcePath: 'src/c.ts',
      sourceSymbol: null,
      targetRepo: 'shared',
      targetPath: null,
      targetSymbol: 'Config',
    });

    const edges = store.getEdgesTo('shared', 'User');
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.sourceRepo).sort()).toEqual(['backend', 'frontend']);
  });

  test('rebuildForRepo deletes all edges where source_repo=X OR target_repo=X', () => {
    store.insertEdge({
      sourceRepo: 'frontend',
      sourcePath: 'src/a.ts',
      sourceSymbol: null,
      targetRepo: 'shared',
      targetPath: null,
      targetSymbol: 'User',
    });
    store.insertEdge({
      sourceRepo: 'backend',
      sourcePath: 'src/b.ts',
      sourceSymbol: null,
      targetRepo: 'frontend',
      targetPath: null,
      targetSymbol: 'Component',
    });
    store.insertEdge({
      sourceRepo: 'backend',
      sourcePath: 'src/c.ts',
      sourceSymbol: null,
      targetRepo: 'shared',
      targetPath: null,
      targetSymbol: 'Config',
    });

    store.rebuildForRepo('frontend');

    // First edge gone (source=frontend), second gone (target=frontend), third remains
    const fromFrontend = store.getEdgesFrom('frontend', 'src/a.ts');
    expect(fromFrontend).toHaveLength(0);
    const toFrontend = store.getEdgesTo('frontend', 'Component');
    expect(toFrontend).toHaveLength(0);
    const remaining = store.getEdgesTo('shared', 'Config');
    expect(remaining).toHaveLength(1);
  });

  test('close() cleanly closes the database', () => {
    store.close();
    // Double close should not throw
    expect(() => store.close()).not.toThrow();
  });
});
