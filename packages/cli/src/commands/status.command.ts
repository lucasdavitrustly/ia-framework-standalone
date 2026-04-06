import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '@ia-framework/core';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { getLastIndexedCommit, getCurrentCommit } from '@ia-framework/indexer';
import { MetricsStore } from '@ia-framework/observability';

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
        const effectiveQdrantHost = process.env['QDRANT_HOST'] ?? 'localhost';
        console.log(`Vector store:   ${effectiveQdrantHost}:${config.vectorStore.port}`);
        console.log(`Collection:     ${config.vectorStore.collectionName}`);

        // Try to connect to Qdrant
        console.log('');
        try {
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

        // Show observability stats
        console.log('');
        console.log('=== Observability ===');
        const metricsDbPath = join(frameworkDir, 'metrics.sqlite');
        console.log(`Metrics DB:    ${metricsDbPath}`);

        if (!existsSync(metricsDbPath)) {
          console.log('No metrics recorded yet.');
          console.log('  → Run ia-framework search or use OpenCode MCP tools to start tracking.');
        } else {
          try {
            const metricsStore = new MetricsStore(metricsDbPath);
            const stats = metricsStore.getTotalStats();
            metricsStore.close();

            console.log(`Total Events:  ${stats.totalEvents.toLocaleString()}`);
            console.log(`Total Tokens:  ${stats.totalTokens.toLocaleString()}`);
            console.log(`Sessions:      ${stats.totalSessions.toLocaleString()}`);
            console.log(`Avg Tokens/Q:  ${stats.avgTokensPerQuery.toLocaleString()}`);
          } catch {
            console.log('Could not read metrics DB.');
          }
        }
      } catch (error) {
        console.error(`✗ Status failed: ${String(error)}`);
        process.exit(1);
      }
    });
}
