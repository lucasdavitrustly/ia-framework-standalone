import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmbeddingProvider } from './factory.js';

describe('createEmbeddingProvider', () => {
  it('creates OpenAI provider with correct properties', () => {
    const provider = createEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'test-key',
      dimensions: 1536,
    });

    expect(provider.name).toBe('openai');
    expect(provider.model).toBe('text-embedding-3-small');
    expect(provider.dimensions).toBe(1536);
  });

  it('creates Ollama provider with correct properties', () => {
    const provider = createEmbeddingProvider({
      provider: 'ollama',
      model: 'nomic-embed-text',
      dimensions: 768,
    });

    expect(provider.name).toBe('ollama');
    expect(provider.model).toBe('nomic-embed-text');
    expect(provider.dimensions).toBe(768);
  });

  it('throws error for unknown provider', () => {
    expect(() =>
      createEmbeddingProvider({
        provider: 'unknown' as 'openai',
        model: 'some-model',
      }),
    ).toThrow(/Unknown provider/i);
  });

  it('estimateTokens returns a positive number for non-empty text', () => {
    const provider = createEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'test',
      dimensions: 1536,
    });

    expect(provider.estimateTokens('hello world')).toBeGreaterThan(0);
  });

  it('estimateTokens returns 0 for empty string', () => {
    const provider = createEmbeddingProvider({
      provider: 'openai',
      model: 'text-embedding-3-small',
      apiKey: 'test',
      dimensions: 1536,
    });

    expect(provider.estimateTokens('')).toBe(0);
  });

  describe('OpenAI provider', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
            usage: { prompt_tokens: 5, total_tokens: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('calls the correct OpenAI API endpoint and returns vector', async () => {
      const provider = createEmbeddingProvider({
        provider: 'openai',
        model: 'text-embedding-3-small',
        apiKey: 'test-key',
        dimensions: 1536,
      });

      const result = await provider.embed('test text');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/v1/embeddings'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        }),
      );
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('embedBatch returns array of vectors for multiple inputs', async () => {
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { embedding: [0.1, 0.2], index: 0 },
              { embedding: [0.3, 0.4], index: 1 },
              { embedding: [0.5, 0.6], index: 2 },
            ],
            usage: { prompt_tokens: 15, total_tokens: 15 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const provider = createEmbeddingProvider({
        provider: 'openai',
        model: 'text-embedding-3-small',
        apiKey: 'test-key',
        dimensions: 1536,
      });

      const results = await provider.embedBatch(['a', 'b', 'c']);
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual([0.1, 0.2]);
      expect(results[1]).toEqual([0.3, 0.4]);
      expect(results[2]).toEqual([0.5, 0.6]);
    });
  });

  describe('Ollama provider', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            embeddings: [[0.7, 0.8, 0.9]],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('calls the correct Ollama API endpoint and returns vector', async () => {
      const provider = createEmbeddingProvider({
        provider: 'ollama',
        model: 'nomic-embed-text',
        dimensions: 768,
      });

      const result = await provider.embed('test text');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/embed'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result).toEqual([0.7, 0.8, 0.9]);
    });
  });
});
