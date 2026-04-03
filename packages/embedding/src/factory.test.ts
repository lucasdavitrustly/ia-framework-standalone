import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmbeddingProvider, discoverDimensions, DEFAULT_DIMENSIONS } from './factory.js';

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

describe('discoverDimensions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns dimensions from DEFAULT_DIMENSIONS for known model without fetch', async () => {
    const dims = await discoverDimensions('nomic-embed-text');
    expect(dims).toBe(768);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('strips :latest suffix and returns from DEFAULT_DIMENSIONS', async () => {
    const dims = await discoverDimensions('nomic-embed-text:latest');
    expect(dims).toBe(768);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns from DEFAULT_DIMENSIONS for mxbai-embed-large', async () => {
    const dims = await discoverDimensions('mxbai-embed-large');
    expect(dims).toBe(1024);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('queries /api/show for unknown model and parses embedding_length', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model_info: { 'bert.embedding_length': 512 },
        }),
        { status: 200 },
      ),
    );

    const dims = await discoverDimensions('custom-embed-model', 'http://localhost:11434');
    expect(dims).toBe(512);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:11434/api/show',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to /api/embed probe when /api/show lacks embedding_length', async () => {
    // /api/show returns ok but no embedding_length
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ model_info: { 'some.other_field': 42 } }),
        { status: 200 },
      ),
    );
    // /api/embed probe succeeds
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }),
        { status: 200 },
      ),
    );

    const dims = await discoverDimensions('unknown-model', 'http://localhost:11434');
    expect(dims).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to /api/embed probe when /api/show fails', async () => {
    // /api/show fails
    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));
    // /api/embed probe succeeds
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ embeddings: [[0.1, 0.2, 0.3, 0.4, 0.5]] }),
        { status: 200 },
      ),
    );

    const dims = await discoverDimensions('unknown-model', 'http://localhost:11434');
    expect(dims).toBe(5);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws Error when all strategies fail', async () => {
    // /api/show fails
    fetchSpy.mockRejectedValueOnce(new Error('connection refused'));
    // /api/embed also fails
    fetchSpy.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    await expect(
      discoverDimensions('broken-model', 'http://localhost:11434'),
    ).rejects.toThrow(/Cannot determine dimensions/);
  });

  it('exports DEFAULT_DIMENSIONS with known models', () => {
    expect(DEFAULT_DIMENSIONS).toHaveProperty('nomic-embed-text', 768);
    expect(DEFAULT_DIMENSIONS).toHaveProperty('mxbai-embed-large', 1024);
    expect(DEFAULT_DIMENSIONS).toHaveProperty('all-minilm', 384);
  });
});
