import type { RetrievalQuery, RetrievalResult } from '@ia-framework/retrieval';
import type {
  BaselineResult,
  BenchmarkConfig,
  BenchmarkQuery,
  BenchmarkRun,
  ConfigSnapshot,
  QueryResult,
} from './types.js';

/**
 * Runs a set of benchmark queries against a SearchEngine and computes retrieval quality metrics.
 *
 * Metrics computed:
 * - Hit@K: fraction of queries where at least one expected file appears in top-K results
 * - MRR: Mean Reciprocal Rank — average of 1/rank for each query (0 when not found)
 * - avgLatencyMs: average per-query latency in milliseconds
 *
 * No-RAG baseline: set config.scoreThreshold > 1.0 (e.g. 2.0) to force all queries
 * to return empty results, establishing a no-RAG baseline for comparison.
 */
export interface PromptMetadataProvider {
  getMetadata(): { promptVersion: number; promptContentHash: string };
}

export class BenchmarkRunner {
  constructor(
    private readonly searchEngine: { search(q: RetrievalQuery): Promise<RetrievalResult[]> },
    private readonly config: BenchmarkConfig,
    private readonly metadataProvider?: PromptMetadataProvider,
  ) {}

  async run(queries: BenchmarkQuery[], configSnapshot: ConfigSnapshot): Promise<BenchmarkRun> {
    const queryResults: QueryResult[] = [];

    for (const q of queries) {
      const start = Date.now();
      const results = await this.searchEngine.search({
        text: q.query,
        limit: this.config.topK,
        scoreThreshold: this.config.scoreThreshold,
      });
      const latencyMs = Date.now() - start;

      const retrievedFiles = results.map((r) => r.relativePath);
      const hit = q.expectedFiles.some((f) => retrievedFiles.includes(f));
      const firstMatchIndex = hit
        ? retrievedFiles.findIndex((f) => q.expectedFiles.includes(f))
        : -1;
      const rank = hit ? firstMatchIndex + 1 : Infinity;
      const reciprocalRank = hit ? 1 / rank : 0;

      queryResults.push({
        queryId: q.id,
        query: q.query,
        expectedFiles: q.expectedFiles,
        retrievedFiles,
        hit,
        rank,
        reciprocalRank,
        latencyMs,
      });
    }

    const total = queryResults.length;
    const hitAtK = total > 0 ? queryResults.filter((qr) => qr.hit).length / total : 0;
    const mrr =
      total > 0 ? queryResults.reduce((sum, qr) => sum + qr.reciprocalRank, 0) / total : 0;
    const avgLatencyMs =
      total > 0 ? queryResults.reduce((sum, qr) => sum + qr.latencyMs, 0) / total : 0;

    const snapshotWithMeta: ConfigSnapshot = this.metadataProvider
      ? {
          ...configSnapshot,
          ...this.metadataProvider.getMetadata(),
        }
      : configSnapshot;

    const run: BenchmarkRun = {
      runId: crypto.randomUUID(),
      isBaseline: this.config.scoreThreshold > 1.0,
      configSnapshot: snapshotWithMeta,
      queries: queryResults,
      hitAtK,
      mrr,
      avgLatencyMs,
      timestamp: new Date().toISOString(),
    };

    if (this.config.label !== undefined) {
      run.label = this.config.label;
    }

    return run;
  }

  async runBaseline(
    queries: BenchmarkQuery[],
    configSnapshot: ConfigSnapshot,
  ): Promise<BaselineResult> {
    const NUM_RUNS = 3;
    const runs: BenchmarkRun[] = [];
    for (let i = 0; i < NUM_RUNS; i++) {
      runs.push(await this.run(queries, configSnapshot));
    }
    const mrrs = runs.map((r) => r.mrr);
    const avgMrr = mrrs.reduce((a, b) => a + b, 0) / NUM_RUNS;
    const mrrStddev = Math.sqrt(mrrs.reduce((sum, m) => sum + (m - avgMrr) ** 2, 0) / NUM_RUNS);
    return {
      baselineId: crypto.randomUUID(),
      runs,
      avgMrr,
      avgHitAtK: runs.reduce((s, r) => s + r.hitAtK, 0) / NUM_RUNS,
      avgLatencyMs: runs.reduce((s, r) => s + r.avgLatencyMs, 0) / NUM_RUNS,
      mrrStddev,
      configSnapshot: this.metadataProvider
        ? { ...configSnapshot, ...this.metadataProvider.getMetadata() }
        : configSnapshot,
      timestamp: new Date().toISOString(),
    };
  }
}
