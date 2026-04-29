import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchCodebaseTool } from './tools/search-codebase.js';
import { registerSearchCodebaseHybridTool } from './tools/search-codebase-hybrid.js';
import { registerGetFileTool } from './tools/get-file.js';
import { registerGetDependenciesTool } from './tools/get-dependencies.js';
import { registerGetModuleDependenciesTool } from './tools/get-module-dependencies.js';
import type { ModuleDepsEngine } from './tools/get-module-dependencies.js';
import { registerBenchmarkPreflightTool } from './tools/benchmark-preflight.js';
import { registerQueryDatabaseTool } from './tools/query-database.js';
import { registerIndexDatabaseSchemaTool } from './tools/index-database-schema.js';
import type { SearchEngine, MultiCollectionSearchEngine } from '@ia-framework/retrieval';
import type { MetricsStore, TokenCounter } from '@ia-framework/observability';
import type { ModuleChunkResult } from './tools/get-module-dependencies.js';

/**
 * Create a searchByModule adapter that queries SearchEngine with a mavenModule.artifactId filter.
 * Extracted for testability.
 */
export function createSearchByModuleAdapter(
  searchEngine: SearchEngine | MultiCollectionSearchEngine,
): (moduleName: string, limit: number) => Promise<ModuleChunkResult[]> {
  return async (moduleName: string, limit: number) => {
    const artifactId = moduleName.includes(':') ? moduleName.split(':')[1]! : moduleName;
    const results = await searchEngine.search({
      text: 'interface DTO',
      limit,
      scoreThreshold: 0.1,
      filter: { must: [{ key: 'mavenModule.artifactId', match: { value: artifactId } }] },
    });
    return results.map((r) => ({
      name: r.name,
      relativePath: r.relativePath,
      chunkType: r.chunkType,
      content: r.content,
    }));
  };
}

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
  /** Path to the target project root — needed for getModuleGraph */
  projectRoot?: string | undefined;
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
  registerBenchmarkPreflightTool(server, config.searchEngine);

  // Register Maven module dependencies tool if metricsStore + projectRoot available
  if (config.metricsStore && config.projectRoot) {
    const metricsStore = config.metricsStore;
    const projectRoot = config.projectRoot;
    const moduleDepsEngine: ModuleDepsEngine = {
      getModuleGraph: () => metricsStore.getModuleGraph(projectRoot),
      searchByModule: createSearchByModuleAdapter(config.searchEngine),
    };
    registerGetModuleDependenciesTool(server, moduleDepsEngine);
  }

  if (config.dbConfigPath) {
    registerQueryDatabaseTool(server, config.dbConfigPath);
    if (config.configPath) {
      registerIndexDatabaseSchemaTool(server, config.configPath, config.dbConfigPath);
    }
  }

  return server;
}
