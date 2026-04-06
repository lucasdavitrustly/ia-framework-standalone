#!/usr/bin/env node
/**
 * MCP server binary — wires config, SearchEngine, MetricsStore, and StdioTransport.
 * Run via: node dist/bin.js
 * OpenCode configures this as an MCP server in its config.
 *
 * Config is loaded from .ia-framework/project.json relative to cwd,
 * or from the IA_FRAMEWORK_CONFIG environment variable if set.
 */
import { join, dirname } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, createLogger } from '@ia-framework/core';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { SearchEngine, DependencyGraph } from '@ia-framework/retrieval';
import { MetricsStore, TokenCounter, generateSessionId } from '@ia-framework/observability';
import { createMcpServer } from './server.js';

const logger = createLogger('mcp-server');

async function main(): Promise<void> {
  // Load config from .ia-framework/project.json (searches from cwd)
  const configPath =
    process.env['IA_FRAMEWORK_CONFIG'] ?? join(process.cwd(), '.ia-framework', 'project.json');

  const config = await loadConfig(configPath);

  const embeddingProvider = createEmbeddingProvider(config.embedding);
  // MCP server runs on the host machine — use QDRANT_HOST env var or fall back to localhost.
  // config.vectorStore.host may be "qdrant" (the Docker service name), which only
  // resolves inside Docker containers. From the host, Qdrant is reachable via localhost.
  const qdrantHost = process.env['QDRANT_HOST'] ?? 'localhost';
  const vectorStore = new QdrantVectorStore({
    host: qdrantHost,
    port: config.vectorStore.port,
    collectionName: config.vectorStore.collectionName,
    apiKey: config.vectorStore.apiKey,
  });

  // Set up dependency graph for search expansion (if graph.sqlite exists)
  const frameworkDir = dirname(configPath);
  const graphDbPath = join(frameworkDir, 'graph.sqlite');
  let dependencyGraph:
    | { getNeighborFiles(filePaths: string[], hops: 1 | 2): Promise<string[]> }
    | undefined;

  try {
    const graph = new DependencyGraph({ dbPath: graphDbPath });
    graph.initialize();
    // Wrap sync getNeighborFiles as async to match SearchEngineConfig interface
    dependencyGraph = {
      getNeighborFiles: async (filePaths: string[], hops: 1 | 2) =>
        graph.getNeighborFiles(filePaths, hops),
    };
    logger.info({ graphDbPath }, 'Dependency graph loaded for search expansion');
  } catch {
    logger.info({ graphDbPath }, 'Dependency graph not available — expansion disabled');
  }

  const searchEngine = new SearchEngine({ embeddingProvider, vectorStore, dependencyGraph });

  // Set up observability — metrics stored in .ia-framework/metrics.sqlite
  const metricsDbPath = join(frameworkDir, 'metrics.sqlite');
  const metricsStore = new MetricsStore(metricsDbPath);
  const tokenCounter = new TokenCounter();
  const sessionId = generateSessionId();

  logger.info({ metricsDbPath, sessionId }, 'Observability initialized');

  const dbConfigPath = join(frameworkDir, 'db.json');

  // Read expansion hops from config (default: 1)
  const expansionHops = config.retrieval?.expansionHops ?? 1;

  const server = createMcpServer({
    searchEngine,
    metricsStore,
    tokenCounter,
    sessionId,
    configPath,
    dbConfigPath,
    defaultExpansionHops: expansionHops,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP server started (stdio transport)');
}

main().catch((err: unknown) => {
  process.stderr.write(`MCP server fatal error: ${String(err)}\n`);
  process.exit(1);
});
