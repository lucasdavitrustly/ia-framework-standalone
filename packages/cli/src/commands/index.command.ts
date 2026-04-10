import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { writeFile, access, unlink } from 'node:fs/promises';
import { loadConfig, createLogger } from '@ia-framework/core';
import { createEmbeddingProvider, discoverDimensions } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { IndexingPipeline, LlmChunkingStrategy, isOllamaReachable } from '@ia-framework/indexer';
import type { IndexingProgress, ChunkingStrategy } from '@ia-framework/indexer';
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
    .option('-s, --strategy <type>', 'Chunking strategy: ast (default) or llm', 'ast')
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
      async (options: { force: boolean; config: string; model?: string; strategy: string }) => {
        const logger = createLogger('cli:index');
        const configPath =
          options.config ||
          process.env['IA_FRAMEWORK_CONFIG'] ||
          join(process.cwd(), '.ia-framework', 'project.json');
        const frameworkDir = resolveFrameworkDir(configPath);

        try {
          const config = await loadConfig(configPath);
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
          const vectorStore = new QdrantVectorStore({
            host: qdrantHost,
            port: config.vectorStore.port,
            collectionName: config.vectorStore.collectionName,
            apiKey: config.vectorStore.apiKey,
          });

          // Mismatch detection: check existing collection vs configured model
          try {
            const collectionInfo = await vectorStore.getCollectionInfo();
            if (collectionInfo.pointCount > 0) {
              const existingDimensions = collectionInfo.vectorDimensions.text;
              const configuredDimensions = embeddingProvider.dimensions;
              const lastModel = await getLastEmbeddingModel(frameworkDir);
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
          const BAR_WIDTH = 20;

          // Route collection name based on strategy (D-06, D-08, RETR-07)
          const baseCollectionName = config.vectorStore.collectionName;
          const collectionName =
            options.strategy === 'llm' ? `${baseCollectionName}-llm` : baseCollectionName;

          // LLM strategy setup: Ollama verification, model management, strategy creation
          let chunkingStrategy: ChunkingStrategy | undefined;
          let chunkingModel = '';
          if (options.strategy === 'llm') {
            // a. Verify Ollama connectivity (D-16)
            const ollamaUrl = config.indexing?.llm?.ollamaUrl ?? 'http://localhost:11434';
            const reachable = await isOllamaReachable(ollamaUrl);
            if (!reachable) {
              console.error(
                `\n✗ Ollama is not running at ${ollamaUrl}. Start it with: ollama serve`,
              );
              process.exit(1);
            }

            // b. Determine chunking model (D-14, D-15)
            chunkingModel = config.indexing?.llm?.model ?? 'llama3.2:latest';

            // c. Check model availability (D-17, CLIE-02)
            const modelAvailable = await isModelAvailable(chunkingModel, ollamaUrl);
            if (!modelAvailable) {
              console.log(`\n  ⚠ Chunking model "${chunkingModel}" not found locally.`);
              const rl = createInterface({ input: process.stdin, output: process.stdout });
              const answer = await rl.question(`  Pull "${chunkingModel}" now? (Y/n): `);
              rl.close();
              if (answer.trim().toLowerCase() !== 'n') {
                await pullModel(chunkingModel, ollamaUrl);
              } else {
                // Offer to select from available models (CLIE-03)
                const selected = await promptModelSelection(ollamaUrl);
                chunkingModel = selected;
                // Verify selected model is available (may need pull)
                const selectedAvailable = await isModelAvailable(chunkingModel, ollamaUrl);
                if (!selectedAvailable) {
                  await pullModel(chunkingModel, ollamaUrl);
                }
              }
            }

            // d. Create LlmChunkingStrategy with per-file progress callback (D-18)
            const cachePath = join(frameworkDir, 'llm-chunk-cache.json');
            const llmStrategy = new LlmChunkingStrategy({
              model: chunkingModel,
              ollamaUrl,
              cachePath,
              onFileProgress: (fileName: string, fileIndex: number, totalFiles: number) => {
                const pct = Math.round((fileIndex / totalFiles) * 100);
                const filled = Math.round((pct / 100) * BAR_WIDTH);
                const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
                const line = `  [${bar}] ${String(pct).padStart(3)}%  chunking  [${fileIndex}/${totalFiles}] ${fileName}`;
                process.stdout.write(`\r\x1b[2K${line}`);
              },
            });
            await llmStrategy.loadCache();
            chunkingStrategy = llmStrategy;
          }

          console.log(`Indexing: ${config.targetProjectPath}`);
          console.log(`Collection: ${collectionName}`);
          console.log(`Model: ${config.embedding.model}`);
          console.log(`Strategy: ${options.strategy}`);
          if (options.strategy === 'llm') {
            console.log(`Chunking model: ${chunkingModel}`);
          }
          console.log('');

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
                line = `  ${progress.stage}`;
            }
            process.stdout.write(`\r\x1b[2K${line}`);
          };

          const startedAt = new Date().toISOString();
          // Write initial "running" state so the dashboard can detect indexing started
          await writeIndexingProgress(frameworkDir, {
            running: true,
            stage: 'walking',
            strategy: options.strategy,
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

          const startTime = Date.now();
          const result = await pipeline.run(
            {
              targetProjectPath: config.targetProjectPath,
              frameworkDir,
              collectionName,
              embeddingProvider,
              vectorStore,
              includePatterns: config.indexing?.includePatterns,
              excludePatterns: config.indexing?.excludePatterns,
              maxChunkLines: config.indexing?.maxChunkLines,
              incremental: !options.force,
              dependencyGraph,
              embeddingConcurrency: config.indexing?.embeddingConcurrency,
              chunkingStrategy,
            },
            (progress: IndexingProgress) => {
              renderProgress(progress);
              // Write progress to shared file so the dashboard API can pick it up
              void writeIndexingProgress(frameworkDir, {
                running: true,
                stage: progress.stage,
                strategy: options.strategy,
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
              // Check for stop sentinel — if found, exit cleanly
              void checkAndClearStopSentinel(frameworkDir).then(async (shouldStop) => {
                if (shouldStop) {
                  process.stdout.write('\n');
                  console.log('\n✗ Indexing stopped by user');
                  await writeIndexingProgress(frameworkDir, {
                    running: false,
                    stage: null,
                    filesTotal: progress.filesTotal,
                    filesProcessed: progress.filesProcessed,
                    chunksTotal: progress.chunksTotal,
                    chunksIndexed: progress.chunksIndexed,
                    currentFile: null,
                    startedAt,
                    completedAt: new Date().toISOString(),
                    error: 'Stopped by user',
                  });
                  process.exit(0);
                }
              });
            },
          );
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          process.stdout.write('\n');

          // Save LLM chunk cache if strategy is llm
          if (chunkingStrategy && chunkingStrategy.name === 'llm') {
            await (chunkingStrategy as LlmChunkingStrategy).saveCache();
          }

          if (result.skippedChunks > 0) {
            console.log(
              `\n  ⚠ ${result.skippedChunks} chunks skipped due to embedding failures (will be retried on next index)`,
            );
          }

          console.log(
            `\n\u2713 Indexed ${result.chunksIndexed} chunks from ${result.filesIndexed} files in ${elapsed}s`,
          );

          // Mark indexing complete in the progress file
          await writeIndexingProgress(frameworkDir, {
            running: false,
            stage: 'done',
            strategy: options.strategy,
            filesTotal: result.filesIndexed,
            filesProcessed: result.filesIndexed,
            chunksTotal: result.chunksIndexed,
            chunksIndexed: result.chunksIndexed,
            currentFile: null,
            batchesTotal: null,
            batchesCompleted: null,
            skippedChunks: result.skippedChunks,
            startedAt,
            completedAt: new Date().toISOString(),
          });

          // Save embedding model to indexing state for mismatch detection
          const currentCommit = await getCurrentCommit(config.targetProjectPath);
          await saveLastIndexedCommit(
            frameworkDir,
            currentCommit ?? '',
            collectionName,
            config.embedding.model,
          );
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
