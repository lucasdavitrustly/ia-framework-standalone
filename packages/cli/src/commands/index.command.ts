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
import type { IndexingProgress } from '@ia-framework/indexer';
import {
  getLastEmbeddingModel,
  saveLastIndexedCommit,
  getCurrentCommit,
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

          // Mismatch detection: check existing collection vs configured model
          try {
            const collectionInfo = await vectorStore.getCollectionInfo();
            if (collectionInfo.pointCount > 0) {
              const existingDimensions = collectionInfo.vectorDimensions.text;
              const configuredDimensions = embeddingProvider.dimensions;
              const lastModel = await getLastEmbeddingModel(frameworkDir, collectionName);
              const currentModel = config.embedding.model;

              const dimensionMismatch = existingDimensions !== configuredDimensions;
              const modelMismatch = lastModel !== null && lastModel !== currentModel;

              if (dimensionMismatch || modelMismatch) {
                console.log('');
                console.log('  \u26a0 Embedding model mismatch detected!');
                console.log(
                  `    Previous model: ${lastModel ?? 'unknown'} (${existingDimensions}d vectors)`,
                );
                console.log(
                  `    New model:      ${currentModel} (${configuredDimensions}d vectors)`,
                );
                console.log('    Existing vectors are incompatible with the new model.');
                console.log('');

                const rl = createInterface({ input: process.stdin, output: process.stdout });
                const answer = await rl.question(
                  '  Delete existing collection and re-index? (y/N): ',
                );
                rl.close();

                if (answer.trim().toLowerCase() === 'y') {
                  await vectorStore.deleteCollection();
                  console.log('  \u2713 Collection deleted \u2014 starting fresh index');
                  options.force = true;
                } else {
                  console.log('  Aborted \u2014 no changes made');
                  process.exit(0);
                }
              }
            }
          } catch {
            // Collection may not exist yet — no mismatch possible
          }

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
          const renderProgress = (progress: IndexingProgress): void => {
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
                line = `  [${bar}] ${String(pct).padStart(3)}%  enriching  ${batchStr} batches  ${elapsedStr}${etaStr}${fileName}`;
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

          try {
            // Per-repo sequential loop (D-03, D-07)
            for (const repo of reposToIndex) {
              console.log(`\n── Indexing repo: ${repo.name} (${repo.path}) ──\n`);

              // Scoped force-delete: when --force AND --repo, delete only that repo's chunks (D-02)
              if (options.force && options.repo) {
                const deleted = await vectorStore.deleteByFilter({
                  must: [{ key: 'repoId', match: { value: repo.name } }],
                });
                console.log(`  Deleted ${deleted} existing chunks for repo "${repo.name}"`);
              }

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

              const result = await pipeline.run(
                {
                  targetProjectPath: repo.path,
                  frameworkDir,
                  collectionName,
                  embeddingProvider,
                  vectorStore,
                  includePatterns: config.indexing?.includePatterns,
                  excludePatterns: config.indexing?.excludePatterns,
                  maxChunkLines: config.indexing?.maxChunkLines,
                  incremental: !options.force,
                  force: options.force,
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
              );

              totalFilesIndexed += result.filesIndexed;
              totalChunksIndexed += result.chunksIndexed;
              totalSkippedChunks += result.skippedChunks;

              process.stdout.write('\n');

              // Save per-repo indexing state with repoId composite key
              const currentCommit = await getCurrentCommit(repo.path);
              await saveLastIndexedCommit(
                frameworkDir,
                currentCommit ?? '',
                collectionName,
                config.embedding.model,
                undefined,
                repo.name,
              );

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
            }
            throw err;
          } finally {
            clearInterval(sentinelPollInterval);
          }
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          if (totalSkippedChunks > 0) {
            console.log(
              `\n  ⚠ ${totalSkippedChunks} chunks skipped due to embedding failures (will be retried on next index)`,
            );
          }

          console.log(
            `\n\u2713 Indexed ${totalChunksIndexed} chunks from ${totalFilesIndexed} files in ${elapsed}s`,
          );

          // Mark indexing complete in the progress file
          await writeIndexingProgress(frameworkDir, {
            running: false,
            stage: 'done',
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
      },
    );
}
