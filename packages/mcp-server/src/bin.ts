#!/usr/bin/env node
/**
 * MCP server binary — wires config, MultiCollectionSearchEngine, MetricsStore, and StdioTransport.
 * Run via: node dist/bin.js
 * OpenCode configures this as an MCP server in its config.
 *
 * Config is loaded from .ia-framework/project.json relative to cwd,
 * or from the IA_FRAMEWORK_CONFIG environment variable if set.
 *
 * At startup, discovers active Qdrant collections via existence check:
 * - {base}     → AST collection (always checked)
 * - {base}-llm → LLM collection (optional, checked if configured)
 * Creates a SearchEngine per existing collection, wraps all in MultiCollectionSearchEngine.
 * Exits with error if no collections are found.
 */
import { join, dirname } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, createLogger } from '@ia-framework/core';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import {
  SearchEngine,
  DependencyGraph,
  MultiCollectionSearchEngine,
} from '@ia-framework/retrieval';
import type { CollectionEngine } from '@ia-framework/retrieval';
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
  const qdrantPort = config.vectorStore.port;
  const qdrantApiKey = config.vectorStore.apiKey;
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
    // Wrap sync getNeighborFiles as async to match SearchEngineConfig interface
    dependencyGraph = {
      getNeighborFiles: async (filePaths: string[], hops: 1 | 2) =>
        graph.getNeighborFiles(filePaths, hops),
    };
    logger.info({ graphDbPath }, 'Dependency graph loaded for search expansion');
  } catch {
    logger.info({ graphDbPath }, 'Dependency graph not available — expansion disabled');
  }

  // Discover active collections — convention: {base} for AST, {base}-llm for LLM
  const qdrantClient = new QdrantClient({
    host: qdrantHost,
    port: qdrantPort,
    ...(qdrantApiKey ? { apiKey: qdrantApiKey } : {}),
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
        port: qdrantPort,
        collectionName: candidate.collectionName,
        apiKey: qdrantApiKey,
      });
      const engine = new SearchEngine({
        embeddingProvider,
        vectorStore,
        // Only wire dependency graph to AST engines — LLM chunks have empty imports/exports
        dependencyGraph: candidate.name === 'ast' ? dependencyGraph : undefined,
      });
      collectionEngines.push({ name: candidate.name, engine });
      logger.info(
        { collection: candidate.collectionName, type: candidate.name },
        'Collection discovered',
      );
    } else {
      logger.info(
        { collection: candidate.collectionName, type: candidate.name },
        'Collection not found — skipping',
      );
    }
  }

  if (collectionEngines.length === 0) {
    logger.error('No Qdrant collections found. Run "ia-framework index" first.');
    process.exit(1);
  }

  const searchEngine = new MultiCollectionSearchEngine({
    engines: collectionEngines,
    ...(dependencyGraph !== undefined ? { dependencyGraph } : {}),
  });

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
