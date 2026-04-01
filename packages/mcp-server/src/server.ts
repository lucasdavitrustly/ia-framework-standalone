import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchCodebaseTool } from './tools/search-codebase.js';
import { registerGetFileTool } from './tools/get-file.js';
import { registerGetDependenciesTool } from './tools/get-dependencies.js';
import type { SearchEngine } from '@ia-framework/retrieval';

export interface McpServerConfig {
  searchEngine: SearchEngine;
  serverName?: string | undefined;
  serverVersion?: string | undefined;
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

  registerSearchCodebaseTool(server, config.searchEngine);
  registerGetFileTool(server, config.searchEngine);
  registerGetDependenciesTool(server, config.searchEngine);

  return server;
}
