import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult, FallbackSearchResult } from '@ia-framework/retrieval';
import { analyzeRetrievalQuery, formatRetrievalContext } from './result-formatting.js';
import { detectIntent, getTemplate } from '../templates/index.js';

type HybridEngine = {
  searchHybrid(query: {
    text: string;
    limit?: number | undefined;
    scoreThreshold?: number | undefined;
    filter?: Record<string, unknown> | undefined;
  }): Promise<RetrievalResult[]>;
  search?(query: { text: string; limit?: number | undefined }): Promise<RetrievalResult[]>;
  searchWithFallback?(
    query: { text: string; limit?: number | undefined },
    options?: { enableFallback?: boolean; maxSuggestions?: number },
  ): Promise<FallbackSearchResult>;
};

export interface SearchCodebaseHybridInput {
  query: string;
  limit?: number | undefined;
  /** RRF score threshold — results below this are filtered out (default: 0.015). RRF scores are rank-based (~0.01–0.03). */
  score_threshold?: number | undefined;
  /** Enable prompt template injection for detected intents (default: true). Per D-05. */
  use_template?: boolean | undefined;
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
  const contextLine = formatRetrievalContext(result);

  const codeBlock = `\`\`\`${result.language}\n${result.content}\n\`\`\``;
  return `${header}\n${contextLine}\n${codeBlock}`;
}

/**
 * Handle the search_codebase_hybrid tool call.
 * Exported separately for testability.
 */
export async function searchCodebaseHybridHandler(
  engine: HybridEngine,
  input: SearchCodebaseHybridInput,
): Promise<ToolOutput> {
  const intent = analyzeRetrievalQuery(input.query);
  let results: RetrievalResult[];
  let fallbackNote: string | undefined;

  try {
    results = await engine.searchHybrid({
      text: input.query,
      limit: input.limit ?? 10,
      scoreThreshold: input.score_threshold,
    });
  } catch (error) {
    if (!engine.search) {
      throw error;
    }

    results = await engine.search({
      text: input.query,
      limit: input.limit ?? 10,
    });
    fallbackNote =
      `Note: hybrid retrieval was unavailable (${error instanceof Error ? error.message : String(error)}). ` +
      'Returning indexed semantic search results instead.';
  }

  if (results.length === 0) {
    const conclusion =
      'Conclusion: the indexed hybrid search did not return strong evidence for this query.';

    // Zero-result fallback: call searchWithFallback for keyword suggestions
    if (engine.searchWithFallback) {
      const fallbackResult = await engine.searchWithFallback(
        { text: input.query, limit: input.limit ?? 10 },
        { enableFallback: true, maxSuggestions: 3 },
      );

      if (fallbackResult.suggestions.length > 0) {
        const suggestionLines = fallbackResult.suggestions
          .map((s) => `- ${s.file} (${s.name}): ${s.snippet}`)
          .join('\n');
        const text = fallbackNote
          ? `${conclusion}\n\n${fallbackNote}\n\nNo exact match found. Closest related code:\n${suggestionLines}`
          : `${conclusion}\n\nNo exact match found. Closest related code:\n${suggestionLines}`;
        return {
          content: [{ type: 'text', text }],
          structuredContent: {
            found: false,
            fallback_used: fallbackResult.fallback_used,
            fallback_mode: fallbackResult.fallback_mode,
            suggestions: fallbackResult.suggestions.map((s) => ({
              file: s.file,
              name: s.name,
              snippet: s.snippet,
            })),
            answered: false,
          },
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: fallbackNote
              ? `${conclusion}\n\n${fallbackNote}\n\nNo results found for query: "${input.query}"`
              : `${conclusion}\n\nNo results found for query: "${input.query}"`,
          },
        ],
        structuredContent: {
          found: false,
          fallback_used: fallbackResult.fallback_used,
          fallback_mode: fallbackResult.fallback_mode,
          suggestions: [],
          answered: false,
        },
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: fallbackNote
            ? `${conclusion}\n\n${fallbackNote}\n\nNo results found for query: "${input.query}"`
            : `${conclusion}\n\nNo results found for query: "${input.query}"`,
        },
      ],
      structuredContent: {
        ...(fallbackNote ? { fallbackUsed: true } : {}),
        answered: false,
      },
    };
  }

  const sections = results.map((r, i) => formatResult(r, i + 1));
  const conclusion = `Conclusion: found ${results.length} hybrid evidence-backed ${results.length === 1 ? 'match' : 'matches'}${
    intent.entryPointQuery || intent.architectureQuery || intent.dataFlowQuery
      ? ' relevant to the requested code path.'
      : '.'
  }`;

  // Template injection: detect intent and prepend scaffolding if applicable
  let templatePrefix = '';
  let intentDetected: string | undefined;
  if (input.use_template !== false) {
    const detectedIntent = detectIntent(input.query);
    const template = getTemplate(detectedIntent);
    if (template) {
      templatePrefix = `${template}\n\n`;
      intentDetected = detectedIntent!;
    }
  }

  const text = `${conclusion}\n\n${templatePrefix}${fallbackNote ? `${fallbackNote}\n\n` : ''}## Hybrid search results for: "${input.query}"\n\n${sections.join('\n\n')}`;

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      ...(fallbackNote ? { fallbackUsed: true } : {}),
      ...(intentDetected ? { intent_detected: intentDetected } : {}),
      answered: true,
    },
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
        score_threshold: z
          .number()
          .optional()
          .describe(
            'Minimum RRF score threshold 0-1 (default: 0.015). RRF scores are rank-based (~0.01-0.03), much lower than cosine similarity.',
          ),
        use_template: z
          .boolean()
          .optional()
          .describe(
            'Enable prompt template injection for detected query intents (default: true). Set false to disable scaffolding.',
          ),
      },
    },
    async (input) => {
      return searchCodebaseHybridHandler(engine, input);
    },
  );
}
