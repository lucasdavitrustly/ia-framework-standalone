import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHandler } from '../search-codebase.js';
import type { SearchCodebaseInput } from '../search-codebase.js';
import type { RetrievalResult, FallbackSearchResult } from '@ia-framework/retrieval';

function getText(output: { content: Array<{ type: string; text?: string }> }): string {
  const item = output.content[0];
  return item && item.type === 'text' && 'text' in item ? (item.text ?? '') : '';
}

const mockRelatedResult: RetrievalResult = {
  chunkId: 'chunk-related-1',
  filePath: '/project/src/Foo.java',
  relativePath: 'src/Foo.java',
  language: 'java',
  chunkType: 'class',
  name: 'MessageHandler',
  content: '@RabbitListener(queues = "myQueue") public void handleMessage(String msg) {}',
  startLine: 10,
  endLine: 15,
  imports: [],
  exports: [],
  score: 0.55,
  matchedVector: 'text',
};

describe('search_codebase relatedResults behavior', () => {
  it('Test 1: surfaces relatedResults with descriptive message when populated', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: [],
      relatedResults: [mockRelatedResult],
      related_query: 'message',
    };
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseInput = { query: 'websocket' };
    const output = await searchCodebaseHandler(engine, input);

    const text = getText(output);
    expect(text).toContain("No results for 'websocket'. Related communication mechanisms found:");
    expect(text).toContain('src/Foo.java');
  });

  it('Test 2: structuredContent includes related_results array when populated', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: [],
      relatedResults: [mockRelatedResult],
      related_query: 'message',
    };
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseInput = { query: 'websocket' };
    const output = await searchCodebaseHandler(engine, input);

    const sc = output.structuredContent as Record<string, unknown>;
    expect(sc['found']).toBe(false);
    expect(sc['fallback_used']).toBe(true);
    expect(Array.isArray(sc['related_results'])).toBe(true);
    const relatedResults = sc['related_results'] as Array<Record<string, unknown>>;
    expect(relatedResults.length).toBe(1);
    expect(relatedResults[0]!['file']).toBe('src/Foo.java');
  });

  it('Test 3: related_query is surfaced in structuredContent', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: [],
      relatedResults: [mockRelatedResult],
      related_query: 'message',
    };
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseInput = { query: 'websocket' };
    const output = await searchCodebaseHandler(engine, input);

    const sc = output.structuredContent as Record<string, unknown>;
    expect(sc['related_query']).toBe('message');
  });

  it('Test 4: existing behavior unchanged when relatedResults is undefined', async () => {
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
    const input: SearchCodebaseInput = { query: 'nothing' };
    const output = await searchCodebaseHandler(engine, input);

    const text = getText(output);
    expect(text).not.toContain('Related communication mechanisms found');
    expect(text).toContain('No results found');
    const sc = output.structuredContent as Record<string, unknown>;
    expect(sc['related_results']).toBeUndefined();
  });

  it('Test 5: relatedResults takes priority over empty suggestions', async () => {
    const fallbackResult: FallbackSearchResult = {
      found: false,
      fallback_used: true,
      fallback_mode: 'keyword',
      results: [],
      suggestions: [],
      relatedResults: [mockRelatedResult],
      related_query: 'message',
    };
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue(fallbackResult),
    };
    const input: SearchCodebaseInput = { query: 'websocket' };
    const output = await searchCodebaseHandler(engine, input);

    const text = getText(output);
    expect(text).toContain('Related communication mechanisms found');
    expect(text).not.toContain('No exact match found. Closest related code:');
  });
});
