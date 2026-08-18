import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { estimateTokens } from '@ia-framework/core';
import type { ContextItem, VectorBranch } from '@ia-framework/core';
import { bm25Rerank, multiHopExpand, QueryPlanner } from '@ia-framework/retrieval';
import type {
  RetrievalResult,
  FallbackSearchResult,
  EffectiveFilter,
  PlannedQuery,
} from '@ia-framework/retrieval';
import type { StoreCapabilities } from '@ia-framework/vector-store';
import type { MetricsStore, TokenCounter } from '@ia-framework/observability';
import { buildCodeAnchor, formatRetrievalContext, isValidLineRange } from './result-formatting.js';
import { detectIntent, getTemplate } from '../templates/index.js';
import type { IntentType } from '../templates/index.js';
import { ContextAssembler, deduplicateResults, selectRange } from '../context/assembler.js';
import { BudgetGovernor } from '../context/budget.js';
import {
  buildDiagnostics,
  cacheFingerprint,
  diagnosticsAnomalyLines,
  type Diagnostics,
} from '../context/diagnostics.js';
import { coercedNumber, coercedBoolean } from './coerce.js';
import { withDegradation, type ServerCapabilities } from '../capabilities.js';

type Engine = {
  search(query: {
    text: string;
    limit?: number;
    scoreThreshold?: number | undefined;
    onBranchExecuted?: ((branch: VectorBranch) => void) | undefined;
  }, plan?: PlannedQuery): Promise<RetrievalResult[]>;
  searchWithExpansion(
    query: {
      text: string;
      limit?: number;
      scoreThreshold?: number | undefined;
      onBranchExecuted?: ((branch: VectorBranch) => void) | undefined;
    },
    filter: EffectiveFilter,
    options?: { hops?: 0 | 1 | 2 },
    plan?: PlannedQuery,
  ): Promise<RetrievalResult[]>;
  searchWithFallback?(
    query: {
      text: string;
      limit?: number;
      scoreThreshold?: number | undefined;
      onBranchExecuted?: ((branch: VectorBranch) => void) | undefined;
    },
    options?: { enableFallback?: boolean; maxSuggestions?: number },
    plan?: PlannedQuery,
  ): Promise<FallbackSearchResult>;
  /** Optional store capability declaration used by the shared query planner. */
  capabilities?(): StoreCapabilities;
  /** Scroll for chunks that match a class/interface name for hierarchy traversal */
  scrollForHierarchy?(
    name: string,
    chunkType: string,
    filter: EffectiveFilter,
  ): Promise<RetrievalResult[]>;
  /** Scroll for chunks that implement/extend a given class or interface (walk DOWN) */
  scrollForImplementations?(name: string, filter: EffectiveFilter): Promise<RetrievalResult[]>;
  /** Scroll for chunks by their name field (for multi-hop class lookups) */
  scrollByName?(name: string, filter: EffectiveFilter): Promise<RetrievalResult[]>;
  /** Scroll for chunks that define a given method (for multi-hop method lookups) */
  scrollByDefines?(methodName: string, filter: EffectiveFilter): Promise<RetrievalResult[]>;
  /** Fetch adjacent chunks by file path and chunk index */
  getAdjacentChunks?(
    relativePath: string,
    chunkIndex: number,
    totalChunks: number,
    filter: EffectiveFilter,
    radius?: number,
  ): Promise<RetrievalResult[]>;
  /** Expand call chain: find chunks that define called methods or callers */
  expandCallChain?(
    results: RetrievalResult[],
    filter: EffectiveFilter,
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
  scrollByNameInRepo?(
    name: string,
    repoId: string,
    filter: EffectiveFilter,
  ): Promise<RetrievalResult[]>;
  /** T137: Search with interface implementation expansion */
  searchWithInterfaceExpansion?(
    query: {
      text: string;
      limit?: number;
      scoreThreshold?: number | undefined;
      filter?: Record<string, unknown> | undefined;
    },
    filter: EffectiveFilter,
  ): Promise<RetrievalResult[]>;
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
    * Used for selected results to guard against indexed content drift.
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
  /**
   * Test/instrumentation hook for the response assembly pipeline.
   *
   * F5.4 decision — KEPT, deliberately. Removal was conditional on stage ordering
   * becoming observable on the response, and it did not: no diagnostics field
   * carries the stage sequence, and `DIAGNOSTIC_KEYS` is pinned to exactly 13
   * entries, so adding one is out of scope here. CTX-02 ("final context assembly
   * runs strictly after retrieval, expansion, live reads and enrichment") is
   * therefore only verifiable through this hook. Removing it would delete the only
   * evidence for an ordering requirement — a coverage loss, not a cleanup.
   */
  stageHook?: ((stage: string) => void) | undefined;
  /** Collection generation used to invalidate cached retrieval responses. */
  indexGeneration?: string | undefined;
  /** Structured logger for QCC-04 classification events. Optional. */
  logger?: { info: (entry: Record<string, unknown>, message: string) => void } | undefined;
}

// ---------------------------------------------------------------------------
// Session-level dedup cache (T156)
// ---------------------------------------------------------------------------

interface SearchCacheEntry {
  response: ToolOutput;
  resultCount: number;
  lastAccess: number;
}

const SEARCH_CACHE_MAX = 100;
const searchCache = new Map<string, SearchCacheEntry>();
let searchCacheAccessCounter = 0;

function buildSearchCacheKey(
  input: SearchCodebaseInput,
  plan: PlannedQuery,
  observability?: ObservabilityConfig,
): string {
  return cacheFingerprint({
    query: input.query,
    planFingerprint: plan.fingerprint,
    filter: plan.filter,
    expansion: plan.expansion,
    budget: plan.budget,
    options: input,
    indexGeneration: observability?.indexGeneration ?? 'unknown',
  });
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

function resolvePlanCapabilities(engine: Engine): StoreCapabilities {
  return (
    engine.capabilities?.() ?? {
      // SearchEngine-backed MCP engines use the sparse-capable Qdrant contract. The
      // optional boundary hook lets tests and alternate adapters declare otherwise.
      sparse: true,
      filterOnly: true,
      payloadIndexes: [],
    }
  );
}

/**
 * Placeholder used while measuring a response that will carry its own token count.
 * Wide enough that substituting the real figure cannot make the response larger
 * than what was measured, so the estimate never under-reports (BUD-13).
 */
const ESTIMATE_SENTINEL = 999_999_999;

function planConfidence(plan: PlannedQuery): number {
  return plan.route === 'keyword' ? 1 : 0.5;
}

// ---------------------------------------------------------------------------
// Executed-branch provenance (SPR-04, SPR-06)
//
// `plan.branches` is what the planner SELECTED. The engine reports each branch
// at the moment it issues the retrieval call, so a branch the plan selected but
// the engine skipped (empty sparse vector, adapter without capability) is never
// observed — which is what makes "skipped" distinguishable from "executed with
// zero results" on the response.
//
// Keyed by the plan instance rather than threaded through every formatter
// signature: the planner produces a fresh plan per request, so the record is
// request-scoped, and a WeakMap retains nothing after the response is built.
// ---------------------------------------------------------------------------

const observedBranches = new WeakMap<PlannedQuery, VectorBranch[]>();

function branchRecorder(plan: PlannedQuery): (branch: VectorBranch) => void {
  return (branch) => {
    const observed = observedBranches.get(plan) ?? [];
    if (!observed.includes(branch)) observed.push(branch);
    observedBranches.set(plan, observed);
  };
}

function executedBranchesFor(plan: PlannedQuery): VectorBranch[] {
  return observedBranches.get(plan) ?? [];
}

// ---------------------------------------------------------------------------
// Deduplication accounting (BUD-15, CTX-13)
//
// The counter observes the collapse that actually happened on this request:
// candidates in minus survivors out at each dedup point. Request-scoped for the
// same reason as the branch record above.
// ---------------------------------------------------------------------------

const deduplicatedCounts = new WeakMap<PlannedQuery, number>();

/** Record a collapse of `before` candidates into `after` survivors. */
function recordDeduplicated(plan: PlannedQuery, before: number, after: number): void {
  deduplicatedCounts.set(plan, (deduplicatedCounts.get(plan) ?? 0) + Math.max(0, before - after));
}

function deduplicatedFor(plan: PlannedQuery): number {
  return deduplicatedCounts.get(plan) ?? 0;
}

/**
 * BUD-15 + `context.md` decision 4: the full 13-field diagnostics set appears on
 * **every** response, on every route — including failures. A failure carries the
 * honest values for what happened: nothing was retrieved, so every count is 0 and
 * no branch executed. When the plan survived (retrieval failed after planning)
 * its route and configured budget are real and reported as such.
 */
function failureDiagnostics(plan: PlannedQuery | undefined): Record<string, unknown> {
  if (plan) return diagnosticsContent(plan, [], null, { candidateCount: 0, estimated: 0 });
  return buildDiagnostics({
    route: 'unplanned',
    executedBranches: [],
    fallbackMode: null,
    candidateCount: 0,
    selectedCount: 0,
    deduplicatedCount: 0,
    omittedCount: 0,
    expansionCount: 0,
    staleCount: 0,
    estimatedTokens: 0,
    configuredBudget: 0,
    compactionCount: 0,
    exactNodeOverflow: false,
  }) as unknown as Record<string, unknown>;
}

/**
 * FAIL-07: a failure response costs real tokens, so it reports a conservative
 * measurement of its own serialized envelope rather than 0. The self-referential
 * count is measured with a wide sentinel in its place, so the figure can never
 * under-report the string actually returned (BUD-13).
 */
function withMeasuredFailureCost(
  text: string,
  structuredContent: Record<string, unknown>,
): ToolOutput {
  const measured = estimateTokens(
    JSON.stringify(
      toTextResult(text, { ...structuredContent, estimated_tokens: ESTIMATE_SENTINEL }),
    ),
  );
  return toTextResult(text, { ...structuredContent, estimated_tokens: measured });
}

function planDiagnostic(error: unknown): ToolOutput {
  const message = error instanceof Error ? error.message : String(error);
  return withMeasuredFailureCost(
    `Conclusion: the search request was refused.\n\nQuery plan could not be produced: ${message}\n\n` +
      'Suggestion: provide a non-empty query and valid expansion, budget, and filter values.',
    {
      ...failureDiagnostics(undefined),
      status: 'refused',
      plan_error: true,
      answered: false,
    },
  );
}

function retrievalFailure(error: unknown, plan?: PlannedQuery): ToolOutput {
  const message = error instanceof Error ? error.message : String(error);
  const contractFailure = /contract|dimension|schema|unknown/i.test(message);
  const status = contractFailure ? 'refused' : 'unavailable';
  const remediation = contractFailure
    ? 'run ia index --force after verifying the active and persisted embedding contracts'
    : 'verify Qdrant availability and retry the request';
  return withMeasuredFailureCost(
    `Conclusion: retrieval ${status === 'refused' ? 'was refused' : 'is unavailable'}.\n\n${message}\nSuggestion: ${remediation}.`,
    { ...failureDiagnostics(plan), status, answered: false, results: [] },
  );
}

function hasGroundedFallback(results: RetrievalResult[], plan: PlannedQuery): boolean {
  if (plan.lexical.exactSymbols.length === 0) return true;
  return results.some((result) =>
    plan.lexical.exactSymbols.some((symbol) => {
      const symbols = [symbol, symbol.split(/\.|::/).pop() ?? symbol];
      return symbols.some((candidate) =>
        [
          result.name,
          result.parentName,
          result.relativePath,
          result.signature,
          result.classSignature,
          ...(result.defines ?? []),
        ]
          .filter((value): value is string => value !== undefined)
          .some((value) => value.toLowerCase().includes(candidate.toLowerCase())),
      );
    }),
  );
}

function addRepoConstraint(filter: EffectiveFilter): EffectiveFilter {
  if (!filter.repoId) return filter;
  const existingMust: unknown[] = Array.isArray(filter.userFilters.must)
    ? [...(filter.userFilters.must as unknown[])]
    : [];
  const hasRepoConstraint = existingMust.some(
    (condition) =>
      typeof condition === 'object' &&
      condition !== null &&
      (condition as { key?: unknown }).key === 'repoId',
  );
  if (!hasRepoConstraint) {
    existingMust.push({ key: 'repoId', match: { value: filter.repoId } });
  }
  return {
    ...filter,
    userFilters: {
      ...filter.userFilters,
      must: existingMust,
    },
  };
}

/** Exported for testing: reset the session cache. */
export function resetSearchSessionCache(): void {
  searchCache.clear();
  searchCacheAccessCounter = 0;
}

// ---------------------------------------------------------------------------
// Embedding-contract gate (EMB-09, A-27, D-2, D-6)
//
// The contract is a per-collection invariant, so each collection registers one
// assert and its verdict is cached for the process lifetime: only
// `ia index --force` can change that state, so re-asserting per request would
// add latency without adding information. A failure in ANY collection refuses
// the search — a mismatched collection can only return degraded results, which
// EMB-09 forbids.
// ---------------------------------------------------------------------------

type ContractGate = { assert: () => Promise<void>; verdict?: Error | null };

const contractGates = new Map<string, ContractGate>();

/**
 * Register the contract assert for a collection. Called once per discovered
 * collection at server startup.
 */
export function registerContractGate(collectionName: string, assert: () => Promise<void>): void {
  contractGates.set(collectionName, { assert });
}

/** Exported for testing: clear registered gates and their cached verdicts. */
export function resetContractVerdictCache(): void {
  contractGates.clear();
}

/**
 * Assert every registered collection contract at most once. Returns the refusal
 * error to report, or `null` when all collections are searchable (or unguarded).
 */
export async function assertContractGates(): Promise<Error | null> {
  for (const gate of contractGates.values()) {
    if (gate.verdict === undefined) {
      try {
        await gate.assert();
        gate.verdict = null;
      } catch (error) {
        gate.verdict = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (gate.verdict) return gate.verdict;
  }
  return null;
}

/**
 * Warm the gates at server startup so an operator sees the problem in the logs
 * immediately. Reports each unsearchable collection through `onRefusal` and
 * **never throws**: per D-2, a throw in `bin.ts` becomes `process.exit(1)`,
 * which hands the agent an opaque dead server instead of the actionable
 * per-request refusal the contract gate already produces.
 */
export async function warmContractGates(
  onRefusal: (collectionName: string, error: Error) => void,
): Promise<void> {
  for (const [collectionName, gate] of contractGates) {
    if (gate.verdict === undefined) {
      try {
        await gate.assert();
        gate.verdict = null;
      } catch (error) {
        gate.verdict = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (gate.verdict) onRefusal(collectionName, gate.verdict);
  }
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

function diagnosticsFor(
  plan: PlannedQuery,
  results: RetrievalResult[],
  fallbackMode: string | null = null,
  budget?: {
    candidateCount?: number;
    omitted?: number;
    compacted?: number;
    overflow?: boolean;
    estimated?: number;
    overflowAmounts?: { configured: number; estimated: number; amount: number } | undefined;
  },
): Diagnostics {
  return buildDiagnostics({
    route: plan.route,
    executedBranches: executedBranchesFor(plan),
    fallbackMode,
    candidateCount: budget?.candidateCount ?? results.length,
    selectedCount: results.length,
    deduplicatedCount: deduplicatedFor(plan),
    omittedCount: budget?.omitted ?? 0,
    expansionCount: results.filter((result) => result.expansionSource !== undefined).length,
    staleCount: results.filter((result) => result.stale === true).length,
    estimatedTokens: budget?.estimated ?? estimateTokens(results.map((result) => result.content).join('\n')),
    configuredBudget: plan.budget.limit,
    compactionCount: budget?.compacted ?? 0,
    exactNodeOverflow: budget?.overflow ?? false,
    ...(budget?.overflowAmounts ? { overflowAmounts: budget.overflowAmounts } : {}),
  });
}

function diagnosticsContent(
  plan: PlannedQuery,
  results: RetrievalResult[],
  fallbackMode?: string | null,
  budget?: {
    candidateCount?: number;
    omitted?: number;
    compacted?: number;
    overflow?: boolean;
    estimated?: number;
    overflowAmounts?: { configured: number; estimated: number; amount: number } | undefined;
  },
): Record<string, unknown> {
  return diagnosticsFor(plan, results, fallbackMode, budget) as unknown as Record<string, unknown>;
}

function withDiagnostics(
  response: ToolOutput,
  plan: PlannedQuery,
  results: RetrievalResult[],
  fallbackMode: string | null = null,
  status: 'ok' | 'empty' | 'low_confidence' | 'unavailable' | 'refused' = results.length > 0 ? 'ok' : 'empty',
): ToolOutput {
  return {
    ...response,
    structuredContent: {
      ...(response.structuredContent as Record<string, unknown> | undefined),
      ...diagnosticsContent(plan, results, fallbackMode),
      status,
    },
  };
}

/**
 * BUD-01/BUD-16: the single budget contract for the routes that build their own
 * prose body (keyword, existence, aggregation, zero-result fallback).
 *
 * Each of these routes formats a bounded number of already-selected results
 * rather than assembling ContextItems, so enforcement is applied to the rendered
 * response: `render` is called with a candidate count, the result is measured,
 * and when it exceeds the budget the count is reduced from the bottom of the
 * ranking and re-rendered once (D-1, max 2 passes). `estimated_tokens` always
 * reports the measurement of the response actually returned.
 */
function enforceRouteBudget(
  plan: PlannedQuery,
  results: RetrievalResult[],
  render: (shown: RetrievalResult[]) => ToolOutput,
  fallbackMode: string | null = null,
  status?: 'ok' | 'empty' | 'low_confidence' | 'unavailable' | 'refused',
): ToolOutput {
  const candidateCount = results.length;
  const overflowFor = (estimated: number) =>
    estimated > plan.budget.limit && plan.budget.limit > 0
      ? {
          configured: plan.budget.limit,
          estimated,
          amount: estimated - plan.budget.limit,
        }
      : undefined;

  /**
   * BUD-03/BUD-12: measure the complete envelope — prose body plus the diagnostics
   * block that will accompany it — not just the rendered body. The self-referential
   * token count is measured via a wide sentinel so the figure never under-reports.
   */
  const measure = (response: ToolOutput, shown: RetrievalResult[], estimated: number): number =>
    estimateTokens(
      JSON.stringify({
        ...response,
        structuredContent: {
          ...(response.structuredContent as Record<string, unknown> | undefined),
          ...diagnosticsContent(plan, shown, fallbackMode, {
            candidateCount,
            omitted: candidateCount - shown.length,
            estimated: ESTIMATE_SENTINEL,
            overflow: overflowFor(estimated) !== undefined,
            ...(overflowFor(estimated) ? { overflowAmounts: overflowFor(estimated) } : {}),
          }),
          status: shown.length > 0 ? 'ok' : 'empty',
        },
      }),
    );

  const measureFor = (shown: RetrievalResult[]): { response: ToolOutput; estimated: number } => {
    const response = render(shown);
    // Two-step: the first measurement sizes the body, the second accounts for the
    // overflow fields that measurement may itself trigger.
    const provisional = measure(response, shown, 0);
    return { response, estimated: measure(response, shown, provisional) };
  };

  let { response, estimated } = measureFor(results);
  let shown = results;

  if (plan.budget.limit > 0 && estimated > plan.budget.limit) {
    // Drop from the bottom of the ranking until the measured response fits, always
    // keeping the single highest-ranked item so a response is never empty (BUD-08).
    let low = 1;
    let high = shown.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (measureFor(shown.slice(0, middle)).estimated <= plan.budget.limit) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    shown = shown.slice(0, Math.max(1, low - 1));
    ({ response, estimated } = measureFor(shown));
  }

  const omitted = candidateCount - shown.length;
  const resolvedStatus = status ?? (shown.length > 0 ? 'ok' : 'empty');
  const overflow = overflowFor(estimated);
  return {
    ...response,
    structuredContent: {
      ...(response.structuredContent as Record<string, unknown> | undefined),
      ...diagnosticsContent(plan, shown, fallbackMode, {
        candidateCount,
        omitted,
        estimated,
        overflow: overflow !== undefined,
        ...(overflow ? { overflowAmounts: overflow } : {}),
      }),
      status: resolvedStatus,
    },
  };
}

function buildSearchResponse(
  input: SearchCodebaseInput,
  plan: PlannedQuery,
  results: RetrievalResult[],
  note?: string,
  fallbackResult?: FallbackSearchResult,
  useTemplate?: boolean,
  capMeta?: { token_cap_applied: true; results_trimmed: number },
  thresholdFiltered?: boolean,
): ToolOutput {
  const hasArchitectureOrFlowSignal =
    plan.representations.signature.includes('architecture') ||
    plan.representations.signature.includes('data-flow');
  const guardrailLead =
    results.length > 0
      ? `Conclusion: found ${results.length} evidence-backed ${results.length === 1 ? 'match' : 'matches'}${
          hasArchitectureOrFlowSignal
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

      return withDiagnostics(toTextResult(text, {
        route: plan.route,
        branches: plan.branches,
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
      }), plan, results, fallbackResult.fallback_mode);
    }

    // Fallback envelope with suggestions
    if (fallbackResult && fallbackResult.suggestions.length > 0) {
      const suggestionLines = fallbackResult.suggestions
        .map((s) => `- ${s.file} (${s.name}): ${s.snippet}`)
        .join('\n');
      const text = `${guardrailLead}\n\nNo exact match found. Closest related code:\n${suggestionLines}`;

      return withDiagnostics(toTextResult(text, {
        route: plan.route,
        branches: plan.branches,
        found: false,
        fallback_used: fallbackResult.fallback_used,
        fallback_mode: fallbackResult.fallback_mode,
        suggestions: fallbackResult.suggestions.map((s) => ({
          file: s.file,
          name: s.name,
          snippet: s.snippet,
        })),
        answered: false,
      }), plan, results, fallbackResult.fallback_mode);
    }

    const noResultText = thresholdFiltered
      ? `${guardrailLead}\n\nNo relevant code found for this query. Do not guess or hallucinate — inform the user that the codebase doesn't appear to contain relevant information for "${input.query}".`
      : note
        ? `${guardrailLead}\n\n${note}\n\nNo results found for query: "${input.query}"`
        : `${guardrailLead}\n\nNo results found for query: "${input.query}"`;

    return withDiagnostics(toTextResult(noResultText, {
      route: plan.route,
      branches: plan.branches,
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
    }), plan, results, fallbackResult?.fallback_mode ?? null);
  }

  const prefix = note ? `${note}\n\n` : '';

  // Template injection: detect intent and prepend scaffolding if applicable
  let templatePrefix = '';
  let intentDetected: string | undefined;
  if (useTemplate !== false && plan.templateId) {
    const template = getTemplate(plan.templateId as IntentType);
    if (template) {
      templatePrefix = `${template}\n\n`;
      intentDetected = plan.templateId;
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

  // Build structured results array with repo field.
  // ENR-01 + context.md decision 5: enrichment reaches the caller in
  // structuredContent ONLY. The prose body stays pure evidence, because a
  // model-generated summary of source that is already present pays twice for the
  // same information. A chunk with no enrichment omits the key entirely rather
  // than emitting an empty or misleading field (ENR-08).
  const structuredResults = results.map((r) => ({
    file: r.relativePath,
    name: r.name,
    score: r.score,
    ...(r.repoId ? { repo: r.repoId } : {}),
    ...(r.stale ? { stale: true } : {}),
    ...(r.signatureOnly ? { signature_only: true } : {}),
    ...((r as FormedResult).readFailed ? { read_failed: true } : {}),
    ...(r.parentName !== undefined ? { parent_name: r.parentName } : {}),
    ...(isValidLineRange(r.parentStartLine, r.parentEndLine)
      ? { parent_start_line: r.parentStartLine, parent_end_line: r.parentEndLine }
      : {}),
    ...(r.partIndex !== undefined && Number.isInteger(r.partIndex) && r.partIndex >= 1
      ? { part_index: r.partIndex }
      : {}),
    ...(r.totalParts !== undefined && Number.isInteger(r.totalParts) && r.totalParts >= 1
      ? { total_parts: r.totalParts }
      : {}),
    ...(r.truncated !== undefined ? { truncated: r.truncated } : {}),
    ...(structuredEnrichment(r.enrichment) ?? {}),
  }));

  return withDiagnostics(toTextResult(text, {
    route: plan.route,
    branches: plan.branches,
    ...(note ? { fallbackUsed: true } : {}),
    ...(intentDetected ? { intent_detected: intentDetected } : {}),
    ...(capMeta ? capMeta : {}),
    results: structuredResults,
    answered: true,
  }), plan, results);
}

/**
 * ENR-01 / ENR-08: project a chunk's enrichment into structuredContent, keeping
 * only the fields that are actually populated. Returns `undefined` when the
 * chunk carries no enrichment at all, so the `enrichment` key is omitted rather
 * than emitted empty.
 */
function structuredEnrichment(
  enrichment: RetrievalResult['enrichment'],
): { enrichment: Record<string, unknown> } | undefined {
  if (!enrichment) return undefined;
  const projected: Record<string, unknown> = {
    ...(enrichment.description === undefined ? {} : { description: enrichment.description }),
    ...(enrichment.businessContext === undefined
      ? {}
      : { businessContext: enrichment.businessContext }),
    ...(enrichment.semanticTags === undefined ? {} : { semanticTags: enrichment.semanticTags }),
    ...(enrichment.relationships === undefined ? {} : { relationships: enrichment.relationships }),
    ...(enrichment.enrichmentModel === undefined
      ? {}
      : { enrichmentModel: enrichment.enrichmentModel }),
    ...(enrichment.enrichedAt === undefined ? {} : { enrichedAt: enrichment.enrichedAt }),
  };
  return Object.keys(projected).length > 0 ? { enrichment: projected } : undefined;
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
  // A-29: the chunk exceeded the provider per-input limit at index time, so only
  // its signature and doc comment were embedded. Its full line range and live
  // body are intact, but the match was semantically reduced — mark it, so the
  // degradation is reported rather than inferred (FAIL-08).
  const signatureOnlyTag = result.signatureOnly ? ' [signature-only]' : '';
  // ENR-07: exact source was unavailable, so this item is a signature. Marked
  // rather than silently served as if it were the code the caller asked for.
  const formTag =
    (result as FormedResult).contextForm === 'signature' && result.content ? ' [signature]' : '';
  // FAIL-01/FAIL-04: the live read for this file failed. A THIRD, distinct marker:
  // `[signature]` means exact source was unavailable at retrieval, `[signature-only]`
  // means the embedding was reduced at index time, `[read-failed]` means the
  // filesystem read itself failed.
  const readFailedTag = (result as FormedResult).readFailed ? ' [read-failed]' : '';
  const partTag =
    result.partIndex !== undefined && result.totalParts !== undefined
      ? ` [part ${result.partIndex}/${result.totalParts}]`
      : '';
  const truncatedTag = result.truncated === true ? ' [truncated]' : '';
  const tags = `${sourceTag}${hierarchyTag}${staleTag}${signatureOnlyTag}${formTag}${readFailedTag}${partTag}${truncatedTag}`;
  const lineRange = `:${result.startLine}-${result.endLine}`;
  const scoreLabel = formatScore(result);
  const header = result.name
    ? `### ${index}. ${result.relativePath}${lineRange} (${result.name}) — ${scoreLabel} [${result.matchedVector}]${tags}`
    : `### ${index}. ${result.relativePath}${lineRange} — ${scoreLabel} [${result.matchedVector}]${tags}`;
  const contextLine = formatRetrievalContext(result);

  // Empty content means the result is represented by its anchor and metadata.
  if (!result.content) {
    const failure = (result as FormedResult).readFailed;
    // FAIL-04: state what failed, then the best grounded evidence that remains.
    return failure
      ? `${header}\n${contextLine}\nLive source could not be read: ${failure}`
      : `${header}\n${contextLine}`;
  }

  const codeBlock = `\`\`\`${result.language}\n${result.content}\n\`\`\``;
  const failure = (result as FormedResult).readFailed;

  // FAIL-01/FAIL-04: name the failure, then serve the best grounded evidence that
  // remains — the indexed body for this exact range, explicitly marked as not
  // live-verified rather than passed off as a successful read.
  return failure
    ? `${header}\n${contextLine}\nLive source could not be read: ${failure}. Showing indexed content for this range.\n${codeBlock}`
    : `${header}\n${contextLine}\n${codeBlock}`;
}

/**
 * BUD-16: render a result as anchor + metadata with no source body, for the
 * existence and aggregation routes which must remain source-free.
 * @internal
 */
function formatSourceFree(result: RetrievalResult, index: number): string {
  const sourceTag = result.source ? ` [${result.source}]` : '';
  const staleTag = result.stale ? ' [stale]' : '';
  // A-29 applies on every route — a semantically reduced match is marked here too.
  const signatureOnlyTag = result.signatureOnly ? ' [signature-only]' : '';
  const partTag =
    Number.isInteger(result.partIndex) &&
    Number.isInteger(result.totalParts) &&
    result.partIndex! >= 1 &&
    result.totalParts! >= result.partIndex!
      ? ` [part ${result.partIndex}/${result.totalParts}]`
      : '';
  const truncatedTag = result.truncated === true ? ' [truncated]' : '';
  return `### ${index}. ${buildCodeAnchor(result)} — ${formatScore(result)} [${result.matchedVector}]${sourceTag}${staleTag}${signatureOnlyTag}${partTag}${truncatedTag}`;
}

/**
 * Expand hierarchy by walking superclass chains up to maxHops levels.
 * Returns additional results tagged with expansionSource: 'hierarchy'.
 */
async function expandHierarchy(
  engine: Engine,
  results: RetrievalResult[],
  maxHops: number,
  filter: EffectiveFilter,
): Promise<RetrievalResult[]> {
  if ((!engine.scrollForHierarchy && !engine.scrollForImplementations) || maxHops === 0) return [];

  const seenIds = new Set(results.map((r) => r.chunkId));
  const expanded: RetrievalResult[] = [];

  // Walk UP: collect seeds from superclass references
  let upFrontier: Array<{ name: string; chunkType: string }> = [];
  // Walk DOWN: collect seeds from class/interface names to find implementors
  const downFrontier: string[] = [];

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
        const hits = await engine.scrollForHierarchy(name, chunkType, filter);
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
      const hits = await engine.scrollForImplementations(name, filter);
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
        const hits = await engine.scrollByNameInRepo(edge.targetSymbol, edge.targetRepo, filter);
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
    plan: PlannedQuery;
    planningLatencyMs: number;
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
    type: data.plan.route,
    reason: data.plan.intent,
    confidence: planConfidence(data.plan),
    route: data.route,
    classificationMs: data.planningLatencyMs,
    totalMs: data.totalLatencyMs,
    results: data.resultCount,
    ...(data.earlyExit !== undefined ? { earlyExit: data.earlyExit } : {}),
    ...(data.earlyExitReason ? { earlyExitReason: data.earlyExitReason } : {}),
  };
  if (typeof observability.logger?.info === 'function') {
    observability.logger.info(logEntry, 'query_classification');
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
 * The context form the assembler chose for a result, carried alongside the
 * retrieval result so the formatter can mark a degraded item. A 'signature'
 * form on a non-class/non-dependency intent means exact source was unavailable,
 * which ENR-07 requires to be visible rather than silently summarized.
 */
type FormedResult = RetrievalResult & {
  contextForm?: ContextItem['form'];
  /**
   * FAIL-01/FAIL-04: the live read for this item's file failed. Distinct from
   * `[signature]` (exact source unavailable at retrieval) and `[signature-only]`
   * (embedding reduced at index time): here the filesystem itself refused, so the
   * item degrades to anchor + metadata and says why.
   */
  readFailed?: string | undefined;
};

/** Live reads are issued per file, so failures are keyed by repo + relative path. */
function liveSourceKey(result: Pick<RetrievalResult, 'repoId' | 'relativePath'>): string {
  return `${result.repoId ?? ''}\0${result.relativePath}`;
}

function anchorReadKey(anchor: ContextItem['anchor']): string {
  return `${anchor.repoId ?? ''}\0${anchor.relativePath}`;
}

function resultsForContextItems(
  items: ReturnType<ContextAssembler['assemble']>,
  results: RetrievalResult[],
  intent: PlannedQuery['intent'],
): FormedResult[] {
  return items.map((item) => {
    const source =
      results.find((result) => {
        const range = selectRange(result, intent);
        return (
          result.relativePath === item.anchor.relativePath &&
          result.repoId === item.anchor.repoId &&
          range.startLine === item.anchor.startLine &&
          range.endLine === item.anchor.endLine
        );
        }) ??
        results.find(
          (result) =>
            result.repoId === item.anchor.repoId &&
            result.relativePath === item.anchor.relativePath,
        ) ??
        results[0]!;
    return {
      ...source,
      startLine: item.anchor.startLine,
      endLine: item.anchor.endLine,
      content: item.text ?? '',
      contextForm: item.form,
    };
  });
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

  // ── Embedding-contract gate (EMB-09, A-27, D-2) ─────────────────────────────
  // Asserted before any retrieval so a refused collection never serves evidence
  // (FAIL-02). Returned as a normal successful tool result, never an MCP
  // protocol error (AD-004).
  const refusal = await assertContractGates();
  if (refusal) return retrievalFailure(refusal);

  const templateId = detectIntent(input.query) ?? undefined;
  let plan: PlannedQuery;
  try {
    plan = new QueryPlanner().plan(
      {
        query: input.query,
        ...(input.repo === undefined ? {} : { repo: input.repo }),
        ...(input.stereotype === undefined ? {} : { stereotype: input.stereotype }),
        ...(input.archLayer === undefined ? {} : { archLayer: input.archLayer }),
        ...(input.module === undefined ? {} : { module: input.module }),
        ...(input.language === undefined ? {} : { language: input.language }),
        expansionHops: input.expand_hops ?? observability?.defaultExpansionHops ?? 2,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(observability?.maxTokensPerCall === undefined
          ? {}
          : { maxTokens: observability.maxTokensPerCall }),
        ...(templateId === undefined ? {} : { templateId }),
      },
      resolvePlanCapabilities(engine),
    );
  } catch (error) {
    return planDiagnostic(error);
  }

  // ── Session dedup check (T156) ──────────────────────────────────────────────
  if (observability?.sessionCache?.enabled) {
    const cacheKey = buildSearchCacheKey(input, plan, observability);
    const cached = searchCache.get(cacheKey);
    if (cached) {
      cached.lastAccess = ++searchCacheAccessCounter;
      return cached.response;
    }
  }

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
  const effectiveFilter = addRepoConstraint(plan.filter);
  const planningLatencyMs = Date.now() - startTime;
  // SPR-04: passed to every retrieval call so diagnostics report branches that
  // actually executed rather than the ones the plan selected.
  const onBranchExecuted = branchRecorder(plan);

  if (plan.route === 'keyword') {
    // Keyword route: use BM25/direct lookup, skip vector search
    // Per D-10: skip score threshold filtering and token cap
    let keywordResults: RetrievalResult[];

    if (engine.searchWithFallback) {
      const fallbackResult = await engine.searchWithFallback(
        {
          text: input.query,
          limit: input.limit ?? 10,
          onBranchExecuted,
          ...(repoFilter ? { filter: repoFilter } : {}),
        },
        { enableFallback: false },
        plan,
      );
      keywordResults = fallbackResult.results;
    } else {
      keywordResults = await engine.search({
        text: input.query,
        limit: input.limit ?? 10,
        onBranchExecuted,
        ...(repoFilter ? { filter: repoFilter } : {}),
      }, plan);
    }

    // D-06: fallback to semantic if keyword returns 0 results
    if (keywordResults.length === 0) {
      // Log fallback, then fall through to normal semantic path
      const earlyExitThreshold = observability?.earlyExitConfidence ?? 0.8;
      if (observability?.metricsStore) {
        logClassification(observability, {
          query: input.query,
          plan,
          planningLatencyMs,
          route: 'keyword-fallback-semantic',
          totalLatencyMs: Date.now() - startTime,
          resultCount: 0,
          earlyExit: false,
          earlyExitReason:
            planConfidence(plan) >= earlyExitThreshold ? 'fallback-no-results' : undefined,
        });
      }
    } else {
      // Keyword route succeeded — format and return directly
      // BM25 re-rank keyword results for better relevance ordering
      if (keywordResults.length > (input.limit ?? 10)) {
        keywordResults = bm25Rerank(keywordResults, input.query, {
          topK: input.limit ?? 10,
          vectorScoreWeight: 0.3, // keyword route: lean more on BM25
        });
      }
      const latencyMs = Date.now() - startTime;
      const earlyExitThreshold = observability?.earlyExitConfidence ?? 0.8;
      const isEarlyExit = planConfidence(plan) >= earlyExitThreshold;

      // Structured logging per D-11
      if (observability?.metricsStore) {
        logClassification(observability, {
          query: input.query,
          plan,
          planningLatencyMs,
          route: 'keyword',
          totalLatencyMs: latencyMs,
          resultCount: keywordResults.length,
          earlyExit: isEarlyExit,
          earlyExitReason: isEarlyExit ? 'confidence-above-threshold' : undefined,
        });
      }

      // D-07: same response format as semantic results
      const renderKeyword = (shown: RetrievalResult[]): ToolOutput => {
        const sections = shown.map((r, i) => formatResult(r, i + 1));

        // Template injection still applies if enabled
        let templatePrefix = '';
        if (input.use_template !== false) {
          const template = plan.templateId
            ? getTemplate(plan.templateId as IntentType)
            : undefined;
          if (template) templatePrefix = `${template}\n\n`;
        }

        const guardrailLead = `Conclusion: found ${shown.length} evidence-backed ${shown.length === 1 ? 'match' : 'matches'}.`;
        const text = `${guardrailLead}\n\n${templatePrefix}## Code results for: "${input.query}"\n\n${sections.join('\n\n')}\n\n---\nSearch: keyword-routed | ${shown.length} results | ${latencyMs}ms`;

        return toTextResult(text, {
          answered: true,
          route: plan.route,
          intent: plan.intent,
          branches: plan.branches,
        });
      };

      return enforceRouteBudget(plan, keywordResults, renderKeyword);
    }
  }

  // Existence query route: "does X exist?", "is there a Y?" — return structured found/not-found
  if (plan.route === 'existence') {
    let existenceResults: RetrievalResult[];

    // Use hybrid search if available for better exact-match detection, else semantic
    if (engine.searchWithFallback) {
      const fallbackResult = await engine.searchWithFallback(
        { text: input.query, limit: 5, onBranchExecuted, ...(repoFilter ? { filter: repoFilter } : {}) },
        { enableFallback: false },
        plan,
      );
      existenceResults = fallbackResult.results;
    } else {
      existenceResults = await engine.search({
        text: input.query,
        limit: 5,
        onBranchExecuted,
        ...(repoFilter ? { filter: repoFilter } : {}),
      }, plan);
    }

    const latencyMs = Date.now() - startTime;
    const highConfidence = existenceResults.filter((r) => r.score > 0.6);

    if (observability?.metricsStore) {
      logClassification(observability, {
        query: input.query,
        plan,
        planningLatencyMs,
        route: 'existence',
        totalLatencyMs: latencyMs,
        resultCount: existenceResults.length,
      });
    }

    if (highConfidence.length > 0) {
      // BUD-16: existence answers stay source-free — anchors and metadata only.
      const renderExistence = (shown: RetrievalResult[]): ToolOutput => {
        const sections = shown.map((r, i) => formatSourceFree(r, i + 1));
        const text = `## Existence check: "${input.query}"\n\n**Found.** ${shown.length} relevant ${shown.length === 1 ? 'match' : 'matches'} in the codebase (best ${formatScore(shown[0] ?? highConfidence[0]!)}).\n\n${sections.join('\n\n')}\n\n---\nSearch: existence-routed | ${shown.length} results | ${latencyMs}ms`;
        return toTextResult(text, {
          answered: true,
          route: plan.route,
          intent: plan.intent,
          branches: plan.branches,
        });
      };
      return enforceRouteBudget(plan, highConfidence, renderExistence);
    } else {
      // Not found — show what the codebase has instead (top results regardless of score)
      const topResults = existenceResults.slice(0, 3);
      const renderNotFound = (shown: RetrievalResult[]): ToolOutput => {
        const sections = shown.map((r, i) => formatSourceFree(r, i + 1));
        const alternativesText =
          shown.length > 0 ? `\n\nThe closest matches found were:\n\n${sections.join('\n\n')}` : '';
        const text = `## Existence check: "${input.query}"\n\n**Not found.** No high-confidence matches in the indexed codebase.${alternativesText}\n\n---\nSearch: existence-routed | 0 confident results (${existenceResults.length} total checked) | ${latencyMs}ms`;
        return toTextResult(text, {
          answered: true,
          route: plan.route,
          intent: plan.intent,
          branches: plan.branches,
        });
      };
      return enforceRouteBudget(plan, topResults, renderNotFound);
    }
  }

  // Aggregation route: breadth-first retrieval for "find all X" queries
  if (plan.route === 'aggregation') {
    const aggregationLimit = Math.max((input.limit ?? 10) * 3, 30); // Fetch 3x more results
    const aggregationThreshold = 0.35; // Lower threshold for breadth

    let aggResults: RetrievalResult[];
    try {
      aggResults = await engine.searchWithExpansion(
        {
          text: input.query,
          limit: aggregationLimit,
          scoreThreshold: aggregationThreshold,
          onBranchExecuted,
          ...(repoFilter ? { filter: repoFilter } : {}),
        },
        effectiveFilter,
        { hops: 0 }, // No expansion — breadth over depth
        plan,
      );
    } catch {
      aggResults = await engine.search({
        text: input.query,
        limit: aggregationLimit,
        scoreThreshold: aggregationThreshold,
        onBranchExecuted,
        ...(repoFilter ? { filter: repoFilter } : {}),
      }, plan);
    }

    // Deduplicate by file — keep best chunk per file
    const byFile = new Map<string, RetrievalResult>();
    for (const r of aggResults) {
      const fileKey = `${r.repoId ?? ''}:${r.relativePath}`;
      const existing = byFile.get(fileKey);
      if (!existing || r.score > existing.score) {
        byFile.set(fileKey, r);
      }
    }
    const deduped = Array.from(byFile.values()).sort((a, b) => b.score - a.score);
    // BUD-15/CTX-13: the aggregation route collapses repeated files — accounted too.
    recordDeduplicated(plan, aggResults.length, deduped.length);

    const latencyMs = Date.now() - startTime;

    if (observability?.metricsStore) {
      logClassification(observability, {
        query: input.query,
        plan,
        planningLatencyMs,
        route: 'aggregation',
        totalLatencyMs: latencyMs,
        resultCount: deduped.length,
      });
    }

    // BUD-16: aggregation stays source-free — grouped anchors, never bodies.
    const renderAggregation = (shown: RetrievalResult[]): ToolOutput => {
      const byDir = new Map<string, RetrievalResult[]>();
      for (const r of shown) {
        const dir = r.relativePath.split('/').slice(0, -1).join('/') || '.';
        const key = `${r.repoId ?? ''}\0${dir}`;
        if (!byDir.has(key)) byDir.set(key, []);
        byDir.get(key)!.push(r);
      }

      const groupSections: string[] = [];
      for (const [key, items] of Array.from(byDir.entries()).sort(
        (a, b) => b[1].length - a[1].length,
      )) {
        const [repo, dir] = key.split('\0');
        const itemLines = items.map((r) => {
          return `  - ${buildCodeAnchor(r)} (${formatScore(r)})`;
        });
        groupSections.push(`### ${repo ? `[${repo}] ` : ''}${dir}/\n${itemLines.join('\n')}`);
      }

      let templatePrefix = '';
      if (input.use_template !== false) {
        const template = plan.templateId
          ? getTemplate(plan.templateId as IntentType)
          : undefined;
        if (template) templatePrefix = `${template}\n\n`;
      }

      const guardrailLead = `Conclusion: found ${shown.length} unique files matching this pattern across ${byDir.size} ${byDir.size === 1 ? 'directory' : 'directories'}.`;
      const text = `${guardrailLead}\n\n${templatePrefix}## Aggregated results for: "${input.query}"\n\n${groupSections.join('\n\n')}\n\n---\nSearch: aggregation-routed | ${shown.length} unique files (${aggResults.length} total chunks scanned) | ${latencyMs}ms`;

      return toTextResult(text, {
        answered: true,
        route: plan.route,
        intent: plan.intent,
        branches: plan.branches,
      });
    };

    return enforceRouteBudget(plan, deduped, renderAggregation);
  }

  // Semantic path continues below (existing code unchanged)

  // Determine expansion hops: input overrides config default
  const clampedHops = plan.expansion.hops;

  let results: RetrievalResult[];
  const degradationNotes: string[] = [];

  observability?.stageHook?.('retrieve');
  try {
    results = await engine.searchWithExpansion(
      {
        text: input.query,
        limit: input.limit ?? 10,
        scoreThreshold: input.score_threshold,
        onBranchExecuted,
        ...(repoFilter ? { filter: repoFilter } : {}),
      },
      effectiveFilter,
      { hops: clampedHops },
      plan,
    );
  } catch (error) {
    try {
      results = await engine.search({
        text: input.query,
        limit: input.limit ?? 10,
        scoreThreshold: input.score_threshold,
        onBranchExecuted,
        ...(repoFilter ? { filter: repoFilter } : {}),
      }, plan);
    } catch (fallbackError) {
      return retrievalFailure(fallbackError, plan);
    }
    if (!hasGroundedFallback(results, plan)) {
      return retrievalFailure(error, plan);
    }
    degradationNotes.push(
      `dependency expansion was unavailable (${error instanceof Error ? error.message : String(error)}).`,
    );
  }

  // Each expansion is isolated so one unavailable capability does not discard the others.
  if (clampedHops > 0) {
    if (engine.scrollForHierarchy || engine.scrollForImplementations) {
      try {
        const hierarchyResults = await expandHierarchy(engine, results, clampedHops, effectiveFilter);
        results = [...results, ...hierarchyResults];
      } catch (error) {
        degradationNotes.push(`hierarchy expansion was unavailable: ${String(error)}.`);
      }
    }

    if (engine.searchWithInterfaceExpansion && results.some((r) => r.chunkType === 'interface')) {
      try {
        const seenIds = new Set(results.map((r) => r.chunkId));
        const expandedWithImpls = await engine.searchWithInterfaceExpansion(
          {
            text: input.query,
            limit: input.limit ?? 10,
            scoreThreshold: input.score_threshold,
            ...(repoFilter ? { filter: repoFilter } : {}),
          },
          effectiveFilter,
        );
        for (const impl of expandedWithImpls) {
          if (!seenIds.has(impl.chunkId)) {
            seenIds.add(impl.chunkId);
            results.push(impl);
          }
        }
      } catch (error) {
        degradationNotes.push(`interface implementation expansion was unavailable: ${String(error)}.`);
      }
    }

    if (engine.getAdjacentChunks) {
      try {
        const seenIds = new Set(results.map((r) => r.chunkId));
        const adjacentResults: RetrievalResult[] = [];
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
            effectiveFilter,
            undefined,
          );
          for (const adj of adjacent) {
            if (!seenIds.has(adj.chunkId)) {
              seenIds.add(adj.chunkId);
              adjacentResults.push(adj);
            }
          }
        }
        results = [...results, ...adjacentResults];
      } catch (error) {
        degradationNotes.push(`adjacent expansion was unavailable: ${String(error)}.`);
      }
    }

    if (engine.expandCallChain) {
      try {
        const callChainResults = await engine.expandCallChain(results, effectiveFilter, 'both');
        results = [...results, ...callChainResults];
      } catch (error) {
        degradationNotes.push(`call-chain expansion was unavailable: ${String(error)}.`);
      }
    }

    if (engine.scrollByName || engine.scrollByDefines) {
      try {
        const multiHopResults = await multiHopExpand(results, engine, effectiveFilter, {
          maxSymbols: 15,
          expandMethodCalls: !!engine.scrollByDefines,
          expandHierarchy: !!engine.scrollByName,
        });
        results = [...results, ...multiHopResults];
      } catch (error) {
        degradationNotes.push(`multi-hop expansion was unavailable: ${String(error)}.`);
      }
    }
  }

  const fallbackNote =
    degradationNotes.length > 0
      ? `Note: ${degradationNotes.join(' ')} Returning grounded results from the capabilities that remained available.`
      : undefined;

  observability?.stageHook?.('expand');
  const beforeDedup = results.length;
  results = deduplicateResults(results);
  // BUD-15/CTX-13: report the collapse that actually happened, not a constant.
  recordDeduplicated(plan, beforeDedup, results.length);
  observability?.stageHook?.('dedup+merge');

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
      return withDiagnostics(toTextResult(gateText, {
        confidence_gated: true,
        best_score: bestScore,
        threshold: observability.confidenceThreshold,
        nearby_count: nearbyResults.length,
        answered: false,
      }), plan, nearbyResults, null, 'low_confidence');
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
  observability?.stageHook?.('rank');

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

  // Read every candidate before assembly so the serialized response measures live evidence.
  // Keyed per file (repo + relative path), matching how the read is issued.
  const readFailures = new Map<string, string>();
  if (results.length > 0) {
    if (observability?.readFileFn) {
      for (let i = 0; i < results.length; i++) {
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
        } catch (error) {
          // FAIL-01/FAIL-04: a bare `catch {}` here left `status: 'ok'` with no
          // marking. The failure is recorded so the item degrades to a marked
          // anchor + metadata and the response states what failed.
          const message = error instanceof Error ? error.message : String(error);
          readFailures.set(liveSourceKey(results[i]!), message);
        }
      }
    }
  }
  const assembler = new ContextAssembler();
  // An item whose file could not be read is marked `read-failed`, which the budget
  // governor excludes from budgeted evidence — so the A-09 one-node overflow rule
  // is never invoked for a node that does not exist on disk (spec Edge Cases).
  const contextItems = assembler
    .assemble(results, plan.intent, input.query)
    .map((item) =>
      readFailures.has(anchorReadKey(item.anchor))
        ? ({ ...item, degraded: 'read-failed' } as ContextItem)
        : item,
    );
  observability?.stageHook?.('assemble');

  const assembledResults = resultsForContextItems(contextItems, results, plan.intent).map(
    (result) => {
      const failure = readFailures.get(liveSourceKey(result));
      return failure === undefined ? result : { ...result, readFailed: failure };
    },
  );

  /**
   * BUD-05/BUD-12: build the response the caller would actually receive for a
   * given set of included items. The governor measures this string, so headers,
   * code fences, the guardrail lead and templates are all accounted for.
   */
  const serializeForBudget = (included: ContextItem[]): ToolOutput =>
    buildSearchResponse(
      input,
      plan,
      resultsForContextItems(included, assembledResults, plan.intent),
      undefined,
      undefined,
      input.use_template,
      undefined,
      thresholdFiltered,
    );

  observability?.stageHook?.('serialize');
  observability?.stageHook?.('measure');

  const budgetResult = new BudgetGovernor().enforceSerialized(
    contextItems,
    plan.budget,
    serializeForBudget,
  );
  observability?.stageHook?.('enforce');
  // FAIL-04: the governor excludes read-failed items from budgeted evidence, but
  // the caller still gets their grounded anchor and metadata — appended after the
  // budgeted evidence, and measured with it, so nothing is silently omitted.
  results = resultsForContextItems(
    [
      ...budgetResult.included,
      ...contextItems.filter((item) => item.degraded === 'read-failed'),
    ],
    assembledResults,
    plan.intent,
  );
  const capMeta =
    budgetResult.omitted > 0 || budgetResult.compacted > 0
      ? {
          token_cap_applied: true as const,
          results_trimmed: budgetResult.omitted + budgetResult.compacted,
        }
      : undefined;

  // Zero-result fallback: if primary search returned nothing and fallback not disabled,
  // call searchWithFallback for keyword-based suggestions
  if (results.length === 0 && input.fallback !== false && engine.searchWithFallback) {
    const fallbackResult = await engine.searchWithFallback(
      {
        text: input.query,
        limit: input.limit ?? 10,
        scoreThreshold: input.score_threshold,
        onBranchExecuted,
        ...(repoFilter ? { filter: repoFilter } : {}),
      },
      { enableFallback: true, maxSuggestions: 3 },
      plan,
    );
    // BUD-01/BUD-16: the fallback response is governed by the same contract. Its
    // body is built from suggestions rather than ContextItems, so enforcement is
    // applied to the rendered response and the measurement is reported.
    const renderFallback = (shown: RetrievalResult[]): ToolOutput =>
      buildSearchResponse(
        input,
        plan,
        shown,
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

    const governedFallback = enforceRouteBudget(
      plan,
      fallbackResult.results,
      renderFallback,
      fallbackResult.fallback_mode,
    );
    if (observability?.sessionCache?.enabled) {
      const cacheKey = buildSearchCacheKey(input, plan, observability);
      searchCache.set(cacheKey, {
        response: governedFallback,
        resultCount: fallbackResult.results.length,
        lastAccess: ++searchCacheAccessCounter,
      });
    }
    return governedFallback;
  }

  // Log classification for semantic path
  if (observability?.metricsStore) {
    logClassification(observability, {
      query: input.query,
      plan,
      planningLatencyMs,
      route: plan.route === 'keyword' ? 'keyword-fallback-semantic' : 'semantic',
      totalLatencyMs: Date.now() - startTime,
      resultCount: results.length,
      earlyExit: false,
    });
  }

  // RAG-sufficient signaling: when results are high-confidence, hint the LLM
  // to use this context before exploring files further
  let ragSufficientNote: string | undefined;
  if (results.length >= 3 && results[0]?.score !== undefined && results[0].score > 0.75) {
    ragSufficientNote = `[Retrieved ${results.length} high-confidence results (best: ${formatScore(results[0])}). Consider using this context before exploring files further.]`;
  }

  const response = buildSearchResponse(
    input,
    plan,
    results,
    ragSufficientNote ?? fallbackNote,
    undefined,
    input.use_template,
    capMeta,
    thresholdFiltered,
  );

  const diagnostics = diagnosticsContent(plan, results, null, {
    candidateCount: contextItems.length,
    omitted: budgetResult.omitted,
    compacted: budgetResult.compacted,
    overflow: budgetResult.overflow?.exact_node_overflow ?? false,
    estimated: budgetResult.estimatedTokens,
    ...(budgetResult.overflow
      ? {
          overflowAmounts: {
            configured: budgetResult.overflow.configured,
            estimated: budgetResult.overflow.estimated,
            amount: budgetResult.overflow.amount,
          },
        }
      : {}),
  });
  // FAIL-06/FAIL-08: a read failure is a degraded response, not an ok one. Carried
  // by the closed status enum so the caller can branch on it rather than infer it.
  const responseStatus: 'ok' | 'empty' | 'low_confidence' =
    results.length === 0 ? 'empty' : readFailures.size > 0 ? 'low_confidence' : 'ok';
  const anomalyLines = diagnosticsAnomalyLines({
    status: responseStatus,
    exactNodeOverflow: Boolean(budgetResult.overflow),
  });
  const finalContent =
    anomalyLines.length > 0
      ? [
          {
            type: 'text' as const,
            text: `${(response.content[0] as { text: string }).text}\n\n${anomalyLines.join('\n')}`,
          },
        ]
      : response.content;

  // BUD-03/BUD-12: the reported estimate must describe the response actually
  // returned — notes, anomaly lines and the diagnostics block included. Measure the
  // assembled envelope with a sentinel in place of the self-referential token count,
  // so the figure never under-reports the final serialized string (BUD-13).
  const measuredFinal = estimateTokens(
    JSON.stringify({
      ...response,
      content: finalContent,
      structuredContent: {
        ...(response.structuredContent as Record<string, unknown> | undefined),
        ...diagnostics,
        estimated_tokens: ESTIMATE_SENTINEL,
      },
    }),
  );

  const responseWithDiagnostics: ToolOutput = {
    ...response,
    content: finalContent,
    structuredContent: {
      ...(response.structuredContent as Record<string, unknown> | undefined),
      ...diagnostics,
      status: responseStatus,
      estimated_tokens: measuredFinal,
      // BUD-08/BUD-12: the overflow amounts describe the same final measurement the
      // token count reports, so the two can never disagree.
      ...(budgetResult.overflow
        ? {
            exact_node_overflow: true,
            exact_node_overflow_configured: plan.budget.limit,
            exact_node_overflow_estimated: measuredFinal,
            exact_node_overflow_amount: measuredFinal - plan.budget.limit,
          }
        : {}),
    },
  };

  // ── Store in session cache (T156) ──
  if (observability?.sessionCache?.enabled && results.length > 0) {
    const cacheKey = buildSearchCacheKey(input, plan, observability);
    if (searchCache.size >= SEARCH_CACHE_MAX) evictSearchLRU();
    searchCache.set(cacheKey, {
      response: responseWithDiagnostics,
      resultCount: results.length,
      lastAccess: ++searchCacheAccessCounter,
    });
  }

  return responseWithDiagnostics;
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
        'Results include targeted live source ranges selected by relevance and the configured context budget. ' +
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
