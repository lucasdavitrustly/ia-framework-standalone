import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IndexingStateManager } from '../indexing-state.js';

interface IndexingDeps {
  indexingState: IndexingStateManager;
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

  // GET /api/indexing/status
  app.get('/status', async (c) => {
    const memState = deps.indexingState.getState();

    // If the in-memory state shows indexing is running (legacy in-process path), prefer it.
    if (memState.running) {
      return c.json(memState);
    }

    // Otherwise check if the CLI wrote a progress file (CLI-triggered indexing).
    const fileState = await readProgressFile(deps.frameworkDir);
    if (fileState !== null) {
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

  return app;
}
