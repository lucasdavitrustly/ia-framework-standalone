/**
 * T028: OllamaEmbeddingProvider error message tests
 *
 * Verifies that embedding errors include the model name for actionable diagnostics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaEmbeddingProvider } from './ollama.js';

describe('OllamaEmbeddingProvider error messages', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('includes model name in error message even when body does not mention it', async () => {
    const provider = new OllamaEmbeddingProvider({
      model: 'nomic-embed-text:v1.5',
      dimensions: 768,
      baseUrl: 'http://localhost:11434',
    });

    // Body does NOT contain model name — error message should still include it
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'unexpected server error' }), {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    await expect(provider.embedBatch(['hello world'])).rejects.toThrow('nomic-embed-text:v1.5');
  });

  it('includes status code in error message', async () => {
    const provider = new OllamaEmbeddingProvider({
      model: 'mxbai-embed-large',
      dimensions: 1024,
      baseUrl: 'http://localhost:11434',
    });

    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );

    await expect(provider.embedBatch(['test'])).rejects.toThrow('500');
  });

  it('includes response body in error message', async () => {
    const provider = new OllamaEmbeddingProvider({
      model: 'nomic-embed-text',
      dimensions: 768,
      baseUrl: 'http://localhost:11434',
    });

    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'context length exceeded' }), {
        status: 400,
        statusText: 'Bad Request',
      }),
    );

    await expect(provider.embedBatch(['test'])).rejects.toThrow('context length exceeded');
  });
});
