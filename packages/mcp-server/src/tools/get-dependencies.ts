import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult } from '@ia-framework/retrieval';
import { resolveImportToRepo } from '@ia-framework/core';
import { parseRepoPath } from './get-file.js';

type Engine = {
  getFile(path: string): Promise<RetrievalResult[]>;
  search?(query: {
    text: string;
    limit?: number | undefined;
    scoreThreshold?: number | undefined;
    filter?: Record<string, unknown> | undefined;
  }): Promise<RetrievalResult[]>;
  /** Available repos for cross-repo import annotation */
  repos?: Array<{ name: string; provides?: string[] | undefined }>;
};

export interface GetDependenciesInput {
  /** Relative file path — file-level query. Mutually exclusive with `module`. */
  path?: string;
  /** Module name (e.g. 'com.example:auth-service') — module-level BFS. Mutually exclusive with `path`. */
  module?: string;
  /** BFS traversal depth for module queries (default: 1). */
  depth?: number;
  /** Filter to specific repo. */
  repo?: string;
}

export type ToolOutput = CallToolResult;

/**
 * Handle the get_dependencies tool call.
 * Supports two modes:
 * - `path`: extract dependency edges from a specific file's indexed chunks.
 * - `module`: BFS traversal from all files in a module up to `depth` hops.
 *
 * Exactly one of `path` or `module` must be provided.
 */
export async function getDependenciesHandler(
  engine: Engine,
  input: GetDependenciesInput,
): Promise<ToolOutput> {
  // Validate mutual exclusion
  if (input.path !== undefined && (input as any).module !== undefined) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: cannot specify both `path` and `module` — provide exactly one.',
        },
      ],
    };
  }

  if ((input as any).module !== undefined) {
    return getDependenciesForModule(engine, (input as any).module as string, input);
  }

  // Path-mode (default): backward-compat with original behavior
  return getDependenciesForPath(engine, input);
}

// ---------------------------------------------------------------------------
// Path-level dependency extraction
// ---------------------------------------------------------------------------

async function getDependenciesForPath(
  engine: Engine,
  input: GetDependenciesInput,
): Promise<ToolOutput> {
  const { repo, path: filePath } = parseRepoPath(input.path!);

  let results: RetrievalResult[];
  let fallbackNote: string | undefined;

  try {
    results = await engine.getFile(filePath);
  } catch (error) {
    if (!engine.search) {
      throw error;
    }

    results = await engine.search({ text: filePath, limit: 5 });
    fallbackNote =
      `Note: direct dependency extraction was unavailable (${error instanceof Error ? error.message : String(error)}). ` +
      'Returning dependency hints from indexed evidence matching the requested path.';
  }

  // Filter by repo if prefix was specified
  if (repo) {
    results = results.filter((r) => r.repoId === repo);
  }

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: fallbackNote
            ? `${fallbackNote}\n\nNo indexed chunks found for: ${input.path}`
            : `No indexed chunks found for: ${input.path}`,
        },
      ],
      ...(fallbackNote ? { structuredContent: { fallbackUsed: true } } : {}),
    };
  }

  // Group results by repoId
  const repoGroups = new Map<string, RetrievalResult[]>();
  for (const r of results) {
    const key = r.repoId ?? '_default';
    const group = repoGroups.get(key) ?? [];
    group.push(r);
    repoGroups.set(key, group);
  }

  const multiRepo = repoGroups.size > 1 || (repoGroups.size === 1 && !repoGroups.has('_default'));
  const textParts: string[] = [];
  const structuredDeps: Array<{
    repo?: string | undefined;
    imports: Array<{ specifier: string; crossRepo?: string | undefined }>;
    exports: string[];
  }> = [];

  for (const [repoKey, groupResults] of repoGroups) {
    const allImports = new Set<string>();
    const allExports = new Set<string>();

    for (const chunk of groupResults) {
      for (const imp of chunk.imports) allImports.add(imp);
      for (const exp of chunk.exports) allExports.add(exp);
    }

    const importsList =
      allImports.size > 0
        ? [...allImports]
            .sort()
            .map((i) => {
              if (engine.repos) {
                const resolution = resolveImportToRepo(
                  i,
                  engine.repos.filter((r) => r.name !== repoKey),
                );
                if (resolution) return `- ${i} [${resolution.targetRepo}]`;
              }
              return `- ${i}`;
            })
            .join('\n')
        : '(none)';

    const exportsList =
      allExports.size > 0
        ? [...allExports]
            .sort()
            .map((e) => `- ${e}`)
            .join('\n')
        : '(none)';

    if (multiRepo && repoKey !== '_default') {
      textParts.push(`## [${repoKey}]`);
    }

    textParts.push(`### Imports\n${importsList}\n\n### Exports\n${exportsList}`);

    structuredDeps.push({
      repo: repoKey === '_default' ? undefined : repoKey,
      imports: [...allImports].sort().map((i) => {
        if (engine.repos) {
          const resolution = resolveImportToRepo(
            i,
            engine.repos.filter((r) => r.name !== repoKey),
          );
          if (resolution) return { specifier: i, crossRepo: resolution.targetRepo };
        }
        return { specifier: i };
      }),
      exports: [...allExports].sort(),
    });
  }

  // Collect all dependencyEdges across all chunks (deduped by targetPath+relation)
  const edgeMap = new Map<
    string,
    (typeof results)[0]['dependencyEdges'] extends Array<infer T> | undefined ? T : never
  >();
  for (const chunk of results) {
    for (const edge of chunk.dependencyEdges ?? []) {
      edgeMap.set(`${edge.targetPath}:${edge.relation}`, edge);
    }
  }
  const allEdges = [...edgeMap.values()];

  // Build structured imports from dependencyEdges
  const structuredImports = allEdges
    .filter((e) => e.relation === 'imports')
    .map((e) => ({ path: e.targetPath, symbols: e.symbols ?? [], relation: e.relation }));

  const header = `## Dependencies for: ${filePath}`;
  const text = `${fallbackNote ? `${fallbackNote}\n\n` : ''}${header}\n\n${textParts.join('\n\n')}`;
  const conclusion = `Conclusion: found dependency evidence for ${input.path}.`;

  return {
    content: [{ type: 'text', text: `${conclusion}\n\n${text}` }],
    structuredContent: {
      ...(fallbackNote ? { fallbackUsed: true } : {}),
      answered: true,
      target: filePath,
      imports: structuredImports,
      dependencyEdges: allEdges,
      deps: structuredDeps,
    },
  };
}

// ---------------------------------------------------------------------------
// Module-level BFS dependency traversal
// ---------------------------------------------------------------------------

async function getDependenciesForModule(
  engine: Engine,
  moduleName: string,
  input: GetDependenciesInput,
): Promise<ToolOutput> {
  const depth = input.depth ?? 1;

  if (!engine.search) {
    return {
      content: [
        {
          type: 'text',
          text: `Cannot perform module-level query: search capability not available.`,
        },
      ],
    };
  }

  // Extract artifactId for the filter (support both 'groupId:artifactId' and bare 'artifactId')
  const artifactId = moduleName.includes(':') ? moduleName.split(':')[1]! : moduleName;

  // BFS state
  const visitedPaths = new Set<string>();
  const allEdges: Array<{ targetPath: string; relation: string; symbols?: string[] | undefined }> =
    [];

  // Hop 0: get all files in the starting module via search filter
  const startChunks = await engine.search({
    text: '',
    limit: 100,
    scoreThreshold: 0,
    filter: { must: [{ key: 'moduleInfo.module', match: { value: artifactId } }] },
  });

  // Collect starting file paths
  const startPaths = new Set<string>(
    startChunks.map((c) => c.relativePath).filter(Boolean) as string[],
  );

  for (const chunk of startChunks) {
    for (const edge of chunk.dependencyEdges ?? []) {
      allEdges.push(edge);
    }
    if (chunk.relativePath) visitedPaths.add(chunk.relativePath);
  }

  // BFS hops 1..depth: follow dependencyEdge targetPaths
  let frontier = [
    ...new Set(allEdges.map((e) => e.targetPath).filter((p) => !visitedPaths.has(p))),
  ];

  for (let hop = 1; hop < depth; hop++) {
    if (frontier.length === 0) break;
    const nextFrontier: string[] = [];

    for (const targetPath of frontier) {
      if (visitedPaths.has(targetPath)) continue;
      visitedPaths.add(targetPath);

      try {
        const chunks = await engine.getFile(targetPath);
        for (const chunk of chunks) {
          for (const edge of chunk.dependencyEdges ?? []) {
            if (!visitedPaths.has(edge.targetPath)) {
              allEdges.push(edge);
              nextFrontier.push(edge.targetPath);
            }
          }
        }
      } catch {
        // file not indexed — skip
      }
    }

    frontier = [...new Set(nextFrontier)];
  }

  // Deduplicate edges
  const edgeMap = new Map<string, (typeof allEdges)[0]>();
  for (const edge of allEdges) {
    edgeMap.set(`${edge.targetPath}:${edge.relation}`, edge);
  }
  const uniqueEdges = [...edgeMap.values()];

  const structuredImports = uniqueEdges
    .filter((e) => e.relation === 'imports')
    .map((e) => ({ path: e.targetPath, symbols: e.symbols ?? [], relation: e.relation }));

  const header = `## Module Dependencies: ${moduleName}`;
  const importLines =
    structuredImports.length > 0
      ? structuredImports
          .map((i) => `- ${i.path} (${i.symbols.join(', ') || 'no symbols'})`)
          .join('\n')
      : '(none)';
  const filesInModule =
    startPaths.size > 0 ? [...startPaths].map((p) => `- ${p}`).join('\n') : '(none)';
  const text = `${header}\n\n### Files in module\n${filesInModule}\n\n### Imports (depth=${depth})\n${importLines}`;

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      answered: true,
      target: moduleName,
      imports: structuredImports,
      dependencyEdges: uniqueEdges,
    },
  };
}

/**
 * Register the get_dependencies tool on an MCP server.
 */
export function registerGetDependenciesTool(server: McpServer, engine: Engine): void {
  server.registerTool(
    'get_dependencies',
    {
      description:
        'Get the imports and exports for a specific file or module. ' +
        'Provide either `path` (file-level lookup) or `module` (module-level with BFS traversal). ' +
        'Returns imports, exports, and full dependencyEdges for graph navigation. ' +
        'Use `depth` to control BFS traversal depth for module queries (default: 1).',
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            'Relative file path (e.g., "src/auth/middleware.ts"). Mutually exclusive with module.',
          ),
        module: z
          .string()
          .optional()
          .describe(
            'Module name to look up (maps to moduleInfo.module). Mutually exclusive with path.',
          ),
        depth: z
          .number()
          .optional()
          .describe('BFS traversal depth for module queries (default: 1, max: 3).'),
      },
    },
    async (input) => {
      return getDependenciesHandler(engine, input as GetDependenciesInput);
    },
  );
}
