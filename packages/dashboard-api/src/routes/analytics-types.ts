/**
 * Response DTOs for the /api/analytics endpoints.
 * These are plain data shapes — no business logic.
 */

/** Single data point in the benchmark quality trend chart */
export interface BenchmarkTrendPoint {
  runId: string;
  label?: string;
  timestamp: string;
  mrr: number;
  hitAtK: number;
  avgLatencyMs: number;
  collectionName: string;
  isBaseline: boolean;
  /** Prompt template version number — captured from LlmStrategy.getMetadata() (D-02) */
  promptVersion?: number;
  /** SHA-256 hash of prompt content — for precise change tracking (D-02) */
  promptContentHash?: string;
}

/** One row in the strategy comparison table / chart */
export interface StrategyComparisonRow {
  collectionName: string;
  runCount: number;
  avgMrr: number;
  avgHitAtK: number;
  avgLatencyMs: number;
}

/** A single histogram bucket for reciprocalRank distribution */
export interface ScoreBucket {
  /** Human-readable label e.g. "0.0–0.1" */
  label: string;
  bucketStart: number;
  bucketEnd: number;
  count: number;
}

/** Score distribution for one strategy/collection */
export interface ScoreDistributionEntry {
  collectionName: string;
  buckets: ScoreBucket[];
  totalQueries: number;
}

/** Token usage breakdown per retrieval strategy */
export interface TokenBreakdownEntry {
  strategy: string;
  totalTokens: number;
  avgTokensPerQuery: number;
  totalQueries: number;
}
