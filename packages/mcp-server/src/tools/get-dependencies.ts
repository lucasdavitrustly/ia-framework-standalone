import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult } from '@ia-framework/retrieval';

type Engine = {
  getFile(path: string): Promise<RetrievalResult[]>;
  search?(query: { text: string; limit?: number | undefined }): Promise<RetrievalResult[]>;
};

export interface GetDependenciesInput {
  path: string;
}

export type ToolOutput = CallToolResult;

/**
 * Handle the get_dependencies tool call.
 * Extracts unique imports and exports from all chunks in the file.
 */
export async function getDependenciesHandler(
  engine: Engine,
  input: GetDependenciesInput,
): Promise<ToolOutput> {
  let results: RetrievalResult[];
  let fallbackNote: string | undefined;

  try {
    results = await engine.getFile(input.path);
  } catch (error) {
    if (!engine.search) {
      throw error;
    }

    results = await engine.search({ text: input.path, limit: 5 });
    fallbackNote =
      `Note: direct dependency extraction was unavailable (${error instanceof Error ? error.message : String(error)}). ` +
      'Returning dependency hints from indexed evidence matching the requested path.';
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

  // Collect unique imports and exports across all chunks
  const allImports = new Set<string>();
  const allExports = new Set<string>();

  for (const chunk of results) {
    for (const imp of chunk.imports) {
      allImports.add(imp);
    }
    for (const exp of chunk.exports) {
      allExports.add(exp);
    }
  }

  const importsList =
    allImports.size > 0
      ? [...allImports]
          .sort()
          .map((i) => `- ${i}`)
          .join('\n')
      : '(none)';

  const exportsList =
    allExports.size > 0
      ? [...allExports]
          .sort()
          .map((e) => `- ${e}`)
          .join('\n')
      : '(none)';

  const text = `${fallbackNote ? `${fallbackNote}\n\n` : ''}## Dependencies for: ${input.path}\n\n### Imports\n${importsList}\n\n### Exports\n${exportsList}`;
  const conclusion = `Conclusion: found dependency evidence for ${input.path}.`;

  return {
    content: [{ type: 'text', text: `${conclusion}\n\n${text}` }],
    structuredContent: {
      ...(fallbackNote ? { fallbackUsed: true } : {}),
      answered: true,
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
