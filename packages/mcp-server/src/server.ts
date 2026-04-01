import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchCodebaseTool } from './tools/search-codebase.js';
import { registerGetFileTool } from './tools/get-file.js';
import { registerGetDependenciesTool } from './tools/get-dependencies.js';
import type { SearchEngine } from '@ia-framework/retrieval';
import type { MetricsStore, TokenCounter } from '@ia-framework/observability';

export interface McpServerConfig {
  searchEngine: SearchEngine;
  serverName?: string | undefined;
  serverVersion?: string | undefined;
  /** Optional observability — if provided, every search_codebase call is logged */
  metricsStore?: MetricsStore | undefined;
  tokenCounter?: TokenCounter | undefined;
  sessionId?: string | undefined;
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
  });
  registerGetFileTool(server, config.searchEngine);
  registerGetDependenciesTool(server, config.searchEngine);

  return server;
}
