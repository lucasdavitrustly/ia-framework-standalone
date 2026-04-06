import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MetricsStore } from '@ia-framework/observability';
import { BenchmarkStore } from '@ia-framework/benchmark';
import { DependencyGraph } from '@ia-framework/retrieval';
import { ConfigWatcher } from './config-watcher.js';
import { IndexingStateManager } from './indexing-state.js';
import { createApp } from './app.js';

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
  const indexingState = new IndexingStateManager();

  // Initialize embedding provider and vector store only when config is available
  const _config = config; // retained for future use

  // Set up dependency graph for building import adjacency during indexing
  const graphDbPath = join(frameworkDir, 'graph.sqlite');
  let dependencyGraph: InstanceType<typeof DependencyGraph> | undefined;
  try {
    dependencyGraph = new DependencyGraph({ dbPath: graphDbPath });
    dependencyGraph.initialize();
  } catch {
    dependencyGraph = undefined;
  }

  void dependencyGraph; // may be used by future CLI-triggered indexing

  // Build Hono app
  const app = createApp({
    metricsStore,
    benchmarkStore,
    configWatcher,
    indexingState,
    frameworkDir,
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
