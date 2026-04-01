import { Command } from 'commander';
import { join } from 'node:path';
import { loadConfig, createLogger } from '@ia-framework/core';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { SearchEngine } from '@ia-framework/retrieval';
import type { RetrievalResult } from '@ia-framework/retrieval';

export function searchCommand(): Command {
  return new Command('search')
    .description('Search the indexed codebase with a natural language query')
    .argument('<query>', 'Natural language search query')
    .option('-l, --limit <n>', 'Maximum number of results', '10')
    .option('-t, --threshold <n>', 'Minimum score threshold (0-1)', '0.5')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (query: string, options: { limit: string; threshold: string; config: string }) => {
      const logger = createLogger('cli:search');
      const configPath =
        options.config ||
        process.env['IA_FRAMEWORK_CONFIG'] ||
        join(process.cwd(), '.ia-framework', 'project.json');

      try {
        const config = await loadConfig(configPath);
        const embeddingProvider = createEmbeddingProvider(config.embedding);
        const vectorStore = new QdrantVectorStore({
          host: config.vectorStore.host,
          port: config.vectorStore.port,
          collectionName: config.vectorStore.collectionName,
          apiKey: config.vectorStore.apiKey,
        });

        const searchEngine = new SearchEngine({ embeddingProvider, vectorStore });

        const limit = parseInt(options.limit, 10);
        const scoreThreshold = parseFloat(options.threshold);

        console.log(`Searching for: "${query}"\n`);

        const results = await searchEngine.search({
          text: query,
          limit: isNaN(limit) ? 10 : limit,
          scoreThreshold: isNaN(scoreThreshold) ? 0.5 : scoreThreshold,
        });

        if (results.length === 0) {
          console.log('No results found.');
          console.log('  • Try lowering --threshold (default: 0.5)');
          console.log('  • Ensure the codebase is indexed: ia-framework index');
          return;
        }

        console.log(`Found ${results.length} result(s)\n`);

        for (const result of results as RetrievalResult[]) {
          const name = result.name ? ` (${result.chunkType}: ${result.name})` : ` (${result.chunkType})`;
          const score = result.score.toFixed(3);
          const matched = result.matchedVector;

          console.log(`─── ${result.relativePath}${name} [score: ${score}, matched: ${matched}]`);

          const preview = result.content.slice(0, 400);
          const truncated = result.content.length > 400;
          console.log(preview + (truncated ? '\n  ...' : ''));
          console.log('');
        }
      } catch (error) {
        console.error(`✗ Search failed: ${String(error)}`);
        logger.error({ error }, 'Search failed');
        process.exit(1);
      }
    });
}
