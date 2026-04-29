import { describe, it, expect, vi } from 'vitest';
import { searchCodebaseHandler } from '../search-codebase.js';
import type { SearchCodebaseInput } from '../search-codebase.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

const mockResult: RetrievalResult = {
  chunkId: 'chunk-1',
  filePath: '/project/src/user.ts',
  relativePath: 'src/user.ts',
  language: 'typescript',
  chunkType: 'class',
  name: 'User',
  content: 'class User {}',
  startLine: 1,
  endLine: 1,
  imports: [],
  exports: [],
  score: 0.85,
  matchedVector: 'text',
};

function makeEngine(results: RetrievalResult[] = [mockResult]) {
  return {
    search: vi.fn().mockResolvedValue(results),
    searchWithExpansion: vi.fn().mockResolvedValue(results),
  };
}

describe('search-codebase template injection', () => {
  it('prepends impact-analysis template before code results for impact query', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = {
      query: 'what files need updating if I change the User model',
    };
    const result = await searchCodebaseHandler(engine, input);

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('List affected files in dependency order');
    expect(text).toContain('## Code results');
    // Template should appear BEFORE code results
    const templateIdx = text.indexOf('List affected files');
    const codeIdx = text.indexOf('## Code results');
    expect(templateIdx).toBeLessThan(codeIdx);
  });

  it('includes intent_detected in structuredContent for impact query', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = {
      query: 'what files need updating if I change the User model',
    };
    const result = await searchCodebaseHandler(engine, input);

    expect(result.structuredContent).toBeDefined();
    expect((result.structuredContent as Record<string, unknown>).intent_detected).toBe(
      'impact-analysis',
    );
  });

  it('does not inject template for non-matching query', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = { query: 'how does authentication work' };
    const result = await searchCodebaseHandler(engine, input);

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).not.toContain('List affected files');
    expect(text).not.toContain('dependency chain');
    expect((result.structuredContent as Record<string, unknown>)?.intent_detected).toBeUndefined();
  });

  it('suppresses template when use_template is false', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = {
      query: 'what files need updating if I change the User model',
      use_template: false,
    };
    const result = await searchCodebaseHandler(engine, input);

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).not.toContain('List affected files');
    expect((result.structuredContent as Record<string, unknown>)?.intent_detected).toBeUndefined();
  });

  it('does not inject template when zero results', async () => {
    const engine = makeEngine([]);
    const input: SearchCodebaseInput = {
      query: 'what files need updating if I change the User model',
    };
    const result = await searchCodebaseHandler(engine, input);

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).not.toContain('List affected files');
  });

  it('prepends dependency-trace template for dependency query', async () => {
    const engine = makeEngine();
    const input: SearchCodebaseInput = { query: 'what uses this function' };
    const result = await searchCodebaseHandler(engine, input);

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('tracing dependencies');
    expect((result.structuredContent as Record<string, unknown>).intent_detected).toBe(
      'dependency-trace',
    );
  });
});
