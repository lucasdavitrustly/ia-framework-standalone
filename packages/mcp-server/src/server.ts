import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchCodebaseTool } from './tools/search-codebase.js';
import { registerSearchCodebaseHybridTool } from './tools/search-codebase-hybrid.js';
import { registerGetFileTool } from './tools/get-file.js';
import { registerGetDependenciesTool } from './tools/get-dependencies.js';
import { registerQueryDatabaseTool } from './tools/query-database.js';
import { registerIndexDatabaseSchemaTool } from './tools/index-database-schema.js';
import type { SearchEngine, MultiCollectionSearchEngine } from '@ia-framework/retrieval';
import type { MetricsStore, TokenCounter } from '@ia-framework/observability';

export interface McpServerConfig {
  searchEngine: SearchEngine | MultiCollectionSearchEngine;
  serverName?: string | undefined;
  serverVersion?: string | undefined;
  /** Optional observability — if provided, every search_codebase call is logged */
  metricsStore?: MetricsStore | undefined;
  tokenCounter?: TokenCounter | undefined;
  sessionId?: string | undefined;
  /** Path to .ia-framework/db.json — if provided, DB tools are registered */
  dbConfigPath?: string | undefined;
  /** Path to .ia-framework/project.json — needed for index_database_schema */
  configPath?: string | undefined;
  /** Default dependency graph expansion hops for search_codebase (0=off, 1=direct, 2=transitive) */
  defaultExpansionHops?: 0 | 1 | 2 | undefined;
}

/**
 * Create and configure an MCP server with all retrieval tools registered.
 * Returns the McpServer instance — call server.connect(transport) to start.
 */
export function createMcpServer(config: McpServerConfig): McpServer {
  const server = new McpServer({
    name: config.serverName ?? 'ia-framework',
    version: config.serverVersion ?? '0.0.1',
  });

  registerSearchCodebaseTool(server, config.searchEngine, {
    metricsStore: config.metricsStore,
    tokenCounter: config.tokenCounter,
    sessionId: config.sessionId,
    defaultExpansionHops: config.defaultExpansionHops,
  });
  registerSearchCodebaseHybridTool(server, config.searchEngine);
  registerGetFileTool(server, config.searchEngine);
  registerGetDependenciesTool(server, config.searchEngine);

  if (config.dbConfigPath) {
    registerQueryDatabaseTool(server, config.dbConfigPath);
    if (config.configPath) {
      registerIndexDatabaseSchemaTool(server, config.configPath, config.dbConfigPath);
    }
  }

  return server;
}
