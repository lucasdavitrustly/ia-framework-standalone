import Database from 'better-sqlite3';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface DependencyGraphConfig {
  /** Path to SQLite file (e.g. .ia-framework/graph.sqlite) */
  dbPath: string;
}

/**
 * Resolve a relative import specifier to an absolute file path.
 * Returns null for external package imports (non-relative).
 */
function resolveImport(
  sourceFile: string,
  importSpecifier: string,
  _projectRoot: string,
): string | null {
  // Skip external packages (not starting with '.', '..', or '/')
  if (!importSpecifier.startsWith('.') && !importSpecifier.startsWith('/')) {
    return null;
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
      return candidate;
    }
  }

  return null;
}

/**
 * File-level dependency graph stored in SQLite.
 * Resolves import specifiers to absolute file paths and stores an adjacency table.
 * Supports BFS neighbor expansion for retrieval augmentation.
 */
export class DependencyGraph {
  private readonly db: Database.Database;

  constructor(config: DependencyGraphConfig) {
    this.db = new Database(config.dbPath);
  }

  /** Initialize the SQLite schema (idempotent). */
  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_edges (
        source_file TEXT NOT NULL,
        target_file TEXT NOT NULL,
        PRIMARY KEY (source_file, target_file)
      );
      CREATE INDEX IF NOT EXISTS idx_file_edges_source ON file_edges(source_file);
      CREATE INDEX IF NOT EXISTS idx_file_edges_target ON file_edges(target_file);
    `);
  }

  /**
   * Upsert edges for a single source file.
   * Resolves import specifiers to absolute paths; skips external packages.
   * Replaces all existing edges for this source file.
   */
  upsertEdges(sourceFilePath: string, imports: string[], projectRoot: string): void {
    // Delete existing edges for this source file first
    this.db.prepare('DELETE FROM file_edges WHERE source_file = ?').run(sourceFilePath);

    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO file_edges (source_file, target_file) VALUES (?, ?)',
    );

    const insertMany = this.db.transaction((resolvedTargets: string[]) => {
      for (const target of resolvedTargets) {
        insert.run(sourceFilePath, target);
      }
    });

    const resolved: string[] = [];
    for (const spec of imports) {
      const target = resolveImport(sourceFilePath, spec, projectRoot);
      if (target !== null) {
        resolved.push(target);
      }
    }

    insertMany(resolved);
  }

  /**
   * Get all files reachable from startFiles within `hops` hops (BFS).
   * Does NOT include the startFiles themselves in the result.
   */
  getNeighborFiles(startFiles: string[], hops: 1 | 2): string[] {
    const visited = new Set<string>(startFiles);
    let frontier = [...startFiles];

    const query = this.db.prepare(
      'SELECT target_file FROM file_edges WHERE source_file = ?',
    );

    for (let hop = 0; hop < hops; hop++) {
      const nextFrontier: string[] = [];

      for (const file of frontier) {
        const rows = query.all(file) as Array<{ target_file: string }>;
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

  /** Remove all edges where source file matches (for incremental re-indexing). */
  deleteEdgesForFile(filePath: string): void {
    this.db.prepare('DELETE FROM file_edges WHERE source_file = ?').run(filePath);
  }

  /** Close DB connection. */
  close(): void {
    this.db.close();
  }
}
