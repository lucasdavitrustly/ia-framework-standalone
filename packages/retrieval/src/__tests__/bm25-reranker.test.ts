import { describe, it, expect } from 'vitest';
import { bm25Rerank } from '../bm25-reranker.js';
import type { RetrievalResult } from '../types.js';

function makeResult(
  overrides: Partial<RetrievalResult> & { content: string; score: number },
): RetrievalResult {
  const { content, score, ...rest } = overrides;
  return {
    chunkId: 'chunk-' + Math.random().toString(36).slice(2, 8),
    filePath: '/src/test.ts',
    relativePath: 'src/test.ts',
    language: 'typescript',
    chunkType: 'function',
    content,
    startLine: 1,
    endLine: 10,
    imports: [],
    exports: [],
    score,
    matchedVector: 'text',
    ...rest,
  };
}

describe('bm25Rerank', () => {
  it('returns empty array for empty input', () => {
    expect(bm25Rerank([], 'test query', { topK: 5 })).toEqual([]);
  });

  it('returns all results when fewer than topK', () => {
    const results = [makeResult({ content: 'hello world', score: 0.8 })];
    const reranked = bm25Rerank(results, 'hello', { topK: 5 });
    expect(reranked).toHaveLength(1);
  });

  it('reduces results to topK', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      makeResult({ content: `function test${i}() { return ${i}; }`, score: 0.5 + i * 0.01 }),
    );
    const reranked = bm25Rerank(results, 'test function', { topK: 3 });
    expect(reranked).toHaveLength(3);
  });

  it('promotes results with query terms in content', () => {
    const relevant = makeResult({
      content: 'class PaymentProcessor handles payment gateway integration',
      score: 0.6,
    });
    const irrelevant = makeResult({
      content: 'class UserService manages user authentication and sessions',
      score: 0.7, // higher vector score
    });
    const reranked = bm25Rerank([irrelevant, relevant], 'payment gateway', { topK: 1 });
    expect(reranked[0]!.content).toContain('PaymentProcessor');
  });

  it('respects vectorScoreWeight parameter', () => {
    const highVector = makeResult({
      content: 'unrelated logging utility class',
      score: 0.95,
    });
    const highBm25 = makeResult({
      content: 'payment payment payment gateway gateway',
      score: 0.3,
    });
    // With high vector weight, the high-vector-score result should win
    const rerankedVectorHeavy = bm25Rerank([highVector, highBm25], 'payment gateway', {
      topK: 1,
      vectorScoreWeight: 0.9,
    });
    expect(rerankedVectorHeavy[0]!.content).toContain('logging');

    // With low vector weight, BM25 should dominate
    const rerankedBm25Heavy = bm25Rerank([highVector, highBm25], 'payment gateway', {
      topK: 1,
      vectorScoreWeight: 0.1,
    });
    expect(rerankedBm25Heavy[0]!.content).toContain('payment');
  });

  it('handles camelCase tokenization', () => {
    const camel = makeResult({
      content: 'public void processPaymentGateway() { }',
      score: 0.5,
    });
    const noMatch = makeResult({
      content: 'public void handleUserLogin() { }',
      score: 0.6,
    });
    const reranked = bm25Rerank([noMatch, camel], 'payment gateway', { topK: 1 });
    expect(reranked[0]!.content).toContain('processPaymentGateway');
  });

  it('falls back to vector score order when query has no useful tokens', () => {
    const high = makeResult({ content: 'class A {}', score: 0.9 });
    const low = makeResult({ content: 'class B {}', score: 0.5 });
    // Single-char query tokens get filtered out
    const reranked = bm25Rerank([low, high], 'a', { topK: 1 });
    expect(reranked[0]!.score).toBe(0.9);
  });

  // ---------------------------------------------------------------------------
  // T088 (Phase 11 / US6): BM25 must use name/defines/calls when content is empty
  // ---------------------------------------------------------------------------
  it('T088: uses name/defines/calls as fallback text when content is empty (lean-payload)', () => {
    // Lean-payload chunks: content='' but name and defines are populated
    const relevant = makeResult({
      content: '',
      score: 0.6, // lower vector score
      name: 'PaymentGateway',
      defines: ['processPayment', 'refundTransaction'],
    });
    const irrelevant = makeResult({
      content: '',
      score: 0.7, // higher vector score, no matching metadata tokens
      name: 'UserSessionManager',
      defines: ['createSession', 'invalidateSession'],
    });

    // Currently FAILS: tokenize('') = [] → BM25=0 for all → order by vectorScore → UserSessionManager wins
    // After fix: tokenize(name + defines) → PaymentGateway tokens match 'payment gateway' → wins
    const reranked = bm25Rerank([irrelevant, relevant], 'payment gateway', {
      topK: 1,
      vectorScoreWeight: 0.1, // low weight so BM25 dominates
    });
    expect(reranked[0]!.name).toBe('PaymentGateway');
  });
});
