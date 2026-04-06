import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { writeFile } from 'node:fs/promises';
import { loadConfig, createLogger } from '@ia-framework/core';
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
    .option('-m, --model <name>', 'Override embedding model (auto-pulls if not installed)')
    .action(async (options: { force: boolean; config: string; model?: string }) => {
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
              console.log(`    New model:      ${currentModel} (${configuredDimensions}d vectors)`);
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
        const collectionName = config.vectorStore.collectionName;

        console.log(`Indexing: ${config.targetProjectPath}`);
        console.log(`Collection: ${collectionName}`);
        console.log(`Model: ${config.embedding.model}`);
        console.log('');

        let lastFile = '';
        const startedAt = new Date().toISOString();
        // Write initial "running" state so the dashboard can detect indexing started
        await writeIndexingProgress(frameworkDir, {
          running: true,
          stage: 'walking',
          filesTotal: 0,
          filesProcessed: 0,
          chunksTotal: 0,
          chunksIndexed: 0,
          currentFile: null,
          startedAt,
          updatedAt: startedAt,
        });

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
          },
          (progress: IndexingProgress) => {
            const file = progress.currentFile ?? lastFile;
            lastFile = file;
            process.stdout.write(
              `\r  ${progress.stage}: ${progress.filesProcessed}/${progress.filesTotal} files, ${progress.chunksIndexed} chunks${file ? ` — ${file.slice(-40)}` : ''}`,
            );
            // Write progress to shared file so the dashboard API can pick it up
            void writeIndexingProgress(frameworkDir, {
              running: true,
              stage: progress.stage,
              filesTotal: progress.filesTotal,
              filesProcessed: progress.filesProcessed,
              chunksTotal: progress.chunksTotal,
              chunksIndexed: progress.chunksIndexed,
              currentFile: progress.currentFile ?? null,
              startedAt,
              updatedAt: new Date().toISOString(),
            });
          },
        );

        process.stdout.write('\n');
        console.log(
          `\n\u2713 Indexed ${result.chunksIndexed} chunks from ${result.filesIndexed} files`,
        );

        // Mark indexing complete in the progress file
        await writeIndexingProgress(frameworkDir, {
          running: false,
          stage: 'done',
          filesTotal: result.filesIndexed,
          filesProcessed: result.filesIndexed,
          chunksTotal: result.chunksIndexed,
          chunksIndexed: result.chunksIndexed,
          currentFile: null,
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
    });
}
