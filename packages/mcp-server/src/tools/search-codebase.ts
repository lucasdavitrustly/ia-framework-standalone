import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { RetrievalResult, FallbackSearchResult } from '@ia-framework/retrieval';
import type { MetricsStore, TokenCounter } from '@ia-framework/observability';
import { analyzeRetrievalQuery, formatRetrievalContext } from './result-formatting.js';
import { detectIntent, getTemplate } from '../templates/index.js';
import { applyTokenCap } from './token-cap.js';
import { classifyQuery } from '../classification/index.js';
import type { QueryClassification } from '../classification/index.js';

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
  /** Soft token cap per search call (default: 6000) */
  maxTokensPerCall?: number | undefined;
  /** Default minimum relevance score threshold (0-1). Results below this are filtered client-side. */
  defaultScoreThreshold?: number | undefined;
  /** Confidence threshold for keyword early exit (0-1, default 0.8). */
  earlyExitConfidence?: number | undefined;
  /** Confidence gate: if the best result score is below this, return "no relevant code found"
   *  and skip fallback entirely. Prevents low-quality chunks from being injected. Undefined = disabled. */
  confidenceThreshold?: number | undefined;
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
  capMeta?: { token_cap_applied: true; results_trimmed: number },
  thresholdFiltered?: boolean,
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
    // Related-concept results (per D-05)
    if (
      fallbackResult &&
      fallbackResult.relatedResults &&
      fallbackResult.relatedResults.length > 0
    ) {
      const relatedLines = fallbackResult.relatedResults
        .map(
          (r, i) =>
            `${i + 1}. ${r.relativePath}${r.name ? ` (${r.name})` : ''}: ${r.content.slice(0, 150)}`,
        )
        .join('\n');
      const text = `${guardrailLead}\n\nNo results for '${input.query}'. Related communication mechanisms found:\n\n${relatedLines}`;

      return toTextResult(text, {
        found: false,
        fallback_used: true,
        fallback_mode: fallbackResult.fallback_mode,
        related_query: fallbackResult.related_query,
        related_results: fallbackResult.relatedResults.map((r) => ({
          file: r.relativePath,
          name: r.name,
          snippet: r.content.slice(0, 200),
        })),
        answered: false,
      });
    }

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

    const noResultText = thresholdFiltered
      ? `${guardrailLead}\n\nNo relevant code found for this query. Do not guess or hallucinate — inform the user that the codebase doesn't appear to contain relevant information for "${input.query}".`
      : note
        ? `${guardrailLead}\n\n${note}\n\nNo results found for query: "${input.query}"`
        : `${guardrailLead}\n\nNo results found for query: "${input.query}"`;

    return toTextResult(noResultText, {
      ...(note ? { fallbackUsed: true } : {}),
      ...(thresholdFiltered ? { threshold_filtered: true } : {}),
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
    ...(capMeta ? capMeta : {}),
    answered: true,
  });
}

/**
 * Format a single RetrievalResult as a markdown section.
 * @internal Exported for testing only.
 */
export function formatResult(result: RetrievalResult, index: number): string {
  const sourceTag = result.source ? ` [${result.source}]` : '';
  const hierarchyTag = result.expansionSource === 'hierarchy' ? ' [hierarchy]' : '';
  const lineRange = `:${result.startLine}-${result.endLine}`;
  const header = result.name
    ? `### ${index}. ${result.relativePath}${lineRange} (${result.name}) — score: ${result.score.toFixed(2)} [${result.matchedVector}]${sourceTag}${hierarchyTag}`
    : `### ${index}. ${result.relativePath}${lineRange} — score: ${result.score.toFixed(2)} [${result.matchedVector}]${sourceTag}${hierarchyTag}`;
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
 * Log a classification event for observability (QCC-04).
 */
function logClassification(
  observability: ObservabilityConfig,
  data: {
    query: string;
    classification: QueryClassification;
    classificationLatencyMs: number;
    route: 'keyword' | 'semantic' | 'keyword-fallback-semantic';
    totalLatencyMs: number;
    resultCount: number;
    earlyExit?: boolean | undefined;
    earlyExitReason?: string | undefined;
  },
): void {
  const logEntry = {
    event: 'query_classification',
    query: data.query,
    type: data.classification.type,
    reason: data.classification.reason,
    confidence: data.classification.confidence,
    route: data.route,
    classificationMs: data.classificationLatencyMs,
    totalMs: data.totalLatencyMs,
    results: data.resultCount,
    ...(data.earlyExit !== undefined ? { earlyExit: data.earlyExit } : {}),
    ...(data.earlyExitReason ? { earlyExitReason: data.earlyExitReason } : {}),
  };
  if ('logger' in observability && typeof (observability as any).logger?.info === 'function') {
    (observability as any).logger.info(logEntry, 'query_classification');
  }
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

  // Query classification gate (Phase 37 — QCC-01, QCC-02)
  const classification = classifyQuery(input.query);
  const classificationLatencyMs = Date.now() - startTime;

  if (classification.type === 'keyword') {
    // Keyword route: use BM25/direct lookup, skip vector search
    // Per D-10: skip score threshold filtering and token cap
    let keywordResults: RetrievalResult[];

    if (engine.searchWithFallback) {
      const fallbackResult = await engine.searchWithFallback(
        { text: input.query, limit: input.limit ?? 10 },
        { enableFallback: false },
      );
      keywordResults = fallbackResult.results;
    } else {
      keywordResults = await engine.search({
        text: input.query,
        limit: input.limit ?? 10,
      });
    }

    // D-06: fallback to semantic if keyword returns 0 results
    if (keywordResults.length === 0) {
      // Log fallback, then fall through to normal semantic path
      const earlyExitThreshold = observability?.earlyExitConfidence ?? 0.8;
      observability?.metricsStore &&
        logClassification(observability, {
          query: input.query,
          classification,
          classificationLatencyMs,
          route: 'keyword-fallback-semantic',
          totalLatencyMs: Date.now() - startTime,
          resultCount: 0,
          earlyExit: false,
          earlyExitReason:
            classification.confidence >= earlyExitThreshold ? 'fallback-no-results' : undefined,
        });
    } else {
      // Keyword route succeeded — format and return directly
      // Skip score threshold (D-10), skip token cap (D-10)
      const latencyMs = Date.now() - startTime;
      const earlyExitThreshold = observability?.earlyExitConfidence ?? 0.8;
      const isEarlyExit = classification.confidence >= earlyExitThreshold;

      // Structured logging per D-11
      observability?.metricsStore &&
        logClassification(observability, {
          query: input.query,
          classification,
          classificationLatencyMs,
          route: 'keyword',
          totalLatencyMs: latencyMs,
          resultCount: keywordResults.length,
          earlyExit: isEarlyExit,
          earlyExitReason: isEarlyExit ? 'confidence-above-threshold' : undefined,
        });

      // D-07: same response format as semantic results
      const sections = keywordResults.map((r, i) => formatResult(r, i + 1));

      // Template injection still applies if enabled
      let templatePrefix = '';
      if (input.use_template !== false) {
        const detectedIntent = detectIntent(input.query);
        const template = getTemplate(detectedIntent);
        if (template) templatePrefix = `${template}\n\n`;
      }

      const guardrailLead = `Conclusion: found ${keywordResults.length} evidence-backed ${keywordResults.length === 1 ? 'match' : 'matches'}.`;
      const text = `${guardrailLead}\n\n${templatePrefix}## Code results for: "${input.query}"\n\n${sections.join('\n\n')}\n\n---\nSearch: keyword-routed | ${keywordResults.length} results | ${latencyMs}ms`;

      return toTextResult(text, { answered: true, route: 'keyword' });
    }
  }

  // Semantic path continues below (existing code unchanged)

  // Determine expansion hops: input overrides config default
  const hops = input.expand_hops ?? observability?.defaultExpansionHops ?? 2;
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

  // Confidence gate: if configured and best result is below threshold, reject immediately
  // This prevents low-quality chunks from being injected even when they pass scoreThreshold.
  // Skips fallback entirely to avoid suggesting irrelevant code.
  if (observability?.confidenceThreshold !== undefined && results.length > 0) {
    const bestScore = Math.max(...results.map((r) => r.score));
    if (bestScore < observability.confidenceThreshold) {
      const gateText =
        `Conclusion: the indexed search did not return strong evidence for this query.\n\n` +
        `No relevant code found for this query. Do not guess or hallucinate — inform the user that the codebase doesn't appear to contain relevant information for "${input.query}".`;
      return toTextResult(gateText, {
        confidence_gated: true,
        best_score: bestScore,
        threshold: observability.confidenceThreshold,
        answered: false,
      });
    }
  }

  // Score threshold filtering (client-side, per D-01, D-02, D-03)
  // Hierarchy-expanded results (expansionSource === 'hierarchy') are excluded from threshold
  // since they are structurally-related chunks, not relevance-ranked results.
  const scoreThreshold = input.score_threshold ?? observability?.defaultScoreThreshold ?? 0.5;
  let thresholdFiltered = false;
  if (scoreThreshold > 0) {
    const directBefore = results.filter((r) => r.expansionSource !== 'hierarchy').length;
    results = results.filter((r) => r.expansionSource === 'hierarchy' || r.score >= scoreThreshold);
    const directAfter = results.filter((r) => r.expansionSource !== 'hierarchy').length;
    // thresholdFiltered = true only when direct (non-hierarchy) results were present but all got filtered
    thresholdFiltered = directBefore > 0 && directAfter === 0;
  }

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

  // Token budget cap (per D-02, D-05, D-06)
  const maxTokens = observability?.maxTokensPerCall ?? 6000;

  // D-06: 70/30 budget split when hierarchy expansion produced results
  const hierarchyCount = results.filter((r) => r.expansionSource === 'hierarchy').length;
  let cappedResults: RetrievalResult[];
  let tokenCapApplied = false;
  let resultsTrimmed = 0;

  if (hierarchyCount > 0 && clampedHops > 0) {
    const directResults = results.filter((r) => r.expansionSource !== 'hierarchy');
    const hierarchyResults = results.filter((r) => r.expansionSource === 'hierarchy');
    const directBudget = Math.floor(maxTokens * 0.7);
    const hierarchyBudget = maxTokens - directBudget;

    const directCap = applyTokenCap(directResults, directBudget);
    const hierarchyCap = applyTokenCap(hierarchyResults, hierarchyBudget);

    cappedResults = [...directCap.results, ...hierarchyCap.results];
    tokenCapApplied = directCap.tokenCapApplied || hierarchyCap.tokenCapApplied;
    resultsTrimmed = directCap.resultsTrimmed + hierarchyCap.resultsTrimmed;
  } else {
    const cap = applyTokenCap(results, maxTokens);
    cappedResults = cap.results;
    tokenCapApplied = cap.tokenCapApplied;
    resultsTrimmed = cap.resultsTrimmed;
  }

  results = cappedResults;

  if (tokenCapApplied) {
    console.info(
      `token cap: ${results.length + resultsTrimmed} results → ${results.length} results`,
    );
  }

  const capMeta = tokenCapApplied
    ? { token_cap_applied: true as const, results_trimmed: resultsTrimmed }
    : undefined;

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
      undefined,
      // Pass thresholdFiltered only when fallback itself returns no results
      fallbackResult.results.length === 0 &&
        (!fallbackResult.suggestions || fallbackResult.suggestions.length === 0) &&
        (!fallbackResult.relatedResults || fallbackResult.relatedResults.length === 0)
        ? thresholdFiltered
        : false,
    );
  }

  // Log classification for semantic path
  observability?.metricsStore &&
    logClassification(observability, {
      query: input.query,
      classification,
      classificationLatencyMs,
      route: classification.type === 'keyword' ? 'keyword-fallback-semantic' : 'semantic',
      totalLatencyMs: Date.now() - startTime,
      resultCount: results.length,
    });

  return buildSearchResponse(
    input,
    results,
    fallbackNote,
    undefined,
    input.use_template,
    capMeta,
    thresholdFiltered,
  );
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
        'Use expand_hops=0 to disable expansion, 1 for direct imports, or 2 for transitive dependencies (default).',
      inputSchema: {
        query: z.string().describe('Natural language search query'),
        limit: z.number().optional().describe('Maximum number of results (default: 10)'),
        score_threshold: z
          .number()
          .optional()
          .describe('Minimum similarity score 0-1 (default: 0.5). Set to 0 to disable filtering.'),
        expand_hops: z
          .number()
          .optional()
          .describe(
            'Dependency graph expansion hops: 0 = no expansion, 1 = direct imports, 2 = transitive (default)',
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
