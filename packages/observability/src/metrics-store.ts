import Database from 'better-sqlite3';
import type { RagEvent, SessionStats, StrategyStats, TotalStats, DailyTokenUsage, EventsPage } from './types.js';

/**
 * SQLite-backed store for RAG interaction events.
 * Uses better-sqlite3 synchronous API for simplicity and reliability.
 * All operations are synchronous — no async/await needed.
 */
export class MetricsStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rag_events (
        id          TEXT    PRIMARY KEY,
        session_id  TEXT    NOT NULL,
        query       TEXT    NOT NULL,
        chunks_retrieved INTEGER NOT NULL,
        chunk_ids   TEXT    NOT NULL,
        token_count INTEGER NOT NULL,
        strategy    TEXT    NOT NULL,
        timestamp   TEXT    NOT NULL,
        latency_ms  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_session   ON rag_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_strategy  ON rag_events(strategy);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON rag_events(timestamp);
    `);
  }

  /** Log a RAG event synchronously */
  logEvent(event: RagEvent): void {
    const stmt = this.db.prepare(`
      INSERT INTO rag_events
        (id, session_id, query, chunks_retrieved, chunk_ids, token_count, strategy, timestamp, latency_ms)
      VALUES
        (@id, @sessionId, @query, @chunksRetrieved, @chunkIds, @tokenCount, @strategy, @timestamp, @latencyMs)
    `);
    stmt.run({
      id: event.id,
      sessionId: event.sessionId,
      query: event.query,
      chunksRetrieved: event.chunksRetrieved,
      chunkIds: JSON.stringify(event.chunkIds),
      tokenCount: event.tokenCount,
      strategy: event.strategy,
      timestamp: event.timestamp,
      latencyMs: event.latencyMs,
    });
  }

  /** Get aggregated stats for a specific session */
  getSessionStats(sessionId: string): SessionStats | null {
    const row = this.db
      .prepare(`
        SELECT
          session_id         AS sessionId,
          COUNT(*)           AS totalQueries,
          SUM(token_count)   AS totalTokens,
          SUM(chunks_retrieved) AS totalChunks,
          AVG(latency_ms)    AS avgLatencyMs,
          MIN(timestamp)     AS firstQuery,
          MAX(timestamp)     AS lastQuery
        FROM rag_events
        WHERE session_id = ?
        GROUP BY session_id
      `)
      .get(sessionId) as
      | {
          sessionId: string;
          totalQueries: number;
          totalTokens: number;
          totalChunks: number;
          avgLatencyMs: number;
          firstQuery: string;
          lastQuery: string;
        }
      | undefined;

    if (!row) return null;

    return {
      sessionId: row.sessionId,
      totalQueries: row.totalQueries,
      totalTokens: row.totalTokens,
      totalChunks: row.totalChunks,
      avgLatencyMs: Math.round(row.avgLatencyMs),
      firstQuery: row.firstQuery,
      lastQuery: row.lastQuery,
    };
  }

  /** Get stats per retrieval strategy */
  getStrategyStats(): StrategyStats[] {
    const rows = this.db
      .prepare(`
        SELECT
          strategy,
          COUNT(*)         AS totalQueries,
          SUM(token_count) AS totalTokens,
          AVG(token_count) AS avgTokensPerQuery
        FROM rag_events
        GROUP BY strategy
        ORDER BY strategy
      `)
      .all() as Array<{
      strategy: string;
      totalQueries: number;
      totalTokens: number;
      avgTokensPerQuery: number;
    }>;

    return rows.map((r) => ({
      strategy: r.strategy,
      totalQueries: r.totalQueries,
      totalTokens: r.totalTokens,
      avgTokensPerQuery: Math.round(r.avgTokensPerQuery),
    }));
  }

  /** Get overall total stats across all sessions */
  getTotalStats(): TotalStats {
    const row = this.db
      .prepare(`
        SELECT
          COUNT(*)                  AS totalEvents,
          COALESCE(SUM(token_count), 0) AS totalTokens,
          COUNT(DISTINCT session_id) AS totalSessions,
          COALESCE(AVG(token_count), 0) AS avgTokensPerQuery
        FROM rag_events
      `)
      .get() as {
      totalEvents: number;
      totalTokens: number;
      totalSessions: number;
      avgTokensPerQuery: number;
    };

    return {
      totalEvents: row.totalEvents,
      totalTokens: row.totalTokens,
      totalSessions: row.totalSessions,
      avgTokensPerQuery: Math.round(row.avgTokensPerQuery),
    };
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }

  /** Get daily token usage grouped by date (for dashboard charts) */
  getEventsByDay(): DailyTokenUsage[] {
    const rows = this.db
      .prepare(`
        SELECT
          DATE(timestamp) AS date,
          SUM(token_count) AS totalTokens,
          COUNT(*) AS totalQueries
        FROM rag_events
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `)
      .all() as Array<{ date: string; totalTokens: number; totalQueries: number }>;

    return rows.map((r) => ({
      date: r.date,
      totalTokens: r.totalTokens,
      totalQueries: r.totalQueries,
    }));
  }

  /** List paginated RAG events ordered by timestamp DESC */
  listEvents(limit: number, offset: number): EventsPage {
    const events = this.db
      .prepare(`
        SELECT * FROM rag_events ORDER BY timestamp DESC LIMIT ? OFFSET ?
      `)
      .all(limit, offset) as Array<{
      id: string;
      session_id: string;
      query: string;
      chunks_retrieved: number;
      chunk_ids: string;
      token_count: number;
      strategy: string;
      timestamp: string;
      latency_ms: number;
    }>;

    const { total } = this.db
      .prepare('SELECT COUNT(*) AS total FROM rag_events')
      .get() as { total: number };

    return {
      events: events.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        query: r.query,
        chunksRetrieved: r.chunks_retrieved,
        chunkIds: JSON.parse(r.chunk_ids) as string[],
        tokenCount: r.token_count,
        strategy: r.strategy as RagEvent['strategy'],
        timestamp: r.timestamp,
        latencyMs: r.latency_ms,
      })),
      total,
    };
  }
}
