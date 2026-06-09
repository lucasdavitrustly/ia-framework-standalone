import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerSearchCodebaseTool } from './tools/search-codebase.js';
import { registerGetFileTool } from './tools/get-file.js';
import { registerGetDependenciesTool } from './tools/get-dependencies.js';
import { registerQueryDatabaseTool } from './tools/query-database.js';
import { registerIndexDatabaseSchemaTool } from './tools/index-database-schema.js';
import { withRequestLogging, type RequestLoggerDeps } from './request-logger.js';
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
  /** Absolute path to the target project root (used by tools for filesystem reads) */
  projectRoot?: string | undefined;
  /** Resolved repo list for multi-repo filesystem reads (name → absolute path) */
  repos?: Array<{ name: string; path: string }> | undefined;
}

/**
 * Create and configure an MCP server with all retrieval tools registered.
 * Returns the McpServer instance — call server.connect(transport) to start.
 *
 * Registered tools: search_codebase, get_file, get_dependencies
 * (search_codebase_hybrid, get_module_dependencies, and benchmark_preflight
 *  were removed in feature 008 — functionality merged into the three tools above)
 */
export function createMcpServer(config: McpServerConfig): McpServer {
  const server = new McpServer({
    name: config.serverName ?? 'ia-framework',
    version: config.serverVersion ?? '0.0.1',
  });

  // Build repo-path map for multi-repo filesystem reads
  const primaryRoot = config.projectRoot;
  const repoPathMap = new Map<string, string>(
    (config.repos ?? (primaryRoot ? [{ name: '_default', path: primaryRoot }] : [])).map((r) => [
      r.name,
      r.path,
    ]),
  );
  const resolveRoot = (repoId?: string): string | undefined =>
    repoId ? (repoPathMap.get(repoId) ?? primaryRoot) : primaryRoot;

  // Filesystem read closure for search_codebase (line-range slicing)
  const searchReadFileFn =
    repoPathMap.size > 0
      ? async (
          relativePath: string,
          startLine: number,
          endLine: number,
          repoId?: string,
        ): Promise<string> => {
          const root = resolveRoot(repoId);
          if (!root) throw new Error('No project root configured for filesystem read');
          const raw = await readFile(join(root, relativePath), 'utf-8');
          const lines = raw.split('\n');
          return lines.slice(startLine - 1, endLine).join('\n');
        }
      : undefined;

  // Filesystem read closure for get_file (full file or line-range content)
  const getFileReadFileFn =
    repoPathMap.size > 0
      ? async (
          filePath: string,
          repo?: string,
          startLine?: number,
          endLine?: number,
        ): Promise<string> => {
          const root = resolveRoot(repo);
          if (!root) throw new Error('No project root configured for filesystem read');
          const raw = await readFile(join(root, filePath), 'utf-8');
          if (startLine !== undefined && endLine !== undefined) {
            const lines = raw.split('\n');
            return lines.slice(startLine - 1, endLine).join('\n');
          }
          return raw;
        }
      : undefined;

  registerSearchCodebaseTool(server, config.searchEngine, {
    metricsStore: config.metricsStore,
    tokenCounter: config.tokenCounter,
    sessionId: config.sessionId,
    defaultExpansionHops: config.defaultExpansionHops,
    confidenceThreshold: 0.45,
    defaultScoreThreshold: 0.4,
    ...(searchReadFileFn ? { readFileFn: searchReadFileFn } : {}),
  });
  registerGetFileTool(
    server,
    config.searchEngine,
    getFileReadFileFn ? { readFileFn: getFileReadFileFn } : undefined,
  );
  registerGetDependenciesTool(server, config.searchEngine);

  if (config.dbConfigPath) {
    registerQueryDatabaseTool(server, config.dbConfigPath);
    if (config.configPath) {
      registerIndexDatabaseSchemaTool(server, config.configPath, config.dbConfigPath);
    }
  }

  // Wire request logging for all registered tools if metricsStore + tokenCounter available
  if (config.metricsStore && config.tokenCounter) {
    const loggerDeps: RequestLoggerDeps = {
      metricsStore: config.metricsStore,
      tokenCounter: config.tokenCounter,
      sessionId: config.sessionId ?? 'unknown',
    };
    wrapToolsWithLogging(server, loggerDeps);
  }

  return server;
}

/**
 * Wrap all registered tool handlers with request logging.
 * Accesses internal _registeredTools to decorate handlers post-registration.
 */
function wrapToolsWithLogging(server: McpServer, deps: RequestLoggerDeps): void {
  // Access internal registered tools map (McpServer internals)
  const registeredTools = (
    server as unknown as {
      _registeredTools: Record<string, { handler: (...args: unknown[]) => Promise<unknown> }>;
    }
  )._registeredTools;
  if (!registeredTools) return;

  for (const [toolName, toolEntry] of Object.entries(registeredTools)) {
    const originalHandler = toolEntry.handler;
    if (typeof originalHandler === 'function') {
      toolEntry.handler = withRequestLogging(
        toolName,
        originalHandler as (
          input: Record<string, unknown>,
          ...rest: unknown[]
        ) => Promise<{ content: Array<{ type: string; text?: string }> }>,
        deps,
      ) as unknown as typeof originalHandler;
    }
  }
}

type ToolHandler = (...args: unknown[]) => unknown;
