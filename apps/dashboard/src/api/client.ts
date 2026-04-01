// Typed API client for the ia-framework Dashboard API.
// All response types are defined here as plain TypeScript interfaces —
// no imports from backend packages (avoids bundling server-only code).

export interface ApiStatus {
  qdrant: 'ok' | 'error';
  indexingInProgress: boolean;
  lastIndexedCommit: string | null;
  timestamp: string;
}

export interface DailyTokenUsage {
  date: string; // YYYY-MM-DD
  totalTokens: number;
  totalQueries: number;
}

export interface StrategyStats {
  strategy: string;
  totalQueries: number;
  totalTokens: number;
  avgTokensPerQuery: number;
}

export interface TotalStats {
  totalEvents: number;
  totalTokens: number;
  totalSessions: number;
  avgTokensPerQuery: number;
}

export interface ApiMetrics {
  totals: TotalStats;
  byStrategy: StrategyStats[];
  byDay: DailyTokenUsage[];
}

export interface RagEvent {
  id: string;
  sessionId: string;
  query: string;
  chunksRetrieved: number;
  chunkIds: string[];
  tokenCount: number;
  strategy: string;
  timestamp: string;
  latencyMs: number;
}

export interface ApiMetricsEvents {
  events: RagEvent[];
  total: number;
}

export interface ConfigSnapshot {
  embeddingProvider: string;
  embeddingModel: string;
  collectionName: string;
  topK: number;
  scoreThreshold: number;
}

export interface QueryResult {
  queryId: string;
  query: string;
  expectedFiles: string[];
  retrievedFiles: string[];
  hit: boolean;
  rank: number;
  reciprocalRank: number;
  latencyMs: number;
}

export interface BenchmarkRun {
  runId: string;
  label?: string;
  isBaseline: boolean;
  configSnapshot: ConfigSnapshot;
  queries: QueryResult[];
  hitAtK: number;
  mrr: number;
  avgLatencyMs: number;
  timestamp: string;
}

export interface ApiBenchmarks {
  runs: BenchmarkRun[];
}

export interface ProjectProfile {
  languages: string[];
  frameworks: string[];
  packageManager: string;
  testRunner?: string;
  buildCommand?: string;
  devCommand?: string;
}

export interface ProjectConfig {
  targetProjectPath: string;
  embedding: { provider: string; model: string };
  vectorStore: { host: string; port: number; collectionName: string };
  indexing?: { includePatterns: string[]; excludePatterns: string[] };
  profile?: ProjectProfile;
}

export interface ApiIndexingStatus {
  running: boolean;
  stage: string | null;
  filesTotal: number;
  filesProcessed: number;
  chunksTotal: number;
  chunksIndexed: number;
  currentFile: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface ApiTriggerResponse {
  message: string;
  startedAt: string;
}

// Base URL — same origin via Vite proxy in dev; relative path in production
const BASE = '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export const DashboardClient = {
  getStatus: () => get<ApiStatus>('/api/status'),
  getConfig: () => get<ProjectConfig>('/api/config'),
  getMetrics: () => get<ApiMetrics>('/api/metrics'),
  getMetricsEvents: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return get<ApiMetricsEvents>(`/api/metrics/events${q ? `?${q}` : ''}`);
  },
  getBenchmarks: (limit?: number) =>
    get<ApiBenchmarks>(`/api/benchmarks${limit ? `?limit=${limit}` : ''}`),
  getBenchmarkRun: (runId: string) => get<BenchmarkRun>(`/api/benchmarks/${runId}`),
  getIndexingStatus: () => get<ApiIndexingStatus>('/api/indexing/status'),
  triggerIndexing: (body?: { incremental?: boolean; label?: string }) =>
    post<ApiTriggerResponse>('/api/indexing/trigger', body),
};
