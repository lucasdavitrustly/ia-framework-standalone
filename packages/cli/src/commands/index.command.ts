import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, createLogger } from '@ia-framework/core';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { IndexingPipeline } from '@ia-framework/indexer';
import type { IndexingProgress } from '@ia-framework/indexer';

function resolveFrameworkDir(configPath: string): string {
  // .ia-framework/project.json → .ia-framework/
  return dirname(configPath);
}

export function indexCommand(): Command {
  return new Command('index')
    .description('Index the configured target project codebase into Qdrant')
    .option('-f, --force', 'Force re-index all files regardless of changes', false)
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (options: { force: boolean; config: string }) => {
      const logger = createLogger('cli:index');
      const configPath =
        options.config ||
        process.env['IA_FRAMEWORK_CONFIG'] ||
        join(process.cwd(), '.ia-framework', 'project.json');

      try {
        const config = await loadConfig(configPath);
        const frameworkDir = resolveFrameworkDir(configPath);

        const embeddingProvider = createEmbeddingProvider(config.embedding);
        const vectorStore = new QdrantVectorStore({
          host: config.vectorStore.host,
          port: config.vectorStore.port,
          collectionName: config.vectorStore.collectionName,
          apiKey: config.vectorStore.apiKey,
        });

        const pipeline = new IndexingPipeline();

        console.log(`Indexing: ${config.targetProjectPath}`);
        console.log(`Collection: ${config.vectorStore.collectionName}`);
        console.log('');

        let lastFile = '';
        const result = await pipeline.run(
          {
            targetProjectPath: config.targetProjectPath,
            frameworkDir,
            collectionName: config.vectorStore.collectionName,
            embeddingProvider,
            vectorStore,
            includePatterns: config.indexing?.includePatterns,
            excludePatterns: config.indexing?.excludePatterns,
            maxChunkLines: config.indexing?.maxChunkLines,
            incremental: !options.force,
          },
          (progress: IndexingProgress) => {
            const file = progress.currentFile ?? lastFile;
            lastFile = file;
            process.stdout.write(
              `\r  ${progress.stage}: ${progress.filesProcessed}/${progress.filesTotal} files, ${progress.chunksIndexed} chunks${file ? ` — ${file.slice(-40)}` : ''}`,
            );
          },
        );

        process.stdout.write('\n');
        console.log(`\n✓ Indexed ${result.chunksIndexed} chunks from ${result.filesIndexed} files`);
      } catch (error) {
        console.error(`\n✗ Indexing failed: ${String(error)}`);
        logger.error({ error }, 'Indexing failed');
        process.exit(1);
      }
    });
}
