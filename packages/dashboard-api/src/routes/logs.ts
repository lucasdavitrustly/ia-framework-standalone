import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';

const LEVEL_MAP: Record<string, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LEVEL_LABELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

interface LogsRouteDeps {
  frameworkDir: string;
  /** Override for testing — reads the log file content */
  readFileFn?: (path: string) => Promise<string>;
}

export function logsRouter(deps: LogsRouteDeps): Hono {
  const app = new Hono();
  const readFileFn = deps.readFileFn ?? ((p: string) => readFile(p, 'utf8'));
  const logFilePath = join(deps.frameworkDir, 'logs', 'mcp-server.log');

  app.get('/', async (c) => {
    const levelParam = c.req.query('level') ?? 'info';
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;

    // Validate level
    if (!LEVEL_MAP[levelParam]) {
      return c.json(
        { error: 'Invalid level filter. Must be one of: debug, info, warn, error, fatal' },
        400,
      );
    }

    const minLevel = LEVEL_MAP[levelParam];

    // Read log file
    let content: string;
    try {
      content = await readFileFn(logFilePath);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'ENOENT'
      ) {
        return c.json({ entries: [], total: 0, file: '.ia-framework/logs/mcp-server.log' });
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Failed to read log file: ${message}` }, 500);
    }

    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    // Parse and filter
    interface ParsedEntry {
      timestamp: string;
      level: number;
      levelLabel: string;
      component: string;
      msg: string;
      metadata: Record<string, unknown>;
    }

    const allEntries: ParsedEntry[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        if (typeof obj.level !== 'number' || typeof obj.msg !== 'string') continue;

        const level = obj.level;
        const timestamp =
          typeof obj.time === 'number'
            ? new Date(obj.time).toISOString()
            : typeof obj.time === 'string'
              ? obj.time
              : new Date().toISOString();

        const component = typeof obj.name === 'string' ? obj.name : 'unknown';

        // Extract metadata (everything except known fields)
        const metadata: Record<string, unknown> = { ...obj };
        for (const known of ['level', 'time', 'msg', 'name']) delete metadata[known];

        allEntries.push({
          timestamp,
          level,
          levelLabel: LEVEL_LABELS[level] ?? `level-${level}`,
          component,
          msg: obj.msg,
          metadata,
        });
      } catch {
        // Malformed line — skip
      }
    }

    // Filter by level
    const filtered = allEntries.filter((e) => e.level >= minLevel);

    // Return newest-first, limited
    const sorted = filtered.reverse();
    const limited = sorted.slice(0, limit);

    return c.json({
      entries: limited,
      total: filtered.length,
      file: '.ia-framework/logs/mcp-server.log',
    });
  });

  return app;
}
