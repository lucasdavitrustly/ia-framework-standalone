import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectConfig } from '@ia-framework/core';

interface StatusDeps {
  indexingState: { getState(): { running: boolean } };
  frameworkDir: string;
  configWatcher: { getConfig(): ProjectConfig | null };
  /** Optional fetch override for testing */
  fetchFn?: typeof fetch;
}

interface IndexingStateFile {
  lastIndexedCommit?: string;
}

export function statusRouter(deps: StatusDeps): Hono {
  const app = new Hono();
  const fetchImpl: typeof fetch = deps.fetchFn ?? fetch;

  app.get('/', async (c) => {
    // Derive Qdrant host/port per-request so that env var changes and config
    // reloads take effect without restarting the server.
    // Priority: QDRANT_HOST env var (set by Docker to the service name "qdrant")
    // > project.json vectorStore host > fallback "localhost"
    const config = deps.configWatcher.getConfig();
    const qdrantHost = process.env['QDRANT_HOST'] ?? config?.vectorStore.host ?? 'localhost';
    const qdrantPort =
      process.env['QDRANT_PORT'] != null
        ? parseInt(process.env['QDRANT_PORT'], 10)
        : (config?.vectorStore.port ?? 6333);

    // Check Qdrant health
    let qdrantStatus: 'ok' | 'error' = 'ok';
    try {
      const res = await fetchImpl(`http://${qdrantHost}:${qdrantPort}/readyz`);
      if (!res.ok) qdrantStatus = 'error';
    } catch {
      qdrantStatus = 'error';
    }

    // Read last indexed commit from indexing-state.json
    let lastIndexedCommit: string | null = null;
    try {
      const content = await readFile(join(deps.frameworkDir, 'indexing-state.json'), 'utf-8');
      const state = JSON.parse(content) as IndexingStateFile;
      lastIndexedCommit = state.lastIndexedCommit ?? null;
    } catch {
      // Not indexed yet
    }

    const indexingState = deps.indexingState.getState();

    return c.json({
      qdrant: qdrantStatus,
      indexingInProgress: indexingState.running,
      lastIndexedCommit,
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
