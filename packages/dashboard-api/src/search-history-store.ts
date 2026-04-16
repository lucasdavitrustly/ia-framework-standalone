import Database from 'better-sqlite3';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchHistoryEntry {
  id: string;
  query: string;
  params: { limit: number; scoreThreshold: number; collections: string[] };
  results: Array<{
    id: string;
    filePath: string;
    startLine: number;
    endLine: number;
    score: number;
    source: string;
    chunkType: string;
    matchedVector: string;
    content: string;
    description?: string;
  }>;
  metrics: {
    latencyMs: number;
    chunksScanned: number;
    resultsReturned: number;
    scoreRange: { min: number; max: number };
  };
  collection: string;
  resultCount: number;
  topScore: number;
  latencyMs: number;
  createdAt: string;
}

export interface SearchHistoryListParams {
  q?: string;
  collection?: string;
  dateFrom?: string;
  dateTo?: string;
  minScore?: number;
  sortBy?: 'created_at' | 'query' | 'result_count' | 'top_score' | 'latency_ms';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface SearchHistoryListResult {
  entries: SearchHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Row shape ────────────────────────────────────────────────────────────────

interface SearchHistoryRow {
  id: string;
  query: string;
  params: string;
  results: string;
  metrics: string;
  collection: string;
  result_count: number;
  top_score: number;
  latency_ms: number;
  created_at: string;
}

// ── Allowed sort columns (allowlist to prevent SQL injection) ─────────────────

const ALLOWED_SORT_COLUMNS = new Set([
  'created_at',
  'query',
  'result_count',
  'top_score',
  'latency_ms',
]);

// ── Store ─────────────────────────────────────────────────────────────────────

/**
 * SQLite-backed store for dashboard search history.
 * Uses better-sqlite3 synchronous API.
 * Follows the same pattern as BenchmarkStore.
 */
export class SearchHistoryStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_history (
        id            TEXT PRIMARY KEY,
        query         TEXT NOT NULL,
        params        TEXT NOT NULL,
        results       TEXT NOT NULL,
        metrics       TEXT NOT NULL,
        collection    TEXT NOT NULL,
        result_count  INTEGER NOT NULL,
        top_score     REAL NOT NULL,
        latency_ms    REAL NOT NULL,
        created_at    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sh_created_at ON search_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_sh_collection  ON search_history(collection);
      CREATE INDEX IF NOT EXISTS idx_sh_query       ON search_history(query);
    `);
  }

  /**
   * Save a search history entry.
   * Generates a UUID id and ISO timestamp automatically.
   * Returns the generated id.
   */
  saveEntry(entry: Omit<SearchHistoryEntry, 'id' | 'createdAt'>): string {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO search_history
        (id, query, params, results, metrics, collection, result_count, top_score, latency_ms, created_at)
      VALUES
        (@id, @query, @params, @results, @metrics, @collection, @resultCount, @topScore, @latencyMs, @createdAt)
    `);

    stmt.run({
      id,
      query: entry.query,
      params: JSON.stringify(entry.params),
      results: JSON.stringify(entry.results),
      metrics: JSON.stringify(entry.metrics),
      collection: entry.collection,
      resultCount: entry.resultCount,
      topScore: entry.topScore,
      latencyMs: entry.latencyMs,
      createdAt,
    });

    return id;
  }

  /** Retrieve a single entry by id. Returns null if not found. */
  getById(id: string): SearchHistoryEntry | null {
    const row = this.db
      .prepare(
        `SELECT id, query, params, results, metrics, collection, result_count, top_score, latency_ms, created_at
         FROM search_history WHERE id = ?`,
      )
      .get(id) as SearchHistoryRow | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  /**
   * List search history entries with optional filtering, sorting, and pagination.
   * Builds WHERE clause dynamically with parameter binding (no string interpolation).
   */
  list(params: SearchHistoryListParams = {}): SearchHistoryListResult {
    const {
      q,
      collection,
      dateFrom,
      dateTo,
      minScore,
      sortBy = 'created_at',
      sortOrder = 'desc',
      page = 1,
      pageSize = 20,
    } = params;

    // Validate sortBy against allowlist
    const safeSortBy = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Build WHERE clause
    const conditions: string[] = [];
    const bindParams: unknown[] = [];

    if (q !== undefined && q !== '') {
      conditions.push(`LOWER(query) LIKE LOWER(?)`);
      bindParams.push(`%${q}%`);
    }

    if (collection !== undefined && collection !== '') {
      conditions.push(`collection = ?`);
      bindParams.push(collection);
    }

    if (dateFrom !== undefined && dateFrom !== '') {
      conditions.push(`created_at >= ?`);
      bindParams.push(dateFrom);
    }

    if (dateTo !== undefined && dateTo !== '') {
      conditions.push(`created_at <= ?`);
      bindParams.push(dateTo);
    }

    if (minScore !== undefined) {
      conditions.push(`top_score >= ?`);
      bindParams.push(minScore);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM search_history ${whereClause}`)
      .get(...bindParams) as { total: number };

    // Get paginated results
    const offset = (page - 1) * pageSize;
    const rows = this.db
      .prepare(
        `SELECT id, query, params, results, metrics, collection, result_count, top_score, latency_ms, created_at
         FROM search_history ${whereClause}
         ORDER BY ${safeSortBy} ${safeSortOrder}
         LIMIT ? OFFSET ?`,
      )
      .all(...bindParams, pageSize, offset) as SearchHistoryRow[];

    return {
      entries: rows.map((row) => this.rowToEntry(row)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Delete a single entry by id.
   * Returns true if deleted, false if not found.
   */
  deleteById(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM search_history WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /** Remove all entries from search_history. */
  clearAll(): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM search_history').run();
    });
    transaction();
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private rowToEntry(row: SearchHistoryRow): SearchHistoryEntry {
    return {
      id: row.id,
      query: row.query,
      params: JSON.parse(row.params) as SearchHistoryEntry['params'],
      results: JSON.parse(row.results) as SearchHistoryEntry['results'],
      metrics: JSON.parse(row.metrics) as SearchHistoryEntry['metrics'],
      collection: row.collection,
      resultCount: row.result_count,
      topScore: row.top_score,
      latencyMs: row.latency_ms,
      createdAt: row.created_at,
    };
  }
}
