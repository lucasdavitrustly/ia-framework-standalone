import type { RetrievalResult } from '@ia-framework/retrieval';

/**
 * Result envelope returned by applyTokenCap.
 */
export interface TokenCapResult {
  /** Results that fit within the token budget (at least 1 always included) */
  results: RetrievalResult[];
  /** True when results were trimmed due to token budget being exceeded */
  tokenCapApplied: boolean;
  /** Number of results removed to fit within the budget */
  resultsTrimmed: number;
  /** Total token count of the returned results */
  totalTokens: number;
}

/**
 * Estimate the number of tokens in a string using a simple heuristic:
 * ceil(content.length / 4).
 *
 * Per D-01: approximate — not LLM-specific tokenization.
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Apply a soft token budget cap to a list of retrieval results.
 *
 * Results are assumed to be pre-ranked (best first). Accumulates tokens
 * from the top result downward and stops when the budget would be exceeded.
 * Always includes at least the first result regardless of size.
 *
 * Per D-02: default cap is 6000 — callers supply the cap.
 * Per D-04: returns metadata (tokenCapApplied, resultsTrimmed, totalTokens).
 *
 * @param results  Pre-ranked retrieval results (highest score first)
 * @param maxTokens  Token budget for this call
 */
export function applyTokenCap(results: RetrievalResult[], maxTokens: number): TokenCapResult {
  if (results.length === 0) {
    return { results: [], tokenCapApplied: false, resultsTrimmed: 0, totalTokens: 0 };
  }

  // 0 = unlimited — return all results with total token count
  if (maxTokens === 0) {
    const totalTokens = results.reduce((sum, r) => sum + estimateTokens(r.content), 0);
    return { results: [...results], tokenCapApplied: false, resultsTrimmed: 0, totalTokens };
  }

  const included: RetrievalResult[] = [];
  let runningTokens = 0;

  for (let i = 0; i < results.length; i++) {
    const tokens = estimateTokens(results[i]!.content);
    const wouldExceed = runningTokens + tokens > maxTokens;

    if (wouldExceed && i > 0) {
      // Budget exceeded and we already have at least one result — stop here
      break;
    }

    // Always include first result (minimum guarantee) even if it alone exceeds budget
    included.push(results[i]!);
    runningTokens += tokens;
  }

  const trimmed = results.length - included.length;
  const capApplied = trimmed > 0 || runningTokens > maxTokens;

  return {
    results: included,
    tokenCapApplied: capApplied,
    resultsTrimmed: trimmed,
    totalTokens: runningTokens,
  };
}
