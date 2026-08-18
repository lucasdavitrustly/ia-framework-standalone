import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DependencyGraph, resolveJavaImport } from './dependency-graph.js';
import { createEffectiveFilter } from './effective-filter.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const filter = createEffectiveFilter();

describe('DependencyGraph', () => {
  let graph: DependencyGraph;
  let tmpDir: string;
  let dbPath: string;
  let projectRoot: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dep-graph-'));
    dbPath = join(tmpDir, 'graph.sqlite');
    projectRoot = join(tmpDir, 'project');

    // Create a fake project structure
    mkdirSync(join(projectRoot, 'src', 'auth'), { recursive: true });
    mkdirSync(join(projectRoot, 'src', 'utils'), { recursive: true });
    mkdirSync(join(projectRoot, 'src', 'models'), { recursive: true });

    writeFileSync(join(projectRoot, 'src', 'auth', 'middleware.ts'), '// middleware');
    writeFileSync(join(projectRoot, 'src', 'auth', 'types.ts'), '// types');
    writeFileSync(join(projectRoot, 'src', 'auth', 'utils.ts'), '// auth utils');
    writeFileSync(join(projectRoot, 'src', 'utils', 'helpers.ts'), '// helpers');
    writeFileSync(join(projectRoot, 'src', 'models', 'user.ts'), '// user model');
    writeFileSync(join(projectRoot, 'src', 'models', 'index.ts'), '// models barrel');

    graph = new DependencyGraph({ dbPath });
    graph.initialize();
  });

  afterEach(() => {
    graph.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('resolves relative imports to absolute paths', () => {
    const sourceFile = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const imports = ['./types', './utils'];

    graph.upsertEdges(sourceFile, imports, projectRoot);

    const neighbors = graph.getNeighborFiles([sourceFile], 1, filter);
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'types.ts'));
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'utils.ts'));
  });

  test('skips external package imports (non-relative, non-alias)', () => {
    const sourceFile = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const imports = ['express', '@nestjs/common', 'react', './types'];

    graph.upsertEdges(sourceFile, imports, projectRoot);

    const neighbors = graph.getNeighborFiles([sourceFile], 1, filter);
    // Only the relative import should resolve
    expect(neighbors).toHaveLength(1);
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'types.ts'));
  });

  test('getNeighborFiles returns 1-hop neighbors', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const types = join(projectRoot, 'src', 'auth', 'types.ts');
    const helpers = join(projectRoot, 'src', 'utils', 'helpers.ts');

    // middleware -> types, helpers
    graph.upsertEdges(middleware, ['./types', '../utils/helpers'], projectRoot);
    // types -> helpers (this is a 2-hop from middleware)
    graph.upsertEdges(types, ['../utils/helpers'], projectRoot);

    const neighbors = graph.getNeighborFiles([middleware], 1, filter);
    expect(neighbors).toContain(types);
    expect(neighbors).toContain(helpers);
    // Should NOT include middleware itself
    expect(neighbors).not.toContain(middleware);
  });

  test('getNeighborFiles returns 2-hop neighbors (transitively)', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const types = join(projectRoot, 'src', 'auth', 'types.ts');
    const user = join(projectRoot, 'src', 'models', 'user.ts');

    // middleware -> types (1 hop)
    graph.upsertEdges(middleware, ['./types'], projectRoot);
    // types -> user (2 hops from middleware)
    graph.upsertEdges(types, ['../models/user'], projectRoot);

    const oneHop = graph.getNeighborFiles([middleware], 1, filter);
    expect(oneHop).toContain(types);
    expect(oneHop).not.toContain(user);

    const twoHop = graph.getNeighborFiles([middleware], 2, filter);
    expect(twoHop).toContain(types);
    expect(twoHop).toContain(user);
  });

  test('deduplicates results', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const authUtils = join(projectRoot, 'src', 'auth', 'utils.ts');
    const helpers = join(projectRoot, 'src', 'utils', 'helpers.ts');

    // Both middleware and authUtils import helpers
    graph.upsertEdges(middleware, ['./utils', '../utils/helpers'], projectRoot);
    graph.upsertEdges(authUtils, ['../utils/helpers'], projectRoot);

    // Start from middleware — helpers should appear only once
    const neighbors = graph.getNeighborFiles([middleware], 2, filter);
    const helpersCount = neighbors.filter((f) => f === helpers).length;
    expect(helpersCount).toBe(1);
  });

  test('returns empty array when no edges found', () => {
    const nonExistent = join(projectRoot, 'src', 'does-not-matter.ts');
    const neighbors = graph.getNeighborFiles([nonExistent], 1, filter);
    expect(neighbors).toEqual([]);
  });

  test('upsertEdges replaces existing edges for a source file', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');

    // First insert: imports types
    graph.upsertEdges(middleware, ['./types'], projectRoot);
    let neighbors = graph.getNeighborFiles([middleware], 1, filter);
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'types.ts'));

    // Second insert: imports utils instead (replaces)
    graph.upsertEdges(middleware, ['./utils'], projectRoot);
    neighbors = graph.getNeighborFiles([middleware], 1, filter);
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'utils.ts'));
    expect(neighbors).not.toContain(join(projectRoot, 'src', 'auth', 'types.ts'));
  });

  test('deleteEdgesForFile removes all edges for a source', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    graph.upsertEdges(middleware, ['./types', './utils'], projectRoot);

    let neighbors = graph.getNeighborFiles([middleware], 1, filter);
    expect(neighbors).toHaveLength(2);

    graph.deleteEdgesForFile(middleware);
    neighbors = graph.getNeighborFiles([middleware], 1, filter);
    expect(neighbors).toHaveLength(0);
  });

  test('resolves index.ts barrel exports (directory/index.ts)', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    // ../models resolves to ../models/index.ts
    graph.upsertEdges(middleware, ['../models'], projectRoot);

    const neighbors = graph.getNeighborFiles([middleware], 1, filter);
    expect(neighbors).toContain(join(projectRoot, 'src', 'models', 'index.ts'));
  });

  test('handles multiple start files', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const types = join(projectRoot, 'src', 'auth', 'types.ts');
    const helpers = join(projectRoot, 'src', 'utils', 'helpers.ts');
    const user = join(projectRoot, 'src', 'models', 'user.ts');

    graph.upsertEdges(middleware, ['../utils/helpers'], projectRoot);
    graph.upsertEdges(types, ['../models/user'], projectRoot);

    const neighbors = graph.getNeighborFiles([middleware, types], 1, filter);
    expect(neighbors).toContain(helpers);
    expect(neighbors).toContain(user);
  });

  // --- Task 1+2: edge_type, collection, nullable target_file ---

  test('stores external imports with null target_file', () => {
    const sourceFile = join(projectRoot, 'src', 'auth', 'middleware.ts');
    // 'express' is external; './types' is local
    graph.upsertEdges(sourceFile, ['express', '@nestjs/common', './types'], projectRoot);

    const neighbors = graph.getNeighborFiles([sourceFile], 1, filter);
    // Only local imports appear in BFS (external are null target)
    expect(neighbors).toHaveLength(1);
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'types.ts'));
  });

  test('collection isolates edges between collections', () => {
    const file = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const types = join(projectRoot, 'src', 'auth', 'types.ts');
    const helpers = join(projectRoot, 'src', 'utils', 'helpers.ts');

    graph.upsertEdges(file, ['./types'], projectRoot, 'col-a');
    graph.upsertEdges(file, ['../utils/helpers'], projectRoot, 'col-b');

    const neighborsA = graph.getNeighborFiles([file], 1, filter, 'col-a');
    expect(neighborsA).toContain(types);
    expect(neighborsA).not.toContain(helpers);

    const neighborsB = graph.getNeighborFiles([file], 1, filter, 'col-b');
    expect(neighborsB).toContain(helpers);
    expect(neighborsB).not.toContain(types);
  });

  test('getDensityStats returns accurate counts', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const types = join(projectRoot, 'src', 'auth', 'types.ts');

    graph.upsertEdges(middleware, ['./types', 'express', 'lodash'], projectRoot, 'test-col');
    graph.upsertEdges(types, ['../utils/helpers'], projectRoot, 'test-col');

    const stats = graph.getDensityStats('test-col');
    expect(stats.total_edges).toBe(4); // 3 from middleware + 1 from types
    expect(stats.files_with_imports).toBe(2);
    expect(stats.external_edges).toBe(2); // express + lodash
  });

  test('schema migration: re-initialize with old schema works', () => {
    // This tests that initialize() is idempotent on the new schema
    graph.initialize(); // second call — should be a no-op
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    graph.upsertEdges(middleware, ['./types'], projectRoot);
    const neighbors = graph.getNeighborFiles([middleware], 1, filter);
    expect(neighbors).toHaveLength(1);
  });

  test('T33: requires an EffectiveFilter before traversing dependency edges', () => {
    const sourceFile = join(projectRoot, 'src', 'auth', 'middleware.ts');

    expect(() => graph.getNeighborFiles([sourceFile], 1, undefined as never)).toThrow(
      /EffectiveFilter is required/,
    );
  });

  test('T33: accepts repository and metadata scope while traversing the graph', () => {
    const sourceFile = join(projectRoot, 'src', 'auth', 'middleware.ts');
    graph.upsertEdges(sourceFile, ['./types'], projectRoot);

    const scopedFilter = createEffectiveFilter(
      { must: [{ key: 'language', match: { value: 'typescript' } }] },
      'repo-a',
    );

    expect(graph.getNeighborFiles([sourceFile], 1, scopedFilter)).toEqual([
      join(projectRoot, 'src', 'auth', 'types.ts'),
    ]);
  });
});

// --- Task 3: Java import resolution ---

describe('resolveJavaImport', () => {
  const manifest = [
    '/project/src/main/java/com/example/Foo.java',
    '/project/src/main/java/com/example/Bar.java',
    '/project/src/main/java/org/utils/Helper.java',
  ];

  test('resolves Java package import to file path', () => {
    const result = resolveJavaImport('com.example.Foo', manifest);
    expect(result).toBe('/project/src/main/java/com/example/Foo.java');
  });

  test('resolves nested package import', () => {
    const result = resolveJavaImport('org.utils.Helper', manifest);
    expect(result).toBe('/project/src/main/java/org/utils/Helper.java');
  });

  test('returns null for unknown Java import', () => {
    const result = resolveJavaImport('com.example.Unknown', manifest);
    expect(result).toBeNull();
  });

  test('returns null for relative imports', () => {
    expect(resolveJavaImport('./Foo', manifest)).toBeNull();
  });

  test('returns null for non-package strings (no dot)', () => {
    expect(resolveJavaImport('Foo', manifest)).toBeNull();
  });

  test('upsertEdgesWithJava resolves Java imports', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'java-graph-'));
    const dbPath = join(tmpDir, 'graph.sqlite');
    const projectRoot = join(tmpDir, 'project');

    mkdirSync(join(projectRoot, 'src', 'main', 'java', 'com', 'example'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'main', 'java', 'com', 'example', 'Foo.java'), '');
    writeFileSync(join(projectRoot, 'src', 'main', 'java', 'com', 'example', 'Bar.java'), '');

    const g = new DependencyGraph({ dbPath });
    g.initialize();

    const sourceFile = join(projectRoot, 'src', 'main', 'java', 'com', 'example', 'Main.java');
    writeFileSync(sourceFile, '');

    const fooPath = join(projectRoot, 'src', 'main', 'java', 'com', 'example', 'Foo.java');
    const barPath = join(projectRoot, 'src', 'main', 'java', 'com', 'example', 'Bar.java');
    const fileManifest = [fooPath, barPath];

    g.upsertEdgesWithJava(
      sourceFile,
      ['com.example.Foo', 'com.example.Bar', 'java.util.List'],
      projectRoot,
      fileManifest,
    );

    const neighbors = g.getNeighborFiles([sourceFile], 1, filter);
    expect(neighbors).toContain(fooPath);
    expect(neighbors).toContain(barPath);
    // java.util.List is unresolvable → external (null target), not in BFS
    expect(neighbors).toHaveLength(2);

    g.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ── T035: expandFromPayloadEdges ──────────────────────────────────────────────

describe('DependencyGraph.expandFromPayloadEdges (T035)', () => {
  test('expand_hops=1 returns direct dependency target paths from payload edges', () => {
    const results = [
      {
        relativePath: 'src/A.java',
        dependencyEdges: [
          { targetPath: 'src/B.java', relation: 'imports' },
          { targetPath: 'src/C.java', relation: 'imports' },
        ],
      },
    ];

    const expanded = DependencyGraph.expandFromPayloadEdges(results, 1);
    expect(expanded).toContain('src/B.java');
    expect(expanded).toContain('src/C.java');
    // Source file itself should not appear in expansion
    expect(expanded).not.toContain('src/A.java');
  });

  test('deduplicates target paths across multiple results', () => {
    const results = [
      {
        relativePath: 'src/A.java',
        dependencyEdges: [{ targetPath: 'src/Shared.java', relation: 'imports' }],
      },
      {
        relativePath: 'src/B.java',
        dependencyEdges: [{ targetPath: 'src/Shared.java', relation: 'imports' }],
      },
    ];

    const expanded = DependencyGraph.expandFromPayloadEdges(results, 1);
    const sharedCount = expanded.filter((p: string) => p === 'src/Shared.java').length;
    expect(sharedCount).toBe(1);
  });

  test('returns empty array when results have no dependency edges', () => {
    const results = [{ relativePath: 'src/A.java', dependencyEdges: [] }];
    const expanded = DependencyGraph.expandFromPayloadEdges(results, 1);
    expect(expanded).toHaveLength(0);
  });

  test('returns empty array when hops=0 (expansion disabled)', () => {
    const results = [
      {
        relativePath: 'src/A.java',
        dependencyEdges: [{ targetPath: 'src/B.java', relation: 'imports' }],
      },
    ];
    const expanded = DependencyGraph.expandFromPayloadEdges(results, 0);
    expect(expanded).toHaveLength(0);
  });

  test('excludes the source relativePath from the expansion results', () => {
    // Edge targeting itself should not appear
    const results = [
      {
        relativePath: 'src/A.java',
        dependencyEdges: [
          { targetPath: 'src/A.java', relation: 'imports' }, // self-reference
          { targetPath: 'src/B.java', relation: 'imports' },
        ],
      },
    ];
    const expanded = DependencyGraph.expandFromPayloadEdges(results, 1);
    expect(expanded).not.toContain('src/A.java');
    expect(expanded).toContain('src/B.java');
  });
});
