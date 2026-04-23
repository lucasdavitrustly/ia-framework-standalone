/**
 * Domain types for the benchmark package.
 * These are pure TypeScript interfaces — no implementation.
 */

/** A single benchmark query with expected file(s) that should appear in top-K results. */
export interface BenchmarkQuery {
  /** Unique identifier for the query (e.g. "auth-middleware") */
  id: string;
  /** Natural language query text */
  query: string;
  /** Relative paths expected in retrieval results (e.g. ["src/middleware/auth.ts"]) */
  expectedFiles: string[];
  /** Optional human-readable description of what this query tests */
  description?: string;
}

/** Result of running a single benchmark query against the search engine. */
export interface QueryResult {
  queryId: string;
  query: string;
  expectedFiles: string[];
  /** relativePath of each RetrievalResult returned by the search engine */
  retrievedFiles: string[];
  /** true if ANY expectedFile appears in retrievedFiles */
  hit: boolean;
  /** 1-indexed position of first expected file; Infinity if not found */
  rank: number;
  /** 1/rank; 0 if not found */
  reciprocalRank: number;
  latencyMs: number;
}

/** Snapshot of configuration used for a benchmark run — enables comparison across configurations. */
export interface ConfigSnapshot {
  embeddingProvider: string;
  embeddingModel: string;
  collectionName: string;
  topK: number;
  scoreThreshold: number;
  /** Prompt template version number — from LlmStrategy.getMetadata() (D-02, DTUN-04) */
  promptVersion?: number;
  /** SHA-256 hash of prompt content — from LlmStrategy.getMetadata() (D-02, DTUN-04) */
  promptContentHash?: string;
}

/** Aggregated results of a full benchmark run across all queries. */
export interface BenchmarkRun {
  /** UUID identifier */
  runId: string;
  /** Optional human-readable label */
  label?: string;
  /** true when scoreThreshold > 1.0 (no-RAG baseline run) */
  isBaseline: boolean;
  configSnapshot: ConfigSnapshot;
  queries: QueryResult[];
  /** Fraction of queries with hit=true (0–1) */
  hitAtK: number;
  /** Mean Reciprocal Rank — mean of all reciprocalRank values (0–1) */
  mrr: number;
  avgLatencyMs: number;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/** Result of a 3-run baseline benchmark with averaged metrics and stddev. */
export interface BaselineResult {
  /** UUID identifier for this baseline */
  baselineId: string;
  /** The 3 individual BenchmarkRun objects */
  runs: BenchmarkRun[];
  /** Average MRR across 3 runs */
  avgMrr: number;
  /** Average Hit@K across 3 runs */
  avgHitAtK: number;
  /** Average latency across 3 runs */
  avgLatencyMs: number;
  /** Standard deviation of MRR across 3 runs */
  mrrStddev: number;
  configSnapshot: ConfigSnapshot;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional human-readable label */
  label?: string;
}

/** Configuration for running a benchmark. */
export interface BenchmarkConfig {
  /** Number of results to retrieve per query (default: 10) */
  topK: number;
  /** Minimum score threshold (default: 0.5; set >1.0 for no-RAG baseline) */
  scoreThreshold: number;
  /** Optional human-readable label for this run */
  label?: string;
}
