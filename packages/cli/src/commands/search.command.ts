import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { loadConfig, createLogger } from '@ia-framework/core';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import {
  SearchEngine,
  DependencyGraph,
  MultiCollectionSearchEngine,
} from '@ia-framework/retrieval';
import type { CollectionEngine, RetrievalResult } from '@ia-framework/retrieval';
import { MetricsStore, TokenCounter, generateSessionId } from '@ia-framework/observability';

export function searchCommand(): Command {
  return new Command('search')
    .description('Search the indexed codebase with a natural language query')
    .argument('<query>', 'Natural language search query')
    .option('-l, --limit <n>', 'Maximum number of results', '10')
    .option('-t, --threshold <n>', 'Minimum score threshold (0-1)', '0.5')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(
      async (query: string, options: { limit: string; threshold: string; config: string }) => {
        const logger = createLogger('cli:search');
        const configPath =
          options.config ||
          process.env['IA_FRAMEWORK_CONFIG'] ||
          join(process.cwd(), '.ia-framework', 'project.json');

        try {
          const config = await loadConfig(configPath);
          const embeddingProvider = createEmbeddingProvider(config.embedding);
          // CLI runs on the host machine — use QDRANT_HOST env var or fall back to localhost.
          // config.vectorStore.host may be "qdrant" (the Docker service name), which only
          // resolves inside Docker containers. From the host, Qdrant is reachable via localhost.
          const qdrantHost = process.env['QDRANT_HOST'] ?? 'localhost';
          const baseCollectionName = config.vectorStore.collectionName;

          // Set up dependency graph for search expansion (if graph.sqlite exists)
          const frameworkDir = dirname(configPath);
          const graphDbPath = join(frameworkDir, 'graph.sqlite');
          let dependencyGraph:
            | { getNeighborFiles(filePaths: string[], hops: 1 | 2): Promise<string[]> }
            | undefined;

          try {
            const graph = new DependencyGraph({ dbPath: graphDbPath });
            graph.initialize();
            dependencyGraph = {
              getNeighborFiles: async (filePaths: string[], hops: 1 | 2) =>
                graph.getNeighborFiles(filePaths, hops),
            };
          } catch {
            // Graph not available — search will work without expansion
          }

          // Discover active collections — convention: {base} for AST, {base}-llm for LLM
          const qdrantClient = new QdrantClient({
            host: qdrantHost,
            port: config.vectorStore.port,
            ...(config.vectorStore.apiKey ? { apiKey: config.vectorStore.apiKey } : {}),
          });

          const candidateCollections: Array<{ name: 'ast' | 'llm'; collectionName: string }> = [
            { name: 'ast', collectionName: baseCollectionName },
            { name: 'llm', collectionName: `${baseCollectionName}-llm` },
          ];

          const collectionEngines: CollectionEngine[] = [];

          for (const candidate of candidateCollections) {
            const { exists } = await qdrantClient.collectionExists(candidate.collectionName);
            if (exists) {
              const vectorStore = new QdrantVectorStore({
                host: qdrantHost,
                port: config.vectorStore.port,
                collectionName: candidate.collectionName,
                apiKey: config.vectorStore.apiKey,
              });
              const engine = new SearchEngine({
                embeddingProvider,
                vectorStore,
                // Only wire dependency graph to AST engines — LLM chunks have empty imports/exports
                dependencyGraph: candidate.name === 'ast' ? dependencyGraph : undefined,
              });
              collectionEngines.push({ name: candidate.name, engine });
            }
          }

          if (collectionEngines.length === 0) {
            console.error('✗ No indexed collections found. Run "ia-framework index" first.');
            process.exit(1);
          }

          const searchEngine = new MultiCollectionSearchEngine({
            engines: collectionEngines,
            ...(dependencyGraph !== undefined ? { dependencyGraph } : {}),
          });

          const limit = parseInt(options.limit, 10);
          const scoreThreshold = parseFloat(options.threshold);

          // Read expansion hops from config (default: 1 = direct imports)
          const expansionHops = config.retrieval?.expansionHops ?? 1;

          console.log(`Searching for: "${query}"\n`);

          const startTime = Date.now();
          const results = await searchEngine.searchWithExpansion(
            {
              text: query,
              limit: isNaN(limit) ? 10 : limit,
              scoreThreshold: isNaN(scoreThreshold) ? 0.5 : scoreThreshold,
            },
            { hops: expansionHops },
          );
          const latencyMs = Date.now() - startTime;

          // Log RAG event — graceful degradation on failure
          try {
            const metricsDbPath = join(dirname(configPath), 'metrics.sqlite');
            const metricsStore = new MetricsStore(metricsDbPath);
            const tokenCounter = new TokenCounter();
            const sessionId = generateSessionId();

            metricsStore.logEvent({
              id: crypto.randomUUID(),
              sessionId,
              query,
              chunksRetrieved: results.length,
              chunkIds: results.map((r) => r.chunkId),
              tokenCount: tokenCounter.countRagEvent(
                query,
                results.map((r) => r.content),
              ),
              strategy: 'mcp',
              timestamp: new Date().toISOString(),
              latencyMs,
            });
            metricsStore.close();
          } catch {
            // Observability failure must never break search output
          }

          if (results.length === 0) {
            console.log('No results found.');
            console.log('  • Try lowering --threshold (default: 0.5)');
            console.log('  • Ensure the codebase is indexed: ia-framework index');
            return;
          }

          console.log(`Found ${results.length} result(s)\n`);

          for (const result of results as RetrievalResult[]) {
            const name = result.name
              ? ` (${result.chunkType}: ${result.name})`
              : ` (${result.chunkType})`;
            const score = result.score.toFixed(3);
            const matched = result.matchedVector;
            const source = result.source ? ` [${result.source}]` : '';

            console.log(
              `─── ${result.relativePath}${name} [score: ${score}, matched: ${matched}]${source}`,
            );

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
      },
    );
}
