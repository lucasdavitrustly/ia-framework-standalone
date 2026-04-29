import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHybridHandler } from '../search-codebase-hybrid.js';
import type { SearchCodebaseHybridInput } from '../search-codebase-hybrid.js';
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

const keywordSuggestions = [
  { file: 'src/auth.ts', name: 'authenticate', snippet: 'function authenticate(token) {' },
];

function getText(output: { content: Array<{ type: string; text?: string }> }): string {
  const item = output.content[0];
  return item && item.type === 'text' && 'text' in item ? (item.text ?? '') : '';
}

describe('search_codebase_hybrid fallback behavior', () => {
  it('Test 1: returns suggestions and "No exact match found" text when found:false with keyword suggestions', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: keywordSuggestions,
    };
    const engine = {
      searchHybrid: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseHybridInput = { query: 'auth handler' };
    const output = await searchCodebaseHybridHandler(engine, input);

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

  it('Test 2: no fallback triggered when hybrid primary returns results', async () => {
    const engine = {
      searchHybrid: vi.fn().mockResolvedValue([mockResult]),
      searchWithFallback: vi.fn(),
    };
    const input: SearchCodebaseHybridInput = { query: 'foo function' };
    const output = await searchCodebaseHybridHandler(engine, input);

    expect(engine.searchWithFallback).not.toHaveBeenCalled();
    expect(output.structuredContent).toMatchObject({ answered: true });
  });

  it('Test 3: structuredContent contains fallback_mode:keyword when keyword fallback activated', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: keywordSuggestions,
    };
    const engine = {
      searchHybrid: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseHybridInput = { query: 'something' };
    const output = await searchCodebaseHybridHandler(engine, input);

    expect(output.structuredContent).toMatchObject({ fallback_mode: 'keyword' });
  });

  it('Test 4: falls back to existing behavior when searchWithFallback not available', async () => {
    const engine = {
      searchHybrid: vi.fn().mockResolvedValue([]),
      // No searchWithFallback
    };
    const input: SearchCodebaseHybridInput = { query: 'test' };
    const output = await searchCodebaseHybridHandler(engine, input);

    // Should return existing empty result without error
    expect(output.structuredContent).toMatchObject({ answered: false });
  });
});
