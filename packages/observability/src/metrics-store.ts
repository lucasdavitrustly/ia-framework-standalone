import { createDatabase, type SqliteDatabase } from '@ia-framework/core';
import type {
  RagEvent,
  SessionStats,
  StrategyStats,
  TotalStats,
  DailyTokenUsage,
  EventsPage,
  ModuleGraphJSON,
  McpRequest,
  ListRequestsOptions,
  RequestsPage,
  RequestSummaryStats,
  DailyRequestStats,
  ToolRequestStats,
} from './types.js';

/**
 * SQLite-backed store for RAG interaction events.
 * Uses better-sqlite3 synchronous API for simplicity and reliability.
 * All operations are synchronous — no async/await needed.
 */
export class MetricsStore {
  private readonly db: SqliteDatabase;

  constructor(dbPath: string) {
    this.db = createDatabase(dbPath).db;
    this.initialize();
  }

  private initialize(): void {
    // Use DELETE journal mode for cross-filesystem compatibility (e.g., Docker-mounted volumes).
    // WAL requires shared memory (-shm) which doesn't work over SFTP/9p/NFS mounts.
    // busy_timeout prevents SQLITE_BUSY errors during concurrent read/write.
    if (this.db.name !== ':memory:' && this.db.name !== '') {
      this.db.pragma('journal_mode = DELETE');
      this.db.pragma('busy_timeout = 5000');
    }
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

      CREATE TABLE IF NOT EXISTS module_graph (
        project_root TEXT PRIMARY KEY,
        graph_json   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mcp_requests (
        id               TEXT    PRIMARY KEY,
        session_id       TEXT    NOT NULL,
        tool_name        TEXT    NOT NULL,
        input_params     TEXT    NOT NULL,
        response_content TEXT    NOT NULL,
        input_tokens     INTEGER NOT NULL,
        output_tokens    INTEGER NOT NULL,
        duration_ms      INTEGER NOT NULL,
        timestamp        TEXT    NOT NULL,
        is_truncated     INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_requests_timestamp ON mcp_requests(timestamp);
      CREATE INDEX IF NOT EXISTS idx_mcp_requests_tool_name ON mcp_requests(tool_name);
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
      .prepare(
        `
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
      `,
      )
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
      .prepare(
        `
        SELECT
          strategy,
          COUNT(*)         AS totalQueries,
          SUM(token_count) AS totalTokens,
          AVG(token_count) AS avgTokensPerQuery
        FROM rag_events
        GROUP BY strategy
        ORDER BY strategy
      `,
      )
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
      .prepare(
        `
        SELECT
          COUNT(*)                  AS totalEvents,
          COALESCE(SUM(token_count), 0) AS totalTokens,
          COUNT(DISTINCT session_id) AS totalSessions,
          COALESCE(AVG(token_count), 0) AS avgTokensPerQuery
        FROM rag_events
      `,
      )
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

  /** Save a module graph JSON blob for a project root (upsert) */
  saveModuleGraph(projectRoot: string, graphJson: ModuleGraphJSON): void {
    this.db
      .prepare(
        `INSERT INTO module_graph (project_root, graph_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(project_root) DO UPDATE SET graph_json = excluded.graph_json, updated_at = excluded.updated_at`,
      )
      .run(projectRoot, JSON.stringify(graphJson), new Date().toISOString());
  }

  /** Retrieve a stored module graph for a project root, or null if not found */
  getModuleGraph(projectRoot: string): ModuleGraphJSON | null {
    const row = this.db
      .prepare('SELECT graph_json FROM module_graph WHERE project_root = ?')
      .get(projectRoot) as { graph_json: string } | undefined;
    return row ? (JSON.parse(row.graph_json) as ModuleGraphJSON) : null;
  }

  /** Log an MCP tool call request */
  logRequest(request: McpRequest): void {
    const stmt = this.db.prepare(`
      INSERT INTO mcp_requests
        (id, session_id, tool_name, input_params, response_content, input_tokens, output_tokens, duration_ms, timestamp, is_truncated)
      VALUES
        (@id, @sessionId, @toolName, @inputParams, @responseContent, @inputTokens, @outputTokens, @durationMs, @timestamp, @isTruncated)
    `);
    stmt.run({
      id: request.id,
      sessionId: request.sessionId,
      toolName: request.toolName,
      inputParams: JSON.stringify(request.inputParams),
      responseContent: request.responseContent,
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      durationMs: request.durationMs,
      timestamp: request.timestamp,
      isTruncated: request.isTruncated ? 1 : 0,
    });
  }

  /** Get a single MCP request by ID (with full response content) */
  getRequestById(id: string): McpRequest | null {
    const row = this.db.prepare('SELECT * FROM mcp_requests WHERE id = ?').get(id) as
      | {
          id: string;
          session_id: string;
          tool_name: string;
          input_params: string;
          response_content: string;
          input_tokens: number;
          output_tokens: number;
          duration_ms: number;
          timestamp: string;
          is_truncated: number;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      sessionId: row.session_id,
      toolName: row.tool_name,
      inputParams: JSON.parse(row.input_params) as Record<string, unknown>,
      responseContent: row.response_content,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      durationMs: row.duration_ms,
      timestamp: row.timestamp,
      isTruncated: row.is_truncated === 1,
    };
  }

  /** List MCP requests with pagination and optional filtering */
  listRequests(options: ListRequestsOptions): RequestsPage {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.toolName) {
      conditions.push('tool_name = ?');
      params.push(options.toolName);
    }
    if (options.from) {
      conditions.push('timestamp >= ?');
      params.push(options.from);
    }
    if (options.to) {
      conditions.push('timestamp <= ?');
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const items = this.db
      .prepare(
        `SELECT id, session_id, tool_name, input_params, input_tokens, output_tokens, duration_ms, timestamp, is_truncated
         FROM mcp_requests ${whereClause}
         ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, options.limit, options.offset) as Array<{
      id: string;
      session_id: string;
      tool_name: string;
      input_params: string;
      input_tokens: number;
      output_tokens: number;
      duration_ms: number;
      timestamp: string;
      is_truncated: number;
    }>;

    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM mcp_requests ${whereClause}`)
      .get(...params) as { total: number };

    return {
      items: items.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        toolName: r.tool_name,
        inputParams: JSON.parse(r.input_params) as Record<string, unknown>,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        durationMs: r.duration_ms,
        timestamp: r.timestamp,
        isTruncated: r.is_truncated === 1,
      })),
      total,
    };
  }

  /** Get aggregated request statistics */
  getRequestStats(options?: { from?: string; to?: string }): RequestSummaryStats {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.from) {
      conditions.push('timestamp >= ?');
      params.push(options.from);
    }
    if (options?.to) {
      conditions.push('timestamp <= ?');
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const today = new Date().toISOString().slice(0, 10);

    const row = this.db
      .prepare(
        `SELECT
          COUNT(*) AS totalRequests,
          COALESCE(SUM(input_tokens), 0) AS totalInputTokens,
          COALESCE(SUM(output_tokens), 0) AS totalOutputTokens,
          COALESCE(AVG(duration_ms), 0) AS avgDurationMs
        FROM mcp_requests ${whereClause}`,
      )
      .get(...params) as {
      totalRequests: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      avgDurationMs: number;
    };

    const { requestsToday } = this.db
      .prepare(`SELECT COUNT(*) AS requestsToday FROM mcp_requests WHERE DATE(timestamp) = ?`)
      .get(today) as { requestsToday: number };

    return {
      totalRequests: row.totalRequests,
      totalInputTokens: row.totalInputTokens,
      totalOutputTokens: row.totalOutputTokens,
      avgDurationMs: Math.round(row.avgDurationMs),
      requestsToday,
    };
  }

  /** Get daily request stats */
  getDailyRequestStats(options?: { from?: string; to?: string }): DailyRequestStats[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.from) {
      conditions.push('timestamp >= ?');
      params.push(options.from);
    }
    if (options?.to) {
      conditions.push('timestamp <= ?');
      params.push(options.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db
      .prepare(
        `SELECT
          DATE(timestamp) AS date,
          COUNT(*) AS requestCount,
          SUM(input_tokens) AS totalInputTokens,
          SUM(output_tokens) AS totalOutputTokens,
          AVG(duration_ms) AS avgDurationMs
        FROM mcp_requests ${whereClause}
        GROUP BY DATE(timestamp)
        ORDER BY date ASC`,
      )
      .all(...params) as Array<{
      date: string;
      requestCount: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      avgDurationMs: number;
    }>;

    return rows.map((r) => ({
      date: r.date,
      requestCount: r.requestCount,
      totalInputTokens: r.totalInputTokens,
      totalOutputTokens: r.totalOutputTokens,
      avgDurationMs: Math.round(r.avgDurationMs),
    }));
  }

  /** Get per-tool request stats */
  getToolRequestStats(): ToolRequestStats[] {
    const rows = this.db
      .prepare(
        `SELECT
          tool_name AS toolName,
          COUNT(*) AS requestCount,
          SUM(input_tokens) AS totalInputTokens,
          SUM(output_tokens) AS totalOutputTokens,
          AVG(duration_ms) AS avgDurationMs
        FROM mcp_requests
        GROUP BY tool_name
        ORDER BY requestCount DESC`,
      )
      .all() as Array<{
      toolName: string;
      requestCount: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      avgDurationMs: number;
    }>;

    return rows.map((r) => ({
      toolName: r.toolName,
      requestCount: r.requestCount,
      totalInputTokens: r.totalInputTokens,
      totalOutputTokens: r.totalOutputTokens,
      avgDurationMs: Math.round(r.avgDurationMs),
    }));
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }

  /** Get daily token usage grouped by date (for dashboard charts) */
  getEventsByDay(): DailyTokenUsage[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          DATE(timestamp) AS date,
          SUM(token_count) AS totalTokens,
          COUNT(*) AS totalQueries
        FROM rag_events
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `,
      )
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
      .prepare(
        `
        SELECT * FROM rag_events ORDER BY timestamp DESC LIMIT ? OFFSET ?
      `,
      )
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

    const { total } = this.db.prepare('SELECT COUNT(*) AS total FROM rag_events').get() as {
      total: number;
    };

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
