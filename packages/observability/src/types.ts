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

/**
 * A single MCP tool call request — logged every time any MCP tool is invoked.
 */
export interface McpRequest {
  /** Unique request ID (UUIDv4) */
  id: string;
  /** Session identifier */
  sessionId: string;
  /** MCP tool name (e.g., search_codebase, get_file) */
  toolName: string;
  /** Input parameters as JSON object */
  inputParams: Record<string, unknown>;
  /** Full response content sent to the LLM */
  responseContent: string;
  /** Token count for input (query + params) */
  inputTokens: number;
  /** Token count for response content */
  outputTokens: number;
  /** Request duration in milliseconds */
  durationMs: number;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Whether response was truncated due to size limit */
  isTruncated: boolean;
}

/**
 * Options for listing MCP requests.
 */
export interface ListRequestsOptions {
  limit: number;
  offset: number;
  toolName?: string;
  from?: string;
  to?: string;
}

/**
 * Paginated list of MCP requests (without response content for list views).
 */
export interface RequestsPage {
  items: Omit<McpRequest, 'responseContent'>[];
  total: number;
}

/**
 * Aggregated request statistics.
 */
export interface RequestSummaryStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number;
  requestsToday: number;
}

/**
 * Daily request statistics.
 */
export interface DailyRequestStats {
  date: string;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number;
}

/**
 * Per-tool request statistics.
 */
export interface ToolRequestStats {
  toolName: string;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgDurationMs: number;
}

/**
 * Serializable representation of a Maven module graph for disk cache and SQLite storage.
 * Canonical source: @ia-framework/core packages/core/src/maven/types.ts
 */
export interface ModuleGraphJSON {
  version: 1;
  modules: Record<
    string,
    {
      coordinate: { groupId: string; artifactId: string; version: string };
      dependencies: string[];
      interfaces: string[];
      dtos: string[];
      pomPath: string;
      sourceRoot: string;
    }
  >;
}
