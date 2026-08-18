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
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, createLogger, RepoRegistry, detectSqliteBackend } from '@ia-framework/core';
import { createEmbeddingProvider, CachingEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import {
  SearchEngine,
  DependencyGraph,
  MultiCollectionSearchEngine,
} from '@ia-framework/retrieval';
import type { CollectionEngine } from '@ia-framework/retrieval';
import type { EffectiveFilter } from '@ia-framework/retrieval';
import { MetricsStore, TokenCounter, generateSessionId } from '@ia-framework/observability';
import { createMcpServer } from './server.js';
import { registerContractGate, warmContractGates } from './tools/search-codebase.js';
import { createCapabilities, serverMode, type ServerCapabilities } from './capabilities.js';

const logger = createLogger('mcp-server');

/**
 * Discover the .ia-framework/project.json config path in a CWD-independent way.
 *
 * Resolution order:
 *  1. IA_FRAMEWORK_CONFIG env var (explicit, absolute) — highest priority.
 *  2. Walk up from this binary's own location (import.meta.url) looking for
 *     .ia-framework/project.json — robust when the MCP host spawns the server
 *     with a working directory other than the project root.
 *  3. process.cwd()/.ia-framework/project.json — last-resort legacy behavior.
 *
 * Returns the resolved path and the method used (for diagnostics).
 */
function discoverConfigPath(): { configPath: string; method: string } {
  const envPath = process.env['IA_FRAMEWORK_CONFIG'];
  if (envPath) {
    return { configPath: envPath, method: 'env:IA_FRAMEWORK_CONFIG' };
  }

  // Walk up from the binary's directory looking for .ia-framework/project.json.
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    // Bound the walk to avoid infinite loops on odd filesystems.
    for (let i = 0; i < 20; i++) {
      const candidate = join(dir, '.ia-framework', 'project.json');
      if (existsSync(candidate)) {
        return { configPath: candidate, method: 'import.meta.url-walkup' };
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // fileURLToPath may fail in exotic bundling scenarios — fall through to cwd.
  }

  return {
    configPath: join(process.cwd(), '.ia-framework', 'project.json'),
    method: 'process.cwd()',
  };
}

async function main(): Promise<void> {
  // Capabilities snapshot — populated as backends/features initialize.
  const runtimeVersion = process.versions.node;
  const capabilities: ServerCapabilities = createCapabilities(runtimeVersion);

  // Detect the SQLite backend up front for diagnostics.
  const sqliteBackend = detectSqliteBackend();
  capabilities.sqliteBackend = sqliteBackend ?? 'none';
  logger.info(
    { runtimeVersion, sqliteBackend: capabilities.sqliteBackend },
    'Runtime detected; SQLite backend selected',
  );

  // Load config from .ia-framework/project.json (CWD-independent discovery).
  const { configPath, method: configDiscoveryMethod } = discoverConfigPath();
  logger.info({ configPath, configDiscoveryMethod }, 'Config path resolved');

  const config = await loadConfig(configPath);

  const baseEmbeddingProvider = createEmbeddingProvider(config.embedding);
  // Wrap with caching layer (T157) — deterministic embed() results cached LRU-100
  const embeddingProvider = new CachingEmbeddingProvider(baseEmbeddingProvider);
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
    | {
        getNeighborFiles(
          filePaths: string[],
          hops: 1 | 2,
          filter: EffectiveFilter,
        ): Promise<string[]>;
      }
    | undefined;

  try {
    const graph = new DependencyGraph({ dbPath: graphDbPath });
    graph.initialize();
    // Wrap sync getNeighborFiles as async to match SearchEngineConfig interface.
    dependencyGraph = {
      getNeighborFiles: (filePaths, hops, filter) =>
        Promise.resolve(graph.getNeighborFiles(filePaths, hops, filter)),
    };
    capabilities.dependencyGraphAvailable = true;
    logger.info({ graphDbPath }, 'Dependency graph loaded for search expansion');
  } catch (err) {
    capabilities.dependencyGraphAvailable = false;
    capabilities.degradedFeatures.push('dependency_graph_expansion');
    capabilities.degradedReasons.push(
      `Dependency graph expansion unavailable: ${String(err)}. Results may include fewer related files.`,
    );
    logger.warn(
      { graphDbPath, err: String(err) },
      'Dependency graph not available — expansion disabled',
    );
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
        elbowDropThreshold: 0.15,
        elbowMinResults: 2,
      });
      collectionEngines.push({ name: candidate.name, engine });
      logger.info(
        { collection: candidate.collectionName, type: candidate.name },
        'Collection discovered',
      );

      // Register the embedding-contract gate for this collection (EMB-09, A-27).
      // QdrantVectorStore.initialize() is assertSearchable()'s only caller, so
      // it is the real contract gate; it also reconciles payload indexes, which
      // context.md decision 1 requires to be additive and silent on success.
      registerContractGate(candidate.collectionName, async () => {
        await vectorStore.initialize({
          textDimensions: embeddingProvider.dimensions,
          codeDimensions: embeddingProvider.dimensions,
          embeddingContract: embeddingProvider.contract,
        });
      });
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

  // Operator visibility for the embedding contract (EMB-09, D-2): warn at
  // startup and keep the server up. Never throws — a throw here would become
  // process.exit(1) above, replacing the actionable per-request refusal with an
  // opaque dead server.
  await warmContractGates((collectionName, err) => {
    logger.warn(
      { collection: collectionName, err: err.message },
      'Embedding contract is not searchable — searches will be refused. ' +
        'Run "ia index --force" to rebuild the collection with the active embedding contract.',
    );
  });

  const searchEngine = new MultiCollectionSearchEngine({
    engines: collectionEngines,
    ...(dependencyGraph !== undefined ? { dependencyGraph } : {}),
  });

  // Set up observability — metrics stored in .ia-framework/metrics.sqlite.
  // Wrapped in try/catch: on the extreme edge case where NO SQLite backend is
  // available (Node < 22.5 AND better-sqlite3 missing), the server still starts
  // with metrics disabled rather than crashing.
  const metricsDbPath = join(frameworkDir, 'metrics.sqlite');
  let metricsStore: MetricsStore | undefined;
  try {
    metricsStore = new MetricsStore(metricsDbPath);
    capabilities.metricsStoreAvailable = true;
    logger.info({ metricsDbPath }, 'Metrics store initialized');
  } catch (err) {
    capabilities.metricsStoreAvailable = false;
    capabilities.degradedFeatures.push('metrics_collection');
    capabilities.degradedReasons.push(
      `Metrics collection disabled: ${String(err)}. Observability data will not be recorded.`,
    );
    logger.warn(
      { metricsDbPath, err: String(err) },
      'Metrics store unavailable — metrics disabled',
    );
  }
  const tokenCounter = new TokenCounter();
  const sessionId = generateSessionId();

  logger.info({ metricsDbPath, sessionId }, 'Observability initialized');

  const dbConfigPath = join(frameworkDir, 'db.json');

  // Read expansion hops from config (default: 1)
  const expansionHops = config.retrieval?.expansionHops ?? 1;

  // Build resolved repo list via RepoRegistry (supports both repos[] and targetProjectPath)
  const registry = RepoRegistry.fromConfig(config, dirname(configPath));
  const resolvedRepos = registry.getRepos().map((r) => ({ name: r.name!, path: r.path }));

  const server = createMcpServer({
    searchEngine,
    ...(metricsStore ? { metricsStore } : {}),
    tokenCounter,
    sessionId,
    configPath,
    dbConfigPath,
    defaultExpansionHops: expansionHops,
    projectRoot: resolvedRepos[0]?.path,
    repos: resolvedRepos,
    capabilities,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Startup summary — reports overall mode and any unavailable features.
  logger.info(
    {
      mode: serverMode(capabilities),
      sqliteBackend: capabilities.sqliteBackend,
      degradedFeatures: capabilities.degradedFeatures,
    },
    `MCP server started (stdio transport) — mode=${serverMode(capabilities)}`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`MCP server fatal error: ${String(err)}\n`);
  process.exit(1);
});
