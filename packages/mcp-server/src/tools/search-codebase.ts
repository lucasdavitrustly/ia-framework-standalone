import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { bm25Rerank, multiHopExpand } from '@ia-framework/retrieval';
import type { RetrievalResult, FallbackSearchResult } from '@ia-framework/retrieval';
import type { MetricsStore, TokenCounter } from '@ia-framework/observability';
import { analyzeRetrievalQuery, formatRetrievalContext } from './result-formatting.js';
import { detectIntent, getTemplate } from '../templates/index.js';
import { applyTokenCap } from './token-cap.js';
import { coercedNumber, coercedBoolean } from './coerce.js';
import { classifyBudget } from './adaptive-budget.js';
import { classifyQuery } from '../classification/index.js';
import type { QueryClassification } from '../classification/index.js';
import { withDegradation, type ServerCapabilities } from '../capabilities.js';

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
  /** Scroll for chunks that implement/extend a given class or interface (walk DOWN) */
  scrollForImplementations?(name: string): Promise<RetrievalResult[]>;
  /** Scroll for chunks by their name field (for multi-hop class lookups) */
  scrollByName?(name: string): Promise<RetrievalResult[]>;
  /** Scroll for chunks that define a given method (for multi-hop method lookups) */
  scrollByDefines?(methodName: string): Promise<RetrievalResult[]>;
  /** Fetch adjacent chunks by file path and chunk index */
  getAdjacentChunks?(
    relativePath: string,
    chunkIndex: number,
    totalChunks: number,
    radius?: number,
  ): Promise<RetrievalResult[]>;
  /** Expand call chain: find chunks that define called methods or callers */
  expandCallChain?(
    results: RetrievalResult[],
    direction?: 'calls' | 'calledBy' | 'both',
  ): Promise<RetrievalResult[]>;
  /** Resolve cross-repo edges for a given source file */
  getCrossRepoEdges?(
    sourceRepo: string,
    sourcePath: string,
  ): Promise<
    Array<{
      targetRepo: string;
      targetPath: string | null;
      targetSymbol: string | null;
    }>
  >;
  /** Scroll by name in a specific repo (for cross-repo symbol lookup) */
  scrollByNameInRepo?(name: string, repoId: string): Promise<RetrievalResult[]>;
  /** T137: Search with interface implementation expansion */
  searchWithInterfaceExpansion?(query: {
    text: string;
    limit?: number;
    scoreThreshold?: number | undefined;
    filter?: Record<string, unknown> | undefined;
  }): Promise<RetrievalResult[]>;
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
  /** Filter results to a specific repo by name. When omitted, searches all repos. */
  repo?: string | undefined;
  /** Filter by stereotype (e.g. 'service', 'repository', 'controller') */
  stereotype?: string | undefined;
  /** Filter by architectural layer (e.g. 'controller', 'service', 'repository') */
  archLayer?: string | undefined;
  /** Filter by module name (maps to moduleInfo.module) */
  module?: string | undefined;
  /** Filter by programming language (e.g. 'java', 'typescript') */
  language?: string | undefined;
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
  /**
   * T058: Read live file content at retrieval time.
   * Receives (relativePath, startLine, endLine) and returns the code snippet.
   * Used for top-5 results to guard against indexed content drift.
   * Falls back to stored Qdrant payload content on error or when not provided.
   */
  readFileFn?: (
    relativePath: string,
    startLine: number,
    endLine: number,
    repoId?: string,
  ) => Promise<string>;
  /** Enable session-level dedup cache (T156). Default: not enabled. */
  sessionCache?: { enabled: boolean } | undefined;
  /** Runtime capabilities — degradation surfaced in response structuredContent. */
  capabilities?: ServerCapabilities | undefined;
}

// ---------------------------------------------------------------------------
// Session-level dedup cache (T156)
// ---------------------------------------------------------------------------

interface SearchCacheEntry {
  responseText: string;
  resultCount: number;
  lastAccess: number;
}

const SEARCH_CACHE_MAX = 100;
const searchCache = new Map<string, SearchCacheEntry>();
let searchCacheAccessCounter = 0;

function buildSearchCacheKey(input: SearchCodebaseInput): string {
  // JSON-stable hash of the full input (sorted keys for determinism)
  const normalized = JSON.stringify(input, Object.keys(input).sort());
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

function evictSearchLRU(): void {
  let oldestKey: string | undefined;
  let oldestAccess = Infinity;
  for (const [key, entry] of searchCache) {
    if (entry.lastAccess < oldestAccess) {
      oldestAccess = entry.lastAccess;
      oldestKey = key;
    }
  }
  if (oldestKey) searchCache.delete(oldestKey);
}

/** Exported for testing: reset the session cache. */
export function resetSearchSessionCache(): void {
  searchCache.clear();
  searchCacheAccessCounter = 0;
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

  // Group results by repo if any result has repoId
  const hasRepoIds = results.some((r) => r.repoId);
  let formattedBody: string;
  if (hasRepoIds) {
    const grouped = groupByRepo(results);
    const groupedSections: string[] = [];
    let idx = 1;
    for (const [repo, items] of grouped) {
      groupedSections.push(`--- [${repo}] ---`);
      for (const r of items) {
        groupedSections.push(formatResult(r, idx++));
      }
    }
    formattedBody = groupedSections.join('\n\n');
  } else {
    const sections = results.map((r, i) => formatResult(r, i + 1));
    formattedBody = sections.join('\n\n');
  }

  const text = `${guardrailLead}\n\n${templatePrefix}${prefix}## Code results for: "${input.query}"\n\n${formattedBody}`;

  // Build structured results array with repo field
  const structuredResults = results.map((r) => ({
    file: r.relativePath,
    name: r.name,
    score: r.score,
    ...(r.repoId ? { repo: r.repoId } : {}),
    ...(r.stale ? { stale: true } : {}),
  }));

  return toTextResult(text, {
    ...(note ? { fallbackUsed: true } : {}),
    ...(intentDetected ? { intent_detected: intentDetected } : {}),
    ...(capMeta ? capMeta : {}),
    results: structuredResults,
    answered: true,
  });
}

/**
 * Format a score value with an appropriate label.
 * RRF scores are rank-based (~0.01–0.03) and shown as 'rrf: X.XXXX'.
 * Cosine scores (0-1) are shown as 'score: X.XX'.
 * @internal
 */
function formatScore(result: RetrievalResult): string {
  return result.scoreType === 'rrf'
    ? `rrf: ${result.score.toFixed(4)}`
    : `score: ${result.score.toFixed(2)}`;
}

/**
 * Format a single RetrievalResult as a markdown section.
 * @internal Exported for testing only.
 */
export function formatResult(result: RetrievalResult, index: number): string {
  const sourceTag = result.source ? ` [${result.source}]` : '';
  const hierarchyTag = result.expansionSource === 'hierarchy' ? ' [hierarchy]' : '';
  const staleTag = result.stale ? ' [stale]' : '';
  const lineRange = `:${result.startLine}-${result.endLine}`;
  const scoreLabel = formatScore(result);
  const header = result.name
    ? `### ${index}. ${result.relativePath}${lineRange} (${result.name}) — ${scoreLabel} [${result.matchedVector}]${sourceTag}${hierarchyTag}${staleTag}`
    : `### ${index}. ${result.relativePath}${lineRange} — ${scoreLabel} [${result.matchedVector}]${sourceTag}${hierarchyTag}${staleTag}`;
  const contextLine = formatRetrievalContext(result);

  // T059: metadata-only when content is empty (results 6-10 per token budget contract)
  if (!result.content) {
    return `${header}\n${contextLine}`;
  }

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
  if ((!engine.scrollForHierarchy && !engine.scrollForImplementations) || maxHops === 0) return [];

  const seenIds = new Set(results.map((r) => r.chunkId));
  const expanded: RetrievalResult[] = [];

  // Walk UP: collect seeds from superclass references
  let upFrontier: Array<{ name: string; chunkType: string }> = [];
  // Walk DOWN: collect seeds from class/interface names to find implementors
  let downFrontier: string[] = [];

  for (const r of results) {
    if (r.superclass && engine.scrollForHierarchy) {
      upFrontier.push({ name: r.superclass, chunkType: r.chunkType });
    }
    // Seed downward expansion from interfaces and class names
    if (engine.scrollForImplementations) {
      if (r.chunkType === 'class' || r.chunkType === 'interface') {
        if (r.name) downFrontier.push(r.name);
      }
      if (r.interfaces) {
        for (const iface of r.interfaces) {
          downFrontier.push(iface);
        }
      }
    }
  }

  // Walk UP superclass chains
  if (engine.scrollForHierarchy) {
    for (let hop = 0; hop < maxHops && upFrontier.length > 0; hop++) {
      const nextFrontier: Array<{ name: string; chunkType: string }> = [];
      for (const { name, chunkType } of upFrontier) {
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
      upFrontier = nextFrontier;
    }
  }

  // Walk DOWN: find implementations/subclasses (1 hop only to limit cost)
  if (engine.scrollForImplementations && downFrontier.length > 0) {
    // Dedupe frontier names
    const uniqueNames = [...new Set(downFrontier)];
    // Limit to first 5 names to avoid excessive scrolling
    for (const name of uniqueNames.slice(0, 5)) {
      const hits = await engine.scrollForImplementations(name);
      for (const hit of hits) {
        if (!seenIds.has(hit.chunkId)) {
          seenIds.add(hit.chunkId);
          expanded.push({ ...hit, expansionSource: 'hierarchy' });
        }
      }
    }
  }

  // Cross-repo expansion: follow pre-computed edges across repo boundaries (D-04: costs 1 hop per crossing)
  if (engine.getCrossRepoEdges && engine.scrollByNameInRepo && maxHops > 0) {
    for (const r of results) {
      if (!r.repoId || !r.relativePath) continue;
      const edges = await engine.getCrossRepoEdges(r.repoId, r.relativePath);
      for (const edge of edges) {
        if (!edge.targetSymbol) continue;
        const hits = await engine.scrollByNameInRepo(edge.targetSymbol, edge.targetRepo);
        for (const hit of hits) {
          if (!seenIds.has(hit.chunkId)) {
            seenIds.add(hit.chunkId);
            expanded.push({ ...hit, expansionSource: 'hierarchy', expansionRepo: edge.targetRepo });
          }
        }
      }
    }
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
    route: 'keyword' | 'semantic' | 'keyword-fallback-semantic' | 'existence' | 'aggregation';
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
 * Group results by repoId, ordered by best score per repo (descending).
 */
function groupByRepo(results: RetrievalResult[]): Map<string, RetrievalResult[]> {
  const groups = new Map<string, RetrievalResult[]>();
  for (const r of results) {
    const repo = r.repoId ?? 'default';
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo)!.push(r);
  }
  return new Map(
    [...groups.entries()].sort((a, b) => {
      const bestA = Math.max(...a[1].map((r) => r.score));
      const bestB = Math.max(...b[1].map((r) => r.score));
      return bestB - bestA;
    }),
  );
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
  // ── Session dedup check (T156) ──────────────────────────────────────────────
  if (observability?.sessionCache?.enabled) {
    const cacheKey = buildSearchCacheKey(input);
    const cached = searchCache.get(cacheKey);
    if (cached) {
      cached.lastAccess = ++searchCacheAccessCounter;
      const shortMsg = `Same results as previous identical query (${cached.resultCount} results). Refine your query or use filters to get different results.`;
      return toTextResult(shortMsg, {
        answered: true,
        cached: true,
        resultCount: cached.resultCount,
      });
    }
  }

  const startTime = Date.now();

  // Build combined Qdrant filter from all filter params (repo, stereotype, archLayer, module, language)
  const filterConditions: Array<{ key: string; match: { value: string } }> = [];
  if (input.repo) filterConditions.push({ key: 'repoId', match: { value: input.repo } });
  if (input.stereotype)
    filterConditions.push({ key: 'stereotype', match: { value: input.stereotype } });
  if (input.archLayer)
    filterConditions.push({ key: 'archLayer', match: { value: input.archLayer } });
  if (input.module)
    filterConditions.push({ key: 'moduleInfo.module', match: { value: input.module } });
  if (input.language) filterConditions.push({ key: 'language', match: { value: input.language } });
  const combinedFilter = filterConditions.length > 0 ? { must: filterConditions } : undefined;

  // Keep repoFilter alias for backward-compatible usage in keyword/existence/aggregation paths
  const repoFilter = combinedFilter;

  // Query classification gate (Phase 37 — QCC-01, QCC-02)
  const classification = classifyQuery(input.query);
  const classificationLatencyMs = Date.now() - startTime;

  if (classification.type === 'keyword') {
    // Keyword route: use BM25/direct lookup, skip vector search
    // Per D-10: skip score threshold filtering and token cap
    let keywordResults: RetrievalResult[];

    if (engine.searchWithFallback) {
      const fallbackResult = await engine.searchWithFallback(
        {
          text: input.query,
          limit: input.limit ?? 10,
          ...(repoFilter ? { filter: repoFilter } : {}),
        },
        { enableFallback: false },
      );
      keywordResults = fallbackResult.results;
    } else {
      keywordResults = await engine.search({
        text: input.query,
        limit: input.limit ?? 10,
        ...(repoFilter ? { filter: repoFilter } : {}),
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
      // BM25 re-rank keyword results for better relevance ordering
      if (keywordResults.length > (input.limit ?? 10)) {
        keywordResults = bm25Rerank(keywordResults, input.query, {
          topK: input.limit ?? 10,
          vectorScoreWeight: 0.3, // keyword route: lean more on BM25
        });
      }
      // Apply token cap (budget enforcement applies to all routes — adaptive)
      const keywordBudget = classifyBudget(input.query);
      const keywordMaxTokens = observability?.maxTokensPerCall ?? keywordBudget.tokenBudget;
      let cappedKeywordResults = keywordResults;
      let keywordCapMeta: { token_cap_applied: true; results_trimmed: number } | undefined;
      if (keywordMaxTokens > 0) {
        const cap = applyTokenCap(keywordResults, keywordMaxTokens);
        cappedKeywordResults = cap.results;
        if (cap.tokenCapApplied) {
          keywordCapMeta = { token_cap_applied: true, results_trimmed: cap.resultsTrimmed };
        }
      }

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
      const sections = cappedKeywordResults.map((r, i) => formatResult(r, i + 1));

      // Template injection still applies if enabled
      let templatePrefix = '';
      if (input.use_template !== false) {
        const detectedIntent = detectIntent(input.query);
        const template = getTemplate(detectedIntent);
        if (template) templatePrefix = `${template}\n\n`;
      }

      const guardrailLead = `Conclusion: found ${cappedKeywordResults.length} evidence-backed ${cappedKeywordResults.length === 1 ? 'match' : 'matches'}.`;
      const text = `${guardrailLead}\n\n${templatePrefix}## Code results for: "${input.query}"\n\n${sections.join('\n\n')}\n\n---\nSearch: keyword-routed | ${cappedKeywordResults.length} results | ${latencyMs}ms`;

      return toTextResult(text, { answered: true, route: 'keyword', ...keywordCapMeta });
    }
  }

  // Existence query route: "does X exist?", "is there a Y?" — return structured found/not-found
  if (classification.type === 'existence') {
    let existenceResults: RetrievalResult[];

    // Use hybrid search if available for better exact-match detection, else semantic
    if (engine.searchWithFallback) {
      const fallbackResult = await engine.searchWithFallback(
        { text: input.query, limit: 5, ...(repoFilter ? { filter: repoFilter } : {}) },
        { enableFallback: false },
      );
      existenceResults = fallbackResult.results;
    } else {
      existenceResults = await engine.search({
        text: input.query,
        limit: 5,
        ...(repoFilter ? { filter: repoFilter } : {}),
      });
    }

    const latencyMs = Date.now() - startTime;
    const highConfidence = existenceResults.filter((r) => r.score > 0.6);

    observability?.metricsStore &&
      logClassification(observability, {
        query: input.query,
        classification,
        classificationLatencyMs,
        route: 'existence',
        totalLatencyMs: latencyMs,
        resultCount: existenceResults.length,
      });

    if (highConfidence.length > 0) {
      const sections = highConfidence.map((r, i) => formatResult(r, i + 1));
      const text = `## Existence check: "${input.query}"\n\n**Found.** ${highConfidence.length} relevant ${highConfidence.length === 1 ? 'match' : 'matches'} in the codebase (best ${formatScore(highConfidence[0]!)}).\n\n${sections.join('\n\n')}\n\n---\nSearch: existence-routed | ${highConfidence.length} results | ${latencyMs}ms`;
      return toTextResult(text, { answered: true, route: 'existence' });
    } else {
      // Not found — show what the codebase has instead (top results regardless of score)
      const topResults = existenceResults.slice(0, 3);
      const sections = topResults.map((r, i) => formatResult(r, i + 1));
      const alternativesText =
        topResults.length > 0
          ? `\n\nThe closest matches found were:\n\n${sections.join('\n\n')}`
          : '';
      const text = `## Existence check: "${input.query}"\n\n**Not found.** No high-confidence matches in the indexed codebase.${alternativesText}\n\n---\nSearch: existence-routed | 0 confident results (${existenceResults.length} total checked) | ${latencyMs}ms`;
      return toTextResult(text, { answered: true, route: 'existence' });
    }
  }

  // Aggregation route: breadth-first retrieval for "find all X" queries
  if (classification.type === 'aggregation') {
    const aggregationLimit = Math.max((input.limit ?? 10) * 3, 30); // Fetch 3x more results
    const aggregationThreshold = 0.35; // Lower threshold for breadth

    let aggResults: RetrievalResult[];
    try {
      aggResults = await engine.searchWithExpansion(
        {
          text: input.query,
          limit: aggregationLimit,
          scoreThreshold: aggregationThreshold,
          ...(repoFilter ? { filter: repoFilter } : {}),
        },
        { hops: 0 }, // No expansion — breadth over depth
      );
    } catch {
      aggResults = await engine.search({
        text: input.query,
        limit: aggregationLimit,
        scoreThreshold: aggregationThreshold,
        ...(repoFilter ? { filter: repoFilter } : {}),
      });
    }

    // Deduplicate by file — keep best chunk per file
    const byFile = new Map<string, RetrievalResult>();
    for (const r of aggResults) {
      const existing = byFile.get(r.relativePath);
      if (!existing || r.score > existing.score) {
        byFile.set(r.relativePath, r);
      }
    }
    let deduped = Array.from(byFile.values()).sort((a, b) => b.score - a.score);

    // Apply token cap
    const aggBudget = classifyBudget(input.query);
    const aggMaxTokens = observability?.maxTokensPerCall ?? aggBudget.tokenBudget;
    if (aggMaxTokens > 0) {
      const cap = applyTokenCap(deduped, aggMaxTokens);
      deduped = cap.results;
    }

    // Group by directory for structured output
    const byDir = new Map<string, RetrievalResult[]>();
    for (const r of deduped) {
      const dir = r.relativePath.split('/').slice(0, -1).join('/') || '.';
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir)!.push(r);
    }

    const latencyMs = Date.now() - startTime;

    // Format grouped output
    const groupSections: string[] = [];
    for (const [dir, items] of Array.from(byDir.entries()).sort(
      (a, b) => b[1].length - a[1].length,
    )) {
      const itemLines = items.map((r) => {
        const name = r.name || r.relativePath.split('/').pop() || 'unknown';
        return `  - **${name}** \`${r.relativePath}\` (${formatScore(r)})`;
      });
      groupSections.push(`### ${dir}/\n${itemLines.join('\n')}`);
    }

    observability?.metricsStore &&
      logClassification(observability, {
        query: input.query,
        classification,
        classificationLatencyMs,
        route: 'aggregation',
        totalLatencyMs: latencyMs,
        resultCount: deduped.length,
      });

    let templatePrefix = '';
    if (input.use_template !== false) {
      const detectedIntent = detectIntent(input.query);
      const template = getTemplate(detectedIntent);
      if (template) templatePrefix = `${template}\n\n`;
    }

    const guardrailLead = `Conclusion: found ${deduped.length} unique files matching this pattern across ${byDir.size} ${byDir.size === 1 ? 'directory' : 'directories'}.`;
    const text = `${guardrailLead}\n\n${templatePrefix}## Aggregated results for: "${input.query}"\n\n${groupSections.join('\n\n')}\n\n---\nSearch: aggregation-routed | ${deduped.length} unique files (${aggResults.length} total chunks scanned) | ${latencyMs}ms`;

    return toTextResult(text, { answered: true, route: 'aggregation' });
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
        ...(repoFilter ? { filter: repoFilter } : {}),
      },
      { hops: clampedHops },
    );
    // Hierarchy expansion: walk superclass chains up to clampedHops levels
    if (clampedHops > 0) {
      const hierarchyResults = await expandHierarchy(engine, results, clampedHops);
      results = [...results, ...hierarchyResults];
    }
    // T137: Interface implementation expansion: find implementations for interface results
    if (clampedHops > 0 && engine.searchWithInterfaceExpansion) {
      const seenIds = new Set(results.map((r) => r.chunkId));
      const interfaceResults = results.filter((r) => r.chunkType === 'interface');
      if (interfaceResults.length > 0) {
        const expandedWithImpls = await engine.searchWithInterfaceExpansion({
          text: input.query,
          limit: input.limit ?? 10,
          scoreThreshold: input.score_threshold,
          ...(repoFilter ? { filter: repoFilter } : {}),
        });
        for (const impl of expandedWithImpls) {
          if (!seenIds.has(impl.chunkId)) {
            seenIds.add(impl.chunkId);
            results.push(impl);
          }
        }
      }
    }
    // Adjacent chunk expansion: auto-expand context for top results that have chunk ordering metadata
    if (engine.getAdjacentChunks && clampedHops > 0) {
      const seenIds = new Set(results.map((r) => r.chunkId));
      const adjacentResults: RetrievalResult[] = [];
      // Only expand top 3 results to limit cost
      const expandCandidates = results
        .filter(
          (r) => r.chunkIndex !== undefined && r.totalChunks !== undefined && r.totalChunks > 1,
        )
        .slice(0, 3);
      for (const candidate of expandCandidates) {
        const adjacent = await engine.getAdjacentChunks(
          candidate.relativePath,
          candidate.chunkIndex!,
          candidate.totalChunks!,
        );
        for (const adj of adjacent) {
          if (!seenIds.has(adj.chunkId)) {
            seenIds.add(adj.chunkId);
            adjacentResults.push(adj);
          }
        }
      }
      if (adjacentResults.length > 0) {
        results = [...results, ...adjacentResults];
      }
    }
    // Call-chain expansion: find chunks that define methods called by top results (or callers)
    if (engine.expandCallChain && clampedHops > 0) {
      const callChainResults = await engine.expandCallChain(results, 'both');
      if (callChainResults.length > 0) {
        results = [...results, ...callChainResults];
      }
    }
    // Multi-hop expansion: extract symbols from results and fetch their definitions
    if (clampedHops > 0 && (engine.scrollByName || engine.scrollByDefines)) {
      const multiHopResults = await multiHopExpand(results, engine, {
        maxSymbols: 15,
        expandMethodCalls: !!engine.scrollByDefines,
        expandHierarchy: !!engine.scrollByName,
      });
      if (multiHopResults.length > 0) {
        results = [...results, ...multiHopResults];
      }
    }
  } catch (error) {
    results = await engine.search({
      text: input.query,
      limit: input.limit ?? 10,
      scoreThreshold: input.score_threshold,
      ...(repoFilter ? { filter: repoFilter } : {}),
    });
    fallbackNote =
      `Note: dependency expansion was unavailable (${error instanceof Error ? error.message : String(error)}). ` +
      'Returning indexed semantic search results without expansion.';
  }

  const latencyMs = Date.now() - startTime;

  // BM25 re-ranking: re-rank non-expansion results using text relevance
  // Applied before score threshold to improve ranking quality before cutoffs
  const expansionResults = results.filter(
    (r) =>
      r.expansionSource === 'hierarchy' ||
      r.expansionSource === 'adjacent' ||
      r.expansionSource === 'multi-hop',
  );
  const directResults = results.filter(
    (r) =>
      r.expansionSource !== 'hierarchy' &&
      r.expansionSource !== 'adjacent' &&
      r.expansionSource !== 'multi-hop',
  );
  if (directResults.length > (input.limit ?? 10)) {
    const reranked = bm25Rerank(directResults, input.query, {
      topK: input.limit ?? 10,
      vectorScoreWeight: 0.4,
    });
    results = [...reranked, ...expansionResults];
  }

  // Confidence gate: if configured and best result is below threshold, reject immediately
  // This prevents low-quality chunks from being injected even when they pass scoreThreshold.
  // Enhanced with negative-knowledge: show what WAS found so the LLM knows what's available.
  // Skip gate for RRF-scored results: RRF rank scores (~0.016–0.033) are not on the same
  // 0–1 cosine scale the threshold is calibrated for — gating them would reject every
  // multi-collection semantic search regardless of actual relevance.
  const allRrf = results.length > 0 && results.every((r) => r.scoreType === 'rrf');
  if (!allRrf && observability?.confidenceThreshold !== undefined && results.length > 0) {
    const bestScore = Math.max(...results.map((r) => r.score));
    if (bestScore < observability.confidenceThreshold) {
      // Negative-knowledge: surface low-confidence results as "nearby but not matching"
      const nearbyResults = results.sort((a, b) => b.score - a.score).slice(0, 5);
      const nearbySection =
        nearbyResults.length > 0
          ? `\n\n**What the search DID find** (below confidence threshold ${observability.confidenceThreshold.toFixed(2)}):\n${nearbyResults.map((r) => `- \`${r.relativePath}\` — ${r.name || r.chunkType} (${formatScore(r)}) [${r.matchedVector}]${r.source ? ` [${r.source}]` : ''}`).join('\n')}\n\nThese results were too weakly related to be trustworthy. The codebase may not contain what you're looking for, or try rephrasing the query.`
          : '';

      const gateText =
        `Conclusion: the indexed search did not return strong evidence for this query.\n\n` +
        `No relevant code found for "${input.query}". Do not guess or hallucinate — inform the user that the codebase doesn't appear to contain relevant information.${nearbySection}`;
      return toTextResult(gateText, {
        confidence_gated: true,
        best_score: bestScore,
        threshold: observability.confidenceThreshold,
        nearby_count: nearbyResults.length,
        answered: false,
      });
    }
  }

  // Score threshold filtering (client-side, per D-01, D-02, D-03)
  // Hierarchy-expanded and adjacent-expanded results are excluded from threshold
  // since they are structurally-related chunks, not relevance-ranked results.
  // For RRF-scored results, the cosine threshold (0.5–0.6) is meaningless — skip it
  // so RRF results (~0.016–0.033) are not silently discarded before reaching the LLM.
  const scoreThreshold = allRrf
    ? 0
    : (input.score_threshold ?? observability?.defaultScoreThreshold ?? 0.5);
  let thresholdFiltered = false;
  if (scoreThreshold > 0) {
    const isExpansion = (r: RetrievalResult) =>
      r.expansionSource === 'hierarchy' ||
      r.expansionSource === 'adjacent' ||
      r.expansionSource === 'multi-hop';
    const directBefore = results.filter((r) => !isExpansion(r)).length;
    results = results.filter((r) => isExpansion(r) || r.score >= scoreThreshold);
    const directAfter = results.filter((r) => !isExpansion(r)).length;
    // thresholdFiltered = true only when direct results were present but all got filtered
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

  // Token budget cap — adaptive based on query complexity (per D-02, D-05, D-06)
  const budgetClassification = classifyBudget(input.query);
  const maxTokens = observability?.maxTokensPerCall ?? budgetClassification.tokenBudget;

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

  // T058: Filesystem read for top-5 results (guards against indexed content drift).
  // T059: Results 6-10 are metadata-only (content stripped to reduce token usage).
  // T069: contentHash drift detection — compare stored hash vs live file hash.
  if (results.length > 0) {
    const topN = 5;
    // Step 1: Read live content for top-5 results; detect hash drift
    if (observability?.readFileFn) {
      for (let i = 0; i < Math.min(topN, results.length); i++) {
        try {
          const liveContent = await observability.readFileFn(
            results[i]!.relativePath,
            results[i]!.startLine,
            results[i]!.endLine,
            results[i]!.repoId,
          );
          // T069: drift detection — compare SHA256 of live content vs stored contentHash
          let stale: boolean | undefined;
          if (results[i]!.contentHash) {
            const liveHash = createHash('sha256').update(liveContent).digest('hex');
            if (liveHash !== results[i]!.contentHash) {
              stale = true;
            }
          }
          results[i] = { ...results[i]!, content: liveContent, ...(stale ? { stale } : {}) };
        } catch {
          // Silent degradation: fallback to stored payload content
        }
      }
    }
    // Step 2: Strip content for results 6-10 (metadata-only per contract)
    for (let i = topN; i < results.length; i++) {
      results[i] = { ...results[i]!, content: '' };
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

  // RAG-sufficient signaling: when results are high-confidence, hint the LLM
  // to use this context before exploring files further
  let ragSufficientNote: string | undefined;
  if (results.length >= 3 && results[0]?.score !== undefined && results[0].score > 0.75) {
    ragSufficientNote = `[Retrieved ${results.length} high-confidence results (best: ${formatScore(results[0])}). Consider using this context before exploring files further.]`;
  }

  const response = buildSearchResponse(
    input,
    results,
    ragSufficientNote ?? fallbackNote,
    undefined,
    input.use_template,
    capMeta,
    thresholdFiltered,
  );

  // ── Store in session cache (T156) ──
  if (observability?.sessionCache?.enabled && results.length > 0) {
    const cacheKey = buildSearchCacheKey(input);
    if (searchCache.size >= SEARCH_CACHE_MAX) evictSearchLRU();
    const responseText = (response.content[0] as { text?: string })?.text ?? '';
    searchCache.set(cacheKey, {
      responseText,
      resultCount: results.length,
      lastAccess: ++searchCacheAccessCounter,
    });
  }

  return response;
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
        'Query is auto-classified (semantic / keyword / existence / aggregation) and routed accordingly. ' +
        'Top-5 results include live file content; results 6-10 are metadata-only to reduce token usage. ' +
        'Results can be expanded along the dependency graph to include related files (imports/dependencies). ' +
        'Use expand_hops=0 to disable expansion, 1 for direct imports, or 2 for transitive dependencies (default). ' +
        'Supports optional metadata filters: stereotype, archLayer, module, language for precise retrieval.',
      inputSchema: {
        query: z.string().describe('Natural language search query'),
        limit: coercedNumber().optional().describe('Maximum number of results (default: 10)'),
        score_threshold: coercedNumber()
          .optional()
          .describe('Minimum similarity score 0-1 (default: 0.5). Set to 0 to disable filtering.'),
        expand_hops: coercedNumber()
          .optional()
          .describe(
            'Dependency graph expansion hops: 0 = no expansion, 1 = direct imports, 2 = transitive (default)',
          ),
        fallback: coercedBoolean()
          .optional()
          .describe(
            'Enable zero-result fallback (default: true). Set false to receive raw empty results without suggestions.',
          ),
        use_template: coercedBoolean()
          .optional()
          .describe(
            'Enable prompt template injection for detected query intents (default: true). Set false to disable scaffolding.',
          ),
        repo: z
          .string()
          .optional()
          .describe('Filter results to a specific repo by name. When omitted, searches all repos.'),
        stereotype: z
          .string()
          .optional()
          .describe(
            "Filter by architectural stereotype (e.g. 'service', 'repository', 'controller', 'entity', 'dto').",
          ),
        archLayer: z
          .string()
          .optional()
          .describe(
            "Filter by architectural layer (e.g. 'presentation', 'service', 'domain', 'persistence', 'infrastructure').",
          ),
        module: z
          .string()
          .optional()
          .describe('Filter by module name (maps to moduleInfo.module in the Qdrant payload).'),
        language: z
          .string()
          .optional()
          .describe("Filter by programming language (e.g. 'java', 'typescript', 'python')."),
      },
    },
    async (input) => {
      const result = await searchCodebaseHandler(engine, input, observability);
      const merged = withDegradation(
        result.structuredContent as Record<string, unknown> | undefined,
        observability?.capabilities,
      );
      return merged ? { ...result, structuredContent: merged } : result;
    },
  );
}
