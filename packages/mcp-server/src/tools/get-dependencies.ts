import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult } from '@ia-framework/retrieval';
import { resolveImportToRepo } from '@ia-framework/core';
import { parseRepoPath } from './get-file.js';

type Engine = {
  getFile(path: string): Promise<RetrievalResult[]>;
  search?(query: { text: string; limit?: number | undefined }): Promise<RetrievalResult[]>;
  /** Available repos for cross-repo import annotation */
  repos?: Array<{ name: string; provides?: string[] | undefined }>;
};

export interface GetDependenciesInput {
  path: string;
}

export type ToolOutput = CallToolResult;

/**
 * Handle the get_dependencies tool call.
 * Extracts unique imports and exports from all chunks in the file.
 * Supports multi-repo resolution with optional repo:path prefix syntax.
 */
export async function getDependenciesHandler(
  engine: Engine,
  input: GetDependenciesInput,
): Promise<ToolOutput> {
  const { repo, path: filePath } = parseRepoPath(input.path);

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

  const header = `## Dependencies for: ${filePath}`;
  const text = `${fallbackNote ? `${fallbackNote}\n\n` : ''}${header}\n\n${textParts.join('\n\n')}`;
  const conclusion = `Conclusion: found dependency evidence for ${input.path}.`;

  return {
    content: [{ type: 'text', text: `${conclusion}\n\n${text}` }],
    structuredContent: {
      ...(fallbackNote ? { fallbackUsed: true } : {}),
      answered: true,
      deps: structuredDeps,
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
        'Get the imports and exports for a specific file. Returns a deduplicated list of module dependencies and exported symbols.',
      inputSchema: {
        path: z.string().describe('Relative file path (e.g., "src/auth/middleware.ts")'),
      },
    },
    async (input) => {
      return getDependenciesHandler(engine, input);
    },
  );
}
