import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult } from '@ia-framework/retrieval';

type HybridEngine = {
  searchHybrid(query: {
    text: string;
    limit?: number | undefined;
    filter?: Record<string, unknown> | undefined;
  }): Promise<RetrievalResult[]>;
};

export interface SearchCodebaseHybridInput {
  query: string;
  limit?: number | undefined;
}

export type ToolOutput = CallToolResult;

/**
 * Format a single RetrievalResult as a markdown section.
 * Same format as search_codebase for consistency.
 */
function formatResult(result: RetrievalResult, index: number): string {
  const sourceTag = result.source ? ` [${result.source}]` : '';
  const header = result.name
    ? `### ${index}. ${result.relativePath} (${result.name}) — score: ${result.score.toFixed(3)} [hybrid]${sourceTag}`
    : `### ${index}. ${result.relativePath} — score: ${result.score.toFixed(3)} [hybrid]${sourceTag}`;

  const codeBlock = `\`\`\`${result.language}\n${result.content}\n\`\`\``;
  return `${header}\n${codeBlock}`;
}

/**
 * Handle the search_codebase_hybrid tool call.
 * Exported separately for testability.
 */
export async function searchCodebaseHybridHandler(
  engine: HybridEngine,
  input: SearchCodebaseHybridInput,
): Promise<ToolOutput> {
  const results = await engine.searchHybrid({
    text: input.query,
    limit: input.limit ?? 10,
  });

  if (results.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: `No results found for query: "${input.query}"`,
        },
      ],
    };
  }

  const sections = results.map((r, i) => formatResult(r, i + 1));
  const text = `## Hybrid search results for: "${input.query}"\n\n${sections.join('\n\n')}`;

  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Register the search_codebase_hybrid tool on an MCP server.
 */
export function registerSearchCodebaseHybridTool(server: McpServer, engine: HybridEngine): void {
  server.registerTool(
    'search_codebase_hybrid',
    {
      description:
        'Search the indexed codebase using hybrid retrieval: BM25 sparse keyword search + dense semantic search, ' +
        'combined via Reciprocal Rank Fusion (RRF). ' +
        'Better than search_codebase for queries mixing exact identifiers with semantic concepts. ' +
        'Use search_codebase for pure semantic queries; use this tool when you know specific class/function names.',
      inputSchema: {
        query: z.string().describe('Natural language search query (can include exact identifiers)'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
      },
    },
    async (input) => {
      return searchCodebaseHybridHandler(engine, input);
    },
  );
}
