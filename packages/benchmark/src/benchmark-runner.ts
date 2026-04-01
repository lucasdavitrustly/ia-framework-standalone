import type { RetrievalQuery, RetrievalResult } from '@ia-framework/retrieval';
import type {
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
export class BenchmarkRunner {
  constructor(
    private readonly searchEngine: { search(q: RetrievalQuery): Promise<RetrievalResult[]> },
    private readonly config: BenchmarkConfig,
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

    const run: BenchmarkRun = {
      runId: crypto.randomUUID(),
      isBaseline: this.config.scoreThreshold > 1.0,
      configSnapshot,
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
}
