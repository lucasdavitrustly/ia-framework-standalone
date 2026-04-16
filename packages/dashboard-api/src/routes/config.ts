import { Hono } from 'hono';
import { readFile, writeFile } from 'node:fs/promises';
import type { ProjectConfig } from '@ia-framework/core';

interface ConfigDeps {
  configWatcher: { getConfig(): ProjectConfig | null };
  configPath: string;
}

export function configRouter(deps: ConfigDeps): Hono {
  const app = new Hono();

  app.get('/', (c) => {
    const config = deps.configWatcher.getConfig();
    if (!config) {
      return c.json({ error: 'Config not loaded' }, 503);
    }
    return c.json(config);
  });

  app.patch('/', async (c) => {
    try {
      const patch = await c.req.json();

      // Read current config from disk
      let current: Record<string, unknown> = {};
      try {
        const raw = await readFile(deps.configPath, 'utf-8');
        current = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return c.json({ error: 'Config file not found' }, 404);
      }

      // Deep merge patch into current (one level for indexing.llm)
      if (patch.indexing?.llm) {
        const existingIndexing = (current.indexing as Record<string, unknown>) ?? {};
        current.indexing = {
          ...existingIndexing,
          llm: {
            ...((existingIndexing.llm as Record<string, unknown>) ?? {}),
            ...patch.indexing.llm,
          },
        };
      }

      await writeFile(deps.configPath, JSON.stringify(current, null, 2), 'utf-8');
      // ConfigWatcher will auto-detect the file change

      return c.json(current);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return app;
}
