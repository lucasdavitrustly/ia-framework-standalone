import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { DependencyGraph } from './dependency-graph.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

    const neighbors = graph.getNeighborFiles([sourceFile], 1);
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'types.ts'));
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'utils.ts'));
  });

  test('skips external package imports (non-relative, non-alias)', () => {
    const sourceFile = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const imports = ['express', '@nestjs/common', 'react', './types'];

    graph.upsertEdges(sourceFile, imports, projectRoot);

    const neighbors = graph.getNeighborFiles([sourceFile], 1);
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

    const neighbors = graph.getNeighborFiles([middleware], 1);
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

    const oneHop = graph.getNeighborFiles([middleware], 1);
    expect(oneHop).toContain(types);
    expect(oneHop).not.toContain(user);

    const twoHop = graph.getNeighborFiles([middleware], 2);
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
    const neighbors = graph.getNeighborFiles([middleware], 2);
    const helpersCount = neighbors.filter((f) => f === helpers).length;
    expect(helpersCount).toBe(1);
  });

  test('returns empty array when no edges found', () => {
    const nonExistent = join(projectRoot, 'src', 'does-not-matter.ts');
    const neighbors = graph.getNeighborFiles([nonExistent], 1);
    expect(neighbors).toEqual([]);
  });

  test('upsertEdges replaces existing edges for a source file', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');

    // First insert: imports types
    graph.upsertEdges(middleware, ['./types'], projectRoot);
    let neighbors = graph.getNeighborFiles([middleware], 1);
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'types.ts'));

    // Second insert: imports utils instead (replaces)
    graph.upsertEdges(middleware, ['./utils'], projectRoot);
    neighbors = graph.getNeighborFiles([middleware], 1);
    expect(neighbors).toContain(join(projectRoot, 'src', 'auth', 'utils.ts'));
    expect(neighbors).not.toContain(join(projectRoot, 'src', 'auth', 'types.ts'));
  });

  test('deleteEdgesForFile removes all edges for a source', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    graph.upsertEdges(middleware, ['./types', './utils'], projectRoot);

    let neighbors = graph.getNeighborFiles([middleware], 1);
    expect(neighbors).toHaveLength(2);

    graph.deleteEdgesForFile(middleware);
    neighbors = graph.getNeighborFiles([middleware], 1);
    expect(neighbors).toHaveLength(0);
  });

  test('resolves index.ts barrel exports (directory/index.ts)', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    // ../models resolves to ../models/index.ts
    graph.upsertEdges(middleware, ['../models'], projectRoot);

    const neighbors = graph.getNeighborFiles([middleware], 1);
    expect(neighbors).toContain(join(projectRoot, 'src', 'models', 'index.ts'));
  });

  test('handles multiple start files', () => {
    const middleware = join(projectRoot, 'src', 'auth', 'middleware.ts');
    const types = join(projectRoot, 'src', 'auth', 'types.ts');
    const helpers = join(projectRoot, 'src', 'utils', 'helpers.ts');
    const user = join(projectRoot, 'src', 'models', 'user.ts');

    graph.upsertEdges(middleware, ['../utils/helpers'], projectRoot);
    graph.upsertEdges(types, ['../models/user'], projectRoot);

    const neighbors = graph.getNeighborFiles([middleware, types], 1);
    expect(neighbors).toContain(helpers);
    expect(neighbors).toContain(user);
  });
});
