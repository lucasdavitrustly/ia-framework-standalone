import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult } from '@ia-framework/retrieval';
import type { MetricsStore, TokenCounter } from '@ia-framework/observability';

type Engine = {
  search(query: {
    text: string;
    limit?: number;
    scoreThreshold?: number;
  }): Promise<RetrievalResult[]>;
  searchWithExpansion(
    query: { text: string; limit?: number; scoreThreshold?: number },
    options?: { hops?: 0 | 1 | 2 },
  ): Promise<RetrievalResult[]>;
};

export interface SearchCodebaseInput {
  query: string;
  limit?: number | undefined;
  score_threshold?: number | undefined;
  expand_hops?: number | undefined;
}

export type ToolOutput = CallToolResult;

export interface ObservabilityConfig {
  metricsStore?: MetricsStore | undefined;
  tokenCounter?: TokenCounter | undefined;
  sessionId?: string | undefined;
  /** Default expansion hops from project config (0=off, 1=direct, 2=transitive) */
  defaultExpansionHops?: 0 | 1 | 2 | undefined;
}

/**
 * Format a single RetrievalResult as a markdown section.
 */
function formatResult(result: RetrievalResult, index: number): string {
  const header = result.name
    ? `### ${index}. ${result.relativePath} (${result.name}) — score: ${result.score.toFixed(2)} [${result.matchedVector}]`
    : `### ${index}. ${result.relativePath} — score: ${result.score.toFixed(2)} [${result.matchedVector}]`;

  const codeBlock = `\`\`\`${result.language}\n${result.content}\n\`\`\``;

  return `${header}\n${codeBlock}`;
}

/**
 * Handle the search_codebase tool call.
 * Exported separately for testability.
 */
export async function searchCodebaseHandler(
  engine: Engine,
  input: SearchCodebaseInput,
  observability?: ObservabilityConfig,
): Promise<ToolOutput> {
  const startTime = Date.now();

  // Determine expansion hops: input overrides config default
  const hops = input.expand_hops ?? observability?.defaultExpansionHops ?? 1;
  const clampedHops = Math.min(Math.max(Math.round(hops), 0), 2) as 0 | 1 | 2;

  const results = await engine.searchWithExpansion(
    {
      text: input.query,
      limit: input.limit ?? 10,
      scoreThreshold: input.score_threshold ?? 0.3,
    },
    { hops: clampedHops },
  );

  const latencyMs = Date.now() - startTime;

  // Log RAG event if observability is wired up
  if (observability?.metricsStore && observability.tokenCounter) {
    try {
      const tokenCount = observability.tokenCounter.countRagEvent(
        input.query,
        results.map((r) => r.content),
      );
      observability.metricsStore.logEvent({
        id: crypto.randomUUID(),
        sessionId: observability.sessionId ?? 'unknown',
        query: input.query,
        chunksRetrieved: results.length,
        chunkIds: results.map((r) => r.chunkId),
        tokenCount,
        strategy: 'mcp',
        timestamp: new Date().toISOString(),
        latencyMs,
      });
    } catch {
      // Observability failure must never break search output — silent degradation
    }
  }

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
  const text = `## Code results for: "${input.query}"\n\n${sections.join('\n\n')}`;

  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Register the search_codebase tool on an MCP server.
 */
export function registerSearchCodebaseTool(
  server: McpServer,
  engine: Engine,
  observability?: ObservabilityConfig,
): void {
  server.registerTool(
    'search_codebase',
    {
      description:
        'Search the indexed codebase using a natural language query. Returns relevant code chunks ranked by similarity. ' +
        'Results can be expanded along the dependency graph to include related files (imports/dependencies). ' +
        'Use expand_hops=0 to disable expansion, 1 for direct imports (default), or 2 for transitive dependencies.',
      inputSchema: {
        query: z.string().describe('Natural language search query'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
        score_threshold: z
          .number()
          .optional()
          .describe('Minimum similarity score 0-1 (default: 0.3)'),
        expand_hops: z
          .number()
          .optional()
          .describe(
            'Dependency graph expansion hops: 0 = no expansion, 1 = direct imports (default), 2 = transitive',
          ),
      },
    },
    async (input) => {
      return searchCodebaseHandler(engine, input, observability);
    },
  );
}
