import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createLogger, loadConfig } from '@ia-framework/core';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { SearchEngine } from '@ia-framework/retrieval';
import {
  BenchmarkRunner,
  loadCorpus,
  validateCorpus,
  CorpusNotFoundError,
} from '@ia-framework/benchmark';
import type { BenchmarkConfig, BenchmarkRun, ConfigSnapshot } from '@ia-framework/benchmark';

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function colorDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  const formatted = `${sign}${delta.toFixed(2)}`;
  if (delta > 0) return `${GREEN}${formatted}${RESET}`;
  if (delta < 0) return `${RED}${formatted}${RESET}`;
  return formatted;
}

function pad(str: string, len: number): string {
  // Strip ANSI escape codes for padding calculation
  const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padNeeded = Math.max(0, len - plain.length);
  return str + ' '.repeat(padNeeded);
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

// ── Comparison formatting (exported for testing) ──────────────────────────────

export function formatComparisonTable(
  runA: BenchmarkRun,
  runB: BenchmarkRun,
  v1: number,
  v2: number,
): string {
  const Q_WIDTH = 25;
  const MRR_WIDTH = 10;
  const DELTA_WIDTH = 9;

  const top = `┌${'─'.repeat(Q_WIDTH + 2)}┬${'─'.repeat(MRR_WIDTH + 2)}┬${'─'.repeat(MRR_WIDTH + 2)}┬${'─'.repeat(DELTA_WIDTH + 2)}┐`;
  const header = `│ ${pad(`Query`, Q_WIDTH)} │ ${pad(`MRR-v${v1}`, MRR_WIDTH)} │ ${pad(`MRR-v${v2}`, MRR_WIDTH)} │ ${pad('Delta', DELTA_WIDTH)} │`;
  const mid = `├${'─'.repeat(Q_WIDTH + 2)}┼${'─'.repeat(MRR_WIDTH + 2)}┼${'─'.repeat(MRR_WIDTH + 2)}┼${'─'.repeat(DELTA_WIDTH + 2)}┤`;
  const bottom = `└${'─'.repeat(Q_WIDTH + 2)}┴${'─'.repeat(MRR_WIDTH + 2)}┴${'─'.repeat(MRR_WIDTH + 2)}┴${'─'.repeat(DELTA_WIDTH + 2)}┘`;

  const aMap = new Map(runA.queries.map((q) => [q.queryId, q]));
  const bMap = new Map(runB.queries.map((q) => [q.queryId, q]));
  const allIds = new Set([
    ...runA.queries.map((q) => q.queryId),
    ...runB.queries.map((q) => q.queryId),
  ]);

  const lines: string[] = [top, header, mid];

  for (const qId of allIds) {
    const aQ = aMap.get(qId);
    const bQ = bMap.get(qId);
    const queryText = truncate(aQ?.query ?? bQ?.query ?? qId, Q_WIDTH);
    const mrrA = aQ ? aQ.reciprocalRank.toFixed(2) : '—';
    const mrrB = bQ ? bQ.reciprocalRank.toFixed(2) : '—';
    const delta = (aQ ? aQ.reciprocalRank : 0) - (bQ ? bQ.reciprocalRank : 0);
    const deltaStr = aQ && bQ ? colorDelta(delta) : '—';

    lines.push(
      `│ ${pad(queryText, Q_WIDTH)} │ ${pad(mrrA, MRR_WIDTH)} │ ${pad(mrrB, MRR_WIDTH)} │ ${pad(deltaStr, DELTA_WIDTH)} │`,
    );
  }

  lines.push(bottom);

  const overallDelta = runB.mrr - runA.mrr;
  lines.push('');
  lines.push(`Summary:`);
  lines.push(
    `  v${v1} MRR: ${runA.mrr.toFixed(2)} | v${v2} MRR: ${runB.mrr.toFixed(2)} | Delta: ${colorDelta(overallDelta)}`,
  );

  return lines.join('\n');
}

export function generateComparisonReport(
  runA: BenchmarkRun,
  runB: BenchmarkRun,
  v1: number,
  v2: number,
): string {
  const timestamp = new Date().toISOString();
  const aMap = new Map(runA.queries.map((q) => [q.queryId, q]));
  const bMap = new Map(runB.queries.map((q) => [q.queryId, q]));
  const allIds = new Set([
    ...runA.queries.map((q) => q.queryId),
    ...runB.queries.map((q) => q.queryId),
  ]);

  const overallDelta = runB.mrr - runA.mrr;
  const sign = overallDelta >= 0 ? '+' : '';

  const lines: string[] = [
    `## Prompt Comparison: v${v1} vs v${v2}`,
    '',
    `**Generated:** ${timestamp}`,
    '',
    '| Query | MRR-v' + v1 + ' | MRR-v' + v2 + ' | Delta |',
    '|-------|--------|--------|-------|',
  ];

  for (const qId of allIds) {
    const aQ = aMap.get(qId);
    const bQ = bMap.get(qId);
    const queryText = aQ?.query ?? bQ?.query ?? qId;
    const mrrA = aQ ? aQ.reciprocalRank.toFixed(2) : '—';
    const mrrB = bQ ? bQ.reciprocalRank.toFixed(2) : '—';
    const delta =
      aQ && bQ
        ? (bQ.reciprocalRank - aQ.reciprocalRank >= 0 ? '+' : '') +
          (bQ.reciprocalRank - aQ.reciprocalRank).toFixed(2)
        : '—';
    lines.push(`| ${queryText} | ${mrrA} | ${mrrB} | ${delta} |`);
  }

  lines.push('');
  lines.push(
    `**Summary:** v${v1} MRR: ${runA.mrr.toFixed(2)} | v${v2} MRR: ${runB.mrr.toFixed(2)} | Delta: ${sign}${overallDelta.toFixed(2)}`,
  );

  return lines.join('\n');
}

// ── bump subcommand ───────────────────────────────────────────────────────────

function bumpSubcommand(): Command {
  return new Command('bump')
    .description('Increment the prompt version counter (invalidates LLM chunk cache)')
    .option('-c, --config <path>', 'Path to project.json config')
    .action(async (options: { config?: string }) => {
      const logger = createLogger('cli:prompt:bump');
      const configPath =
        options.config ||
        process.env['IA_FRAMEWORK_CONFIG'] ||
        join(process.cwd(), '.ia-framework', 'project.json');

      try {
        // Read raw JSON to preserve formatting
        const raw = await readFile(configPath, 'utf-8');
        const config = JSON.parse(raw) as Record<string, unknown>;

        const currentVersion =
          typeof config['promptVersion'] === 'number' ? config['promptVersion'] : 1;
        const newVersion = currentVersion + 1;
        config['promptVersion'] = newVersion;

        await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

        console.log(`✓ Prompt version bumped: ${currentVersion} → ${newVersion}`);
        console.log(`  Cache keys now include version ${newVersion}`);
        console.log(`  Next LLM indexing will re-process all files.`);
      } catch (error) {
        process.stderr.write(`✗ prompt bump failed: ${String(error)}\n`);
        logger.error({ error }, 'Prompt bump failed');
        process.exit(1);
      }
    });
}

// ── compare subcommand ────────────────────────────────────────────────────────

function compareSubcommand(): Command {
  return new Command('compare')
    .description('Compare two prompt versions: full re-index + benchmark for each, then diff')
    .argument('<v1>', 'First prompt version number')
    .argument('<v2>', 'Second prompt version number')
    .option('-c, --config <path>', 'Path to project.json config')
    .option('--corpus <path>', 'Path to benchmark-queries.json')
    .option('-o, --output <path>', 'Output path for markdown report')
    .action(
      async (
        v1Str: string,
        v2Str: string,
        options: { config?: string; corpus?: string; output?: string },
      ) => {
        const configPath =
          options.config ||
          process.env['IA_FRAMEWORK_CONFIG'] ||
          join(process.cwd(), '.ia-framework', 'project.json');
        const frameworkDir = dirname(configPath);

        const v1 = parseInt(v1Str, 10);
        const v2 = parseInt(v2Str, 10);

        if (Number.isNaN(v1) || v1 < 1) {
          process.stderr.write(`✗ Invalid v1 version: "${v1Str}". Must be a positive integer.\n`);
          process.exit(1);
          return;
        }
        if (Number.isNaN(v2) || v2 < 1) {
          process.stderr.write(`✗ Invalid v2 version: "${v2Str}". Must be a positive integer.\n`);
          process.exit(1);
          return;
        }

        // Read raw config for mutation/restore
        const raw = await readFile(configPath, 'utf-8');
        const rawConfig = JSON.parse(raw) as Record<string, unknown>;
        const originalVersion = rawConfig['promptVersion'];

        try {
          const config = await loadConfig(configPath);
          const corpusPath = options.corpus ?? join(frameworkDir, 'benchmark-queries.json');

          // Load corpus
          let queries;
          try {
            queries = await loadCorpus(corpusPath);
          } catch (err) {
            if (err instanceof CorpusNotFoundError) {
              process.stderr.write(`✗ Benchmark corpus not found: ${corpusPath}\n`);
              process.stderr.write(`  Run: ia-framework benchmark init-corpus\n`);
              process.exit(1);
              return;
            }
            throw err;
          }

          // Validate corpus
          const validationErrors = await validateCorpus(queries, config.targetProjectPath ?? '');
          if (validationErrors.length > 0) {
            for (const err of validationErrors) {
              console.error(`  [corpus] [${err.queryId}] ${err.error}`);
            }
            process.exit(1);
            return;
          }

          // Build SearchEngine
          const qdrantHost = process.env['QDRANT_HOST'] ?? 'localhost';
          const embeddingProvider = createEmbeddingProvider(config.embedding);
          const vectorStore = new QdrantVectorStore({
            host: qdrantHost,
            port: config.vectorStore.port,
            collectionName: config.vectorStore.collectionName,
            apiKey: config.vectorStore.apiKey,
          });
          const searchEngine = new SearchEngine({ embeddingProvider, vectorStore });

          const benchmarkConfig: BenchmarkConfig = {
            topK: 10,
            scoreThreshold: 0.5,
          };
          const configSnapshot: ConfigSnapshot = {
            embeddingProvider: config.embedding.provider,
            embeddingModel: config.embedding.model,
            collectionName: config.vectorStore.collectionName,
            topK: benchmarkConfig.topK,
            scoreThreshold: benchmarkConfig.scoreThreshold,
          };

          const runner = new BenchmarkRunner(searchEngine, benchmarkConfig);
          const runs: BenchmarkRun[] = [];

          for (const version of [v1, v2]) {
            console.log(`\n◆ Testing prompt version ${version}...`);

            // Write promptVersion to config on disk
            rawConfig['promptVersion'] = version;
            await writeFile(configPath, JSON.stringify(rawConfig, null, 2) + '\n', 'utf-8');

            // Run full re-index via subprocess (inherits env for IA_PROMPT_VERSION)
            console.log(`  Re-indexing with prompt version ${version}...`);
            execFileSync(
              process.argv[0]!,
              [process.argv[1]!, 'index', '--config', configPath, '--force', '--strategy', 'llm'],
              {
                stdio: 'inherit',
                env: { ...process.env, IA_PROMPT_VERSION: String(version) },
              },
            );

            // Run benchmark
            console.log(`  Running benchmark...`);
            const run = await runner.run(queries, {
              ...configSnapshot,
              embeddingProvider: config.embedding.provider,
            });
            runs.push(run);
          }

          const [runA, runB] = runs as [BenchmarkRun, BenchmarkRun];

          // Display comparison table
          console.log(`\nPrompt Comparison: v${v1} vs v${v2}\n`);
          console.log(formatComparisonTable(runA, runB, v1, v2));

          // Save markdown report
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const defaultOutputPath = join(
            frameworkDir,
            `prompt-compare-v${v1}-v${v2}-${timestamp}.md`,
          );
          const outputPath = options.output ?? defaultOutputPath;

          await mkdir(dirname(outputPath), { recursive: true });
          const report = generateComparisonReport(runA, runB, v1, v2);
          await writeFile(outputPath, report, 'utf-8');
          console.log(`\n✓ Markdown report saved to: ${outputPath}`);
        } finally {
          // Restore original promptVersion
          rawConfig['promptVersion'] = originalVersion;
          await writeFile(configPath, JSON.stringify(rawConfig, null, 2) + '\n', 'utf-8').catch(
            () => {
              // Best-effort restore
            },
          );
        }
      },
    );
}

// ── promptCommand ─────────────────────────────────────────────────────────────

export function promptCommand(): Command {
  const prompt = new Command('prompt').description('Manage LLM chunking prompt versioning');
  prompt.addCommand(bumpSubcommand());
  prompt.addCommand(compareSubcommand());
  return prompt;
}
