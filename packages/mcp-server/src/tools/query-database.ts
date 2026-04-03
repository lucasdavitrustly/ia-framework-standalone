import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadDbConfig, PostgresSource, DbConfigNotFoundError } from '@ia-framework/db-context';

export type ToolOutput = CallToolResult;

/**
 * Handle the query_database tool call.
 * Executes arbitrary SQL against the configured PostgreSQL database.
 * Gracefully returns error text if db.json is missing or connection fails.
 */
export async function queryDatabaseHandler(
  input: { sql: string },
  dbConfigPath: string,
): Promise<ToolOutput> {
  // Check if db is configured
  let config;
  try {
    config = await loadDbConfig(dbConfigPath);
  } catch (err) {
    if (err instanceof DbConfigNotFoundError) {
      return {
        content: [{ type: 'text', text: 'Database not configured. Run: ia-framework db configure' }],
      };
    }
    return {
      content: [{ type: 'text', text: `Database config error: ${String(err)}` }],
    };
  }

  const source = new PostgresSource(config);
  try {
    const result = await source.executeQuery(input.sql);
    const text = `Rows: ${result.rowCount}\n\n${JSON.stringify(result.rows, null, 2)}`;
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }] };
  } finally {
    await source.close();
  }
}

/**
 * Register the query_database tool on an MCP server.
 */
export function registerQueryDatabaseTool(server: McpServer, dbConfigPath: string): void {
  server.registerTool(
    'query_database',
    {
      description:
        'Execute SQL against the configured PostgreSQL database. WARNING: This tool executes SQL directly. Write operations (INSERT, UPDATE, DELETE) will modify the database.',
      inputSchema: {
        sql: z.string().min(1).describe('SQL query to execute'),
      },
    },
    async (input) => {
      return queryDatabaseHandler(input, dbConfigPath);
    },
  );
}
