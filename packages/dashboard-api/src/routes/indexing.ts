import { Hono } from 'hono';
import type { IndexingStateManager } from '../indexing-state.js';
import type { IndexingProgress } from '@ia-framework/indexer';

export type TriggerFn = (
  onProgress: (progress: IndexingProgress) => void,
) => Promise<{ filesIndexed: number; chunksIndexed: number }>;

interface IndexingDeps {
  indexingState: IndexingStateManager;
  triggerIndexing: TriggerFn;
}

export function indexingRouter(deps: IndexingDeps): Hono {
  const app = new Hono();

  // GET /api/indexing/status
  app.get('/status', (c) => {
    return c.json(deps.indexingState.getState());
  });

  // POST /api/indexing/trigger
  app.post('/trigger', async (c) => {
    if (deps.indexingState.getState().running) {
      return c.json({ error: 'Indexing already in progress' }, 409);
    }

    const startedAt = new Date().toISOString();
    deps.indexingState.start(startedAt);

    // Fire and forget
    void deps.triggerIndexing((progress) => {
      deps.indexingState.update(progress);
    })
      .then(() => {
        deps.indexingState.complete(new Date().toISOString());
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        deps.indexingState.fail(msg);
      });

    return c.json({ message: 'Indexing started', startedAt }, 202);
  });

  return app;
}
