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
  indexing?: {
    includePatterns: string[];
    excludePatterns: string[];
    llm?: { model: string; ollamaUrl?: string };
  };
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

export interface ApiDbStatus {
  configured: boolean;
  connected: boolean;
  tableCount: number | null;
  error?: string;
}

// Search result DTO (per D-24)
export interface SearchResult {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
  source: 'ast' | 'llm';
  chunkType: string;
  matchedVector: string;
  content: string;
  description?: string;
}

// Per-query metrics (per D-24)
export interface SearchMetrics {
  latencyMs: number;
  chunksScanned: number;
  resultsReturned: number;
  scoreRange: { min: number; max: number };
}

// Search response (per D-24)
export interface SearchResponse {
  results: SearchResult[];
  metrics: SearchMetrics;
  historyId?: string;
}

// Search request body (per D-23)
export interface SearchRequest {
  query: string;
  limit: number;
  scoreThreshold: number;
  collections: string[];
}

// Collection info (per D-25)
export interface CollectionInfo {
  name: string;
  type: 'ast' | 'llm';
  chunkCount: number;
}

// Search history types (per DASH-12, DASH-13, DASH-14)
export interface SearchHistoryEntry {
  id: string;
  query: string;
  params: { limit: number; scoreThreshold: number; collections: string[] };
  results: SearchResult[];
  metrics: SearchMetrics;
  collection: string;
  resultCount: number;
  topScore: number;
  latencyMs: number;
  createdAt: string;
}

export interface SearchHistoryListResult {
  entries: SearchHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchHistoryFilters {
  q?: string;
  collection?: string;
  dateFrom?: string;
  dateTo?: string;
  minScore?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ReplayResponse {
  original: { results: SearchResult[]; metrics: SearchMetrics };
  fresh: { results: SearchResult[]; metrics: SearchMetrics };
  warning?: string;
}

// Analytics DTOs (mirror packages/dashboard-api/src/routes/analytics-types.ts)
export interface BenchmarkTrendPoint {
  runId: string;
  label?: string;
  timestamp: string;
  mrr: number;
  hitAtK: number;
  avgLatencyMs: number;
  collectionName: string;
  isBaseline: boolean;
  promptVersion?: number;
  promptContentHash?: string;
}

// Tuning DTOs (mirror packages/dashboard-api/src/routes/tuning-types.ts)
export interface ChunkBrowseEntry {
  chunkId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  chunkType: string;
  source: 'ast' | 'llm';
  qualityScore?: number;
  name?: string;
  content: string;
}

export interface ChunkBrowseResponse {
  chunks: ChunkBrowseEntry[];
  total: number;
}

/** A single search candidate in the unfiltered score analysis (mirrors tuning-types.ts) */
export interface ScoreCandidate {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
  source: 'ast' | 'llm';
  chunkType: string;
  content: string;
  aboveThreshold: boolean;
  isNearMiss: boolean;
}

/** Full score analysis response for a search history entry (mirrors tuning-types.ts) */
export interface ScoreAnalysisResponse {
  query: string;
  threshold: number;
  candidates: ScoreCandidate[];
  returnedCount: number;
  filteredCount: number;
  nearMissCount: number;
}

export interface StrategyComparisonRow {
  collectionName: string;
  runCount: number;
  avgMrr: number;
  avgHitAtK: number;
  avgLatencyMs: number;
}

export interface ScoreBucket {
  label: string;
  bucketStart: number;
  bucketEnd: number;
  count: number;
}

export interface ScoreDistributionEntry {
  collectionName: string;
  buckets: ScoreBucket[];
  totalQueries: number;
}

export interface TokenBreakdownEntry {
  strategy: string;
  totalTokens: number;
  avgTokensPerQuery: number;
  totalQueries: number;
}

// Base URL — same origin via Vite proxy in dev; relative path in production
const BASE = '';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const DashboardClient = {
  getStatus: () => get<ApiStatus>('/api/status'),
  getConfig: () => get<ProjectConfig>('/api/config'),
  updateConfig: async (patch: Partial<ProjectConfig>): Promise<ProjectConfig> => {
    const res = await fetch(`${BASE}/api/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`Config update error ${res.status}`);
    return res.json() as Promise<ProjectConfig>;
  },
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
  getDbStatus: () => get<ApiDbStatus>('/api/db/status'),
  getSearchCollections: () => get<CollectionInfo[]>('/api/search/collections'),
  search: async (request: SearchRequest): Promise<SearchResponse> => {
    const res = await fetch(`${BASE}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Search error ${res.status}`);
    return res.json() as Promise<SearchResponse>;
  },
  getSearchHistory: (filters?: SearchHistoryFilters) => {
    const qs = new URLSearchParams();
    if (filters?.q) qs.set('q', filters.q);
    if (filters?.collection) qs.set('collection', filters.collection);
    if (filters?.dateFrom) qs.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) qs.set('dateTo', filters.dateTo);
    if (filters?.minScore !== undefined) qs.set('minScore', String(filters.minScore));
    if (filters?.sortBy) qs.set('sortBy', filters.sortBy);
    if (filters?.sortOrder) qs.set('sortOrder', filters.sortOrder);
    if (filters?.page !== undefined) qs.set('page', String(filters.page));
    if (filters?.pageSize !== undefined) qs.set('pageSize', String(filters.pageSize));
    const q = qs.toString();
    return get<SearchHistoryListResult>(`/api/search/history${q ? `?${q}` : ''}`);
  },
  getSearchHistoryEntry: (id: string) => get<SearchHistoryEntry>(`/api/search/history/${id}`),
  replaySearch: async (id: string): Promise<ReplayResponse> => {
    const res = await fetch(`${BASE}/api/search/history/${id}/replay`, { method: 'POST' });
    if (!res.ok) throw new Error(`Replay error ${res.status}`);
    return res.json() as Promise<ReplayResponse>;
  },
  deleteSearchHistoryEntry: async (id: string): Promise<void> => {
    const res = await fetch(`${BASE}/api/search/history/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Delete error ${res.status}`);
  },
  clearSearchHistory: async (): Promise<void> => {
    const res = await fetch(`${BASE}/api/search/history`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Clear error ${res.status}`);
  },
  getAnalyticsBenchmarkTrends: (limit = 50) =>
    get<{ trends: BenchmarkTrendPoint[] }>(`/api/analytics/benchmark-trends?limit=${limit}`).then(
      (r) => r.trends,
    ),
  getAnalyticsStrategyComparison: () =>
    get<{ strategies: StrategyComparisonRow[] }>('/api/analytics/strategy-comparison').then(
      (r) => r.strategies,
    ),
  getAnalyticsScoreDistribution: () =>
    get<{ distributions: ScoreDistributionEntry[] }>('/api/analytics/score-distribution').then(
      (r) => r.distributions,
    ),
  getAnalyticsTokenBreakdown: () =>
    get<{ breakdown: TokenBreakdownEntry[] }>('/api/analytics/token-breakdown').then(
      (r) => r.breakdown,
    ),
  getTuningChunks: (params?: {
    collection?: string;
    minQuality?: number;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.collection) qs.set('collection', params.collection);
    if (params?.minQuality !== undefined) qs.set('minQuality', String(params.minQuality));
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return get<ChunkBrowseResponse>(`/api/tuning/chunks${q ? `?${q}` : ''}`);
  },
  getTuningScores: (historyId: string) =>
    get<ScoreAnalysisResponse>(`/api/tuning/scores/${historyId}`),
};
