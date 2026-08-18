import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHandler } from '../search-codebase.js';
import type { SearchCodebaseInput } from '../search-codebase.js';
import type { RetrievalResult, FallbackSearchResult } from '@ia-framework/retrieval';

const mockResult: RetrievalResult = {
  chunkId: 'chunk-1',
  filePath: '/project/src/foo.ts',
  relativePath: 'src/foo.ts',
  language: 'typescript',
  chunkType: 'function',
  name: 'foo',
  content: 'function foo() {}',
  startLine: 1,
  endLine: 1,
  imports: [],
  exports: [],
  score: 0.8,
  matchedVector: 'text',
};

const baseSuggestions = [
  { file: 'src/auth.ts', name: 'authenticate', snippet: 'function authenticate(token) {' },
  { file: 'src/session.ts', name: 'createSession', snippet: 'function createSession(user) {' },
];

function getText(output: { content: Array<{ type: string; text?: string }> }): string {
  const item = output.content[0];
  return item && item.type === 'text' && 'text' in item ? (item.text ?? '') : '';
}

describe('search_codebase fallback behavior', () => {
  it('returns a normal successful refusal result with remediation for a planning failure', async () => {
    const output = await searchCodebaseHandler(
      { search: vi.fn(), searchWithExpansion: vi.fn() },
      { query: '   ' },
    );
    const text = getText(output);

    expect(output).not.toHaveProperty('isError', true);
    expect((output.structuredContent as Record<string, unknown>).status).toBe('refused');
    expect(text).toContain('Suggestion:');
  });

  it('distinguishes empty, low-confidence, unavailable, refused, and ok statuses', async () => {
    const empty = await searchCodebaseHandler(
      { search: vi.fn(), searchWithExpansion: vi.fn().mockResolvedValue([]) },
      { query: 'empty result', expand_hops: 0 },
    );
    const lowConfidence = await searchCodebaseHandler(
      { search: vi.fn(), searchWithExpansion: vi.fn().mockResolvedValue([{ ...mockResult, score: 0.1 }]) },
      { query: 'weak result', expand_hops: 0 },
      { confidenceThreshold: 0.9 },
    );
    const unavailable = await searchCodebaseHandler(
      { search: vi.fn().mockRejectedValue(new Error('Qdrant unavailable')), searchWithExpansion: vi.fn().mockRejectedValue(new Error('Qdrant unavailable')) },
      { query: 'unavailable result', expand_hops: 0 },
    );
    const refused = await searchCodebaseHandler(
      { search: vi.fn(), searchWithExpansion: vi.fn() },
      { query: '   ' },
    );
    const ok = await searchCodebaseHandler(
      { search: vi.fn(), searchWithExpansion: vi.fn().mockResolvedValue([mockResult]) },
      { query: 'ok result', expand_hops: 0 },
    );

    expect((empty.structuredContent as Record<string, unknown>).status).toBe('empty');
    expect((lowConfidence.structuredContent as Record<string, unknown>).status).toBe('low_confidence');
    expect((unavailable.structuredContent as Record<string, unknown>).status).toBe('unavailable');
    expect((refused.structuredContent as Record<string, unknown>).status).toBe('refused');
    expect((ok.structuredContent as Record<string, unknown>).status).toBe('ok');
  });

  it('returns unavailable for a Qdrant failure without endorsing shell fallback', async () => {
    const engine = {
      search: vi.fn().mockRejectedValue(new Error('Qdrant unavailable')),
      searchWithExpansion: vi.fn().mockRejectedValue(new Error('Qdrant unavailable')),
    };
    const output = await searchCodebaseHandler(engine, { query: 'payment', expand_hops: 0 });
    const text = getText(output);

    expect((output.structuredContent as Record<string, unknown>).status).toBe('unavailable');
    expect(text).toContain('Qdrant');
    expect(text).toContain('Suggestion:');
    expect(text.toLowerCase()).not.toContain('grep');
    expect(text.toLowerCase()).not.toContain('find ');
  });

  it('returns refused for an embedding contract failure with force-index remediation', async () => {
    const engine = {
      search: vi.fn().mockRejectedValue(new Error('Embedding contract mismatch for collection "ast"')),
      searchWithExpansion: vi.fn().mockRejectedValue(new Error('Embedding contract mismatch for collection "ast"')),
    };
    const output = await searchCodebaseHandler(engine, { query: 'payment', expand_hops: 0 });
    const text = getText(output);

    expect((output.structuredContent as Record<string, unknown>).status).toBe('refused');
    expect(text).toContain('ast');
    expect(text).toContain('ia index --force');
  });

  it('does not return unrelated fallback evidence after retrieval failure', async () => {
    const unrelated = { ...mockResult, relativePath: 'src/unrelated.ts', name: 'unrelated' };
    const engine = {
      search: vi.fn().mockResolvedValue([unrelated]),
      searchWithExpansion: vi.fn().mockRejectedValue(new Error('Qdrant unavailable')),
    };
    const output = await searchCodebaseHandler(engine, { query: 'how does PaymentService.refund work', expand_hops: 0 });
    const text = getText(output);

    expect(text).not.toContain('unrelated');
  });

  it('preserves exact query filters and symbols when invoking a forced fallback', async () => {
    const search = vi.fn().mockResolvedValue([mockResult]);
    const engine = {
      search,
      searchWithExpansion: vi.fn().mockRejectedValue(new Error('graph unavailable')),
    };
    await searchCodebaseHandler(engine, {
      query: 'PaymentService.refund',
      repo: 'payments',
      stereotype: 'service',
      language: 'typescript',
      expand_hops: 1,
    });

    expect(search.mock.calls[0]?.[0]).toMatchObject({
      text: 'PaymentService.refund',
      filter: {
        must: expect.arrayContaining([
          { key: 'repoId', match: { value: 'payments' } },
        ]) as unknown[],
      },
    });
  });

  it('keeps failure information compact and structured', async () => {
    const output = await searchCodebaseHandler(
      { search: vi.fn().mockRejectedValue(new Error('Qdrant unavailable')), searchWithExpansion: vi.fn().mockRejectedValue(new Error('Qdrant unavailable')) },
      { query: 'payment', expand_hops: 0 },
    );
    expect(JSON.stringify(output.structuredContent)).not.toContain('function foo');
  });

  it('isolates a failing hierarchy expansion while preserving adjacent expansion results', async () => {
    const hierarchy = vi.fn().mockRejectedValue(new Error('hierarchy unavailable'));
    const adjacent = vi.fn().mockResolvedValue([{
      ...mockResult,
      chunkId: 'adjacent-result',
      relativePath: 'src/adjacent.ts',
      expansionSource: 'adjacent',
    }]);
    const engine = {
      search: vi.fn().mockResolvedValue([{
        ...mockResult,
        superclass: 'BaseService',
        chunkIndex: 1,
        totalChunks: 3,
      }]),
      searchWithExpansion: vi.fn().mockResolvedValue([{
        ...mockResult,
        superclass: 'BaseService',
        chunkIndex: 1,
        totalChunks: 3,
      }]),
      scrollForHierarchy: hierarchy,
      getAdjacentChunks: adjacent,
    };

    const output = await searchCodebaseHandler(engine, { query: 'payment service' });
    const text = getText(output);

    expect(adjacent).toHaveBeenCalled();
    expect(text).toContain('adjacent.ts');
    expect(text).toContain('hierarchy expansion was unavailable');
  });

  it('Test 1: returns answered:true when searchWithFallback returns found:true', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: true,
      fallback_used: false,
      fallback_mode: 'none',
      results: [mockResult],
      suggestions: [],
    };
    const engine = {
      search: vi.fn().mockResolvedValue([mockResult]),
      searchWithExpansion: vi.fn().mockResolvedValue([mockResult]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseInput = { query: 'find auth handler' };
    const output = await searchCodebaseHandler(engine, input);

    expect(output.structuredContent).toMatchObject({ answered: true });
  });

  it('Test 2: returns suggestions and "No exact match found" text when found:false with suggestions', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: baseSuggestions,
    };
    // primary returns empty, fallback returns suggestions
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseInput = { query: 'nonexistent stuff' };
    const output = await searchCodebaseHandler(engine, input);

    const text = getText(output);
    expect(text).toContain('No exact match found. Closest related code:');
    expect(output.structuredContent).toMatchObject({
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
    });
    const sc = output.structuredContent as Record<string, unknown>;
    expect(Array.isArray(sc['suggestions'])).toBe(true);
  });

  it('Test 3: returns answered:false with "No results found" when found:false with empty suggestions', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: [],
    };
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseInput = { query: 'nothing here' };
    const output = await searchCodebaseHandler(engine, input);

    expect(output.structuredContent).toMatchObject({ answered: false });
    const text = getText(output);
    expect(text).toContain('No results found');
  });

  it('Test 4: calls searchWithFallback with enableFallback:false when input.fallback is false', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: false,
      fallback_mode: 'none',
      results: [],
      suggestions: [],
    };
    const searchWithFallback = vi.fn().mockResolvedValue(fallbackResult);
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback,
    };
    const input: SearchCodebaseInput = { query: 'test', fallback: false };
    await searchCodebaseHandler(engine, input);

    // searchWithFallback should NOT be called when fallback:false
    expect(searchWithFallback).not.toHaveBeenCalled();
  });

  it('Test 5: structuredContent includes fallback_mode matching engine response', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'hybrid',
      results: [],
      suggestions: baseSuggestions,
    };
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseInput = { query: 'query' };
    const output = await searchCodebaseHandler(engine, input);

    expect(output.structuredContent).toMatchObject({ fallback_mode: 'hybrid' });
  });

  it('Test 6: suggestions in structuredContent contain only file, name, snippet — no score field', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: baseSuggestions,
    };
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseInput = { query: 'something' };
    const output = await searchCodebaseHandler(engine, input);

    const sc = output.structuredContent as Record<string, unknown>;
    const suggestions = sc['suggestions'] as Array<Record<string, unknown>>;
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(Object.keys(s)).toEqual(expect.arrayContaining(['file', 'name', 'snippet']));
      expect('score' in s).toBe(false);
    }
  });
});
