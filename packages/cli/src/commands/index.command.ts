import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { writeFile, access, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadConfig, createLogger, MavenModuleParser, RepoRegistry } from '@ia-framework/core';
import { MetricsStore } from '@ia-framework/observability';
import { createEmbeddingProvider, discoverDimensions } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { IndexingPipeline } from '@ia-framework/indexer';
import type { IndexRunMetrics, IndexRunSummary, IndexingProgress } from '@ia-framework/indexer';
import {
  getCurrentCommit,
  getFullReindexRequired,
  saveLastIndexedCommit,
  setFullReindexRequired,
} from '@ia-framework/indexer';
import { DependencyGraph } from '@ia-framework/retrieval';

function resolveFrameworkDir(configPath: string): string {
  // .ia-framework/project.json → .ia-framework/
  return dirname(configPath);
}

/**
 * Write indexing progress to a JSON file so the dashboard API (a separate
 * process, possibly in a VM) can read live CLI-triggered progress.
 * Fire-and-forget — never throws, so it never disrupts actual indexing.
 */
async function writeIndexingProgress(
  frameworkDir: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const filePath = join(frameworkDir, 'indexing-progress.json');
    await writeFile(filePath, JSON.stringify(data), 'utf-8');
  } catch {
    // Non-fatal — dashboard just won't show progress
  }
}

/**
 * Check if the stop-requested sentinel file exists.
 * If found, deletes it and returns true.
 * Never throws — always returns false on any error.
 */
async function checkAndClearStopSentinel(frameworkDir: string): Promise<boolean> {
  const sentinelPath = join(frameworkDir, 'indexing-stop-requested');
  try {
    await access(sentinelPath);
    await unlink(sentinelPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeIndexResult(
  result: IndexRunSummary,
  mode: IndexRunMetrics['mode'],
): IndexRunSummary {
  const failedFiles = result.failedFiles ?? result.metrics?.failedFiles ?? [];
  const failedChanges = result.failedChanges ?? result.metrics?.failedChanges ?? [];
  const existingMetrics = result.metrics;
  const metrics: IndexRunMetrics = existingMetrics
    ? {
        mode: existingMetrics.mode ?? mode,
        filesChanged: existingMetrics.filesChanged ?? result.filesIndexed,
        chunksDeleted: existingMetrics.chunksDeleted ?? 0,
        chunksReindexed: existingMetrics.chunksReindexed ?? result.chunksIndexed,
        chunksAffected: existingMetrics.chunksAffected ?? result.chunksIndexed,
        failedFiles: existingMetrics.failedFiles ?? failedFiles,
        failedChanges: existingMetrics.failedChanges ?? failedChanges,
      }
    : {
        mode,
        filesChanged: result.filesIndexed,
        chunksDeleted: 0,
        chunksReindexed: result.chunksIndexed,
        chunksAffected: result.chunksIndexed,
        failedFiles,
        failedChanges,
      };

  return { ...result, failedFiles, failedChanges, metrics };
}

function hasIndexFailures(result: IndexRunSummary): boolean {
  return (
    result.skippedChunks > 0 ||
    (result.failedFiles?.length ?? 0) > 0 ||
    (result.failedChanges?.length ?? 0) > 0 ||
    (result.metrics?.failedFiles?.length ?? 0) > 0 ||
    (result.metrics?.failedChanges?.length ?? 0) > 0
  );
}

function isMissingCollectionError(error: unknown): boolean {
  return /collection.*(?:not found|does not exist)|(?:not found|does not exist).*collection|\b404\b/i.test(
    String(error),
  );
}

function addScopedDeletion(result: IndexRunSummary, deleted: number): IndexRunSummary {
  if (deleted === 0) return result;
  return {
    ...result,
    metrics: {
      ...result.metrics,
      chunksDeleted: result.metrics.chunksDeleted + deleted,
      chunksAffected: result.metrics.chunksAffected + deleted,
    },
  };
}

/**
 * Check if a model is locally available in Ollama.
 */
async function isModelAvailable(model: string, baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const names = (data.models ?? []).map((m) => m.name);
    return names.includes(model) || names.includes(`${model}:latest`);
  } catch {
    return false;
  }
}

/**
 * Pull a model from the Ollama registry.
 */
async function pullModel(model: string, baseUrl: string): Promise<void> {
  console.log(`  Pulling model: ${model}...`);
  console.log('    (This may take a few minutes...)');
  const res = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false }),
  });
  if (!res.ok) {
    throw new Error(`Failed to pull model "${model}": HTTP ${res.status}`);
  }
}

/**
 * Prompt user to select a model interactively when none is configured.
 */
async function promptModelSelection(baseUrl: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Try to get locally available models
    let models: string[] = [];
    try {
      const res = await fetch(`${baseUrl}/api/tags`);
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        models = (data.models ?? []).map((m) => m.name);
      }
    } catch {
      /* Ollama may not be running */
    }

    console.log('');
    console.log('  No embedding model configured.');

    if (models.length === 0) {
      console.log('  Popular embedding models: nomic-embed-text, mxbai-embed-large, all-minilm');
      const answer = await rl.question('  Enter a model name [nomic-embed-text]: ');
      return answer.trim() || 'nomic-embed-text';
    }

    const knownEmbed = ['nomic-embed-text', 'mxbai-embed-large', 'all-minilm'];
    console.log('  Available models:');
    for (let i = 0; i < models.length; i++) {
      const shortName = models[i]!.replace(/:latest$/, '');
      const hint = knownEmbed.includes(shortName) ? ' [embed]' : '';
      console.log(`    ${i + 1}. ${models[i]}${hint}`);
    }
    console.log(`    ${models.length + 1}. Enter a custom model name`);

    const answer = await rl.question(`  Select [1]: `);
    const choice = parseInt(answer.trim() || '1', 10);

    if (choice === models.length + 1) {
      const custom = await rl.question('  Enter model name: ');
      return custom.trim() || 'nomic-embed-text';
    }

    if (choice >= 1 && choice <= models.length) {
      return models[choice - 1]!;
    }

    return models[0]!;
  } finally {
    rl.close();
  }
}

export function indexCommand(): Command {
  return new Command('index')
    .description('Index the configured target project codebase into Qdrant')
    .option('-f, --force', 'Force re-index all files regardless of changes', false)
    .option('-c, --config <path>', 'Path to project.json config', '')
    .option(
      '-m, --model <name>',
      [
        'Embedding model to use (overrides project.json).',
        'Auto-pulls from Ollama if not installed locally.',
        'Detects dimension mismatches and prompts to recreate the collection.',
        '',
        'Examples:',
        '  --model nomic-embed-text       (768d, fast)',
        '  --model mxbai-embed-large      (1024d, higher quality)',
        '  --model qwen3-embedding:0.6b   (1024d)',
        '  --model qwen3-embedding:1.7b   (2048d)',
        '  --model qwen3-embedding:4b     (2560d)',
        '',
        'Browse all models: https://ollama.com/search',
      ].join('\n'),
    )
    .option('--skip-enrichment', 'Skip LLM enrichment (index AST metadata only, no Ollama)', false)
    .option(
      '-r, --repo <name>',
      'Index only the specified repo (must match a name in project.json repos[])',
    )
    .addHelpText(
      'after',
      `
Changing embedding models:
  Switch models at any time with --model. If the new model has different
  dimensions than the existing Qdrant collection, you will be prompted to
  delete and re-index. This is required — vectors from different models
  are incompatible.

  $ ia-framework index --model mxbai-embed-large
  $ ia-framework index --model qwen3-embedding:1.7b --force

To persist a model change, update "embedding.model" in .ia-framework/project.json.
Browse available models: https://ollama.com/search
`,
    )
    .action(
      async (options: {
        force: boolean;
        config: string;
        model?: string;
        skipEnrichment: boolean;
        repo?: string;
      }) => {
        const logger = createLogger('cli:index');
        const configPath =
          options.config ||
          process.env['IA_FRAMEWORK_CONFIG'] ||
          join(process.cwd(), '.ia-framework', 'project.json');
        const frameworkDir = resolveFrameworkDir(configPath);
        let cleanRun = false;

        try {
          const config = await loadConfig(configPath);

          // Create RepoRegistry for per-repo orchestration
          const registry = RepoRegistry.fromConfig(config, dirname(configPath));

          // Validate --repo flag (D-06)
          if (options.repo) {
            const entry = registry.getRepo(options.repo);
            if (!entry) {
              const validNames = registry
                .getRepos()
                .map((r) => r.name)
                .join(', ');
              console.error(`\n✗ Unknown repo: "${options.repo}"\n  Valid repos: ${validNames}`);
              process.exit(1);
            }
          }

          // Determine repos to index
          const reposToIndex = options.repo
            ? [registry.getRepo(options.repo)!]
            : registry.getRepos();

          const baseUrl = config.embedding.baseUrl ?? 'http://localhost:11434';

          // Handle --model override or missing model
          if (options.model) {
            // Check if model is locally available, auto-pull if not
            const available = await isModelAvailable(options.model, baseUrl);
            if (!available) {
              await pullModel(options.model, baseUrl);
            }

            // Discover dimensions for the override model
            const dims = await discoverDimensions(options.model, baseUrl);
            config.embedding.model = options.model;
            config.embedding.dimensions = dims;
            console.log(`  Using model: ${options.model} (${dims}d vectors)`);
          } else if (!config.embedding.model) {
            // No model configured — prompt interactively
            const selectedModel = await promptModelSelection(baseUrl);

            // Check availability and pull if needed
            const available = await isModelAvailable(selectedModel, baseUrl);
            if (!available) {
              await pullModel(selectedModel, baseUrl);
            }

            const dims = await discoverDimensions(selectedModel, baseUrl);
            config.embedding.model = selectedModel;
            config.embedding.dimensions = dims;
            console.log(`  Using model: ${selectedModel} (${dims}d vectors)`);
          }

          const embeddingProvider = createEmbeddingProvider(config.embedding);
          // CLI runs on the host machine — use QDRANT_HOST env var or fall back to localhost.
          // config.vectorStore.host may be "qdrant" (the Docker service name), which only
          // resolves inside Docker containers. From the host, Qdrant is reachable via localhost.
          const qdrantHost = process.env['QDRANT_HOST'] ?? 'localhost';

          // Route collection name (no more strategy suffix)
          const baseCollectionName = config.vectorStore.collectionName;
          const collectionName = baseCollectionName;

          const vectorStore = new QdrantVectorStore({
            host: qdrantHost,
            port: config.vectorStore.port,
            collectionName,
            apiKey: config.vectorStore.apiKey,
          });

          // Embedding-contract state is owned by ContractStore, persisted inside
          // the Qdrant collection (EMB-08, AD-002). The legacy per-repo model +
          // dimension check that lived here is retired (D-3): it wrote per-repo
          // state after every run while the contract is a per-collection
          // invariant (D-6), so the two could disagree, and it prompted
          // interactively to delete a collection. A mismatch is now a loud,
          // non-destructive refusal at search time naming `ia index --force`.

          // Set up dependency graph for building import adjacency during indexing
          const graphDbPath = join(frameworkDir, 'graph.sqlite');
          let dependencyGraph: InstanceType<typeof DependencyGraph> | undefined;
          try {
            dependencyGraph = new DependencyGraph({ dbPath: graphDbPath });
            dependencyGraph.initialize();
            logger.info({ graphDbPath }, 'Dependency graph initialized for indexing');
          } catch {
            logger.info({ graphDbPath }, 'Dependency graph not available — skipping');
            dependencyGraph = undefined;
          }

          const pipeline = new IndexingPipeline();

          // --skip-enrichment flag: disable LLM enrichment for this run
          const enrichmentConfig = options.skipEnrichment
            ? null
            : (config.indexing?.enrichment ?? null);

          console.log(`Collection: ${collectionName}`);
          console.log(`Model: ${config.embedding.model}`);
          console.log(`Enrichment: ${enrichmentConfig ? `${enrichmentConfig.model}` : 'disabled'}`);
          console.log(`Repos: ${reposToIndex.map((r) => r.name).join(', ')}`);

          // T061: Warn about OLLAMA_NUM_PARALLEL when enrichment concurrency > 3
          if (enrichmentConfig) {
            const enrichConcurrency = enrichmentConfig.concurrency ?? 5;
            if (enrichConcurrency > 3) {
              console.warn(
                `  ⚠ Enrichment concurrency is ${enrichConcurrency}. For optimal performance, start Ollama with: OLLAMA_NUM_PARALLEL=${enrichConcurrency}`,
              );
            }
          }

          console.log('');

          const BAR_WIDTH = 20;
          let enrichmentStartedAt: number | null = null;
          let enrichmentWarnings = 0;
          const renderProgress = (progress: IndexingProgress): void => {
            // Handle warnings: clear progress line, print warning above, then re-render
            if (progress.warning) {
              enrichmentWarnings++;
              process.stdout.write(`\r\x1b[2K`);
              process.stderr.write(
                `\x1b[33m  ⚠ [batch ${progress.batchesCompleted}/${progress.batchesTotal}] ${progress.warning}\x1b[0m\n`,
              );
            }
            let line: string;
            switch (progress.stage) {
              case 'walking':
                line = `  ⠋ Discovering files...`;
                break;
              case 'parsing': {
                const pct =
                  progress.filesTotal > 0
                    ? Math.round((progress.filesProcessed / progress.filesTotal) * 100)
                    : 0;
                const filled = Math.round((pct / 100) * BAR_WIDTH);
                const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
                const fileName = progress.currentFile
                  ? ` ${progress.currentFile.split('/').pop()}`
                  : '';
                line = `  [${bar}] ${String(pct).padStart(3)}%  parsing  ${progress.filesProcessed}/${progress.filesTotal} files${fileName}`;
                break;
              }
              case 'enriching': {
                // Track when enrichment started (first enriching event)
                if (enrichmentStartedAt === null) enrichmentStartedAt = Date.now();
                const completed = progress.batchesCompleted ?? 0;
                const total = progress.batchesTotal ?? 0;
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                const filled = Math.round((pct / 100) * BAR_WIDTH);
                const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
                const fileName = progress.currentFile
                  ? ` ${progress.currentFile.split('/').pop()}`
                  : '';
                // Elapsed / ETA
                const elapsedMs = Date.now() - enrichmentStartedAt;
                const elapsedSec = Math.floor(elapsedMs / 1000);
                const elapsedStr =
                  elapsedSec >= 60
                    ? `${Math.floor(elapsedSec / 60)}m${String(elapsedSec % 60).padStart(2, '0')}s`
                    : `${elapsedSec}s`;
                let etaStr = '';
                if (completed > 0 && total > 0 && completed < total) {
                  const etaMs = (elapsedMs / completed) * (total - completed);
                  const etaSec = Math.ceil(etaMs / 1000);
                  const etaFmt =
                    etaSec >= 60
                      ? `${Math.floor(etaSec / 60)}m${String(etaSec % 60).padStart(2, '0')}s`
                      : `${etaSec}s`;
                  etaStr = `  ~${etaFmt} left`;
                }
                const batchStr = total > 0 ? `${completed}/${total}` : '…';
                const failStr =
                  enrichmentWarnings > 0 ? ` \x1b[33m(${enrichmentWarnings} failed)\x1b[0m` : '';
                line = `  [${bar}] ${String(pct).padStart(3)}%  enriching  ${batchStr} batches${failStr}  ${elapsedStr}${etaStr}${fileName}`;
                break;
              }
              case 'embedding': {
                const batchPct =
                  (progress.batchesTotal ?? 0) > 0
                    ? Math.round(((progress.batchesCompleted ?? 0) / progress.batchesTotal!) * 100)
                    : 0;
                const filled = Math.round((batchPct / 100) * BAR_WIDTH);
                const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
                line = `  [${bar}] ${String(batchPct).padStart(3)}%  embedding  batch ${progress.batchesCompleted ?? 0}/${progress.batchesTotal ?? '?'}  ${progress.chunksIndexed} chunks`;
                break;
              }
              case 'storing':
                line = `  ⠋ Storing ${progress.chunksIndexed} points in Qdrant...`;
                break;
              case 'done':
                line = `  ✓ Done`;
                break;
              default:
                line = `  ${String(progress.stage)}`;
            }
            process.stdout.write(`\r\x1b[2K${line}`);
          };

          const startedAt = new Date().toISOString();
          // Write initial "running" state so the dashboard can detect indexing started
          await writeIndexingProgress(frameworkDir, {
            running: true,
            stage: 'walking',
            strategy: 'ast',
            filesTotal: 0,
            filesProcessed: 0,
            chunksTotal: 0,
            chunksIndexed: 0,
            currentFile: null,
            batchesTotal: null,
            batchesCompleted: null,
            startedAt,
            updatedAt: startedAt,
          });

          // Set up AbortController with polling sentinel check for responsive stop
          const abortController = new AbortController();
          // Track last progress for clean abort messaging.
          const lastProgress = {
            filesTotal: 0,
            filesProcessed: 0,
            chunksTotal: 0,
            chunksIndexed: 0,
          };
          const sentinelPollInterval = setInterval(() => {
            void checkAndClearStopSentinel(frameworkDir).then((shouldStop) => {
              if (shouldStop) {
                abortController.abort();
              }
            });
          }, 2000);

          const startTime = Date.now();
          let totalFilesIndexed = 0;
          let totalChunksIndexed = 0;
          let totalSkippedChunks = 0;
          let totalFilesChanged = 0;
          let totalChunksDeleted = 0;
          let totalChunksReindexed = 0;
          let totalChunksAffected = 0;
          const failedRepos: Array<{ repo: string; reason: string }> = [];
          const skippedChunks: Array<{
            repoId?: string | undefined;
            relativePath: string;
            name?: string | undefined;
            startLine: number;
            endLine: number;
            reason: string;
          }> = [];
          const signatureOnlyChunks: Array<{
            repoId?: string | undefined;
            relativePath: string;
            name?: string | undefined;
            startLine: number;
            endLine: number;
          }> = [];

          try {
            // Per-repo sequential loop (D-03, D-07)
            for (const repo of reposToIndex) {
              const repoName = repo.name ?? repo.path;
              console.log(`\n── Indexing repo: ${repoName} (${repo.path}) ──\n`);
              if (abortController.signal.aborted) throw new Error('Indexing cancelled');

              // Build Maven module graph per-repo if applicable
              let mavenModuleGraph: import('@ia-framework/core').ModuleGraph | undefined;
              const rootPomPath = join(repo.path, 'pom.xml');
              if (existsSync(rootPomPath)) {
                try {
                  const { glob } = (await import('tinyglobby' as string)) as {
                    glob: (
                      patterns: string[],
                      opts: { cwd: string; ignore: string[]; absolute?: boolean },
                    ) => Promise<string[]>;
                  };
                  const pomFiles = await glob(['**/pom.xml'], {
                    cwd: repo.path,
                    ignore: ['**/target/**', '**/node_modules/**'],
                  });

                  const parser = new MavenModuleParser();
                  const modules = await Promise.all(
                    pomFiles.map(async (relativePath: string) => {
                      const fullPath = join(repo.path, relativePath);
                      const content = await readFile(fullPath, 'utf-8');
                      return parser.parsePom(content, relativePath);
                    }),
                  );

                  mavenModuleGraph = parser.buildModuleGraph(modules);
                  logger.info(
                    { moduleCount: modules.length },
                    'Maven module graph built for indexing',
                  );
                  console.log(
                    `  ✓ Maven module graph: ${modules.length} modules (will enrich chunks)`,
                  );
                } catch (mavenErr) {
                  logger.warn({ error: mavenErr }, 'Failed to build Maven module graph — skipping');
                }
              }

              const runPipeline = async (
                incrementalRun: boolean,
                forceRun: boolean,
              ): Promise<IndexRunSummary> =>
                normalizeIndexResult(
                  await pipeline.run(
                    {
                      targetProjectPath: repo.path,
                      frameworkDir,
                      collectionName,
                      embeddingProvider,
                      vectorStore,
                      includePatterns: config.indexing?.includePatterns,
                      excludePatterns: config.indexing?.excludePatterns,
                      maxChunkLines: config.indexing?.maxChunkLines,
                      embeddingBatchSize: config.indexing?.embeddingBatchSize,
                      incremental: incrementalRun,
                      force: forceRun,
                      dependencyGraph,
                      embeddingConcurrency: config.indexing?.embeddingConcurrency,
                      mavenModuleGraph,
                      repoId: repo.name,
                      skipEnrichment: options.skipEnrichment,
                      ...(enrichmentConfig != null ? { enrichmentConfig } : {}),
                    },
                    (progress: IndexingProgress) => {
                      Object.assign(lastProgress, progress);
                      renderProgress(progress);
                      void writeIndexingProgress(frameworkDir, {
                        running: true,
                        stage: progress.stage,
                        strategy: 'ast',
                        filesTotal: progress.filesTotal,
                        filesProcessed: progress.filesProcessed,
                        chunksTotal: progress.chunksTotal,
                        chunksIndexed: progress.chunksIndexed,
                        currentFile: progress.currentFile ?? null,
                        batchesTotal: progress.batchesTotal ?? null,
                        batchesCompleted: progress.batchesCompleted ?? null,
                        startedAt,
                        updatedAt: new Date().toISOString(),
                      });
                    },
                    abortController.signal,
                  ),
                  incrementalRun ? 'incremental' : 'full',
                );

              const purgeRepo = async (): Promise<number> => {
                const filter = { must: [{ key: 'repoId', match: { value: repoName } }] };
                let deleted: number;
                try {
                  deleted = await vectorStore.deleteByFilter(filter);
                } catch (error) {
                  // A first full index can run before the collection exists. There is
                  // nothing to purge in that case; pipeline.initialize() will create it.
                  if (isMissingCollectionError(error)) {
                    console.log(`  No existing chunks to delete for repo "${repoName}"`);
                    return 0;
                  }
                  throw error;
                }
                console.log(`  Deleted ${deleted} existing chunks for repo "${repoName}"`);
                return deleted;
              };

              let result: IndexRunSummary | undefined;
              let repoFailure: string | undefined;
              const fullReindexRequired =
                !options.force &&
                (await getFullReindexRequired(frameworkDir, collectionName, repoName));

              if (options.force || fullReindexRequired) {
                try {
                  if (fullReindexRequired) {
                    console.log(
                      `  ⚠ A previous full re-index for ${repoName} did not complete; retrying it before incremental indexing`,
                    );
                  }
                  if (abortController.signal.aborted) throw new Error('Indexing cancelled');
                  const deleted = await purgeRepo();
                  // Automatic retries must not pass collection-destructive force semantics.
                  // The scoped purge plus incremental:false provides the full repo rebuild;
                  // explicit --force retains its existing schema-migration behavior.
                  result = addScopedDeletion(await runPipeline(false, options.force), deleted);
                  if (abortController.signal.aborted) throw new Error('Indexing cancelled');
                  if (hasIndexFailures(result)) {
                    repoFailure = fullReindexRequired
                      ? 'full re-index retry returned failed files or skipped chunks'
                      : 'full index returned failed files or skipped chunks';
                  }
                } catch (error) {
                  if (abortController.signal.aborted) throw error;
                  repoFailure = String(error);
                }
              } else {
                try {
                  const incrementalResult = await runPipeline(true, false);
                  if (abortController.signal.aborted) throw new Error('Indexing cancelled');

                  if (hasIndexFailures(incrementalResult)) {
                    if (abortController.signal.aborted) throw new Error('Indexing cancelled');
                    console.log(
                      `  ⚠ Incremental index for ${repoName} had failures; running one scoped full-index fallback`,
                    );
                    for (const failedFile of incrementalResult.failedFiles) {
                      console.log(
                        `  ⚠ Initial failure ${repoName}:${failedFile.relativePath} — ${failedFile.reason}`,
                      );
                    }
                    for (const failedChange of incrementalResult.failedChanges) {
                      console.log(
                        `  ⚠ Initial Git failure for ${repoName} (${failedChange.operation}) — ${failedChange.error}`,
                      );
                    }
                    try {
                      if (abortController.signal.aborted) throw new Error('Indexing cancelled');
                      const deleted = await purgeRepo();
                      if (abortController.signal.aborted) throw new Error('Indexing cancelled');
                      result = addScopedDeletion(await runPipeline(false, false), deleted);
                      if (abortController.signal.aborted) throw new Error('Indexing cancelled');
                      if (hasIndexFailures(result)) {
                        repoFailure = 'full-index fallback returned failed files or skipped chunks';
                      }
                    } catch (error) {
                      if (abortController.signal.aborted) throw error;
                      repoFailure = String(error);
                    }
                  } else {
                    result = incrementalResult;
                  }
                } catch (error) {
                  if (abortController.signal.aborted) throw error;
                  console.log(
                    `  ⚠ Incremental index for ${repoName} threw ${String(error)}; running one scoped full-index fallback`,
                  );
                  try {
                    if (abortController.signal.aborted) throw new Error('Indexing cancelled');
                    const deleted = await purgeRepo();
                    if (abortController.signal.aborted) throw new Error('Indexing cancelled');
                    result = addScopedDeletion(await runPipeline(false, false), deleted);
                    if (abortController.signal.aborted) throw new Error('Indexing cancelled');
                    if (hasIndexFailures(result)) {
                      repoFailure = 'full-index fallback returned failed files or skipped chunks';
                    }
                  } catch (fallbackError) {
                    if (abortController.signal.aborted) throw fallbackError;
                    repoFailure = String(fallbackError);
                  }
                }
              }

              if (repoFailure) {
                await setFullReindexRequired(frameworkDir, collectionName, true, repoName);
                failedRepos.push({ repo: repoName, reason: repoFailure });
                console.error(`  ✗ ${repoName}: ${repoFailure}`);
              }

              if (result) {
                totalFilesIndexed += result.filesIndexed;
                totalChunksIndexed += result.chunksIndexed;
                totalSkippedChunks += result.skippedChunks;
                totalFilesChanged += result.metrics.filesChanged;
                totalChunksDeleted += result.metrics.chunksDeleted;
                totalChunksReindexed += result.metrics.chunksReindexed;
                totalChunksAffected += result.metrics.chunksAffected;
                skippedChunks.push(...result.skipped);
                signatureOnlyChunks.push(...result.signatureOnly);

                console.log(
                  `  ${result.metrics.mode} metrics for ${repoName}: changed files=${result.metrics.filesChanged}, affected chunks=${result.metrics.chunksAffected}, deleted chunks=${result.metrics.chunksDeleted}, re-indexed chunks=${result.metrics.chunksReindexed}`,
                );
                for (const failedFile of result.failedFiles) {
                  console.log(
                    `  ⚠ Failed file ${repoName}:${failedFile.relativePath} — ${failedFile.reason}`,
                  );
                }
                for (const failedChange of result.failedChanges) {
                  console.log(
                    `  ⚠ Git ${failedChange.operation} change detection failed for ${repoName} — ${failedChange.error}`,
                  );
                }
                process.stdout.write('\n');

                // Keep the CLI-side state write for callers that mock the pipeline, but never
                // advance it after a failed or cancelled repo run.
                const currentCommit = await getCurrentCommit(repo.path);
                if (
                  !repoFailure &&
                  !hasIndexFailures(result) &&
                  currentCommit &&
                  !abortController.signal.aborted
                ) {
                  await saveLastIndexedCommit(
                    frameworkDir,
                    currentCommit,
                    collectionName,
                    config.embedding.model,
                    undefined,
                    repo.name,
                  );
                } else {
                  console.log(
                    `  ⚠ Not advancing indexed commit for ${repoName}: indexing failed or was cancelled — re-run to retry it`,
                  );
                }
              }

              // Persist Maven module graph per-repo
              if (mavenModuleGraph) {
                try {
                  const metricsDbPath = join(frameworkDir, 'metrics.sqlite');
                  const metricsStore = new MetricsStore(metricsDbPath);
                  metricsStore.saveModuleGraph(repo.path, mavenModuleGraph.toJSON());
                  metricsStore.close();
                  logger.info('Maven module graph persisted to SQLite');
                } catch (mavenErr) {
                  logger.warn({ error: mavenErr }, 'Failed to persist Maven module graph');
                }
              }
            }
          } catch (err) {
            if (abortController.signal.aborted) {
              process.stdout.write('\n');
              console.log('\n✗ Indexing stopped by user');
              await writeIndexingProgress(frameworkDir, {
                running: false,
                stage: null,
                filesTotal: lastProgress.filesTotal,
                filesProcessed: lastProgress.filesProcessed,
                chunksTotal: lastProgress.chunksTotal,
                chunksIndexed: lastProgress.chunksIndexed,
                currentFile: null,
                startedAt,
                updatedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                error: 'Stopped by user',
              });
              process.exit(0);
              return;
            }
            throw err;
          } finally {
            clearInterval(sentinelPollInterval);
          }
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          if (totalSkippedChunks > 0) {
            console.log(
              `\n  ⚠ ${totalSkippedChunks} chunks skipped due to embedding failures (indexed commit not advanced for affected repos; re-run \`ia index\` to retry them)`,
            );
            for (const chunk of skippedChunks) {
              console.log(
                `    - ${chunk.repoId ? `${chunk.repoId}:` : ''}${chunk.relativePath}:${chunk.startLine}-${chunk.endLine}${chunk.name ? ` (${chunk.name})` : ''} — ${chunk.reason}`,
              );
            }
          }

          if (signatureOnlyChunks.length > 0) {
            console.log(`\n  ⚠ ${signatureOnlyChunks.length} signature-only chunks indexed`);
            for (const chunk of signatureOnlyChunks) {
              console.log(
                `    - ${chunk.repoId ? `${chunk.repoId}:` : ''}${chunk.relativePath}:${chunk.startLine}-${chunk.endLine}${chunk.name ? ` (${chunk.name})` : ''} — signature-only`,
              );
            }
          }

          const indexingFailed = totalSkippedChunks > 0 || failedRepos.length > 0;
          console.log(
            `\n${indexingFailed ? '⚠' : '\u2713'} Indexed ${totalChunksIndexed} chunks from ${totalFilesIndexed} files in ${elapsed}s`,
          );
          console.log(
            `  Aggregate metrics: changed files=${totalFilesChanged}, affected chunks=${totalChunksAffected}, deleted chunks=${totalChunksDeleted}, re-indexed chunks=${totalChunksReindexed}`,
          );
          if (failedRepos.length > 0) {
            console.log(`\n  ⚠ ${failedRepos.length} repos failed:`);
            for (const failedRepo of failedRepos) {
              console.log(`    - ${failedRepo.repo}: ${failedRepo.reason}`);
            }
          }

          // Mark indexing complete in the progress file
          await writeIndexingProgress(frameworkDir, {
            running: false,
            stage: indexingFailed ? 'error' : 'done',
            strategy: 'ast',
            filesTotal: totalFilesIndexed,
            filesProcessed: totalFilesIndexed,
            chunksTotal: totalChunksIndexed,
            chunksIndexed: totalChunksIndexed,
            currentFile: null,
            batchesTotal: null,
            batchesCompleted: null,
            skippedChunks: totalSkippedChunks,
            startedAt,
            completedAt: new Date().toISOString(),
            ...(indexingFailed
              ? {
                  error: [
                    ...failedRepos.map((failedRepo) => `${failedRepo.repo}: ${failedRepo.reason}`),
                    ...(totalSkippedChunks > 0
                      ? [`${totalSkippedChunks} chunks skipped during indexing`]
                      : []),
                  ].join('; '),
                }
              : {}),
          });

          // Backward-compat check: warn about chunks without repoId (D-09)
          try {
            const totalPoints = await vectorStore.countPoints();
            const pointsWithRepo = await vectorStore.countPoints({
              must_not: [{ is_null: { key: 'repoId' } }],
            });
            const orphanCount = totalPoints - pointsWithRepo;
            if (orphanCount > 0) {
              console.log(
                `\n  ⚠ ${orphanCount} chunks lack repoId (indexed before multi-repo support).`,
              );
              console.log(
                `    Run "ia-framework index --force" to re-index all repos and add repoId to all chunks.`,
              );
            }
          } catch {
            // Non-fatal — skip warning if count fails
          }

          if (indexingFailed) {
            process.exit(1);
          }
          cleanRun = true;
        } catch (error) {
          console.error(`\n\u2717 Indexing failed: ${String(error)}`);
          logger.error({ error }, 'Indexing failed');
          // Write failure state so the dashboard shows the error
          await writeIndexingProgress(frameworkDir, {
            running: false,
            stage: null,
            filesTotal: 0,
            filesProcessed: 0,
            chunksTotal: 0,
            chunksIndexed: 0,
            currentFile: null,
            error: String(error),
            completedAt: new Date().toISOString(),
          });
          process.exit(1);
        }

        // Explicit success exit so a clean run reports an observable exit code
        // rather than an absent one. Outside the try so it is never mistaken for
        // an indexing failure.
        if (cleanRun) process.exit(0);
      },
    );
}
