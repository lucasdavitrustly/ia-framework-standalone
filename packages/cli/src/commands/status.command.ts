import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { loadConfig } from '@ia-framework/core';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { getLastIndexedCommit, getCurrentCommit } from '@ia-framework/indexer';

export function statusCommand(): Command {
  return new Command('status')
    .description('Show indexing status and Qdrant collection info')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (options: { config: string }) => {
      const configPath =
        options.config ||
        process.env['IA_FRAMEWORK_CONFIG'] ||
        join(process.cwd(), '.ia-framework', 'project.json');

      try {
        const config = await loadConfig(configPath);
        const frameworkDir = dirname(configPath);

        console.log('ia-framework status');
        console.log('═══════════════════════════════════════');
        console.log(`Config:         ${configPath}`);
        console.log(`Target project: ${config.targetProjectPath}`);
        console.log(`Embedding:      ${config.embedding.provider} / ${config.embedding.model}`);
        console.log(`Vector store:   ${config.vectorStore.host}:${config.vectorStore.port}`);
        console.log(`Collection:     ${config.vectorStore.collectionName}`);

        // Try to connect to Qdrant
        console.log('');
        try {
          const vectorStore = new QdrantVectorStore({
            host: config.vectorStore.host,
            port: config.vectorStore.port,
            collectionName: config.vectorStore.collectionName,
            apiKey: config.vectorStore.apiKey,
          });

          const info = await vectorStore.getCollectionInfo();
          console.log(`Qdrant:         ✓ connected`);
          console.log(`Chunks indexed: ${info.pointCount ?? 0}`);
          console.log(`Status:         ${info.status}`);
        } catch {
          console.log(`Qdrant:         ✗ not reachable`);
          console.log(`  → Is Docker running? Try: docker compose up -d qdrant`);
        }

        // Show last indexed commit vs current
        console.log('');
        try {
          const lastCommit = await getLastIndexedCommit(frameworkDir);
          const currentCommit = await getCurrentCommit(config.targetProjectPath);

          if (lastCommit) {
            const upToDate = lastCommit === currentCommit;
            const indicator = upToDate ? '✓ up to date' : '⚠ stale';
            console.log(`Last indexed:   ${lastCommit.slice(0, 8)} (${indicator})`);
            if (currentCommit) {
              console.log(`Current HEAD:   ${currentCommit.slice(0, 8)}`);
            }
            if (!upToDate) {
              console.log(`  → Run: ia-framework index`);
            }
          } else {
            console.log(`Last indexed:   never`);
            console.log(`  → Run: ia-framework index`);
          }
        } catch {
          console.log(`Last indexed:   unknown (could not read git state)`);
        }
      } catch (error) {
        console.error(`✗ Status failed: ${String(error)}`);
        process.exit(1);
      }
    });
}
