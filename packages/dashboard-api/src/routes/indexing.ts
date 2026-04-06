import { Hono } from 'hono';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IndexingStateManager } from '../indexing-state.js';
import type { IndexingProgress } from '@ia-framework/indexer';

export type TriggerFn = (
  onProgress: (progress: IndexingProgress) => void,
  signal?: AbortSignal,
) => Promise<{ filesIndexed: number; chunksIndexed: number }>;

interface IndexingDeps {
  indexingState: IndexingStateManager;
  triggerIndexing: TriggerFn;
  /** frameworkDir is used to read CLI-written progress file for cross-process visibility */
  frameworkDir: string;
}

interface ProgressFile {
  running: boolean;
  stage: string | null;
  filesTotal: number;
  filesProcessed: number;
  chunksTotal: number;
  chunksIndexed: number;
  currentFile: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
}

/**
 * Read the CLI-written indexing-progress.json file from frameworkDir.
 * Returns null if the file doesn't exist or is malformed.
 */
async function readProgressFile(frameworkDir: string): Promise<ProgressFile | null> {
  try {
    const raw = await readFile(join(frameworkDir, 'indexing-progress.json'), 'utf-8');
    return JSON.parse(raw) as ProgressFile;
  } catch {
    return null;
  }
}

export function indexingRouter(deps: IndexingDeps): Hono {
  const app = new Hono();
  let activeController: AbortController | null = null;

  // GET /api/indexing/status
  app.get('/status', async (c) => {
    const memState = deps.indexingState.getState();

    // If the in-memory state shows indexing is running (dashboard-triggered), prefer it.
    if (memState.running) {
      return c.json(memState);
    }

    // Otherwise check if the CLI wrote a progress file (CLI-triggered indexing).
    const fileState = await readProgressFile(deps.frameworkDir);
    if (fileState !== null) {
      // Merge file state into the response shape expected by the frontend
      return c.json({
        running: fileState.running,
        stage: fileState.stage ?? null,
        filesTotal: fileState.filesTotal ?? 0,
        filesProcessed: fileState.filesProcessed ?? 0,
        chunksTotal: fileState.chunksTotal ?? 0,
        chunksIndexed: fileState.chunksIndexed ?? 0,
        currentFile: fileState.currentFile ?? null,
        startedAt: fileState.startedAt ?? null,
        completedAt: fileState.completedAt ?? null,
        error: fileState.error ?? null,
      });
    }

    // No file state — return in-memory default (all zeros)
    return c.json(memState);
  });

  // POST /api/indexing/trigger
  app.post('/trigger', async (c) => {
    if (deps.indexingState.getState().running) {
      return c.json({ error: 'Indexing already in progress' }, 409);
    }

    const startedAt = new Date().toISOString();
    deps.indexingState.start(startedAt);

    const controller = new AbortController();
    activeController = controller;

    // Fire and forget
    void deps
      .triggerIndexing((progress) => {
        deps.indexingState.update(progress);
      }, controller.signal)
      .then(() => {
        deps.indexingState.complete(new Date().toISOString());
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        deps.indexingState.fail(msg);
      })
      .finally(() => {
        if (activeController === controller) activeController = null;
      });

    return c.json({ message: 'Indexing started', startedAt }, 202);
  });

  // POST /api/indexing/stop
  app.post('/stop', async (c) => {
    // Abort in-process dashboard-triggered indexing
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    deps.indexingState.cancel();

    // Write sentinel file for CLI-triggered indexing (cross-process)
    try {
      await writeFile(join(deps.frameworkDir, 'indexing-stop-requested'), '', 'utf-8');
    } catch {
      // Non-fatal — CLI sentinel is best-effort
    }

    return c.json({ message: 'Stop requested' });
  });

  return app;
}
