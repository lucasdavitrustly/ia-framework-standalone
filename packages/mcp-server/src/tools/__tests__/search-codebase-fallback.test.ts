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
