import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult, FallbackSearchResult } from '@ia-framework/retrieval';
import type { MetricsStore, TokenCounter } from '@ia-framework/observability';
import { analyzeRetrievalQuery, formatRetrievalContext } from './result-formatting.js';
import { detectIntent, getTemplate } from '../templates/index.js';

type Engine = {
  search(query: {
    text: string;
    limit?: number;
    scoreThreshold?: number | undefined;
  }): Promise<RetrievalResult[]>;
  searchWithExpansion(
    query: { text: string; limit?: number; scoreThreshold?: number | undefined },
    options?: { hops?: 0 | 1 | 2 },
  ): Promise<RetrievalResult[]>;
  searchWithFallback?(
    query: { text: string; limit?: number; scoreThreshold?: number | undefined },
    options?: { enableFallback?: boolean; maxSuggestions?: number },
  ): Promise<FallbackSearchResult>;
  /** Scroll for chunks that match a class/interface name for hierarchy traversal */
  scrollForHierarchy?(name: string, chunkType: string): Promise<RetrievalResult[]>;
};

export interface SearchCodebaseInput {
  query: string;
  limit?: number | undefined;
  score_threshold?: number | undefined;
  expand_hops?: number | undefined;
  /** Enable zero-result fallback (default: true). Set false for raw empty results. */
  fallback?: boolean | undefined;
  /** Enable prompt template injection for detected intents (default: true). Per D-05. */
  use_template?: boolean | undefined;
}

export type ToolOutput = CallToolResult;

export interface ObservabilityConfig {
  metricsStore?: MetricsStore | undefined;
  tokenCounter?: TokenCounter | undefined;
  sessionId?: string | undefined;
  /** Default expansion hops from project config (0=off, 1=direct, 2=transitive) */
  defaultExpansionHops?: 0 | 1 | 2 | undefined;
}

function toTextResult(text: string, structuredContent?: Record<string, unknown>): ToolOutput {
  return structuredContent
    ? {
        content: [{ type: 'text', text }],
        structuredContent,
      }
    : {
        content: [{ type: 'text', text }],
      };
}

function buildSearchResponse(
  input: SearchCodebaseInput,
  results: RetrievalResult[],
  note?: string,
  fallbackResult?: FallbackSearchResult,
  useTemplate?: boolean,
): ToolOutput {
  const intent = analyzeRetrievalQuery(input.query);
  const guardrailLead =
    results.length > 0
      ? `Conclusion: found ${results.length} evidence-backed ${results.length === 1 ? 'match' : 'matches'}${
          intent.architectureQuery || intent.dataFlowQuery
            ? ' relevant to the requested architecture or flow.'
            : '.'
        }`
      : 'Conclusion: the indexed search did not return strong evidence for this query.';

  if (results.length === 0) {
    // Fallback envelope with suggestions
    if (fallbackResult && fallbackResult.suggestions.length > 0) {
      const suggestionLines = fallbackResult.suggestions
        .map((s) => `- ${s.file} (${s.name}): ${s.snippet}`)
        .join('\n');
      const text = `${guardrailLead}\n\nNo exact match found. Closest related code:\n${suggestionLines}`;

      return toTextResult(text, {
        found: false,
        fallback_used: fallbackResult.fallback_used,
        fallback_mode: fallbackResult.fallback_mode,
        suggestions: fallbackResult.suggestions.map((s) => ({
          file: s.file,
          name: s.name,
          snippet: s.snippet,
        })),
        answered: false,
      });
    }

    const text = note
      ? `${guardrailLead}\n\n${note}\n\nNo results found for query: "${input.query}"`
      : `${guardrailLead}\n\nNo results found for query: "${input.query}"`;

    return toTextResult(text, {
      ...(note ? { fallbackUsed: true } : {}),
      ...(fallbackResult
        ? {
            found: false,
            fallback_used: fallbackResult.fallback_used,
            fallback_mode: fallbackResult.fallback_mode,
            suggestions: [],
          }
        : {}),
      answered: false,
    });
  }

  const sections = results.map((r, i) => formatResult(r, i + 1));
  const prefix = note ? `${note}\n\n` : '';

  // Template injection: detect intent and prepend scaffolding if applicable
  let templatePrefix = '';
  let intentDetected: string | undefined;
  if (useTemplate !== false) {
    const detectedIntent = detectIntent(input.query);
    const template = getTemplate(detectedIntent);
    if (template) {
      templatePrefix = `${template}\n\n`;
      intentDetected = detectedIntent!;
    }
  }

  const text = `${guardrailLead}\n\n${templatePrefix}${prefix}## Code results for: "${input.query}"\n\n${sections.join('\n\n')}`;

  return toTextResult(text, {
    ...(note ? { fallbackUsed: true } : {}),
    ...(intentDetected ? { intent_detected: intentDetected } : {}),
    answered: true,
  });
}

/**
 * Format a single RetrievalResult as a markdown section.
 */
function formatResult(result: RetrievalResult, index: number): string {
  const sourceTag = result.source ? ` [${result.source}]` : '';
  const hierarchyTag = result.expansionSource === 'hierarchy' ? ' [hierarchy]' : '';
  const header = result.name
    ? `### ${index}. ${result.relativePath} (${result.name}) — score: ${result.score.toFixed(2)} [${result.matchedVector}]${sourceTag}${hierarchyTag}`
    : `### ${index}. ${result.relativePath} — score: ${result.score.toFixed(2)} [${result.matchedVector}]${sourceTag}${hierarchyTag}`;
  const contextLine = formatRetrievalContext(result);

  const codeBlock = `\`\`\`${result.language}\n${result.content}\n\`\`\``;

  return `${header}\n${contextLine}\n${codeBlock}`;
}

/**
 * Expand hierarchy by walking superclass chains up to maxHops levels.
 * Returns additional results tagged with expansionSource: 'hierarchy'.
 */
async function expandHierarchy(
  engine: Engine,
  results: RetrievalResult[],
  maxHops: number,
): Promise<RetrievalResult[]> {
  if (!engine.scrollForHierarchy || maxHops === 0) return [];

  const seenIds = new Set(results.map((r) => r.chunkId));
  const expanded: RetrievalResult[] = [];

  // Collect seeds: results that have a superclass
  let frontier: Array<{ name: string; chunkType: string }> = [];
  for (const r of results) {
    if (r.superclass) {
      frontier.push({ name: r.superclass, chunkType: r.chunkType });
    }
  }

  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const nextFrontier: Array<{ name: string; chunkType: string }> = [];
    for (const { name, chunkType } of frontier) {
      const hits = await engine.scrollForHierarchy(name, chunkType);
      for (const hit of hits) {
        if (!seenIds.has(hit.chunkId)) {
          seenIds.add(hit.chunkId);
          const tagged: RetrievalResult = { ...hit, expansionSource: 'hierarchy' };
          expanded.push(tagged);
          if (tagged.superclass) {
            nextFrontier.push({ name: tagged.superclass, chunkType: tagged.chunkType });
          }
        }
      }
    }
    frontier = nextFrontier;
  }

  return expanded;
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

  let results: RetrievalResult[];
  let fallbackNote: string | undefined;

  try {
    results = await engine.searchWithExpansion(
      {
        text: input.query,
        limit: input.limit ?? 10,
        scoreThreshold: input.score_threshold,
      },
      { hops: clampedHops },
    );
    // Hierarchy expansion: walk superclass chains up to clampedHops levels
    if (clampedHops > 0) {
      const hierarchyResults = await expandHierarchy(engine, results, clampedHops);
      results = [...results, ...hierarchyResults];
    }
  } catch (error) {
    results = await engine.search({
      text: input.query,
      limit: input.limit ?? 10,
      scoreThreshold: input.score_threshold,
    });
    fallbackNote =
      `Note: dependency expansion was unavailable (${error instanceof Error ? error.message : String(error)}). ` +
      'Returning indexed semantic search results without expansion.';
  }

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

  // Zero-result fallback: if primary search returned nothing and fallback not disabled,
  // call searchWithFallback for keyword-based suggestions
  if (results.length === 0 && input.fallback !== false && engine.searchWithFallback) {
    const fallbackResult = await engine.searchWithFallback(
      {
        text: input.query,
        limit: input.limit ?? 10,
        scoreThreshold: input.score_threshold,
      },
      { enableFallback: true, maxSuggestions: 3 },
    );
    return buildSearchResponse(
      input,
      fallbackResult.results,
      fallbackNote,
      fallbackResult,
      input.use_template,
    );
  }

  return buildSearchResponse(input, results, fallbackNote, undefined, input.use_template);
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
        fallback: z
          .boolean()
          .optional()
          .describe(
            'Enable zero-result fallback (default: true). Set false to receive raw empty results without suggestions.',
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
      return searchCodebaseHandler(engine, input, observability);
    },
  );
}
