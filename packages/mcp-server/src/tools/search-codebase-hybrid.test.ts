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
    expect(text).toBe('No results found for query: "nope"');
  });

  it('uses default limit of 10 when limit is not provided', async () => {
    const engine = {
      searchHybrid: vi.fn().mockResolvedValue([]),
    };

    await searchCodebaseHybridHandler(engine, { query: 'test' });

    expect(engine.searchHybrid).toHaveBeenCalledWith({ text: 'test', limit: 10 });
  });
});

describe('registerSearchCodebaseHybridTool', () => {
  it('registers a tool named search_codebase_hybrid on the MCP server', () => {
    const server = { registerTool: vi.fn() } as unknown as McpServer;
    const engine = { searchHybrid: vi.fn().mockResolvedValue([]) };

    registerSearchCodebaseHybridTool(server, engine);

    expect(server.registerTool).toHaveBeenCalledTimes(1);
    const [toolName] = (server.registerTool as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ...unknown[],
    ];
    expect(toolName).toBe('search_codebase_hybrid');
  });
});
