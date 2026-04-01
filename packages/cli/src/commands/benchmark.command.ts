import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { loadConfig, createLogger } from '@ia-framework/core';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { SearchEngine } from '@ia-framework/retrieval';
import {
  BenchmarkRunner,
  BenchmarkStore,
  loadCorpus,
  scaffoldExampleCorpus,
  CorpusNotFoundError,
} from '@ia-framework/benchmark';
import type { BenchmarkConfig, BenchmarkRun, ConfigSnapshot } from '@ia-framework/benchmark';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConfigPath(options: { config?: string }): string {
  return (
    options.config ||
    process.env['IA_FRAMEWORK_CONFIG'] ||
    join(process.cwd(), '.ia-framework', 'project.json')
  );
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function pad(str: string, len: number): string {
  return str.padEnd(len);
}

function formatDate(iso: string): string {
  return iso.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
}

// ── run subcommand ────────────────────────────────────────────────────────────

function runSubcommand(): Command {
  return new Command('run')
    .description('Run benchmark queries against the indexed codebase')
    .option('-c, --config <path>', 'Path to project.json config')
    .option('-k, --top-k <n>', 'Number of results to retrieve per query', '10')
    .option('-t, --threshold <n>', 'Score threshold (0-1; use >1.0 for baseline)', '0.5')
    .option('-b, --baseline', 'Run no-RAG baseline (sets scoreThreshold=2.0)')
    .option('-l, --label <text>', 'Human-readable label for this run')
    .option('--corpus <path>', 'Path to benchmark-queries.json')
    .action(
      async (options: {
        config?: string;
        topK: string;
        threshold: string;
        baseline?: boolean;
        label?: string;
        corpus?: string;
      }) => {
        const logger = createLogger('cli:benchmark:run');
        const configPath = getConfigPath(options);
        const frameworkDir = dirname(configPath);

        try {
          const config = await loadConfig(configPath);
          const corpusPath = options.corpus ?? join(frameworkDir, 'benchmark-queries.json');

          // Try loading corpus — scaffold example on first run
          let queries;
          try {
            queries = await loadCorpus(corpusPath);
          } catch (err) {
            if (err instanceof CorpusNotFoundError) {
              await scaffoldExampleCorpus(corpusPath);
              console.log(`✓ Created example corpus: ${corpusPath}`);
              console.log(
                'Edit the file to match your codebase, then re-run: ia-framework benchmark run',
              );
              process.exit(0);
            }
            throw err;
          }

          // Build SearchEngine
          const embeddingProvider = createEmbeddingProvider(config.embedding);
          const vectorStore = new QdrantVectorStore({
            host: config.vectorStore.host,
            port: config.vectorStore.port,
            collectionName: config.vectorStore.collectionName,
            apiKey: config.vectorStore.apiKey,
          });
          const searchEngine = new SearchEngine({ embeddingProvider, vectorStore });

          // Build config
          const scoreThreshold = options.baseline ? 2.0 : parseFloat(options.threshold);
          const topK = options.baseline ? 10 : parseInt(options.topK, 10);
          const isNaN_topK = Number.isNaN(topK);
          const isNaN_threshold = Number.isNaN(scoreThreshold);

          const benchmarkConfig: BenchmarkConfig = {
            topK: isNaN_topK ? 10 : topK,
            scoreThreshold: isNaN_threshold ? 0.5 : scoreThreshold,
          };
          if (options.label !== undefined) {
            benchmarkConfig.label = options.label;
          }

          const configSnapshot: ConfigSnapshot = {
            embeddingProvider: config.embedding.provider,
            embeddingModel: config.embedding.model,
            collectionName: config.vectorStore.collectionName,
            topK: benchmarkConfig.topK,
            scoreThreshold: benchmarkConfig.scoreThreshold,
          };

          // Run benchmark
          const runner = new BenchmarkRunner(searchEngine, benchmarkConfig);
          const run = await runner.run(queries, configSnapshot);

          // Save to store
          const benchmarksDbPath = join(frameworkDir, 'benchmarks.sqlite');
          const store = new BenchmarkStore(benchmarksDbPath);
          store.saveRun(run);
          store.close();

          // Print results table
          printRunResults(run);
        } catch (error) {
          process.stderr.write(`✗ benchmark run failed: ${String(error)}\n`);
          logger.error({ error }, 'Benchmark run failed');
          process.exit(1);
        }
      },
    );
}

function printRunResults(run: BenchmarkRun): void {
  const label = run.label ?? formatDate(run.timestamp);
  const runShort = run.runId.slice(0, 8);

  console.log(`\nBenchmark Run: ${runShort} — ${label}`);
  const cs = run.configSnapshot;
  console.log(
    `Config: ${cs.embeddingProvider}/${cs.embeddingModel} | top-k=${cs.topK} | threshold=${cs.scoreThreshold.toFixed(2)}`,
  );
  console.log(`Baseline: ${run.isBaseline ? 'yes' : 'no'}\n`);

  // Table header
  const Q_WIDTH = 25;
  const HIT_WIDTH = 10;
  const RANK_WIDTH = 8;
  const LAT_WIDTH = 16;

  const top = `┌${'─'.repeat(Q_WIDTH + 2)}┬${'─'.repeat(HIT_WIDTH + 2)}┬${'─'.repeat(RANK_WIDTH + 2)}┬${'─'.repeat(LAT_WIDTH + 2)}┐`;
  const header = `│ ${pad('Query', Q_WIDTH)} │ ${pad(`Hit@${cs.topK}`, HIT_WIDTH)} │ ${pad('Rank', RANK_WIDTH)} │ ${pad('Latency', LAT_WIDTH)} │`;
  const mid = `├${'─'.repeat(Q_WIDTH + 2)}┼${'─'.repeat(HIT_WIDTH + 2)}┼${'─'.repeat(RANK_WIDTH + 2)}┼${'─'.repeat(LAT_WIDTH + 2)}┤`;
  const bottom = `└${'─'.repeat(Q_WIDTH + 2)}┴${'─'.repeat(HIT_WIDTH + 2)}┴${'─'.repeat(RANK_WIDTH + 2)}┴${'─'.repeat(LAT_WIDTH + 2)}┘`;

  console.log(top);
  console.log(header);
  console.log(mid);

  for (const qr of run.queries) {
    const q = truncate(qr.query, Q_WIDTH);
    const hit = qr.hit ? '✓' : '✗';
    const rank = qr.rank === Infinity ? '—' : String(qr.rank);
    const lat = `${qr.latencyMs}ms`;
    console.log(
      `│ ${pad(q, Q_WIDTH)} │ ${pad(hit, HIT_WIDTH)} │ ${pad(rank, RANK_WIDTH)} │ ${pad(lat, LAT_WIDTH)} │`,
    );
  }

  console.log(bottom);

  const total = run.queries.length;
  const hits = run.queries.filter((q) => q.hit).length;
  console.log(`\nSummary`);
  console.log(`  Hit@${cs.topK}:       ${run.hitAtK.toFixed(2)} (${hits}/${total} queries)`);
  console.log(`  MRR:          ${run.mrr.toFixed(2)}`);
  console.log(`  Avg Latency:  ${Math.round(run.avgLatencyMs)}ms`);
  console.log(`  Run ID:       ${runShort}`);
}

// ── list subcommand ───────────────────────────────────────────────────────────

function listSubcommand(): Command {
  return new Command('list')
    .description('List recent benchmark runs')
    .option('-c, --config <path>', 'Path to project.json config')
    .option('-n, --limit <n>', 'Number of runs to show', '10')
    .action(async (options: { config?: string; limit: string }) => {
      const logger = createLogger('cli:benchmark:list');
      const configPath = getConfigPath(options);
      const frameworkDir = dirname(configPath);

      try {
        const benchmarksDbPath = join(frameworkDir, 'benchmarks.sqlite');
        const store = new BenchmarkStore(benchmarksDbPath);
        const limit = parseInt(options.limit, 10);
        const runs = store.listRuns(Number.isNaN(limit) ? 10 : limit);
        store.close();

        if (runs.length === 0) {
          console.log('No benchmark runs yet. Run: ia-framework benchmark run');
          return;
        }

        console.log('Recent Benchmark Runs\n');
        const ID_W = 10;
        const TS_W = 20;
        const LABEL_W = 16;
        const HIT_W = 7;
        const MRR_W = 7;
        const BASE_W = 8;
        const divider = `${'─'.repeat(ID_W + TS_W + LABEL_W + HIT_W + MRR_W + BASE_W + 12)}`;

        console.log(
          `${'ID'.padEnd(ID_W)} ${'Timestamp'.padEnd(TS_W)} ${'Label'.padEnd(LABEL_W)} ${'Hit@K'.padEnd(HIT_W)} ${'MRR'.padEnd(MRR_W)} ${'Baseline'.padEnd(BASE_W)}`,
        );
        console.log(divider);

        for (const run of runs) {
          const id = run.runId.slice(0, 8);
          const ts = formatDate(run.timestamp).slice(0, TS_W);
          const label = truncate(run.label ?? '', LABEL_W);
          const hit = run.hitAtK.toFixed(2);
          const mrr = run.mrr.toFixed(2);
          const baseline = run.isBaseline ? 'yes' : 'no';
          console.log(
            `${id.padEnd(ID_W)} ${ts.padEnd(TS_W)} ${label.padEnd(LABEL_W)} ${hit.padEnd(HIT_W)} ${mrr.padEnd(MRR_W)} ${baseline.padEnd(BASE_W)}`,
          );
        }
      } catch (error) {
        process.stderr.write(`✗ benchmark list failed: ${String(error)}\n`);
        logger.error({ error }, 'Benchmark list failed');
        process.exit(1);
      }
    });
}

// ── history subcommand ────────────────────────────────────────────────────────

function historySubcommand(): Command {
  return new Command('history')
    .description('Show Hit@K trend across recent benchmark runs')
    .option('-c, --config <path>', 'Path to project.json config')
    .option('-n, --limit <n>', 'Number of runs to show', '20')
    .action(async (options: { config?: string; limit: string }) => {
      const logger = createLogger('cli:benchmark:history');
      const configPath = getConfigPath(options);
      const frameworkDir = dirname(configPath);

      try {
        const benchmarksDbPath = join(frameworkDir, 'benchmarks.sqlite');
        const store = new BenchmarkStore(benchmarksDbPath);
        const limit = parseInt(options.limit, 10);
        const runs = store.listRuns(Number.isNaN(limit) ? 20 : limit);
        store.close();

        if (runs.length < 2) {
          console.log(
            'Not enough runs for trend (need ≥2). Run: ia-framework benchmark run',
          );
          return;
        }

        // Reverse to chronological order (oldest → newest)
        const ordered = [...runs].reverse();

        const CHART_HEIGHT = 10;
        const CHART_WIDTH = ordered.length;

        console.log(`Hit@K Trend (last ${CHART_WIDTH} runs, oldest → newest)\n`);

        // Build chart rows top to bottom
        for (let row = CHART_HEIGHT; row >= 0; row--) {
          const threshold = row / CHART_HEIGHT;
          let line = '';

          if (row === CHART_HEIGHT) {
            line = `1.0 ┤`;
          } else if (row === 0) {
            line = `0.0 ┼`;
          } else {
            const label = threshold.toFixed(1);
            line = `${label} ┤`;
          }

          for (const run of ordered) {
            const normalizedHit = run.hitAtK;
            const filledRow = Math.round(normalizedHit * CHART_HEIGHT);

            if (row === 0) {
              line += '─';
            } else if (filledRow === row) {
              line += run.isBaseline ? '○' : '●';
            } else {
              line += ' ';
            }
          }

          console.log(line);
        }

        console.log('');
        console.log('● = run (baseline runs shown as ○)');
      } catch (error) {
        process.stderr.write(`✗ benchmark history failed: ${String(error)}\n`);
        logger.error({ error }, 'Benchmark history failed');
        process.exit(1);
      }
    });
}

// ── compare subcommand ────────────────────────────────────────────────────────

function compareSubcommand(): Command {
  return new Command('compare')
    .description('Compare two benchmark runs side-by-side')
    .argument('<runId1>', 'First run ID (full or prefix)')
    .argument('<runId2>', 'Second run ID (full or prefix)')
    .option('-c, --config <path>', 'Path to project.json config')
    .action(async (runId1: string, runId2: string, options: { config?: string }) => {
      const logger = createLogger('cli:benchmark:compare');
      const configPath = getConfigPath(options);
      const frameworkDir = dirname(configPath);

      try {
        const benchmarksDbPath = join(frameworkDir, 'benchmarks.sqlite');
        const store = new BenchmarkStore(benchmarksDbPath);

        // Resolve run IDs (support short prefix matching)
        const runA = resolveRun(store, runId1);
        const runB = resolveRun(store, runId2);
        store.close();

        if (!runA) {
          process.stderr.write(`✗ Run not found: ${runId1}\n`);
          process.exit(1);
          return;
        }
        if (!runB) {
          process.stderr.write(`✗ Run not found: ${runId2}\n`);
          process.exit(1);
          return;
        }

        printComparison(runA, runB);
      } catch (error) {
        process.stderr.write(`✗ benchmark compare failed: ${String(error)}\n`);
        logger.error({ error }, 'Benchmark compare failed');
        process.exit(1);
      }
    });
}

function resolveRun(store: BenchmarkStore, runIdOrPrefix: string): BenchmarkRun | null {
  // First try exact match
  const exact = store.getRunById(runIdOrPrefix);
  if (exact) return exact;

  // Then try prefix match via listRuns scan
  const allRuns = store.listRuns(1000);
  return allRuns.find((r) => r.runId.startsWith(runIdOrPrefix)) ?? null;
}

function printComparison(runA: BenchmarkRun, runB: BenchmarkRun): void {
  const DIVIDER = '═'.repeat(68);
  const COL_W = 21;

  console.log('\nBenchmark Comparison');
  console.log(DIVIDER);

  const aShort = runA.runId.slice(0, 8);
  const bShort = runB.runId.slice(0, 8);
  const aLabel = runA.label ? ` "${runA.label}"` : '';
  const bLabel = runB.label ? ` "${runB.label}"` : '';

  console.log(`\nRun A: ${aShort} — ${formatDate(runA.timestamp)}${aLabel}`);
  console.log(`Run B: ${bShort} — ${formatDate(runB.timestamp)}${bLabel}`);

  // Config + results table
  const ROW_LABEL_W = 21;
  const top = `┌${'─'.repeat(ROW_LABEL_W + 2)}┬${'─'.repeat(COL_W + 2)}┬${'─'.repeat(COL_W + 2)}┐`;
  const divRow = `├${'─'.repeat(ROW_LABEL_W + 2)}┼${'─'.repeat(COL_W + 2)}┼${'─'.repeat(COL_W + 2)}┤`;
  const bottom = `└${'─'.repeat(ROW_LABEL_W + 2)}┴${'─'.repeat(COL_W + 2)}┴${'─'.repeat(COL_W + 2)}┘`;

  const row = (label: string, a: string, b: string): string =>
    `│ ${label.padEnd(ROW_LABEL_W)} │ ${a.padEnd(COL_W)} │ ${b.padEnd(COL_W)} │`;

  console.log('');
  console.log(top);
  console.log(row('Config', 'Run A', 'Run B'));
  console.log(divRow);

  const csA = runA.configSnapshot;
  const csB = runB.configSnapshot;
  console.log(row('Provider', csA.embeddingProvider, csB.embeddingProvider));
  console.log(row('Model', truncate(csA.embeddingModel, COL_W), truncate(csB.embeddingModel, COL_W)));
  console.log(row('Collection', truncate(csA.collectionName, COL_W), truncate(csB.collectionName, COL_W)));
  console.log(row('Top-K', String(csA.topK), String(csB.topK)));

  const threshA = csA.scoreThreshold.toFixed(2) + (runA.isBaseline ? ' (baseline)' : '');
  const threshB = csB.scoreThreshold.toFixed(2) + (runB.isBaseline ? ' (baseline)' : '');
  console.log(row('Threshold', threshA, threshB));

  console.log(divRow);
  console.log(row('RESULTS', '', ''));
  console.log(divRow);

  // Hit@K
  const hitDelta = runA.hitAtK - runB.hitAtK;
  const hitArrow = hitDelta > 0 ? '↑' : hitDelta < 0 ? '↓' : '=';
  const hitAStr = `${runA.hitAtK.toFixed(2)}  ${hitArrow} ${hitDelta >= 0 ? '+' : ''}${hitDelta.toFixed(2)}`;
  console.log(row('Hit@K', hitAStr, runB.hitAtK.toFixed(2)));

  // MRR
  const mrrDelta = runA.mrr - runB.mrr;
  const mrrArrow = mrrDelta > 0 ? '↑' : mrrDelta < 0 ? '↓' : '=';
  const mrrAStr = `${runA.mrr.toFixed(2)}  ${mrrArrow} ${mrrDelta >= 0 ? '+' : ''}${mrrDelta.toFixed(2)}`;
  console.log(row('MRR', mrrAStr, runB.mrr.toFixed(2)));

  // Avg Latency
  console.log(row('Avg Latency', `${Math.round(runA.avgLatencyMs)}ms`, `${Math.round(runB.avgLatencyMs)}ms`));

  // Queries run
  console.log(row('Queries Run', String(runA.queries.length), String(runB.queries.length)));
  console.log(bottom);

  // Per-query breakdown
  console.log('\nPer-Query Breakdown');
  const Q_W = 26;
  const HIT_W = 12;
  const qTop = `┌${'─'.repeat(Q_W + 2)}┬${'─'.repeat(HIT_W + 2)}┬${'─'.repeat(HIT_W + 2)}┐`;
  const qMid = `├${'─'.repeat(Q_W + 2)}┼${'─'.repeat(HIT_W + 2)}┼${'─'.repeat(HIT_W + 2)}┤`;
  const qBottom = `└${'─'.repeat(Q_W + 2)}┴${'─'.repeat(HIT_W + 2)}┴${'─'.repeat(HIT_W + 2)}┘`;
  const qRow = (q: string, a: string, b: string): string =>
    `│ ${q.padEnd(Q_W)} │ ${a.padEnd(HIT_W)} │ ${b.padEnd(HIT_W)} │`;

  console.log(qTop);
  console.log(qRow('Query', 'Run A Hit', 'Run B Hit'));
  console.log(qMid);

  // Build unified query list
  const allQueryIds = new Set([
    ...runA.queries.map((q) => q.queryId),
    ...runB.queries.map((q) => q.queryId),
  ]);

  const aQueryMap = new Map(runA.queries.map((q) => [q.queryId, q]));
  const bQueryMap = new Map(runB.queries.map((q) => [q.queryId, q]));

  for (const qId of allQueryIds) {
    const aQ = aQueryMap.get(qId);
    const bQ = bQueryMap.get(qId);

    const queryText = truncate(aQ?.query ?? bQ?.query ?? qId, Q_W);
    const aHit = aQ ? (aQ.hit ? `✓ (rank ${aQ.rank})` : '✗') : '—';
    const bHit = bQ ? (bQ.hit ? `✓ (rank ${bQ.rank})` : '✗') : '—';

    console.log(qRow(queryText, aHit, bHit));
  }

  console.log(qBottom);

  // Verdict
  if (hitDelta > 0) {
    console.log(
      `\nVerdict: Run A outperforms Run B by +${hitDelta.toFixed(2)} Hit@K (+${mrrDelta.toFixed(2)} MRR)`,
    );
  } else if (hitDelta < 0) {
    console.log(
      `\nVerdict: Run B outperforms Run A by +${Math.abs(hitDelta).toFixed(2)} Hit@K (+${Math.abs(mrrDelta).toFixed(2)} MRR)`,
    );
  } else {
    console.log('\nVerdict: Runs are equivalent');
  }
}

// ── benchmarkCommand ──────────────────────────────────────────────────────────

export function benchmarkCommand(): Command {
  const benchmark = new Command('benchmark').description(
    'Benchmark RAG retrieval quality (Hit@K, MRR, latency)',
  );

  benchmark.addCommand(runSubcommand());
  benchmark.addCommand(listSubcommand());
  benchmark.addCommand(historySubcommand());
  benchmark.addCommand(compareSubcommand());

  return benchmark;
}
