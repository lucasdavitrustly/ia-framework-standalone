import pino from 'pino';

/**
 * Creates a structured pino logger bound to a component name.
 * Always outputs JSON to stderr for consistent structured logging.
 * Use stderr to avoid contaminating stdout (used by MCP server stdio transport).
 */
export function createLogger(component: string) {
  return pino(
    {
      name: component,
      level: process.env['LOG_LEVEL'] ?? 'info',
      base: { component },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination({ dest: 2, sync: false }), // 2 = stderr
  );
}

export type Logger = ReturnType<typeof createLogger>;
