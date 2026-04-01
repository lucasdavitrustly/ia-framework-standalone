import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface StatusDeps {
  indexingState: { getState(): { running: boolean } };
  frameworkDir: string;
  qdrantHost: string;
  qdrantPort: number;
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
    // Check Qdrant health
    let qdrantStatus: 'ok' | 'error' = 'ok';
    try {
      const res = await fetchImpl(`http://${deps.qdrantHost}:${deps.qdrantPort}/readyz`);
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
