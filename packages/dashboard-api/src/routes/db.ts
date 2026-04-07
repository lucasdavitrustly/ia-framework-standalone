import { join } from 'node:path';
import { Hono } from 'hono';
import { loadDbConfig, PostgresSource, DbConfigNotFoundError } from '@ia-framework/db-context';

interface DbRouteDeps {
  frameworkDir: string;
  loadDbConfigFn?: typeof loadDbConfig;
  PostgresSourceCtor?: typeof PostgresSource;
}

export function dbRouter(deps: DbRouteDeps): Hono {
  const app = new Hono();
  const loadDbConfigFn = deps.loadDbConfigFn ?? loadDbConfig;
  const PostgresSourceCtor = deps.PostgresSourceCtor ?? PostgresSource;

  app.get('/status', async (c) => {
    // Try to load DB config
    let config: Awaited<ReturnType<typeof loadDbConfig>>;
    try {
      config = await loadDbConfigFn(join(deps.frameworkDir, 'db.json'));
    } catch (err) {
      if (err instanceof DbConfigNotFoundError) {
        return c.json({ configured: false, connected: false, tableCount: null });
      }
      throw err;
    }

    // Config found — try to connect
    const source = new PostgresSourceCtor(config);
    try {
      const { connected, tableCount } = await source.testConnection();
      if (connected) {
        return c.json({ configured: true, connected: true, tableCount });
      } else {
        return c.json({
          configured: true,
          connected: false,
          tableCount: null,
          error: 'Connection failed',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ configured: true, connected: false, tableCount: null, error: message });
    } finally {
      await source.close();
    }
  });

  return app;
}
