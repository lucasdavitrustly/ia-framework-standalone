import { Hono } from 'hono';
import type { ProjectConfig } from '@ia-framework/core';

interface ConfigDeps {
  configWatcher: { getConfig(): ProjectConfig | null };
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

  return app;
}
