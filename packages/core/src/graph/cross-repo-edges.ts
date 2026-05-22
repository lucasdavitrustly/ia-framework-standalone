import Database from 'better-sqlite3';

export interface CrossRepoEdge {
  id?: number;
  sourceRepo: string;
  sourcePath: string;
  sourceSymbol: string | null;
  targetRepo: string;
  targetPath: string | null;
  targetSymbol: string | null;
}

export class CrossRepoEdgeStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cross_repo_edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_repo TEXT NOT NULL,
        source_path TEXT NOT NULL,
        source_symbol TEXT,
        target_repo TEXT NOT NULL,
        target_path TEXT,
        target_symbol TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cre_source ON cross_repo_edges(source_repo, source_path);
      CREATE INDEX IF NOT EXISTS idx_cre_target ON cross_repo_edges(target_repo, target_symbol);
    `);
  }

  insertEdge(edge: Omit<CrossRepoEdge, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO cross_repo_edges (source_repo, source_path, source_symbol, target_repo, target_path, target_symbol)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      edge.sourceRepo,
      edge.sourcePath,
      edge.sourceSymbol,
      edge.targetRepo,
      edge.targetPath,
      edge.targetSymbol,
    );
  }

  insertEdges(edges: Omit<CrossRepoEdge, 'id'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO cross_repo_edges (source_repo, source_path, source_symbol, target_repo, target_path, target_symbol)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const tx = this.db.transaction((items: Omit<CrossRepoEdge, 'id'>[]) => {
      for (const edge of items) {
        stmt.run(
          edge.sourceRepo,
          edge.sourcePath,
          edge.sourceSymbol,
          edge.targetRepo,
          edge.targetPath,
          edge.targetSymbol,
        );
      }
    });
    tx(edges);
  }

  getEdgesFrom(sourceRepo: string, sourcePath: string): CrossRepoEdge[] {
    const stmt = this.db.prepare(`
      SELECT id, source_repo, source_path, source_symbol, target_repo, target_path, target_symbol
      FROM cross_repo_edges WHERE source_repo = ? AND source_path = ?
    `);
    return (stmt.all(sourceRepo, sourcePath) as Array<Record<string, unknown>>).map(this.rowToEdge);
  }

  getEdgesTo(targetRepo: string, targetSymbol: string): CrossRepoEdge[] {
    const stmt = this.db.prepare(`
      SELECT id, source_repo, source_path, source_symbol, target_repo, target_path, target_symbol
      FROM cross_repo_edges WHERE target_repo = ? AND target_symbol = ?
    `);
    return (stmt.all(targetRepo, targetSymbol) as Array<Record<string, unknown>>).map(
      this.rowToEdge,
    );
  }

  rebuildForRepo(repoId: string): void {
    const stmt = this.db.prepare(
      `DELETE FROM cross_repo_edges WHERE source_repo = ? OR target_repo = ?`,
    );
    stmt.run(repoId, repoId);
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // Already closed
    }
  }

  private rowToEdge(row: Record<string, unknown>): CrossRepoEdge {
    return {
      id: row.id as number,
      sourceRepo: row.source_repo as string,
      sourcePath: row.source_path as string,
      sourceSymbol: row.source_symbol as string | null,
      targetRepo: row.target_repo as string,
      targetPath: row.target_path as string | null,
      targetSymbol: row.target_symbol as string | null,
    };
  }
}
