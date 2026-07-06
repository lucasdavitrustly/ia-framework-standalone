import { createDatabase, type SqliteDatabase } from '@ia-framework/core';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface DependencyGraphConfig {
  /** Path to SQLite file (e.g. .ia-framework/graph.sqlite) */
  dbPath: string;
}

/** Tagged result of import resolution */
type ResolvedImport =
  | { path: string; external: false; edgeType: 'import' }
  | { path: null; external: true; specifier: string; edgeType: 'external' };

/**
 * Resolve a relative import specifier to an absolute file path.
 * Returns a tagged result: resolved path or external marker.
 */
function resolveImport(
  sourceFile: string,
  importSpecifier: string,
  _projectRoot: string,
): ResolvedImport {
  // Skip external packages (not starting with '.', '..', or '/')
  if (!importSpecifier.startsWith('.') && !importSpecifier.startsWith('/')) {
    return { path: null, external: true, specifier: importSpecifier, edgeType: 'external' };
  }

  const base = resolve(dirname(sourceFile), importSpecifier);

  // Try with and without common extensions
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}/index.js`,
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return { path: candidate, external: false, edgeType: 'import' };
    }
  }

  // Relative but unresolvable — still external-ish, store as external
  return { path: null, external: true, specifier: importSpecifier, edgeType: 'external' };
}

/**
 * Resolve a Java import specifier (e.g. com.example.Foo) to a file path
 * using a manifest of known files in the collection.
 *
 * Strategy: convert `com.example.Foo` → `com/example/Foo.java` and
 * search the file manifest for a file ending with that path.
 */
export function resolveJavaImport(importSpec: string, fileManifest: string[]): string | null {
  // Java imports are dot-separated, no leading '.', '/', '@'
  if (
    importSpec.startsWith('.') ||
    importSpec.startsWith('/') ||
    importSpec.startsWith('@') ||
    !importSpec.includes('.')
  ) {
    return null;
  }

  const relativePath = importSpec.replace(/\./g, '/') + '.java';
  const match = fileManifest.find(
    (f) => f.endsWith(relativePath) || f.endsWith(relativePath.replace(/^.*\//, '/')),
  );
  return match ?? null;
}

/**
 * File-level dependency graph stored in SQLite.
 * Resolves import specifiers to absolute file paths and stores an adjacency table.
 * Supports BFS neighbor expansion for retrieval augmentation.
 *
 * Schema (v2): adds edge_type and collection columns; target_file is nullable.
 */
export class DependencyGraph {
  private readonly db: SqliteDatabase;

  constructor(config: DependencyGraphConfig) {
    this.db = createDatabase(config.dbPath).db;
  }

  /** Initialize the SQLite schema (idempotent). Migrates from v1 schema if needed. */
  initialize(): void {
    // Detect v1 schema (no edge_type column) and migrate by dropping + recreating
    const tableExists = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='file_edges'`)
      .get();

    if (tableExists) {
      const cols = this.db.prepare(`PRAGMA table_info(file_edges)`).all() as Array<{
        name: string;
      }>;
      const hasEdgeType = cols.some((c) => c.name === 'edge_type');
      if (!hasEdgeType) {
        // Migrate: drop old table and recreate with new schema
        this.db.exec(`DROP TABLE IF EXISTS file_edges`);
      }
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_edges (
        source_file TEXT NOT NULL,
        target_file TEXT,
        edge_type TEXT NOT NULL DEFAULT 'import',
        collection TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_file_edges_src ON file_edges(collection, source_file);
      CREATE INDEX IF NOT EXISTS idx_file_edges_tgt ON file_edges(collection, target_file)
        WHERE target_file IS NOT NULL;
    `);
  }

  /**
   * Upsert edges for a single source file.
   * Resolves import specifiers to absolute paths; stores external imports with null target.
   * Replaces all existing edges for this source file in the given collection.
   */
  upsertEdges(
    sourceFilePath: string,
    imports: string[],
    projectRoot: string,
    collection = '',
  ): void {
    // Delete existing edges for this source file + collection
    this.db
      .prepare('DELETE FROM file_edges WHERE source_file = ? AND collection = ?')
      .run(sourceFilePath, collection);

    const insert = this.db.prepare(
      'INSERT INTO file_edges (source_file, target_file, edge_type, collection) VALUES (?, ?, ?, ?)',
    );

    const insertMany = this.db.transaction(
      (edges: Array<{ target: string | null; edgeType: string }>) => {
        for (const edge of edges) {
          insert.run(sourceFilePath, edge.target, edge.edgeType, collection);
        }
      },
    );

    const edges: Array<{ target: string | null; edgeType: string }> = [];
    for (const spec of imports) {
      const result = resolveImport(sourceFilePath, spec, projectRoot);
      edges.push({ target: result.path, edgeType: result.edgeType });
    }

    insertMany(edges);
  }

  /**
   * Upsert edges with Java import resolution support.
   * For imports that look like Java package imports, resolves using the file manifest.
   */
  upsertEdgesWithJava(
    sourceFilePath: string,
    imports: string[],
    projectRoot: string,
    fileManifest: string[],
    collection = '',
  ): void {
    this.db
      .prepare('DELETE FROM file_edges WHERE source_file = ? AND collection = ?')
      .run(sourceFilePath, collection);

    const insert = this.db.prepare(
      'INSERT INTO file_edges (source_file, target_file, edge_type, collection) VALUES (?, ?, ?, ?)',
    );

    const insertMany = this.db.transaction(
      (edges: Array<{ target: string | null; edgeType: string }>) => {
        for (const edge of edges) {
          insert.run(sourceFilePath, edge.target, edge.edgeType, collection);
        }
      },
    );

    const edges: Array<{ target: string | null; edgeType: string }> = [];
    for (const spec of imports) {
      const result = resolveImport(sourceFilePath, spec, projectRoot);
      if (result.external) {
        // Try Java resolution
        const javaPath = resolveJavaImport(spec, fileManifest);
        if (javaPath !== null) {
          edges.push({ target: javaPath, edgeType: 'import' });
        } else {
          edges.push({ target: null, edgeType: 'external' });
        }
      } else {
        edges.push({ target: result.path, edgeType: result.edgeType });
      }
    }

    insertMany(edges);
  }

  /**
   * Get all files reachable from startFiles within `hops` hops (BFS).
   * Only traverses non-null target_file edges in the given collection.
   * Does NOT include the startFiles themselves in the result.
   */
  getNeighborFiles(startFiles: string[], hops: 1 | 2, collection = ''): string[] {
    const visited = new Set<string>(startFiles);
    let frontier = [...startFiles];

    const query = this.db.prepare(
      'SELECT target_file FROM file_edges WHERE source_file = ? AND collection = ? AND target_file IS NOT NULL',
    );

    for (let hop = 0; hop < hops; hop++) {
      const nextFrontier: string[] = [];

      for (const file of frontier) {
        const rows = query.all(file, collection) as Array<{ target_file: string }>;
        for (const row of rows) {
          if (!visited.has(row.target_file)) {
            visited.add(row.target_file);
            nextFrontier.push(row.target_file);
          }
        }
      }

      frontier = nextFrontier;
    }

    // Return all discovered files except the starting files
    const startSet = new Set(startFiles);
    return Array.from(visited).filter((f) => !startSet.has(f));
  }

  /**
   * Get graph density statistics for a collection.
   * Returns total_edges, files_with_imports, and external_edges counts.
   */
  getDensityStats(collection = ''): {
    total_edges: number;
    files_with_imports: number;
    external_edges: number;
  } {
    const row = this.db
      .prepare(
        `SELECT
          COUNT(*) AS total_edges,
          COUNT(DISTINCT source_file) AS files_with_imports,
          SUM(CASE WHEN target_file IS NULL THEN 1 ELSE 0 END) AS external_edges
        FROM file_edges
        WHERE collection = ?`,
      )
      .get(collection) as {
      total_edges: number;
      files_with_imports: number;
      external_edges: number;
    };
    return {
      total_edges: row.total_edges,
      files_with_imports: row.files_with_imports,
      external_edges: row.external_edges ?? 0,
    };
  }

  /** Remove all edges where source file matches (for incremental re-indexing). */
  deleteEdgesForFile(filePath: string, collection = ''): void {
    this.db
      .prepare('DELETE FROM file_edges WHERE source_file = ? AND collection = ?')
      .run(filePath, collection);
  }

  /**
   * T039: Pure static helper — no DB access.
   * Collects targetPaths from payload-embedded dependencyEdges up to `hops` levels.
   * Currently only supports hops=1 (direct dependencies); hops=0 returns [].
   * The source relativePaths themselves are excluded from the result.
   */
  static expandFromPayloadEdges(
    results: Array<{
      relativePath: string;
      dependencyEdges?: Array<{ targetPath: string; relation: string }> | undefined;
    }>,
    hops: number,
  ): string[] {
    if (hops === 0) return [];
    const sourceSet = new Set(results.map((r) => r.relativePath));
    const targets = new Set<string>();
    for (const r of results) {
      for (const edge of r.dependencyEdges ?? []) {
        if (!sourceSet.has(edge.targetPath)) {
          targets.add(edge.targetPath);
        }
      }
    }
    return Array.from(targets);
  }

  /** Close DB connection. */
  close(): void {
    this.db.close();
  }
}
