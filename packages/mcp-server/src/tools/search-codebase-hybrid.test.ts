import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  searchCodebaseHybridHandler,
  registerSearchCodebaseHybridTool,
} from './search-codebase-hybrid.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'chunk-1',
    filePath: '/project/src/foo.ts',
    relativePath: 'src/foo.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'myFunction',
    content: 'function myFunction() {}',
    startLine: 1,
    endLine: 3,
    score: 0.92,
    matchedVector: 'both',
    imports: [],
    exports: [],
    ...overrides,
  };
}

describe('searchCodebaseHybridHandler', () => {
  it('returns formatted markdown when results exist', async () => {
    const engine = {
      searchHybrid: vi
        .fn()
        .mockResolvedValue([
          makeResult(),
          makeResult({ name: undefined, relativePath: 'src/bar.ts', score: 0.75 }),
        ]),
    };

    const output = await searchCodebaseHybridHandler(engine, { query: 'my query', limit: 5 });

    expect(output.content).toHaveLength(1);
    expect(output.content[0]!.type).toBe('text');
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Hybrid search results for: "my query"');
    expect(text).toContain('[hybrid]');
    expect(text).toContain('src/foo.ts');
    expect(text).toContain('0.920');
    expect(engine.searchHybrid).toHaveBeenCalledWith({ text: 'my query', limit: 5 });
  });

  it('returns "No results found" message when engine returns empty array', async () => {
    const engine = {
      searchHybrid: vi.fn().mockResolvedValue([]),
    };

    const output = await searchCodebaseHybridHandler(engine, { query: 'nope' });

    expect(output.content[0]!.type).toBe('text');
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Conclusion: the indexed hybrid search did not return strong evidence');
    expect(text).toContain('No results found for query: "nope"');
  });

  it('uses default limit of 10 when limit is not provided', async () => {
    const engine = {
      searchHybrid: vi.fn().mockResolvedValue([]),
    };

    await searchCodebaseHybridHandler(engine, { query: 'test' });

    expect(engine.searchHybrid).toHaveBeenCalledWith({
      text: 'test',
      limit: 10,
      scoreThreshold: undefined,
    });
  });
});

describe('searchCodebaseHybridHandler — expand_hops', () => {
  it('calls searchWithExpansion with hops=2 by default when available', async () => {
    const mockResults = [
      {
        id: '1',
        content: 'code',
        relativePath: 'src/foo.ts',
        score: 0.9,
        language: 'typescript',
        chunkType: 'function',
        startLine: 1,
        endLine: 10,
      },
    ];
    const engine = {
      searchHybrid: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue(mockResults),
    };

    const result = await searchCodebaseHybridHandler(engine, { query: 'find auth' });

    expect(engine.searchWithExpansion).toHaveBeenCalledWith(
      { text: 'find auth', limit: 10, scoreThreshold: undefined },
      { hops: 2 },
    );
    const item = result.content[0];
    const text = item && item.type === 'text' ? (item as { type: 'text'; text: string }).text : '';
    expect(text).toContain('src/foo.ts');
  });

  it('uses searchHybrid directly when expand_hops=0', async () => {
    const engine = {
      searchHybrid: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
    };

    await searchCodebaseHybridHandler(engine, { query: 'test', expand_hops: 0 });

    expect(engine.searchHybrid).toHaveBeenCalled();
    expect(engine.searchWithExpansion).not.toHaveBeenCalled();
  });

  it('falls back to searchHybrid when searchWithExpansion is not available', async () => {
    const engine = { searchHybrid: vi.fn().mockResolvedValue([]) };
    await searchCodebaseHybridHandler(engine, { query: 'test' });
    expect(engine.searchHybrid).toHaveBeenCalled();
  });
});

describe('registerSearchCodebaseHybridTool', () => {
  it('registers a tool named search_codebase_hybrid on the MCP server', () => {
    const server = { registerTool: vi.fn() } as unknown as McpServer;
    const engine = { searchHybrid: vi.fn().mockResolvedValue([]) };

    registerSearchCodebaseHybridTool(server, engine);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(server.registerTool).toHaveBeenCalledTimes(1);
    const [toolName] = (server.registerTool as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ...unknown[],
    ];
    expect(toolName).toBe('search_codebase_hybrid');
  });
});

describe('searchCodebaseHybridHandler - token cap', () => {
  it('trims results and includes token_cap_applied metadata when budget exceeded', async () => {
    // 10 results × 3000 chars / 4 ≈ 750 tokens each = 7500 total > 6000 cap
    const largeContent = 'x'.repeat(3000);
    const results = Array.from({ length: 10 }, (_, i) =>
      makeResult({
        chunkId: `chunk-${i}`,
        content: largeContent,
        score: 1.0 - i * 0.05,
        relativePath: `src/file${i}.ts`,
      }),
    );

    const engine = {
      searchHybrid: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHybridHandler(
      engine,
      { query: 'hybrid token cap test', expand_hops: 0 },
      { maxTokensPerCall: 6000 },
    );

    // Should have fewer than 10 result sections in the text
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    const matchCount = (text.match(/###\s+\d+\./g) ?? []).length;
    expect(matchCount).toBeLessThan(10);

    // structuredContent must contain token_cap_applied: true
    expect(output.structuredContent).toBeDefined();
    expect((output.structuredContent as Record<string, unknown>).token_cap_applied).toBe(true);
    expect(typeof (output.structuredContent as Record<string, unknown>).results_trimmed).toBe(
      'number',
    );
  });
});
