/**
 * BM25 re-ranker for post-retrieval scoring.
 *
 * Takes a set of candidate results (over-fetched from vector search) and
 * re-ranks them using BM25 text relevance scoring against the query.
 * No external model required — pure algorithmic scoring.
 *
 * Pipeline position: after initial retrieval, before token cap.
 * Retrieve `topK * prefetchMultiplier` candidates, BM25-rerank, return top `topK`.
 */

import type { RetrievalResult } from './types.js';

export interface Bm25RerankOptions {
  /** Final number of results to return after re-ranking */
  topK: number;
  /** BM25 k1 parameter — term saturation (default: 1.5) */
  k1?: number;
  /** BM25 b parameter — length normalization (default: 0.75) */
  b?: number;
  /** Weight for original vector score in combined ranking (0-1, default: 0.4) */
  vectorScoreWeight?: number;
}

interface TermFrequency {
  [term: string]: number;
}

/**
 * Tokenize text into lowercase terms, splitting on non-alphanumeric boundaries.
 * Handles camelCase and snake_case splitting for code relevance.
 */
function tokenize(text: string): string[] {
  // Split camelCase, snake_case, dots, slashes, and whitespace
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ACRONYMWord
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function computeTf(tokens: string[]): TermFrequency {
  const tf: TermFrequency = {};
  for (const token of tokens) {
    tf[token] = (tf[token] ?? 0) + 1;
  }
  return tf;
}

/**
 * Compute BM25 score for a single document against query terms.
 */
function bm25Score(
  queryTerms: string[],
  docTf: TermFrequency,
  docLength: number,
  avgDocLength: number,
  docFrequency: Map<string, number>,
  totalDocs: number,
  k1: number,
  b: number,
): number {
  let score = 0;

  for (const term of queryTerms) {
    const tf = docTf[term] ?? 0;
    if (tf === 0) continue;

    const df = docFrequency.get(term) ?? 0;
    // IDF with smoothing to avoid negative values
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
    // BM25 term frequency component
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));

    score += idf * tfNorm;
  }

  return score;
}

/**
 * Re-rank retrieval results using BM25 scoring combined with original vector scores.
 *
 * @param results - Over-fetched candidate results from vector search
 * @param query - The original search query text
 * @param options - BM25 configuration
 * @returns Top-K results re-ranked by combined BM25 + vector score
 */
export function bm25Rerank(
  results: RetrievalResult[],
  query: string,
  options: Bm25RerankOptions,
): RetrievalResult[] {
  if (results.length === 0) return [];

  const { topK, k1 = 1.5, b = 0.75, vectorScoreWeight = 0.4 } = options;

  // If we have fewer results than topK, just return them all
  if (results.length <= topK) return results;

  // Tokenize query
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    // No meaningful query terms — fall back to vector score order
    return [...results].sort((a, b) => b.score - a.score).slice(0, topK);
  }

  // Tokenize all documents and compute stats
  // T093: fall back to name/packageName/defines/calls when content is empty (lean-payload schema)
  const docTokens: string[][] = results.map((r) => {
    const text =
      r.content ||
      [r.name, r.packageName, ...(r.defines ?? []), ...(r.calls ?? [])].filter(Boolean).join(' ');
    return tokenize(text);
  });
  const docTfs: TermFrequency[] = docTokens.map(computeTf);
  const docLengths = docTokens.map((t) => t.length);
  const avgDocLength = docLengths.reduce((a, b) => a + b, 0) / docLengths.length;
  const totalDocs = results.length;

  // Compute document frequency for each query term
  const docFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const tf of docTfs) {
      if (tf[term]) count++;
    }
    docFrequency.set(term, count);
  }

  // Score each result
  const scored = results.map((result, i) => {
    const bm25 = bm25Score(
      queryTerms,
      docTfs[i]!,
      docLengths[i]!,
      avgDocLength,
      docFrequency,
      totalDocs,
      k1,
      b,
    );
    return { result, bm25Score: bm25 };
  });

  // Normalize BM25 scores to 0-1 range
  const maxBm25 = Math.max(...scored.map((s) => s.bm25Score));
  const bm25Weight = 1 - vectorScoreWeight;

  const combined = scored.map(({ result, bm25Score: bm25 }) => {
    const normalizedBm25 = maxBm25 > 0 ? bm25 / maxBm25 : 0;
    const combinedScore = vectorScoreWeight * result.score + bm25Weight * normalizedBm25;
    return { result, combinedScore };
  });

  // Sort by combined score descending, take topK
  combined.sort((a, b) => b.combinedScore - a.combinedScore);

  return combined.slice(0, topK).map(({ result }) => result);
}
