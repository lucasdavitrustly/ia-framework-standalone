import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MetricsStore } from '@ia-framework/observability';
import { BenchmarkStore } from '@ia-framework/benchmark';
import {
  DependencyGraph,
  SearchEngine,
  MultiCollectionSearchEngine,
} from '@ia-framework/retrieval';
import type { CollectionEngine } from '@ia-framework/retrieval';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { QdrantClient } from '@qdrant/js-client-rest';
import { ConfigWatcher } from './config-watcher.js';
import { IndexingStateManager } from './indexing-state.js';
import { SearchHistoryStore } from './search-history-store.js';
import { createApp } from './app.js';
import type { AppDependencies } from './app.js';

export interface ServerOptions {
  port: number;
  frameworkDir: string;
  configPath: string;
  publicDir: string;
}

export async function startServer(options: ServerOptions): Promise<void> {
  const { port, frameworkDir, configPath, publicDir } = options;

  // Initialize config watcher
  const configWatcher = new ConfigWatcher(configPath);
  await configWatcher.start();

  const config = configWatcher.getConfig();

  // Initialize stores
  const metricsStore = new MetricsStore(join(frameworkDir, 'metrics.sqlite'));
  const benchmarkStore = new BenchmarkStore(join(frameworkDir, 'benchmarks.sqlite'));
  const searchHistoryStore = new SearchHistoryStore(join(frameworkDir, 'search-history.sqlite'));
  const indexingState = new IndexingStateManager();

  // Initialize embedding provider and vector store only when config is available
  const _config = config; // retained for future use

  // Set up dependency graph for building import adjacency during indexing.
  // SearchEngine expects an async interface { getNeighborFiles(...): Promise<string[]> }
  // but DependencyGraph.getNeighborFiles is synchronous — wrap it in an adapter.
  const graphDbPath = join(frameworkDir, 'graph.sqlite');
  let dependencyGraph:
    | { getNeighborFiles(filePaths: string[], hops: 1 | 2): Promise<string[]> }
    | undefined;
  try {
    const rawGraph = new DependencyGraph({ dbPath: graphDbPath });
    rawGraph.initialize();
    dependencyGraph = {
      getNeighborFiles: (filePaths: string[], hops: 1 | 2) =>
        Promise.resolve(rawGraph.getNeighborFiles(filePaths, hops)),
    };
  } catch {
    dependencyGraph = undefined;
  }

  // ── Search engine wiring (mirrors mcp-server/bin.ts pattern) ──
  let searchDeps: AppDependencies['search'] = undefined;
  if (config) {
    try {
      const embeddingProvider = createEmbeddingProvider(config.embedding);
      const qdrantHost = process.env['QDRANT_HOST'] ?? config.vectorStore.host;
      const qdrantPort = config.vectorStore.port;
      const qdrantApiKey = config.vectorStore.apiKey;
      const baseCollectionName = config.vectorStore.collectionName;

      const qdrantClient = new QdrantClient({
        host: qdrantHost,
        port: qdrantPort,
        ...(qdrantApiKey !== undefined ? { apiKey: qdrantApiKey } : {}),
      });

      const candidateCollections: Array<{ name: 'ast' | 'llm'; collectionName: string }> = [
        { name: 'ast', collectionName: baseCollectionName },
        { name: 'llm', collectionName: `${baseCollectionName}-llm` },
      ];

      const collectionEngines: CollectionEngine[] = [];
      const vectorStores = new Map<string, QdrantVectorStore>();

      for (const candidate of candidateCollections) {
        const { exists } = await qdrantClient.collectionExists(candidate.collectionName);
        if (exists) {
          const vectorStore = new QdrantVectorStore({
            host: qdrantHost,
            port: qdrantPort,
            collectionName: candidate.collectionName,
            ...(qdrantApiKey !== undefined ? { apiKey: qdrantApiKey } : {}),
          });
          const engine = new SearchEngine({
            embeddingProvider,
            vectorStore,
            ...(candidate.name === 'ast' && dependencyGraph !== undefined
              ? { dependencyGraph }
              : {}),
          });
          collectionEngines.push({ name: candidate.name, engine });
          vectorStores.set(candidate.collectionName, vectorStore);
        }
      }

      if (collectionEngines.length > 0) {
        const multiSearchEngine = new MultiCollectionSearchEngine({
          engines: collectionEngines,
          ...(dependencyGraph !== undefined ? { dependencyGraph } : {}),
        });

        searchDeps = {
          collectionEngines,
          multiSearchEngine,
          getCollectionInfo: async (name: string) => {
            const vs = vectorStores.get(name);
            if (!vs) return null;
            try {
              const info = await vs.getCollectionInfo();
              return { pointCount: info.pointCount };
            } catch {
              return null;
            }
          },
          baseCollectionName,
          searchHistoryStore,
        };
      }
    } catch (err) {
      console.warn('Search engine wiring failed (Qdrant may be unavailable):', err);
    }
  }

  // Build Hono app
  const app = createApp({
    metricsStore,
    benchmarkStore,
    configWatcher,
    indexingState,
    frameworkDir,
    ...(searchDeps !== undefined ? { search: searchDeps } : {}),
  });

  // Serve static files for React build
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const staticDir = publicDir || join(__dirname, '../public');
  process.env['DASHBOARD_PUBLIC_DIR'] = staticDir;

  // Add static file serving
  app.use(
    '/*',
    serveStatic({
      root: staticDir,
    }),
  );

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Dashboard API running on http://localhost:${info.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    configWatcher.stop();
    metricsStore.close();
    benchmarkStore.close();
    searchHistoryStore.close();
    process.exit(0);
  });
}

// Main entry point when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const frameworkDir = process.env['IA_FRAMEWORK_DIR'];
  if (!frameworkDir) {
    console.error('Error: IA_FRAMEWORK_DIR environment variable is required');
    process.exit(1);
  }

  const configPath = process.env['IA_FRAMEWORK_CONFIG'] ?? join(frameworkDir, 'project.json');
  const serverPort = parseInt(process.env['DASHBOARD_PORT'] ?? '3000', 10);
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const publicDir = process.env['DASHBOARD_PUBLIC_DIR'] ?? join(__dirname, '../public');

  void startServer({
    port: serverPort,
    frameworkDir,
    configPath,
    publicDir,
  });
}
