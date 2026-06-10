import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmEnricher } from '../enrichment/enricher.js';
import type { CodeChunk } from '@ia-framework/ast-parser';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeChunk(overrides: Partial<CodeChunk> = {}): CodeChunk {
  return {
    id: 'chunk-1',
    filePath: '/test/file.ts',
    content: 'const x = 1;',
    language: 'typescript',
    startLine: 1,
    endLine: 1,
    chunkType: 'function',
    name: 'test',
    ...overrides,
  } as CodeChunk;
}

describe('LlmEnricher error handling', () => {
  let enricher: LlmEnricher;

  beforeEach(() => {
    vi.clearAllMocks();
    enricher = new LlmEnricher({
      provider: 'ollama',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      retryAttempts: 0, // No retries for test speed
      skipOnFailure: false,
    });
  });

  it('throws error containing response body text on non-2xx response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '{"error":"llama runner process no longer running: unknown"}',
    });

    await expect(enricher.enrich([makeChunk()])).rejects.toThrow(
      'llama runner process no longer running',
    );
  });

  it('throws error containing model name on non-2xx response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"error":"model \'qwen3:8b\' not found"}',
    });

    await expect(enricher.enrich([makeChunk()])).rejects.toThrow('qwen3:8b');
  });

  it('throws formatted connection error when fetch fails with TypeError', async () => {
    const connError = new TypeError('fetch failed');
    (connError as unknown as { cause: { code: string } }).cause = { code: 'ECONNREFUSED' };
    mockFetch.mockRejectedValue(connError);

    await expect(enricher.enrich([makeChunk()])).rejects.toThrow('Cannot reach Ollama');
  });

  it('throws error with raw text when 200 response has invalid JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
      text: async () => '<html>error page</html>',
    });

    await expect(enricher.enrich([makeChunk()])).rejects.toThrow('parse-failure');
  });

  it('logs full error details (including body) when skipOnFailure is true', async () => {
    const skipEnricher = new LlmEnricher({
      provider: 'ollama',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      retryAttempts: 0,
      skipOnFailure: true,
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '{"error":"context window exceeded"}',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await skipEnricher.enrich([makeChunk()]);

    // Should not throw, should skip
    expect(result).toHaveLength(1); // Returns original chunk unchanged
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('context window exceeded'));

    warnSpy.mockRestore();
  });
});
