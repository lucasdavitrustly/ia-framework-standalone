import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile, stat } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { registerSearchCodebaseTool } from './tools/search-codebase.js';
import { registerGetFileTool } from './tools/get-file.js';
import type { RepoResolution } from './tools/get-file.js';
import { registerGetDependenciesTool } from './tools/get-dependencies.js';
import { registerQueryDatabaseTool } from './tools/query-database.js';
import { registerIndexDatabaseSchemaTool } from './tools/index-database-schema.js';
import { withRequestLogging, type RequestLoggerDeps } from './request-logger.js';
import type { SearchEngine, MultiCollectionSearchEngine } from '@ia-framework/retrieval';
import type { MetricsStore, TokenCounter } from '@ia-framework/observability';
import type { ServerCapabilities } from './capabilities.js';
import { validateRelativePath } from './context/live-source-reader.js';

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
  /** Runtime capabilities snapshot — surfaces degradation via tool responses */
  capabilities?: ServerCapabilities | undefined;
}

/**
 * Resolve a repo's absolute root path for filesystem reads.
 *
 * - When `repoId` is undefined, returns the primary root (single-repo default).
 * - When `repoId` is given, returns the configured path for that repo.
 * - When `repoId` is given but not configured, throws — so a typo or stale
 *   repo prefix surfaces as an error instead of silently reading the wrong
 *   file from the default repo.
 */
export function resolveRepoRoot(
  repoPathMap: Map<string, string>,
  primaryRoot: string | undefined,
  repoId?: string,
): string | undefined {
  if (!repoId) return primaryRoot;
  const root = repoPathMap.get(repoId);
  if (!root) {
    const configured = [...repoPathMap.keys()].join(', ') || '(none)';
    throw new Error(`Unknown repo '${repoId}' — configured repos: ${configured}`);
  }
  return root;
}

/** Per-repo filesystem accessibility, computed at startup. */
export interface RepoAccessibility {
  path: string;
  accessible: boolean;
  error?: string;
}

/**
 * Validate that each resolved repo path exists as an accessible directory.
 * Does not throw — returns a map so the server can start with partial access
 * and surface inaccessible repos in diagnostics/tool responses.
 */
export function validateRepoPaths(
  repoPathMap: Map<string, string>,
): Map<string, RepoAccessibility> {
  const result = new Map<string, RepoAccessibility>();
  for (const [name, path] of repoPathMap) {
    try {
      const s = statSync(path);
      if (s.isDirectory()) {
        result.set(name, { path, accessible: true });
      } else {
        result.set(name, { path, accessible: false, error: 'path is not a directory' });
      }
    } catch (err) {
      result.set(name, { path, accessible: false, error: String(err) });
    }
  }
  return result;
}

/**
 * Build the cross-repo existence-check capability for `get_file` (feature 017).
 *
 * Given the configured repo→root map, per-repo accessibility, and a
 * repo-scoped `readFileFn`, returns a function that attempts an EXACT-JOIN read
 * of a relative path against every configured repository root, in configuration
 * order. Inaccessible repos are skipped and reported (never read). No recursive
 * directory scan is performed — at most one read attempt per repo (FR-002,
 * FR-007, FR-011).
 */
export function buildResolveFileAcrossRepos(
  repoPathMap: Map<string, string>,
  repoAccessibility: Map<string, RepoAccessibility>,
  readFileFn: (
    path: string,
    repo?: string,
    startLine?: number,
    endLine?: number,
  ) => Promise<string>,
): (
  relativePath: string,
  opts?: { startLine?: number; endLine?: number },
) => Promise<RepoResolution[]> {
  return async (relativePath, opts) => {
    const resolutions: RepoResolution[] = [];
    // Preserve configuration order.
    for (const repo of repoPathMap.keys()) {
      const access = repoAccessibility.get(repo);
      if (access && !access.accessible) {
        resolutions.push({
          repo,
          found: false,
          skipped: true,
          error: access.error ?? 'path inaccessible',
        });
        continue;
      }
      try {
        const content =
          opts?.startLine !== undefined && opts?.endLine !== undefined
            ? await readFileFn(relativePath, repo, opts.startLine, opts.endLine)
            : await readFileFn(relativePath, repo);
        resolutions.push({ repo, found: true, content });
      } catch (err) {
        resolutions.push({
          repo,
          found: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return resolutions;
  };
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

  // Validate repo paths at startup — mark inaccessible repos without aborting.
  const repoAccessibility = validateRepoPaths(repoPathMap);
  for (const [name, info] of repoAccessibility) {
    if (!info.accessible) {
      config.capabilities?.degradedFeatures.push(`filesystem_read:${name}`);
      config.capabilities?.degradedReasons.push(
        `Repo '${name}' filesystem read unavailable: ${info.error ?? 'path inaccessible'} (path: ${info.path}). Falling back to indexed content only.`,
      );
    }
  }

  const resolveRoot = (repoId?: string): string | undefined =>
    resolveRepoRoot(repoPathMap, primaryRoot, repoId);

  /** Throw a descriptive error if the target repo path is known-inaccessible. */
  const assertAccessible = (repoId?: string): void => {
    const name = repoId ?? (primaryRoot ? '_default' : undefined);
    if (!name) return;
    const info = repoAccessibility.get(name);
    if (info && !info.accessible) {
      throw new Error(
        `Repo '${name}' path is not accessible: ${info.error ?? 'unknown'} (resolved: ${info.path}). ` +
          `Check the repo path in .ia-framework/project.json.`,
      );
    }
  };

  // Filesystem read closure for search_codebase (line-range slicing)
  const searchReadFileFn =
    repoPathMap.size > 0
      ? async (
          relativePath: string,
          startLine: number,
          endLine: number,
          repoId?: string,
        ): Promise<string> => {
          assertAccessible(repoId);
           const root = resolveRoot(repoId);
           if (!root) throw new Error('No project root configured for filesystem read');
           const safePath = validateRelativePath(relativePath);
           const raw = await readFile(join(root, safePath), 'utf-8');
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
          assertAccessible(repo);
           const root = resolveRoot(repo);
           if (!root) throw new Error('No project root configured for filesystem read');
           const safePath = validateRelativePath(filePath);
           const raw = await readFile(join(root, safePath), 'utf-8');
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
    sessionCache: { enabled: true },
    ...(config.capabilities ? { capabilities: config.capabilities } : {}),
  });

  // Build statFn closure for get_file session dedup (mtime-based cache invalidation)
  const getFileStatFn =
    repoPathMap.size > 0
      ? async (filePath: string, repo?: string): Promise<{ mtimeMs: number }> => {
          const root = resolveRoot(repo);
          if (!root) throw new Error('No project root configured for stat');
           const safePath = validateRelativePath(filePath);
           const s = await stat(join(root, safePath));
          return { mtimeMs: s.mtimeMs };
        }
      : undefined;

  registerGetFileTool(server, config.searchEngine, {
    ...(getFileReadFileFn ? { readFileFn: getFileReadFileFn } : {}),
    ...(getFileReadFileFn
      ? {
          resolveFileAcrossRepos: buildResolveFileAcrossRepos(
            repoPathMap,
            repoAccessibility,
            getFileReadFileFn,
          ),
        }
      : {}),
    ...(getFileStatFn ? { statFn: getFileStatFn, sessionCache: true } : {}),
    knownRepos: [...repoPathMap.keys()],
    ...(config.capabilities ? { capabilities: config.capabilities } : {}),
  });
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
