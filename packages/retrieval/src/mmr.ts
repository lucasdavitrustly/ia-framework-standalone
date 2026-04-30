import type { RetrievalResult } from './types.js';

/**
 * Options for the MMR re-ranking algorithm.
 */
export interface MmrOptions {
  /** Pool of candidates to re-rank. */
  candidates: RetrievalResult[];
  /** Optional query vector for cosine-based relevance. When absent, `candidate.score` is used. */
  queryVector?: number[];
  /** Controls relevance vs diversity: 1.0 = pure relevance, 0.0 = pure diversity. */
  lambda: number;
  /** Maximum number of results to return. */
  limit: number;
  /**
   * Optional pairwise similarity function between two candidates.
   * Defaults to Jaccard similarity on their text content.
   */
  similarityFn?: (a: RetrievalResult, b: RetrievalResult) => number;
}

/**
 * Computes the cosine similarity between two numeric vectors.
 * Returns 0 if either vector has zero magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) * (a[i] ?? 0);
    normB += (b[i] ?? 0) * (b[i] ?? 0);
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Computes Jaccard similarity between two strings based on token sets.
 * Tokens are extracted by splitting on non-alphanumeric characters (lowercased).
 * Returns 0 if both strings are empty.
 */
export function jaccardSimilarity(textA: string, textB: string): number {
  const tokenize = (s: string): Set<string> => {
    const tokens = s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return new Set(tokens);
  };
  const setA = tokenize(textA);
  const setB = tokenize(textB);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Classifies the appropriate MMR lambda for a query.
 * Architecture/synthesis queries get λ=0.5 (diversity valued).
 * Lookup/symbol queries get λ=0.8 (relevance dominates).
 *
 * Per decision D-02.
 */
export function classifyQueryLambda(query: string): number {
  const normalized = query.toLowerCase();
  const architectureKeywords = [
    'how',
    'architecture',
    'pattern',
    'overview',
    'communicate',
    'interact',
    'flow',
    'design',
    'structure',
  ];
  for (const kw of architectureKeywords) {
    if (normalized.includes(kw)) return 0.5;
  }
  return 0.8;
}

/**
 * Greedy Maximal Marginal Relevance re-ranking.
 *
 * Iteratively selects candidates that maximise:
 *   λ * relevance(c) - (1-λ) * max_similarity(c, selected)
 *
 * Relevance is normalised to [0,1] by dividing by the maximum score in the
 * candidate pool so that it is on the same scale as similarity values.
 */
export function mmrRerank(options: MmrOptions): RetrievalResult[] {
  const { candidates, queryVector, lambda, limit, similarityFn } = options;

  if (candidates.length === 0) return [];

  // Relevance: cosine against queryVector if provided, otherwise use .score
  const relevance = (c: RetrievalResult): number => {
    if (queryVector && c.score !== undefined) {
      // We don't have individual vectors here; fall back to .score unless
      // the caller injects per-candidate vectors via similarityFn.
      return c.score;
    }
    return c.score;
  };

  // Normalise relevance scores to [0, 1]
  const maxScore = Math.max(...candidates.map((c) => relevance(c)));
  const normRelevance = (c: RetrievalResult): number =>
    maxScore > 0 ? relevance(c) / maxScore : 0;

  // Pairwise similarity between two candidates
  const pairSim = (a: RetrievalResult, b: RetrievalResult): number => {
    if (similarityFn) return similarityFn(a, b);
    return jaccardSimilarity(a.content, b.content);
  };

  const remaining = [...candidates];
  const selected: RetrievalResult[] = [];

  while (selected.length < limit && remaining.length > 0) {
    let bestScore = -Infinity;
    let bestIdx = 0;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]!;
      const rel = normRelevance(c);

      let maxSim = 0;
      for (const s of selected) {
        const sim = pairSim(c, s);
        if (sim > maxSim) maxSim = sim;
      }

      const mmrScore = selected.length === 0 ? lambda * rel : lambda * rel - (1 - lambda) * maxSim;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]!);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}
