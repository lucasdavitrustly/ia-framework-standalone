import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHybridHandler } from '../search-codebase-hybrid.js';
import type { SearchCodebaseHybridInput } from '../search-codebase-hybrid.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

const mockResult: RetrievalResult = {
  chunkId: 'chunk-1',
  filePath: '/project/src/auth.ts',
  relativePath: 'src/auth.ts',
  language: 'typescript',
  chunkType: 'function',
  name: 'authenticate',
  content: 'function authenticate() {}',
  startLine: 1,
  endLine: 1,
  imports: [],
  exports: [],
  score: 0.75,
  matchedVector: 'text',
};

function makeHybridEngine(results: RetrievalResult[] = [mockResult]) {
  return {
    searchHybrid: vi.fn().mockResolvedValue(results),
  };
}

describe('search-codebase-hybrid template injection', () => {
  it('prepends dependency-trace template before hybrid results', async () => {
    const engine = makeHybridEngine();
    const input: SearchCodebaseHybridInput = { query: 'dependency chain for auth' };
    const result = await searchCodebaseHybridHandler(engine, input);

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('tracing dependencies');
    expect(text).toContain('## Hybrid search results');
    const templateIdx = text.indexOf('tracing dependencies');
    const resultsIdx = text.indexOf('## Hybrid search results');
    expect(templateIdx).toBeLessThan(resultsIdx);
  });

  it('includes intent_detected in structuredContent for dependency query', async () => {
    const engine = makeHybridEngine();
    const input: SearchCodebaseHybridInput = { query: 'dependency chain for auth' };
    const result = await searchCodebaseHybridHandler(engine, input);

    expect((result.structuredContent as Record<string, unknown>).intent_detected).toBe(
      'dependency-trace',
    );
  });

  it('does not inject template for non-matching query', async () => {
    const engine = makeHybridEngine();
    const input: SearchCodebaseHybridInput = { query: 'find the User class' };
    const result = await searchCodebaseHybridHandler(engine, input);

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).not.toContain('tracing dependencies');
    expect(text).not.toContain('List affected files');
    expect((result.structuredContent as Record<string, unknown>)?.intent_detected).toBeUndefined();
  });

  it('does not inject template when zero results', async () => {
    const engine = makeHybridEngine([]);
    const input: SearchCodebaseHybridInput = { query: 'dependency chain for auth' };
    const result = await searchCodebaseHybridHandler(engine, input);

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).not.toContain('tracing dependencies');
  });

  it('prepends impact-analysis template for impact query', async () => {
    const engine = makeHybridEngine();
    const input: SearchCodebaseHybridInput = {
      query: 'what files need updating if I change the User model',
    };
    const result = await searchCodebaseHybridHandler(engine, input);

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('List affected files in dependency order');
    expect((result.structuredContent as Record<string, unknown>).intent_detected).toBe(
      'impact-analysis',
    );
  });
});
