import Database from 'better-sqlite3';
import type { BaselineResult, BenchmarkRun, QueryResult } from './types.js';

/**
 * SQLite-backed store for benchmark runs and query results.
 * Uses better-sqlite3 synchronous API for simplicity and reliability.
 * All operations are synchronous — no async/await needed.
 *
 * Note: Infinity is stored as 1e308 (max SQLite REAL) and restored on read.
 */
export class BenchmarkStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS benchmark_runs (
        run_id          TEXT PRIMARY KEY,
        label           TEXT,
        is_baseline     INTEGER NOT NULL,
        config_snapshot TEXT NOT NULL,
        hit_at_k        REAL NOT NULL,
        mrr             REAL NOT NULL,
        avg_latency_ms  REAL NOT NULL,
        timestamp       TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS benchmark_query_results (
        id              TEXT PRIMARY KEY,
        run_id          TEXT NOT NULL REFERENCES benchmark_runs(run_id),
        query_id        TEXT NOT NULL,
        query           TEXT NOT NULL,
        expected_files  TEXT NOT NULL,
        retrieved_files TEXT NOT NULL,
        hit             INTEGER NOT NULL,
        rank            REAL NOT NULL,
        reciprocal_rank REAL NOT NULL,
        latency_ms      INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_bqr_run_id ON benchmark_query_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_br_timestamp ON benchmark_runs(timestamp);

      CREATE TABLE IF NOT EXISTS baseline_runs (
        baseline_id    TEXT PRIMARY KEY,
        label          TEXT,
        avg_mrr        REAL NOT NULL,
        avg_hit_at_k   REAL NOT NULL,
        avg_latency_ms REAL NOT NULL,
        mrr_stddev     REAL NOT NULL,
        config_snapshot TEXT NOT NULL,
        run_ids        TEXT NOT NULL,
        timestamp      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_baseline_timestamp ON baseline_runs(timestamp);
    `);
  }

  /** Save a benchmark run and all its query results in a single transaction. */
  saveRun(run: BenchmarkRun): void {
    const insertRun = this.db.prepare(`
      INSERT INTO benchmark_runs
        (run_id, label, is_baseline, config_snapshot, hit_at_k, mrr, avg_latency_ms, timestamp)
      VALUES
        (@runId, @label, @isBaseline, @configSnapshot, @hitAtK, @mrr, @avgLatencyMs, @timestamp)
    `);

    const insertQuery = this.db.prepare(`
      INSERT INTO benchmark_query_results
        (id, run_id, query_id, query, expected_files, retrieved_files, hit, rank, reciprocal_rank, latency_ms)
      VALUES
        (@id, @runId, @queryId, @query, @expectedFiles, @retrievedFiles, @hit, @rank, @reciprocalRank, @latencyMs)
    `);

    const transaction = this.db.transaction(() => {
      insertRun.run({
        runId: run.runId,
        label: run.label ?? null,
        isBaseline: run.isBaseline ? 1 : 0,
        configSnapshot: JSON.stringify(run.configSnapshot),
        hitAtK: run.hitAtK,
        mrr: run.mrr,
        avgLatencyMs: run.avgLatencyMs,
        timestamp: run.timestamp,
      });

      for (const q of run.queries) {
        insertQuery.run({
          id: crypto.randomUUID(),
          runId: run.runId,
          queryId: q.queryId,
          query: q.query,
          expectedFiles: JSON.stringify(q.expectedFiles),
          retrievedFiles: JSON.stringify(q.retrievedFiles),
          hit: q.hit ? 1 : 0,
          // Infinity cannot be stored in SQLite REAL — use 1e308 sentinel
          rank: q.rank === Infinity ? 1e308 : q.rank,
          reciprocalRank: q.reciprocalRank,
          latencyMs: q.latencyMs,
        });
      }
    });

    transaction();
  }

  /** Retrieve a benchmark run by its ID, including all query results. Returns null if not found. */
  getRunById(runId: string): BenchmarkRun | null {
    const runRow = this.db
      .prepare(
        `SELECT run_id, label, is_baseline, config_snapshot, hit_at_k, mrr, avg_latency_ms, timestamp
         FROM benchmark_runs WHERE run_id = ?`,
      )
      .get(runId) as RunRow | undefined;

    if (!runRow) return null;

    const queryRows = this.db
      .prepare(
        `SELECT query_id, query, expected_files, retrieved_files, hit, rank, reciprocal_rank, latency_ms
         FROM benchmark_query_results WHERE run_id = ? ORDER BY rowid`,
      )
      .all(runId) as QueryRow[];

    return rowToRun(runRow, queryRows);
  }

  /** List benchmark runs ordered by timestamp DESC (newest first). Default limit: 20. */
  listRuns(limit = 20): BenchmarkRun[] {
    const runRows = this.db
      .prepare(
        `SELECT run_id, label, is_baseline, config_snapshot, hit_at_k, mrr, avg_latency_ms, timestamp
         FROM benchmark_runs ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(limit) as RunRow[];

    return runRows.map((runRow) => {
      const queryRows = this.db
        .prepare(
          `SELECT query_id, query, expected_files, retrieved_files, hit, rank, reciprocal_rank, latency_ms
           FROM benchmark_query_results WHERE run_id = ? ORDER BY rowid`,
        )
        .all(runRow.run_id) as QueryRow[];
      return rowToRun(runRow, queryRows);
    });
  }

  /**
   * Delete all benchmark runs and their query results from the database.
   * Both tables are cleared atomically in a single transaction.
   */
  clearRuns(): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM benchmark_query_results').run();
      this.db.prepare('DELETE FROM benchmark_runs').run();
    });
    transaction();
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  /** Save a BaselineResult (3-run average) and all individual runs in a single transaction. */
  saveBaseline(baseline: BaselineResult): void {
    const insertBaseline = this.db.prepare(`
      INSERT INTO baseline_runs
        (baseline_id, label, avg_mrr, avg_hit_at_k, avg_latency_ms, mrr_stddev, config_snapshot, run_ids, timestamp)
      VALUES
        (@baselineId, @label, @avgMrr, @avgHitAtK, @avgLatencyMs, @mrrStddev, @configSnapshot, @runIds, @timestamp)
    `);

    const transaction = this.db.transaction(() => {
      // Save individual runs first (FK refs from baseline)
      for (const run of baseline.runs) {
        this.saveRun(run);
      }
      insertBaseline.run({
        baselineId: baseline.baselineId,
        label: baseline.label ?? null,
        avgMrr: baseline.avgMrr,
        avgHitAtK: baseline.avgHitAtK,
        avgLatencyMs: baseline.avgLatencyMs,
        mrrStddev: baseline.mrrStddev,
        configSnapshot: JSON.stringify(baseline.configSnapshot),
        runIds: JSON.stringify(baseline.runs.map((r) => r.runId)),
        timestamp: baseline.timestamp,
      });
    });

    transaction();
  }

  /** Return the most recently created BaselineResult, or null if none exist. */
  getLatestBaseline(): BaselineResult | null {
    const row = this.db
      .prepare(
        `SELECT baseline_id, label, avg_mrr, avg_hit_at_k, avg_latency_ms, mrr_stddev,
                config_snapshot, run_ids, timestamp
         FROM baseline_runs ORDER BY timestamp DESC LIMIT 1`,
      )
      .get() as BaselineRow | undefined;

    if (!row) return null;

    const runIds: string[] = JSON.parse(row.run_ids) as string[];
    const runs: BenchmarkRun[] = runIds
      .map((id) => this.getRunById(id))
      .filter((r): r is BenchmarkRun => r !== null);

    const result: BaselineResult = {
      baselineId: row.baseline_id,
      runs,
      avgMrr: row.avg_mrr,
      avgHitAtK: row.avg_hit_at_k,
      avgLatencyMs: row.avg_latency_ms,
      mrrStddev: row.mrr_stddev,
      configSnapshot: JSON.parse(row.config_snapshot) as BaselineResult['configSnapshot'],
      timestamp: row.timestamp,
    };

    if (row.label !== null) {
      result.label = row.label;
    }

    return result;
  }
}

interface BaselineRow {
  baseline_id: string;
  label: string | null;
  avg_mrr: number;
  avg_hit_at_k: number;
  avg_latency_ms: number;
  mrr_stddev: number;
  config_snapshot: string;
  run_ids: string;
  timestamp: string;
}

// ── Row shapes ────────────────────────────────────────────────────────────────

interface RunRow {
  run_id: string;
  label: string | null;
  is_baseline: number;
  config_snapshot: string;
  hit_at_k: number;
  mrr: number;
  avg_latency_ms: number;
  timestamp: string;
}

interface QueryRow {
  query_id: string;
  query: string;
  expected_files: string;
  retrieved_files: string;
  hit: number;
  rank: number;
  reciprocal_rank: number;
  latency_ms: number;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function rowToQueryResult(row: QueryRow, runId: string): QueryResult {
  return {
    queryId: row.query_id,
    query: row.query,
    expectedFiles: JSON.parse(row.expected_files) as string[],
    retrievedFiles: JSON.parse(row.retrieved_files) as string[],
    hit: row.hit === 1,
    // Restore Infinity from 1e308 sentinel
    rank: row.rank >= 1e307 ? Infinity : row.rank,
    reciprocalRank: row.reciprocal_rank,
    latencyMs: row.latency_ms,
  };
  void runId; // runId not stored on QueryResult type but used for DB join
}

function rowToRun(runRow: RunRow, queryRows: QueryRow[]): BenchmarkRun {
  const run: BenchmarkRun = {
    runId: runRow.run_id,
    isBaseline: runRow.is_baseline === 1,
    configSnapshot: JSON.parse(runRow.config_snapshot) as BenchmarkRun['configSnapshot'],
    queries: queryRows.map((qr) => rowToQueryResult(qr, runRow.run_id)),
    hitAtK: runRow.hit_at_k,
    mrr: runRow.mrr,
    avgLatencyMs: runRow.avg_latency_ms,
    timestamp: runRow.timestamp,
  };

  if (runRow.label !== null) {
    run.label = runRow.label;
  }

  return run;
}
