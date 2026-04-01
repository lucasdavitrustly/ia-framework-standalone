/**
 * A single RAG interaction event — logged every time a retrieval query is made.
 */
export interface RagEvent {
  /** Unique event ID (UUIDv4) */
  id: string;
  /** Session identifier (e.g. YYYY-MM-DD-{pid}) */
  sessionId: string;
  /** The natural language query text */
  query: string;
  /** Number of chunks retrieved */
  chunksRetrieved: number;
  /** Chunk IDs returned */
  chunkIds: string[];
  /** Estimated token count of query + all retrieved chunk content */
  tokenCount: number;
  /** Retrieval strategy used */
  strategy: 'mcp' | 'auto-context' | 'combined';
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Total latency in milliseconds */
  latencyMs: number;
}

/**
 * Aggregated statistics for a single session.
 */
export interface SessionStats {
  sessionId: string;
  totalQueries: number;
  totalTokens: number;
  totalChunks: number;
  avgLatencyMs: number;
  /** ISO timestamp of first query in session */
  firstQuery: string;
  /** ISO timestamp of last query in session */
  lastQuery: string;
}

/**
 * Aggregated statistics per retrieval strategy.
 */
export interface StrategyStats {
  strategy: string;
  totalQueries: number;
  totalTokens: number;
  avgTokensPerQuery: number;
}

/**
 * Overall totals across all sessions and strategies.
 */
export interface TotalStats {
  totalEvents: number;
  totalTokens: number;
  totalSessions: number;
  avgTokensPerQuery: number;
}

/**
 * Daily token usage aggregation for dashboard charts.
 */
export interface DailyTokenUsage {
  /** Date in YYYY-MM-DD format */
  date: string;
  totalTokens: number;
  totalQueries: number;
}

/**
 * Paginated list of RAG events.
 */
export interface EventsPage {
  events: RagEvent[];
  total: number;
}
